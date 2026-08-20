/** Chunking and progress-reporting driver shared by all document translators. */

export const DOC_MAX_BATCH_ITEMS = 25;
export const DOC_MAX_BATCH_CHARS = 4000;

export function chunkTexts(
  texts: string[],
  maxItems = DOC_MAX_BATCH_ITEMS,
  maxChars = DOC_MAX_BATCH_CHARS,
): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let chars = 0;
  texts.forEach((text, i) => {
    if (current.length > 0 && (current.length >= maxItems || chars + text.length > maxChars)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(i);
    chars += text.length;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export type SnippetTranslator = (texts: string[]) => Promise<string[]>;

/**
 * Translate all texts chunk-by-chunk, reporting progress after each chunk.
 * A failed chunk fails the whole run — document exports should be complete or not at all.
 */
export async function translateAll(
  texts: string[],
  translate: SnippetTranslator,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const chunks = chunkTexts(texts);
  const results: string[] = new Array(texts.length).fill('');
  let done = 0;
  for (const chunk of chunks) {
    const translated = await translate(chunk.map((i) => texts[i]!));
    chunk.forEach((textIndex, j) => {
      results[textIndex] = translated[j] ?? '';
    });
    done++;
    onProgress?.(done, chunks.length);
  }
  return results;
}
