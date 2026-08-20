import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  startCodexDeviceFlow,
  completeCodexSignIn,
  accountIdFromIdToken,
  ensureFreshCodexTokens,
} from '@/lib/codexAuth';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import type { Settings } from '@/lib/settings';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function makeIdToken(claims: Record<string, unknown>): string {
  const b64 = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('startCodexDeviceFlow', () => {
  it('requests a user code with the Codex client id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ device_auth_id: 'da-1', user_code: 'AAAAB-BB6TU', interval: 5 }),
    );
    const device = await startCodexDeviceFlow();
    expect(device.userCode).toBe('AAAAB-BB6TU');
    expect(device.verificationUri).toBe('https://auth.openai.com/codex/device');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://auth.openai.com/api/accounts/deviceauth/usercode');
    expect(JSON.parse((init as RequestInit).body as string).client_id).toBe(
      'app_EMoamEEZ73f0CkXaXp7hrann',
    );
  });

  it('explains a 404 as the account-level toggle being disabled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 404));
    await expect(startCodexDeviceFlow()).rejects.toThrow(/Device code authorization/);
  });
});

describe('accountIdFromIdToken', () => {
  it('extracts the ChatGPT account id from the auth claim', () => {
    const idToken = makeIdToken({
      'https://api.openai.com/auth': { chatgpt_account_id: 'acct-123' },
    });
    expect(accountIdFromIdToken(idToken)).toBe('acct-123');
  });

  it('returns empty for malformed tokens', () => {
    expect(accountIdFromIdToken('garbage')).toBe('');
  });
});

describe('completeCodexSignIn', () => {
  const device = {
    deviceAuthId: 'da-1',
    userCode: 'AAAAB-BB6TU',
    verificationUri: 'https://auth.openai.com/codex/device',
    intervalMs: 1,
    expiresAt: Date.now() + 60_000,
  };

  it('polls until approved, then exchanges the code with the server PKCE verifier', async () => {
    const idToken = makeIdToken({
      'https://api.openai.com/auth': { chatgpt_account_id: 'acct-123' },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, 403)) // pending
      .mockResolvedValueOnce(
        jsonResponse({ authorization_code: 'authz', code_verifier: 'srv-verifier', code_challenge: 'c' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'at',
          refresh_token: 'rt',
          id_token: idToken,
          expires_in: 3600,
        }),
      );

    const tokens = await completeCodexSignIn(device);
    expect(tokens.accessToken).toBe('at');
    expect(tokens.accountId).toBe('acct-123');

    const [exchangeUrl, exchangeInit] = fetchMock.mock.calls[2]!;
    expect(exchangeUrl).toBe('https://auth.openai.com/oauth/token');
    const params = new URLSearchParams((exchangeInit as RequestInit).body as string);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('authz');
    expect(params.get('code_verifier')).toBe('srv-verifier');
    expect(params.get('redirect_uri')).toBe('https://auth.openai.com/deviceauth/callback');
  });
});

describe('ensureFreshCodexTokens', () => {
  const base: Settings = { ...DEFAULT_SETTINGS, authMode: 'codexOauth' };

  it('returns cached tokens while fresh', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const tokens = await ensureFreshCodexTokens({
      ...base,
      codexTokens: {
        accessToken: 'fresh',
        refreshToken: 'rt',
        accountId: 'acct',
        expiresAt: Date.now() + 600_000,
      },
    });
    expect(tokens.accessToken).toBe('fresh');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes, keeps the account id, and persists when expired', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'renewed', expires_in: 3600 }),
    );
    const tokens = await ensureFreshCodexTokens({
      ...base,
      codexTokens: {
        accessToken: 'stale',
        refreshToken: 'rt',
        accountId: 'acct',
        expiresAt: Date.now() - 1000,
      },
    });
    expect(tokens.accessToken).toBe('renewed');
    expect(tokens.accountId).toBe('acct');
    const stored = await fakeBrowser.storage.local.get('settings');
    expect((stored.settings as Settings).codexTokens?.accessToken).toBe('renewed');
  });

  it('demands sign-in when no tokens are stored', async () => {
    await expect(ensureFreshCodexTokens({ ...base, codexTokens: null })).rejects.toThrow(
      /sign in/i,
    );
  });
});
