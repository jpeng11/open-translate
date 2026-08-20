import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  startDeviceFlow,
  pollForTokens,
  refreshTokens,
  ensureFreshAccessToken,
} from '@/lib/grokAuth';
import { saveSettings, getSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import type { DeviceCode } from '@/lib/grokAuth';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('startDeviceFlow', () => {
  it('parses the device code response and requests the grok-cli:access scope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        device_code: 'dev-1',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://accounts.x.ai/oauth2/device',
        verification_uri_complete: 'https://accounts.x.ai/oauth2/device?user_code=ABCD-EFGH',
        interval: 5,
        expires_in: 600,
      }),
    );

    const device = await startDeviceFlow();
    expect(device.userCode).toBe('ABCD-EFGH');
    expect(device.verificationUriComplete).toContain('ABCD-EFGH');
    expect(device.intervalMs).toBe(5000);

    const body = (fetchMock.mock.calls[0]![1] as RequestInit).body as string;
    // Without this scope the proxy rejects inference with a "permission" error.
    expect(decodeURIComponent(body)).toContain('grok-cli:access');
  });
});

describe('pollForTokens', () => {
  const device: DeviceCode = {
    deviceCode: 'dev-1',
    userCode: 'ABCD-EFGH',
    verificationUri: 'https://accounts.x.ai/oauth2/device',
    verificationUriComplete: 'https://accounts.x.ai/oauth2/device?user_code=ABCD-EFGH',
    intervalMs: 1,
    expiresAt: Date.now() + 60_000,
  };

  it('polls through authorization_pending until tokens arrive', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }, 400))
      .mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }, 400))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
      );

    const tokens = await pollForTokens(device);
    expect(tokens.accessToken).toBe('at');
    expect(tokens.refreshToken).toBe('rt');
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
  });

  it('throws when the user denies access', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'access_denied' }, 400));
    await expect(pollForTokens(device)).rejects.toThrow(/denied/);
  });

  it('throws when the device code expires', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'expired_token' }, 400));
    await expect(pollForTokens(device)).rejects.toThrow(/expired/);
  });

  it('stops when cancelled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'authorization_pending' }, 400),
    );
    await expect(pollForTokens(device, () => true)).rejects.toThrow(/cancelled/);
  });
});

describe('refreshTokens', () => {
  it('returns fresh tokens and keeps the old refresh token when omitted', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'new-at', expires_in: 3600 }),
    );
    const tokens = await refreshTokens('old-rt');
    expect(tokens.accessToken).toBe('new-at');
    expect(tokens.refreshToken).toBe('old-rt');
  });

  it('throws a sign-in-again error on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400));
    await expect(refreshTokens('bad')).rejects.toThrow(/sign in again/i);
  });
});

describe('ensureFreshAccessToken', () => {
  it('returns the current token while it is fresh', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      grokTokens: { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 600_000 },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    expect(await ensureFreshAccessToken(settings)).toBe('at');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes and persists when the token is near expiry', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      grokTokens: { accessToken: 'old', refreshToken: 'rt', expiresAt: Date.now() + 30_000 },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'fresh', refresh_token: 'rt2', expires_in: 3600 }),
    );

    const settings = await getSettings();
    expect(await ensureFreshAccessToken(settings)).toBe('fresh');

    const persisted = await getSettings();
    expect(persisted.grokTokens?.accessToken).toBe('fresh');
    expect(persisted.grokTokens?.refreshToken).toBe('rt2');
  });

  it('throws when not signed in', async () => {
    await expect(
      ensureFreshAccessToken({ ...DEFAULT_SETTINGS, grokTokens: null }),
    ).rejects.toThrow(/sign in/i);
  });
});
