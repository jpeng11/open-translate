export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  note?: string;
}

/**
 * Presets only fill the base URL and a suggested model.
 * The API key always comes from the user.
 */
export const PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
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
  },
];
