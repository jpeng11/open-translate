// tesseract.js 7.0.0 loadLanguage reads object.code/object.data correctly, but
// initialize incorrectly joins object.data as the language name. Correct only
// this upstream typo to use the supported object language-data API safely.
export function patchTesseractWorker(source) {
  const before='t?t:t.data})).join("+")',after='t?t:t.code})).join("+")';
  if(source.split(before).length!==2)throw new Error('Tesseract worker changed; review its language-data initialization before building.');
  return '// Open Translate: initialize object language names from .code (Tesseract.js 7.0.0 fix).\n'+source.replace(before,after);
}
