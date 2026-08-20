import { browser } from 'wxt/browser';

export type DisplayMode = 'bilingual' | 'translationOnly';

export interface Settings {
  baseUrl: string;
  apiKey: string;
  model: string;
  targetLang: string;
  neverTranslateLangs: string[];
  displayMode: DisplayMode;
  maxCharsPerPage: number;
  excludedSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  targetLang: '',
  neverTranslateLangs: [],
  displayMode: 'bilingual',
  maxCharsPerPage: 100_000,
  excludedSites: [],
};

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'it', label: 'Italiano' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
  { code: 'id', label: 'Bahasa Indonesia' },
];

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get('settings');
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
  if (!settings.targetLang) {
    const ui = browser.i18n?.getUILanguage?.() ?? 'en';
    settings.targetLang = LANGUAGES.some((l) => l.code === ui) ? ui : ui.split('-')[0] || 'en';
  }
  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}
