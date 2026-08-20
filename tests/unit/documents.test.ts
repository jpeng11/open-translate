import { describe, it, expect, vi } from 'vitest';
import {
  parseSrt,
  cueText,
  serializeBilingualSrt,
  isAss,
  parseAssDialogueTexts,
  serializeBilingualAss,
} from '@/lib/documents/subtitles';
import {
  splitParagraphs,
  serializeBilingualTxt,
  serializeBilingualHtml,
} from '@/lib/documents/text';
import { chunkTexts, translateAll } from '@/lib/documents/batch';

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:03,000
Hello there.

2
00:00:04,000 --> 00:00:06,500
How are you
doing today?
`;

describe('SRT', () => {
  it('parses cues with indexes, timing, and multi-line text', () => {
    const cues = parseSrt(SAMPLE_SRT);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.index).toBe(1);
    expect(cues[0]!.timing).toBe('00:00:01,000 --> 00:00:03,000');
    expect(cueText(cues[1]!)).toBe('How are you doing today?');
  });

  it('handles CRLF line endings', () => {
    expect(parseSrt(SAMPLE_SRT.replace(/\n/g, '\r\n'))).toHaveLength(2);
  });

  it('skips malformed blocks', () => {
    expect(parseSrt('not a cue\n\n1\nno timing here\n')).toHaveLength(0);
  });

  it('serializes bilingual cues with the translation appended', () => {
    const cues = parseSrt(SAMPLE_SRT);
    const out = serializeBilingualSrt(cues, ['你好。', '你今天怎么样？']);
    expect(out).toContain('Hello there.\n你好。');
    expect(out).toContain('doing today?\n你今天怎么样？');
    expect(parseSrt(out)).toHaveLength(2); // round-trips as valid SRT
  });
});

const SAMPLE_ASS = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}Hello{\\i0} there
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Line one\\NLine two, with comma
`;

describe('ASS', () => {
  it('detects ASS content', () => {
    expect(isAss(SAMPLE_ASS)).toBe(true);
    expect(isAss(SAMPLE_SRT)).toBe(false);
  });

  it('extracts dialogue text with override tags stripped and commas preserved', () => {
    const texts = parseAssDialogueTexts(SAMPLE_ASS);
    expect(texts).toEqual(['Hello there', 'Line one Line two, with comma']);
  });

  it('appends translations to dialogue lines only', () => {
    const out = serializeBilingualAss(SAMPLE_ASS, ['你好', '两行']);
    expect(out).toContain('Hello{\\i0} there\\N你好');
    expect(out).toContain('with comma\\N两行');
    expect(out).toContain('[Script Info]'); // non-dialogue lines untouched
  });
});

describe('plain text', () => {
  it('splits on blank lines and trims', () => {
    expect(splitParagraphs('One.\n\nTwo.\n\n\n  Three.  \n')).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('serializes bilingual text pairs', () => {
    const out = serializeBilingualTxt(['One.', 'Two.'], ['一。', '二。']);
    expect(out).toBe('One.\n一。\n\nTwo.\n二。\n');
  });

  it('escapes HTML in bilingual HTML export', () => {
    const html = serializeBilingualHtml('T & <T>', [
      { heading: 'C1', pairs: [{ original: 'a < b', translation: 'a<b' }] },
    ]);
    expect(html).toContain('T &amp; &lt;T&gt;');
    expect(html).toContain('a &lt; b');
    expect(html).not.toContain('<b>');
  });
});

describe('batching', () => {
  it('chunks by item count', () => {
    const chunks = chunkTexts(['a', 'b', 'c'], 2, 1000);
    expect(chunks).toEqual([[0, 1], [2]]);
  });

  it('chunks by character budget', () => {
    const chunks = chunkTexts(['aaaa', 'bbbb', 'c'], 10, 8);
    expect(chunks).toEqual([[0, 1], [2]]);
  });

  it('translateAll preserves order and reports progress', async () => {
    const translator = vi.fn(async (texts: string[]) => texts.map((t) => t.toUpperCase()));
    const progress: [number, number][] = [];
    const result = await translateAll(
      ['a', 'b', 'c'],
      translator,
      (done, total) => progress.push([done, total]),
    );
    expect(result).toEqual(['A', 'B', 'C']);
    expect(progress[progress.length - 1]![0]).toBe(progress[progress.length - 1]![1]);
  });

  it('translateAll fails the whole run when a chunk fails', async () => {
    const translator = vi.fn(async () => {
      throw new Error('provider down');
    });
    await expect(translateAll(['a'], translator)).rejects.toThrow('provider down');
  });
});
