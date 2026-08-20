/** Floating panel showing the result of "Translate this image". */
import type { ImageTranslationMessage } from '@/lib/messaging';

const PANEL_ID = 'ot-image-panel';

function findImage(srcUrl: string): HTMLImageElement | null {
  for (const img of Array.from(document.images)) {
    if (img.currentSrc === srcUrl || img.src === srcUrl) return img;
  }
  return null;
}

function ensurePanel(): HTMLElement {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = [
    'position: absolute',
    'z-index: 2147483646',
    'max-width: 420px',
    'padding: 10px 12px',
    'border-radius: 8px',
    'background: #1e293b',
    'color: #f1f5f9',
    'font: 13px/1.5 system-ui, sans-serif',
    'white-space: pre-wrap',
    'box-shadow: 0 4px 16px rgba(0,0,0,.35)',
  ].join(';');

  const close = document.createElement('button');
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Close');
  close.style.cssText =
    'position:absolute;top:4px;right:6px;background:none;border:none;color:#94a3b8;cursor:pointer;font-size:12px';
  close.addEventListener('click', () => panel?.remove());
  panel.appendChild(close);

  const body = document.createElement('div');
  body.className = 'ot-image-panel-body';
  body.style.paddingRight = '14px';
  panel.appendChild(body);

  document.body.appendChild(panel);
  return panel;
}

function positionPanel(panel: HTMLElement, srcUrl: string): void {
  const img = findImage(srcUrl);
  if (img) {
    const rect = img.getBoundingClientRect();
    panel.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
    panel.style.top = `${rect.bottom + window.scrollY + 6}px`;
  } else {
    // Image not found (srcset swap, canvas, etc.) — pin near the viewport top.
    panel.style.left = `${window.scrollX + 16}px`;
    panel.style.top = `${window.scrollY + 16}px`;
  }
}

export function showImagePanel(msg: ImageTranslationMessage): void {
  const panel = ensurePanel();
  const body = panel.querySelector<HTMLElement>('.ot-image-panel-body')!;

  if (msg.status === 'pending') {
    body.textContent = 'Translating image…';
    body.style.color = '#94a3b8';
  } else if (msg.status === 'done') {
    body.textContent = msg.text;
    body.style.color = '#f1f5f9';
  } else {
    body.textContent = `Image translation failed: ${msg.message}`;
    body.style.color = '#fca5a5';
  }
  positionPanel(panel, msg.srcUrl);
}
