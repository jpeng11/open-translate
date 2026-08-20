import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { hashKey, translateWithCache } from '@/lib/cache';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import type { Settings } from '@/lib/settings';

const settings: Settings = { ...DEFAULT_SETTINGS, model: 'm1', targetLang: 'zh-CN' };

beforeEach(() => {
  fakeBrowser.reset();
});

describe('hashKey', () => {
  it('is stable for identical input', () => {
    expect(hashKey('m', 'zh', 'hello')).toBe(hashKey('m', 'zh', 'hello'));
  });

  it('differs across model, language, and text', () => {
    const base = hashKey('m', 'zh', 'hello');
    expect(hashKey('m2', 'zh', 'hello')).not.toBe(base);
    expect(hashKey('m', 'ja', 'hello')).not.toBe(base);
    expect(hashKey('m', 'zh', 'hallo')).not.toBe(base);
  });
});

describe('translateWithCache', () => {
  it('translates uncached texts and preserves order', async () => {
    const translator = vi.fn(async (texts: string[]) => texts.map((t) => `T(${t})`));
    const result = await translateWithCache(['a', 'b'], settings, translator);
    expect(result).toEqual(['T(a)', 'T(b)']);
    expect(translator).toHaveBeenCalledOnce();
  });

  it('serves repeat requests entirely from cache', async () => {
    const translator = vi.fn(async (texts: string[]) => texts.map((t) => `T(${t})`));
    await translateWithCache(['a', 'b'], settings, translator);
    const second = await translateWithCache(['a', 'b'], settings, translator);
    expect(second).toEqual(['T(a)', 'T(b)']);
    expect(translator).toHaveBeenCalledOnce();
  });

  it('only sends cache misses to the translator', async () => {
    const translator = vi.fn(async (texts: string[]) => texts.map((t) => `T(${t})`));
    await translateWithCache(['a'], settings, translator);
    const result = await translateWithCache(['a', 'b', 'c'], settings, translator);
    expect(result).toEqual(['T(a)', 'T(b)', 'T(c)']);
    expect(translator).toHaveBeenLastCalledWith(['b', 'c'], settings);
  });

  it('does not reuse cache across different models or languages', async () => {
    const translator = vi.fn(async (texts: string[]) => texts.map((t) => `T(${t})`));
    await translateWithCache(['a'], settings, translator);
    await translateWithCache(['a'], { ...settings, model: 'm2' }, translator);
    await translateWithCache(['a'], { ...settings, targetLang: 'ja' }, translator);
    expect(translator).toHaveBeenCalledTimes(3);
  });
});
