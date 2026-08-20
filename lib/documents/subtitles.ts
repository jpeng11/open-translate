/** SRT and ASS subtitle parsing + bilingual serialization. */

export interface SrtCue {
  index: number;
  timing: string;
  lines: string[];
}

export function parseSrt(content: string): SrtCue[] {
  const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const cues: SrtCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) continue;
    const index = Number.parseInt(lines[0]!.trim(), 10);
    const timing = lines[1]!.trim();
    if (!Number.isFinite(index) || !timing.includes('-->')) continue;
    cues.push({ index, timing, lines: lines.slice(2) });
  }
  return cues;
}

export function cueText(cue: SrtCue): string {
  return cue.lines.join(' ').trim();
}

/** Original lines followed by the translated line in each cue. */
export function serializeBilingualSrt(cues: SrtCue[], translations: string[]): string {
  return cues
    .map((cue, i) => {
      const lines = [...cue.lines];
      const translated = translations[i]?.trim();
      if (translated) lines.push(translated);
      return `${cue.index}\n${cue.timing}\n${lines.join('\n')}`;
    })
    .join('\n\n')
    .concat('\n');
}

const ASS_DIALOGUE_FIELDS = 9; // Text is the 10th comma-separated field of a Dialogue line

export function isAss(content: string): boolean {
  return /^\s*\[Script Info\]/m.test(content) || /^Dialogue:/m.test(content);
}

/** Extract the text field of each Dialogue line, with ASS override tags stripped for translation. */
export function parseAssDialogueTexts(content: string): string[] {
  const texts: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith('Dialogue:')) continue;
    const parts = line.split(',');
    const text = parts.slice(ASS_DIALOGUE_FIELDS).join(',');
    texts.push(text.replace(/\{[^}]*\}/g, '').replace(/\\N/gi, ' ').trim());
  }
  return texts;
}

/** Rewrite each Dialogue line as "original\Ntranslation"; everything else passes through. */
export function serializeBilingualAss(content: string, translations: string[]): string {
  let cueIndex = 0;
  return content
    .split(/\r?\n/)
    .map((line) => {
      if (!line.startsWith('Dialogue:')) return line;
      const translated = translations[cueIndex++]?.trim();
      if (!translated) return line;
      return `${line}\\N${translated}`;
    })
    .join('\n');
}
