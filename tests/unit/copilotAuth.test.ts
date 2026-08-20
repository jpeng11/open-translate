import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  startCopilotDeviceFlow,
  pollForGithubToken,
  fetchCopilotToken,
  ensureFreshCopilotToken,
  COPILOT_HEADERS,
} from '@/lib/copilotAuth';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import type { Settings } from '@/lib/settings';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('startCopilotDeviceFlow', () => {
  it('requests a device code with the Copilot client id and read:user scope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        device_code: 'dc',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        interval: 5,
        expires_in: 900,
      }),
    );

    const device = await startCopilotDeviceFlow();
    expect(device.userCode).toBe('ABCD-1234');
    expect(device.verificationUri).toBe('https://github.com/login/device');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://github.com/login/device/code');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.client_id).toBe('Iv1.b507a08c87ecfe98');
    expect(body.scope).toBe('read:user');
  });
});

describe('pollForGithubToken', () => {
  const device = {
    deviceCode: 'dc',
    userCode: 'X',
    verificationUri: 'https://github.com/login/device',
    intervalMs: 1,
    expiresAt: Date.now() + 60_000,
  };

  it('keeps polling through authorization_pending, then returns the token', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'gho_test' }));
    await expect(pollForGithubToken(device)).resolves.toBe('gho_test');
  });

  it('throws on denial', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'access_denied' }));
    await expect(pollForGithubToken(device)).rejects.toThrow(/denied/);
  });
});

describe('fetchCopilotToken', () => {
  it('exchanges the GitHub token with editor headers and parses expiry', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 1500;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ token: 'cop_tok', expires_at: expiresAt }));

    const tokens = await fetchCopilotToken('gho_test');
    expect(tokens).toEqual({
      githubToken: 'gho_test',
      copilotToken: 'cop_tok',
      expiresAt: expiresAt * 1000,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/copilot_internal/v2/token');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('token gho_test');
    expect(headers['Copilot-Integration-Id']).toBe(COPILOT_HEADERS['Copilot-Integration-Id']);
  });

  it('explains a 403 as a missing subscription', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 403));
    await expect(fetchCopilotToken('gho_test')).rejects.toThrow(/Copilot subscription/);
  });
});

describe('ensureFreshCopilotToken', () => {
  const base: Settings = { ...DEFAULT_SETTINGS, authMode: 'copilotOauth' };

  it('returns the cached bearer while fresh', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const token = await ensureFreshCopilotToken({
      ...base,
      copilotTokens: { githubToken: 'gho', copilotToken: 'fresh', expiresAt: Date.now() + 600_000 },
    });
    expect(token).toBe('fresh');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-exchanges and persists when the bearer expired', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ token: 'renewed', expires_at: Math.floor(Date.now() / 1000) + 1500 }),
    );
    const token = await ensureFreshCopilotToken({
      ...base,
      copilotTokens: { githubToken: 'gho', copilotToken: 'stale', expiresAt: Date.now() - 1000 },
    });
    expect(token).toBe('renewed');
    const stored = await fakeBrowser.storage.local.get('settings');
    expect((stored.settings as Settings).copilotTokens?.copilotToken).toBe('renewed');
  });

  it('demands sign-in when no GitHub token is stored', async () => {
    await expect(ensureFreshCopilotToken({ ...base, copilotTokens: null })).rejects.toThrow(
      /sign in/i,
    );
  });
});
