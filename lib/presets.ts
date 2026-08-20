import type { AuthMode } from './settings';
import { GROK_PROXY_BASE_URL, GROK_DEFAULT_MODEL } from './grokAuth';

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  authMode: AuthMode;
  note?: string;
}

/**
 * Presets only fill the base URL and a suggested model.
 * Credentials always come from the user (API key or OAuth sign-in).
 */
export const PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    authMode: 'apiKey',
  },
  {
    id: 'grok-oauth',
    label: 'Grok — Sign in with X (SuperGrok / X Premium)',
    baseUrl: GROK_PROXY_BASE_URL,
    model: GROK_DEFAULT_MODEL,
    authMode: 'grokOauth',
    note:
      'Uses your SuperGrok or X Premium+ subscription via OAuth — no API key needed. ' +
      'Note: xAI gates this endpoint by account entitlement; if translation fails with ' +
      '403 or "does not have Grok Code CLI permission" after signing in, your tier is ' +
      'not allowlisted — use an xAI API key (console.x.ai, base URL https://api.x.ai/v1) ' +
      'with the Custom preset instead.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    authMode: 'apiKey',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    authMode: 'apiKey',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    authMode: 'apiKey',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    authMode: 'apiKey',
    note:
      'Ollama must allow extension origins: start it with OLLAMA_ORIGINS=* ' +
      '(or set the extension origin), otherwise requests fail with 403. ' +
      'No API key needed — leave it blank or type anything.',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    model: '',
    authMode: 'apiKey',
  },
];
