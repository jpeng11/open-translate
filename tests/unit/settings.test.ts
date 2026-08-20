import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getSettings, saveSettings, DEFAULT_SETTINGS, languageLabel, LANGUAGES } from '@/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('getSettings', () => {
  it('returns defaults with a resolved target language when nothing is stored', async () => {
    const settings = await getSettings();
    expect(settings.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl);
    expect(settings.apiKey).toBe('');
    expect(settings.displayMode).toBe('bilingual');
    expect(settings.targetLang).not.toBe('');
  });

  it('merges stored values over defaults', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'sk-1', targetLang: 'ja', model: 'x' });
    const settings = await getSettings();
    expect(settings.apiKey).toBe('sk-1');
    expect(settings.targetLang).toBe('ja');
    expect(settings.model).toBe('x');
    expect(settings.maxCharsPerPage).toBe(DEFAULT_SETTINGS.maxCharsPerPage);
  });

  it('round-trips arrays and nested token objects', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      excludedSites: ['a.com', 'b.com'],
      neverTranslateLangs: ['en'],
      grokTokens: { accessToken: 't', refreshToken: 'r', expiresAt: 123 },
    });
    const settings = await getSettings();
    expect(settings.excludedSites).toEqual(['a.com', 'b.com']);
    expect(settings.neverTranslateLangs).toEqual(['en']);
    expect(settings.grokTokens).toEqual({ accessToken: 't', refreshToken: 'r', expiresAt: 123 });
  });
});

describe('languages', () => {
  it('labels known languages and echoes unknown codes', () => {
    expect(languageLabel('ja')).toBe('日本語');
    expect(languageLabel('xx-YY')).toBe('xx-YY');
  });

  it('has unique language codes', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
