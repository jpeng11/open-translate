import type { AuthMode } from './settings';
import { GROK_PROXY_BASE_URL, GROK_DEFAULT_MODEL } from './grokAuth';
import { COPILOT_BASE_URL, COPILOT_DEFAULT_MODEL } from './copilotAuth';

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  authMode: AuthMode;
  note?: string;
  /** Known-good model names, offered as suggestions in the options UI. */
  modelSuggestions?: string[];
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
    // Verified live against the CLI proxy; grok-4-fast is ~2x faster than grok-4.6.
    modelSuggestions: ['grok-4-fast', 'grok-4.6', 'grok-code-fast-1'],
    note:
      'Uses your SuperGrok or X Premium+ subscription via OAuth — no API key needed. ' +
      'If translation still fails with a permission error after signing in, switch to ' +
      'the "xAI Grok (API key)" preset instead.',
  },
  {
    id: 'copilot-oauth',
    label: 'GitHub Copilot — Sign in with GitHub',
    baseUrl: COPILOT_BASE_URL,
    model: COPILOT_DEFAULT_MODEL,
    authMode: 'copilotOauth',
    modelSuggestions: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1'],
    note:
      'Uses your GitHub Copilot subscription via OAuth — no API key needed. ' +
      'After signing in, click "Fetch models" to see what your plan includes.',
  },
  {
    id: 'xai-key',
    label: 'xAI Grok (API key)',
    baseUrl: 'https://api.x.ai/v1',
    model: GROK_DEFAULT_MODEL,
    authMode: 'apiKey',
    modelSuggestions: ['grok-4-fast', 'grok-4.6', 'grok-code-fast-1'],
    note:
      'Pay-per-token key from console.x.ai. Not gated by subscription tier — use this ' +
      'when Grok OAuth sign-in succeeds but translation returns a permission error.',
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
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-4-5',
    authMode: 'apiKey',
    modelSuggestions: ['claude-haiku-4-5', 'claude-sonnet-4-5'],
    note: 'Uses Anthropic\u2019s OpenAI-compatible endpoint. Haiku is fast and cheap — ideal for translation.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    authMode: 'apiKey',
    modelSuggestions: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    note: 'API key from Google AI Studio (aistudio.google.com). Flash is fast and has a free tier.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    authMode: 'apiKey',
    modelSuggestions: ['mistral-small-latest', 'mistral-large-latest'],
  },
  {
    id: 'together',
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    authMode: 'apiKey',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    authMode: 'apiKey',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'llama-3.3-70b',
    authMode: 'apiKey',
    note: 'Extremely fast inference — great for translating long pages.',
  },
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.ai/v1',
    model: 'kimi-latest',
    authMode: 'apiKey',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    authMode: 'apiKey',
    note: 'Enable the local server in LM Studio (Developer tab) and allow CORS. ' +
      'No API key needed — use "Fetch models" to pick a loaded model.',
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
