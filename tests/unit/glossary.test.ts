import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateBatch, parseGlossary } from '@/lib/provider';
import { DEFAULT_SETTINGS, matchesSite } from '@/lib/settings';
import type { Settings } from '@/lib/settings';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('parseGlossary', () => {
  it('parses term = translation lines and skips malformed ones', () => {
    expect(parseGlossary('LLM = 大语言模型\nnot a rule\nprompt=提示词\n =x\ny= ')).toEqual([
      ['LLM', '大语言模型'],
      ['prompt', '提示词'],
    ]);
  });

  it('keeps equals signs inside the translation', () => {
    expect(parseGlossary('a = b = c')).toEqual([['a', 'b = c']]);
  });
});

describe('glossary in prompts', () => {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    apiKey: 'sk-test',
    targetLang: 'zh-CN',
    glossary: 'LLM = 大语言模型\nkernel = 内核',
  };

  it('injects only the entries present in the batch', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: '["x"]' } }] })),
      );
    await translateBatch(['The LLM is fast.'], settings);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const system: string = body.messages[0].content;
    expect(system).toContain('"LLM" -> "大语言模型"');
    expect(system).not.toContain('内核');
  });

  it('adds no glossary clause when nothing matches', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: '["x"]' } }] })),
      );
    await translateBatch(['No terms here.'], settings);
    const system: string = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    ).messages[0].content;
    expect(system).not.toContain('glossary');
  });
});

describe('matchesSite', () => {
  it('matches exact hostnames and subdomains, not lookalikes', () => {
    expect(matchesSite('lemonde.fr', ['lemonde.fr'])).toBe(true);
    expect(matchesSite('www.lemonde.fr', ['lemonde.fr'])).toBe(true);
    expect(matchesSite('notlemonde.fr', ['lemonde.fr'])).toBe(false);
    expect(matchesSite('lemonde.fr.evil.example', ['lemonde.fr'])).toBe(false);
    expect(matchesSite('anything.com', [])).toBe(false);
  });
});
