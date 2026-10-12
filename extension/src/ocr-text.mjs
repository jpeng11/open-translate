// Tesseract's word segmentation inserts ASCII separators between CJK glyphs.
// Remove only those internal separators for Chinese/Japanese recognition; Latin
// word boundaries, Korean word spacing and explicit line breaks remain intact.
export function normalizeOcrText(text,language='eng') {
 const value=String(text || '');if(!language.split('+').some(code=>/^(?:chi_|jpn(?:_|$))/.test(code)))return value;
 return value.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]) +(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu,'$1');
}
