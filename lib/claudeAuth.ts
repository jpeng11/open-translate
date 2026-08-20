/**
 * Claude Pro/Max subscription auth via Anthropic's OAuth PKCE flow — the same
 * flow Claude Code uses, in its copy/paste variant (`code=true`), which needs
 * no localhost redirect and therefore works inside a browser extension.
 *
 * Flow: build an authorize URL on claude.ai with a PKCE S256 challenge; the
 * callback page on console.anthropic.com displays a "code#state" string the
 * user pastes back; exchange it at console.anthropic.com/v1/oauth/token.
 *
 * Tokens are used against the Anthropic Messages API (not the OpenAI-compat
 * layer) with the `anthropic-beta: oauth-2025-04-20` header.
 */
import { getSettings, saveSettings } from './settings';
import type { Settings } from './settings';

const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
/** Public client id of the Claude Code OAuth app (PKCE only, no secret). */
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const SCOPE = 'org:create_api_key user:profile user:inference';

export const CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';
export const CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5';
export const CLAUDE_OAUTH_BETA = 'oauth-2025-04-20';

export interface ClaudeTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

export interface ClaudePkceSession {
  url: string;
  verifier: string;
}

function base64url(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** Build the claude.ai authorize URL. The verifier doubles as OAuth state. */
export async function startClaudeSignIn(): Promise<ClaudePkceSession> {
  const { verifier, challenge } = await generatePkce();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('code', 'true'); // copy/paste mode: callback page shows the code
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', verifier);
  return { url: url.toString(), verifier };
}

function parseTokenBody(body: {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
}): ClaudeTokens {
  if (typeof body?.access_token !== 'string') {
    throw new Error('Anthropic token response missing access_token');
  }
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : '',
    expiresAt: Date.now() + (typeof body.expires_in === 'number' ? body.expires_in : 3600) * 1000,
  };
}

async function postToken(payload: Record<string, string>): Promise<ClaudeTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Anthropic token request failed: HTTP ${res.status}`);
  return parseTokenBody(await res.json());
}

/** Exchange the pasted "code#state" string for tokens. */
export async function exchangeClaudeCode(
  pasted: string,
  verifier: string,
): Promise<ClaudeTokens> {
  const [code, state] = pasted.trim().split('#');
  if (!code) throw new Error('Paste the full code shown on the Anthropic page');
  return postToken({
    grant_type: 'authorization_code',
    code,
    state: state ?? verifier,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
}

export async function refreshClaudeTokens(refreshToken: string): Promise<ClaudeTokens> {
  const tokens = await postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
  // Some refreshes omit a new refresh token; keep using the old one.
  return { ...tokens, refreshToken: tokens.refreshToken || refreshToken };
}

/** Returns a valid access token, refreshing and persisting when near expiry. */
export async function ensureFreshClaudeToken(settings: Settings): Promise<string> {
  const tokens = settings.claudeTokens;
  if (!tokens?.accessToken) {
    throw new Error('Not signed in with Claude. Open the extension options and sign in.');
  }
  if (Date.now() < tokens.expiresAt - 120_000) return tokens.accessToken;
  if (!tokens.refreshToken) {
    throw new Error('Claude session expired — sign in again in the extension options.');
  }
  const fresh = await refreshClaudeTokens(tokens.refreshToken);
  const latest = await getSettings();
  await saveSettings({ ...latest, claudeTokens: fresh });
  return fresh.accessToken;
}
