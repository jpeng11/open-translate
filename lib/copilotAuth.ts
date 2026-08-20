/**
 * GitHub Copilot auth via the OAuth device flow, for users whose "AI budget"
 * is a Copilot subscription rather than an API key.
 *
 * Two tokens are involved:
 *  1. A long-lived GitHub OAuth token from the device flow (stored).
 *  2. A short-lived Copilot API bearer (~25 min), exchanged from (1) via
 *     copilot_internal/v2/token and refreshed automatically before expiry.
 *
 * The chat endpoint (api.githubcopilot.com) is OpenAI-compatible but requires
 * editor identification headers alongside the bearer.
 */
import { getSettings, saveSettings } from './settings';
import type { Settings } from './settings';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
/** Public client id of the GitHub Copilot editor plugin (device flow only, no secret). */
const CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const SCOPE = 'read:user';

export const COPILOT_BASE_URL = 'https://api.githubcopilot.com';
export const COPILOT_DEFAULT_MODEL = 'gpt-4o-mini';
/** The Copilot API rejects requests that don't identify as an editor client. */
export const COPILOT_HEADERS: Record<string, string> = {
  'Editor-Version': 'vscode/1.99.3',
  'Editor-Plugin-Version': 'copilot-chat/0.26.7',
  'Copilot-Integration-Id': 'vscode-chat',
};

export interface CopilotTokens {
  /** Long-lived GitHub OAuth token (gho_…). */
  githubToken: string;
  /** Short-lived Copilot API bearer. */
  copilotToken: string;
  /** Epoch ms when the Copilot bearer expires. */
  expiresAt: number;
}

export interface CopilotDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalMs: number;
  expiresAt: number;
}

async function postJson(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

export async function startCopilotDeviceFlow(): Promise<CopilotDeviceCode> {
  const res = await postJson(DEVICE_CODE_URL, { client_id: CLIENT_ID, scope: SCOPE });
  if (!res.ok) throw new Error(`Device code request failed: HTTP ${res.status}`);
  const body = await res.json();
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri ?? 'https://github.com/login/device',
    intervalMs: (body.interval ?? 5) * 1000,
    expiresAt: Date.now() + (body.expires_in ?? 900) * 1000,
  };
}

/** Poll GitHub until the user approves the device code. Resolves with the GitHub OAuth token. */
export async function pollForGithubToken(
  device: CopilotDeviceCode,
  isCancelled: () => boolean = () => false,
): Promise<string> {
  let intervalMs = device.intervalMs;
  while (Date.now() < device.expiresAt) {
    if (isCancelled()) throw new Error('Sign-in cancelled');
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await postJson(ACCESS_TOKEN_URL, {
      client_id: CLIENT_ID,
      device_code: device.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    const body = await res.json().catch(() => ({}));
    if (typeof body?.access_token === 'string') return body.access_token;
    switch (body?.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        intervalMs += 5000;
        continue;
      case 'access_denied':
        throw new Error('Sign-in was denied');
      case 'expired_token':
        throw new Error('The sign-in code expired — try again');
      default:
        throw new Error(body?.error_description ?? `Token request failed: HTTP ${res.status}`);
    }
  }
  throw new Error('The sign-in code expired — try again');
}

/** Exchange the GitHub OAuth token for a short-lived Copilot API bearer. */
export async function fetchCopilotToken(githubToken: string): Promise<CopilotTokens> {
  const res = await fetch(COPILOT_TOKEN_URL, {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/json',
      ...COPILOT_HEADERS,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'GitHub rejected the Copilot token request — this account may not have an active Copilot subscription.',
    );
  }
  if (!res.ok) throw new Error(`Copilot token exchange failed: HTTP ${res.status}`);
  const body = await res.json();
  if (typeof body?.token !== 'string') throw new Error('Copilot token response missing token');
  return {
    githubToken,
    copilotToken: body.token,
    // expires_at is epoch seconds; fall back to 20 minutes.
    expiresAt: typeof body.expires_at === 'number' ? body.expires_at * 1000 : Date.now() + 20 * 60_000,
  };
}

/** Full sign-in: device flow → GitHub token → Copilot bearer. */
export async function completeCopilotSignIn(
  device: CopilotDeviceCode,
  isCancelled: () => boolean = () => false,
): Promise<CopilotTokens> {
  const githubToken = await pollForGithubToken(device, isCancelled);
  return fetchCopilotToken(githubToken);
}

/** Returns a valid Copilot bearer, re-exchanging and persisting when near expiry. */
export async function ensureFreshCopilotToken(settings: Settings): Promise<string> {
  const tokens = settings.copilotTokens;
  if (!tokens?.githubToken) {
    throw new Error('Not signed in with GitHub. Open the extension options and sign in.');
  }
  if (tokens.copilotToken && Date.now() < tokens.expiresAt - 120_000) {
    return tokens.copilotToken;
  }
  const fresh = await fetchCopilotToken(tokens.githubToken);
  const latest = await getSettings();
  await saveSettings({ ...latest, copilotTokens: fresh });
  return fresh.copilotToken;
}
