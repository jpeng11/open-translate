import type { DisplayMode } from '@/lib/settings';

export const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, td, th, figcaption, caption, summary';
export const SKIP_CLOSEST =
  'code, pre, script, style, noscript, textarea, select, [contenteditable="true"], ' +
  '.ot-translation, .ot-original, nav';

export type OtState = 'pending' | 'done' | 'error';

export function ensureStyles() {
  if (document.getElementById('ot-styles')) return;
  const style = document.createElement('style');
  style.id = 'ot-styles';
  style.textContent = `
    .ot-translation { display: block; margin-top: 0.25em; opacity: 0.92; }
    .ot-hidden-original { display: none !important; }
    .ot-error-chip { font-size: 12px; color: #b91c1c; display: block; }
    #ot-more-btn {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      background: #2563eb; color: #fff; border: none; border-radius: 8px;
      padding: 8px 14px; font-size: 13px; font-family: system-ui, sans-serif;
      cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    #ot-sel-trigger {
      position: fixed; z-index: 2147483647; background: #2563eb; color: #fff;
      border: none; border-radius: 6px; padding: 4px 10px; font-size: 12px;
      font-family: system-ui, sans-serif; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    #ot-sel-panel {
      position: fixed; z-index: 2147483647; max-width: 380px; max-height: 40vh;
      overflow: auto; background: #fff; color: #111; border: 1px solid #e2e8f0;
      border-radius: 8px; padding: 10px 12px; font-size: 14px; line-height: 1.5;
      font-family: system-ui, sans-serif; white-space: pre-wrap;
      box-shadow: 0 4px 16px rgba(0,0,0,.18);
    }
  `;
  document.head.appendChild(style);
}

export function isTranslatableBlock(el: HTMLElement): boolean {
  if (el.dataset.otState) return false;
  if (el.closest(SKIP_CLOSEST)) return false;
  // Leaf blocks only, so nested structures (li > p) aren't translated twice.
  if (el.querySelector(BLOCK_SELECTOR)) return false;
  const text = el.innerText?.trim() ?? '';
  if (text.length < 2) return false;
  if (el.getClientRects().length === 0) return false;
  return true;
}

export function collectBlocks(): HTMLElement[] {
  const all = Array.from(document.body.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  return all.filter(isTranslatableBlock);
}

export function injectTranslation(el: HTMLElement, translation: string, mode: DisplayMode) {
  if (mode === 'translationOnly') {
    // Wrap originals so they can be hidden and later restored losslessly.
    const wrapper = document.createElement('span');
    wrapper.className = 'ot-original ot-hidden-original';
    while (el.firstChild) wrapper.appendChild(el.firstChild);
    el.appendChild(wrapper);
  }
  const span = document.createElement('span');
  span.className = 'ot-translation';
  span.textContent = translation;
  el.appendChild(span);
  el.dataset.otState = 'done' satisfies OtState;
}

export function markError(el: HTMLElement, message: string) {
  el.dataset.otState = 'error' satisfies OtState;
  const chip = document.createElement('span');
  chip.className = 'ot-translation ot-error-chip';
  chip.textContent = '⚠ translation failed';
  chip.title = message;
  el.appendChild(chip);
}
