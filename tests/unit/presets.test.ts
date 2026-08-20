import { describe, it, expect } from 'vitest';
import { PRESETS } from '@/lib/presets';
import { GROK_PROXY_BASE_URL } from '@/lib/grokAuth';

describe('provider presets', () => {
  it('has unique ids', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every non-custom preset has a valid base URL and a model', () => {
    for (const p of PRESETS) {
      if (p.id === 'custom') continue;
      expect(() => new URL(p.baseUrl), `${p.id} baseUrl`).not.toThrow();
      expect(p.model, `${p.id} model`).not.toBe('');
    }
  });

  it('exactly one preset uses Grok OAuth and it points at the CLI proxy', () => {
    const oauth = PRESETS.filter((p) => p.authMode === 'grokOauth');
    expect(oauth).toHaveLength(1);
    expect(oauth[0]!.baseUrl).toBe(GROK_PROXY_BASE_URL);
  });

  it('exactly one preset uses Copilot OAuth and it points at the Copilot API', () => {
    const oauth = PRESETS.filter((p) => p.authMode === 'copilotOauth');
    expect(oauth).toHaveLength(1);
    expect(oauth[0]!.baseUrl).toBe('https://api.githubcopilot.com');
  });

  it('pairs every subscription OAuth preset with an API-key fallback', () => {
    const byId = new Map(PRESETS.map((p) => [p.id, p]));
    expect(byId.get('claude-oauth')?.authMode).toBe('claudeOauth');
    expect(byId.get('codex-oauth')?.authMode).toBe('codexOauth');
    // OAuth ↔ API-key pairs (GitHub has no key path: GitHub Models retired 2026-07-30).
    for (const [oauth, apiKey] of [
      ['grok-oauth', 'xai-key'],
      ['claude-oauth', 'anthropic'],
      ['codex-oauth', 'openai'],
    ] as const) {
      expect(byId.get(oauth), oauth).toBeDefined();
      expect(byId.get(apiKey)?.authMode, apiKey).toBe('apiKey');
    }
  });

  it('offers an xAI API-key fallback preset', () => {
    const xai = PRESETS.find((p) => p.id === 'xai-key');
    expect(xai).toBeDefined();
    expect(xai!.authMode).toBe('apiKey');
    expect(xai!.baseUrl).toBe('https://api.x.ai/v1');
  });

  it('documents the Ollama CORS requirement', () => {
    const ollama = PRESETS.find((p) => p.id === 'ollama');
    expect(ollama?.note).toMatch(/OLLAMA_ORIGINS/);
  });

  it('covers the major OpenAI-compatible providers', () => {
    const ids = PRESETS.map((p) => p.id);
    for (const id of [
      'openai',
      'anthropic',
      'gemini',
      'mistral',
      'openrouter',
      'deepseek',
      'groq',
      'together',
      'fireworks',
      'cerebras',
      'moonshot',
      'ollama',
      'lmstudio',
    ]) {
      expect(ids, `missing preset: ${id}`).toContain(id);
    }
  });
});
