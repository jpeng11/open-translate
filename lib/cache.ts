import { browser } from 'wxt/browser';
import { translateBatch } from './provider';
import type { Settings } from './settings';

/** djb2 — short stable cache keys for (model, targetLang, text). */
export function hashKey(model: string, lang: string, text: string): string {
  const input = `${model}|${lang}|${text}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `ot:${(hash >>> 0).toString(36)}:${input.length.toString(36)}`;
}

async function cacheGet(keys: string[]): Promise<Record<string, string>> {
  try {
    return (await browser.storage.session.get(keys)) as Record<string, string>;
  } catch {
    return {};
  }
}

async function cacheSet(entries: Record<string, string>): Promise<void> {
  try {
    await browser.storage.session.set(entries);
  } catch {
    // Session cache is best-effort; quota errors must not fail translation.
  }
}

export type BatchTranslator = (texts: string[], settings: Settings) => Promise<string[]>;

/** Translate texts, serving repeats from the session cache so revisits don't re-bill the user. */
export async function translateWithCache(
  texts: string[],
  settings: Settings,
  translate: BatchTranslator = translateBatch,
): Promise<string[]> {
  const keys = texts.map((t) => hashKey(settings.model, settings.targetLang, t));
  const cached = await cacheGet(keys);

  const missingIndexes = texts.map((_, i) => i).filter((i) => cached[keys[i]!] === undefined);
  if (missingIndexes.length > 0) {
    const fresh = await translate(missingIndexes.map((i) => texts[i]!), settings);
    const newEntries: Record<string, string> = {};
    missingIndexes.forEach((textIndex, j) => {
      cached[keys[textIndex]!] = fresh[j] ?? '';
      newEntries[keys[textIndex]!] = fresh[j] ?? '';
    });
    await cacheSet(newEntries);
  }

  return texts.map((_, i) => cached[keys[i]!] ?? '');
}
