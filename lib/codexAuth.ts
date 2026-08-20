/**
 * ChatGPT Plus/Pro subscription auth via OpenAI's device-code flow — the same
 * flow as `codex login --device-auth` (officially documented for headless
 * devices; endpoints are public in the open-source Codex CLI).
 *
 * Note: the user's ChatGPT account must have "Device code authorization"
 * enabled under Settings → Security, otherwise the flow 404s.
 *
 * Flow: request a user code, the user approves it at auth.openai.com/codex/device,
 * polling returns an authorization code plus a server-generated PKCE verifier,
 * which we exchange for tokens. Inference then goes to the ChatGPT Codex
 * backend (Responses API dialect), scoped by the account id from the id token.
 */
import { getSettings, saveSettings } from './settings';
import type { Settings } from './settings';

const ISSUER = 'https://auth.openai.com';
/** Public client id of the Codex CLI (device flow + PKCE, no secret). */
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

export const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';
export const CODEX_DEFAULT_MODEL = 'gpt-5.1';

export interface CodexTokens {
  accessToken: string;
  refreshToken: string;
  /** ChatGPT account id (from the id token) — required header on inference. */
  accountId: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

export interface CodexDeviceCode {
  deviceAuthId: string;
  userCode: string;
  verificationUri: string;
  intervalMs: number;
  expiresAt: number;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

export async function startCodexDeviceFlow(): Promise<CodexDeviceCode> {
  const res = await postJson(`${ISSUER}/api/accounts/deviceauth/usercode`, {
    client_id: CLIENT_ID,
  });
  if (res.status === 404) {
    throw new Error(
      'Device code sign-in is disabled for this ChatGPT account. Enable ' +
        '"Device code authorization" under ChatGPT Settings → Security, then retry.',
    );
  }
  if (!res.ok) throw new Error(`Device code request failed: HTTP ${res.status}`);
  const body = await res.json();
  return {
    deviceAuthId: body.device_auth_id,
    userCode: body.user_code,
    verificationUri: `${ISSUER}/codex/device`,
    intervalMs: (body.interval ?? 5) * 1000,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}

/** Decode the ChatGPT account id from the id token's auth claim. */
export function accountIdFromIdToken(idToken: string): string {
  try {
    const payload = idToken.split('.')[1] ?? '';
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const auth = json['https://api.openai.com/auth'];
    return typeof auth?.chatgpt_account_id === 'string' ? auth.chatgpt_account_id : '';
  } catch {
    return '';
  }
}

async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<CodexTokens> {
  const res = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${ISSUER}/deviceauth/callback`,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status}`);
  const body = await res.json();
  if (typeof body?.access_token !== 'string') {
    throw new Error('OpenAI token response missing access_token');
  }
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : '',
    accountId: accountIdFromIdToken(typeof body.id_token === 'string' ? body.id_token : ''),
    expiresAt: Date.now() + (typeof body.expires_in === 'number' ? body.expires_in : 3600) * 1000,
  };
}

/** Poll until the user approves, then exchange the returned code for tokens. */
export async function completeCodexSignIn(
  device: CodexDeviceCode,
  isCancelled: () => boolean = () => false,
): Promise<CodexTokens> {
  while (Date.now() < device.expiresAt) {
    if (isCancelled()) throw new Error('Sign-in cancelled');
    await new Promise((r) => setTimeout(r, device.intervalMs));
    const res = await postJson(`${ISSUER}/api/accounts/deviceauth/token`, {
      device_auth_id: device.deviceAuthId,
      user_code: device.userCode,
    });
    if (!res.ok) continue; // pending — keep polling until the code expires
    const body = await res.json();
    // The server generates the PKCE pair for device flows and returns the
    // verifier alongside the authorization code (matches the Codex CLI).
    if (typeof body?.authorization_code !== 'string' || typeof body?.code_verifier !== 'string') {
      throw new Error('Device auth response missing authorization code');
    }
    return exchangeAuthorizationCode(body.authorization_code, body.code_verifier);
  }
  throw new Error('The sign-in code expired — try again');
}

export async function refreshCodexTokens(tokens: CodexTokens): Promise<CodexTokens> {
  const res = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: CLIENT_ID,
      scope: 'openid profile email',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Token refresh failed: HTTP ${res.status}`);
  const body = await res.json();
  if (typeof body?.access_token !== 'string') throw new Error('Refresh response missing token');
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : tokens.refreshToken,
    accountId: tokens.accountId,
    expiresAt: Date.now() + (typeof body.expires_in === 'number' ? body.expires_in : 3600) * 1000,
  };
}

/** Returns valid tokens, refreshing and persisting when near expiry. */
export async function ensureFreshCodexTokens(settings: Settings): Promise<CodexTokens> {
  const tokens = settings.codexTokens;
  if (!tokens?.accessToken) {
    throw new Error('Not signed in with ChatGPT. Open the extension options and sign in.');
  }
  if (Date.now() < tokens.expiresAt - 120_000) return tokens;
  if (!tokens.refreshToken) {
    throw new Error('ChatGPT session expired — sign in again in the extension options.');
  }
  const fresh = await refreshCodexTokens(tokens);
  const latest = await getSettings();
  await saveSettings({ ...latest, codexTokens: fresh });
  return fresh;
}
