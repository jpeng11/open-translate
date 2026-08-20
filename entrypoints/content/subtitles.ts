/**
 * Bilingual video subtitles for YouTube.
 *
 * Mirrors the native caption cues from the player DOM (robust against API
 * changes, works for auto-generated and live captions) and renders a
 * translated line in an overlay below them. Cue translations go through the
 * background session cache, so repeated cues aren't re-billed.
 */
import { browser } from 'wxt/browser';
import type { SnippetResponse } from '@/lib/messaging';

const CAPTION_SEGMENT = '.ytp-caption-segment';
const PLAYER = '.html5-video-player';
const OVERLAY_ID = 'ot-subtitle-overlay';

/** Collapse whitespace so the same cue rendered twice hits the cache. */
export function normalizeCue(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Read the currently displayed native caption text from the player DOM. */
export function readCueFromDom(root: ParentNode = document): string {
  const segments = Array.from(root.querySelectorAll<HTMLElement>(CAPTION_SEGMENT));
  return normalizeCue(segments.map((s) => s.textContent ?? '').join(' '));
}

export function isYouTubeWatchPage(loc: Pick<Location, 'hostname'> = location): boolean {
  return /(^|\.)youtube\.com$/.test(loc.hostname);
}

async function translateCue(text: string): Promise<string> {
  const response: SnippetResponse = await browser.runtime.sendMessage({
    type: 'translateSnippets',
    texts: [text],
  });
  if (!response.ok) throw new Error(response.message);
  return response.translations[0] ?? '';
}

function ensureOverlay(): HTMLElement {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    'position: absolute',
    'left: 50%',
    'bottom: 9%',
    'transform: translateX(-50%)',
    'max-width: 88%',
    'padding: 3px 10px',
    'border-radius: 4px',
    'background: rgba(8, 8, 8, 0.78)',
    'color: #fff',
    'font-size: 20px',
    'line-height: 1.35',
    'font-family: system-ui, sans-serif',
    'text-align: center',
    'z-index: 60',
    'pointer-events: none',
    'display: none',
  ].join(';');
  (document.querySelector(PLAYER) ?? document.body).appendChild(overlay);
  return overlay;
}

export function initSubtitles(): void {
  if (!isYouTubeWatchPage()) return;

  let lastCue = '';
  let requestSeq = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const update = () => {
    const cue = readCueFromDom();
    const overlay = ensureOverlay();

    if (cue === '') {
      lastCue = '';
      overlay.style.display = 'none';
      return;
    }
    if (cue === lastCue) return;
    lastCue = cue;

    const seq = ++requestSeq;
    void translateCue(cue)
      .then((translation) => {
        // A newer cue may already be showing — never overwrite it with a stale result.
        if (seq !== requestSeq || translation === '') return;
        overlay.textContent = translation;
        overlay.style.display = 'block';
      })
      .catch(() => {
        if (seq === requestSeq) overlay.style.display = 'none';
      });
  };

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(update, 120);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
