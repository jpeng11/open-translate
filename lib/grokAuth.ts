/**
 * xAI Grok OAuth via the device-code flow (same public client the Grok CLI uses).
 * Lets SuperGrok / X Premium+ subscribers translate without an API key.
 * Tokens are stored in chrome.storage.local alongside other settings.
 */
import { getSettings, saveSettings } from './settings';
import type { Settings } from './settings';

const AUTH_BASE = 'https://auth.x.ai';
const DEVICE_CODE_URL = `${AUTH_BASE}/oauth2/device/code`;
const TOKEN_URL = `${AUTH_BASE}/oauth2/token`;
/** Public client id used by the official Grok CLI (no secret; device + PKCE flows only). */
const CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const SCOPE = 'openid profile email offline_access';

export const GROK_PROXY_BASE_URL = 'https://cli-chat-proxy.grok.com/v1';
export const GROK_DEFAULT_MODEL = 'grok-4.6';

export interface GrokTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  intervalMs: number;
  expiresAt: number;
}

async function postForm(url: string, params: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
}

function tokensFromResponse(body: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}): GrokTokens {
  if (!body.access_token) throw new Error('Token response missing access_token');
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? '',
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
}

export async function startDeviceFlow(): Promise<DeviceCode> {
  const res = await postForm(DEVICE_CODE_URL, { client_id: CLIENT_ID, scope: SCOPE });
  if (!res.ok) throw new Error(`Device code request failed: HTTP ${res.status}`);
  const body = await res.json();
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    verificationUriComplete: body.verification_uri_complete ?? body.verification_uri,
    intervalMs: (body.interval ?? 5) * 1000,
    expiresAt: Date.now() + (body.expires_in ?? 1800) * 1000,
  };
}

/**
 * Poll the token endpoint until the user approves (or the code expires).
 * Resolves with tokens; rejects on denial/expiry.
 */
export async function pollForTokens(
  device: DeviceCode,
  isCancelled: () => boolean = () => false,
): Promise<GrokTokens> {
  let intervalMs = device.intervalMs;
  while (Date.now() < device.expiresAt) {
    if (isCancelled()) throw new Error('Sign-in cancelled');
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await postForm(TOKEN_URL, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: device.deviceCode,
      client_id: CLIENT_ID,
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return tokensFromResponse(body);
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

export async function refreshTokens(refreshToken: string): Promise<GrokTokens> {
  const res = await postForm(TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      body?.error_description ?? `Token refresh failed: HTTP ${res.status} — sign in again`,
    );
  }
  const tokens = tokensFromResponse(body);
  if (!tokens.refreshToken) tokens.refreshToken = refreshToken;
  return tokens;
}

/**
 * Returns a valid access token for the given settings, refreshing and
 * persisting it when it's within 2 minutes of expiry.
 */
export async function ensureFreshAccessToken(settings: Settings): Promise<string> {
  const tokens = settings.grokTokens;
  if (!tokens?.accessToken) {
    throw new Error('Not signed in with Grok. Open the extension options and sign in.');
  }
  if (Date.now() < tokens.expiresAt - 120_000) return tokens.accessToken;
  if (!tokens.refreshToken) {
    throw new Error('Grok session expired. Open the extension options and sign in again.');
  }
  const fresh = await refreshTokens(tokens.refreshToken);
  // Re-read settings to avoid clobbering unrelated changes made meanwhile.
  const latest = await getSettings();
  await saveSettings({ ...latest, grokTokens: fresh });
  return fresh.accessToken;
}
