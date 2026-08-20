import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  startClaudeSignIn,
  exchangeClaudeCode,
  refreshClaudeTokens,
  ensureFreshClaudeToken,
} from '@/lib/claudeAuth';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import type { Settings } from '@/lib/settings';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('startClaudeSignIn', () => {
  it('builds a copy/paste-mode authorize URL with S256 PKCE', async () => {
    const { url, verifier } = await startClaudeSignIn();
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://claude.ai');
    expect(parsed.pathname).toBe('/oauth/authorize');
    expect(parsed.searchParams.get('code')).toBe('true');
    expect(parsed.searchParams.get('client_id')).toBe('9d1c250a-e61b-44d9-88ed-5944d1962f5e');
    expect(parsed.searchParams.get('scope')).toContain('user:inference');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('code_challenge')).toBeTruthy();
    expect(parsed.searchParams.get('state')).toBe(verifier);
    // base64url, no padding
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('exchangeClaudeCode', () => {
  it('splits the pasted code#state string and exchanges it with the verifier', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
    );

    const tokens = await exchangeClaudeCode('the-code#the-state', 'the-verifier');
    expect(tokens.accessToken).toBe('at');
    expect(tokens.refreshToken).toBe('rt');
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://console.anthropic.com/v1/oauth/token');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      grant_type: 'authorization_code',
      code: 'the-code',
      state: 'the-state',
      code_verifier: 'the-verifier',
      redirect_uri: 'https://console.anthropic.com/oauth/code/callback',
    });
  });

  it('rejects an empty paste with a clear message', async () => {
    await expect(exchangeClaudeCode('  ', 'v')).rejects.toThrow(/Paste the full code/);
  });
});

describe('refreshClaudeTokens', () => {
  it('keeps the old refresh token when the response omits one', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'new-at', expires_in: 3600 }),
    );
    const tokens = await refreshClaudeTokens('old-rt');
    expect(tokens.accessToken).toBe('new-at');
    expect(tokens.refreshToken).toBe('old-rt');
  });
});

describe('ensureFreshClaudeToken', () => {
  const base: Settings = { ...DEFAULT_SETTINGS, authMode: 'claudeOauth' };

  it('returns the cached token while fresh', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const token = await ensureFreshClaudeToken({
      ...base,
      claudeTokens: { accessToken: 'fresh', refreshToken: 'rt', expiresAt: Date.now() + 600_000 },
    });
    expect(token).toBe('fresh');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes and persists when expired', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'renewed', refresh_token: 'rt2', expires_in: 3600 }),
    );
    const token = await ensureFreshClaudeToken({
      ...base,
      claudeTokens: { accessToken: 'stale', refreshToken: 'rt', expiresAt: Date.now() - 1000 },
    });
    expect(token).toBe('renewed');
    const stored = await fakeBrowser.storage.local.get('settings');
    expect((stored.settings as Settings).claudeTokens?.refreshToken).toBe('rt2');
  });

  it('demands sign-in when no tokens are stored', async () => {
    await expect(ensureFreshClaudeToken({ ...base, claudeTokens: null })).rejects.toThrow(
      /sign in/i,
    );
  });
});
