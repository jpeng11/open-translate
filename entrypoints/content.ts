import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { getSettings } from '@/lib/settings';
import type { Settings } from '@/lib/settings';
import { TRANSLATE_PORT } from '@/lib/messaging';
import type { TranslateResponse, RuntimeMessage, PageState } from '@/lib/messaging';

const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, td, th, figcaption, caption, summary';
const SKIP_CLOSEST =
  'code, pre, script, style, noscript, textarea, select, [contenteditable="true"], ' +
  '.ot-translation, .ot-original, nav';
const MAX_BATCH_ITEMS = 30;
const MAX_BATCH_CHARS = 4000;

type OtState = 'pending' | 'done' | 'error';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let translated = false;
    let translating = false;
    let blocksTranslated = 0;
    let charsUsed = 0;
    let leftoverBlocks: HTMLElement[] = [];
    let observer: MutationObserver | null = null;

    // --- styles -----------------------------------------------------------

    function ensureStyles() {
      if (document.getElementById('ot-styles')) return;
      const style = document.createElement('style');
      style.id = 'ot-styles';
      style.textContent = `
        .ot-translation { display: block; margin-top: 0.25em; opacity: 0.92; }
        td .ot-translation, th .ot-translation { display: block; }
        .ot-hidden-original { display: none !important; }
        .ot-error-chip { font-size: 12px; color: #b91c1c; display: block; }
        #ot-more-btn {
          position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
          background: #2563eb; color: #fff; border: none; border-radius: 8px;
          padding: 8px 14px; font-size: 13px; font-family: system-ui, sans-serif;
          cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25);
        }
      `;
      document.head.appendChild(style);
    }

    // --- block collection ---------------------------------------------------

    function collectBlocks(): HTMLElement[] {
      const all = Array.from(document.body.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
      return all.filter((el) => {
        if (el.dataset.otState) return false;
        if (el.closest(SKIP_CLOSEST)) return false;
        // Leaf blocks only, so nested structures (li > p) aren't translated twice.
        if (el.querySelector(BLOCK_SELECTOR)) return false;
        const text = el.innerText?.trim() ?? '';
        if (text.length < 2) return false;
        if (el.getClientRects().length === 0) return false;
        return true;
      });
    }

    // --- injection ----------------------------------------------------------

    function inject(el: HTMLElement, translation: string, mode: Settings['displayMode']) {
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
      blocksTranslated++;
    }

    function markError(el: HTMLElement, message: string) {
      el.dataset.otState = 'error' satisfies OtState;
      const chip = document.createElement('span');
      chip.className = 'ot-translation ot-error-chip';
      chip.textContent = '⚠ translation failed';
      chip.title = message;
      el.appendChild(chip);
    }

    function restore() {
      observer?.disconnect();
      observer = null;
      document.querySelectorAll('.ot-translation').forEach((n) => n.remove());
      document.querySelectorAll<HTMLElement>('.ot-original').forEach((wrapper) => {
        const parent = wrapper.parentElement;
        if (!parent) return;
        while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
        wrapper.remove();
      });
      document.querySelectorAll<HTMLElement>('[data-ot-state]').forEach((el) => {
        delete el.dataset.otState;
      });
      document.getElementById('ot-more-btn')?.remove();
      translated = false;
      translating = false;
      blocksTranslated = 0;
      charsUsed = 0;
      leftoverBlocks = [];
    }

    // --- cost guard ---------------------------------------------------------

    function splitByBudget(blocks: HTMLElement[], budget: number) {
      const within: HTMLElement[] = [];
      const beyond: HTMLElement[] = [];
      let used = 0;
      for (const el of blocks) {
        const len = (el.innerText ?? '').trim().length;
        if (used + len <= budget || within.length === 0) {
          within.push(el);
          used += len;
        } else {
          beyond.push(el);
        }
      }
      return { within, beyond, used };
    }

    function showMoreButton(settings: Settings) {
      if (leftoverBlocks.length === 0) {
        document.getElementById('ot-more-btn')?.remove();
        return;
      }
      let btn = document.getElementById('ot-more-btn') as HTMLButtonElement | null;
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'ot-more-btn';
        btn.addEventListener('click', () => {
          const next = leftoverBlocks;
          leftoverBlocks = [];
          btn!.remove();
          void translateBlocks(next, settings);
        });
        document.body.appendChild(btn);
      }
      btn.textContent = `Translate rest of page (${leftoverBlocks.length} blocks)`;
    }

    // --- translation driver ---------------------------------------------------

    function makeBatches(blocks: HTMLElement[]): HTMLElement[][] {
      const batches: HTMLElement[][] = [];
      let current: HTMLElement[] = [];
      let chars = 0;
      for (const el of blocks) {
        const len = (el.innerText ?? '').trim().length;
        if (current.length > 0 && (current.length >= MAX_BATCH_ITEMS || chars + len > MAX_BATCH_CHARS)) {
          batches.push(current);
          current = [];
          chars = 0;
        }
        current.push(el);
        chars += len;
      }
      if (current.length > 0) batches.push(current);
      return batches;
    }

    async function translateBlocks(blocks: HTMLElement[], settings: Settings): Promise<void> {
      if (blocks.length === 0) return;
      ensureStyles();
      translating = true;

      const batches = makeBatches(blocks);
      // The open port doubles as the MV3 service-worker keepalive.
      const port = browser.runtime.connect({ name: TRANSLATE_PORT });
      const pending = new Map<number, HTMLElement[]>();

      await new Promise<void>((resolve) => {
        port.onMessage.addListener((msg: TranslateResponse) => {
          const els = pending.get(msg.id);
          if (!els) return;
          pending.delete(msg.id);
          if (msg.type === 'result') {
            els.forEach((el, i) => inject(el, msg.translations[i] ?? '', settings.displayMode));
          } else {
            els.forEach((el) => markError(el, msg.message));
          }
          if (pending.size === 0) resolve();
        });
        port.onDisconnect.addListener(() => resolve());

        batches.forEach((els, id) => {
          els.forEach((el) => {
            el.dataset.otState = 'pending' satisfies OtState;
          });
          pending.set(id, els);
          port.postMessage({
            type: 'translate',
            id,
            texts: els.map((el) => el.innerText.trim()),
          });
        });
      });

      // Failed blocks get another chance on the next run.
      document.querySelectorAll<HTMLElement>('[data-ot-state="pending"]').forEach((el) => {
        delete el.dataset.otState;
      });
      port.disconnect();
      translating = false;
      translated = true;
    }

    // --- SPA support -----------------------------------------------------------

    function startObserver(settings: Settings) {
      if (observer) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      observer = new MutationObserver((mutations) => {
        const relevant = mutations.some((m) =>
          Array.from(m.addedNodes).some(
            (n) =>
              n instanceof HTMLElement &&
              !n.closest('.ot-translation, .ot-original, #ot-more-btn'),
          ),
        );
        if (!relevant || !translated || translating) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const blocks = collectBlocks();
          if (blocks.length === 0) return;
          const budget = settings.maxCharsPerPage - charsUsed;
          const { within, beyond, used } = splitByBudget(blocks, Math.max(budget, 0));
          if (budget <= 0) {
            leftoverBlocks.push(...blocks);
            showMoreButton(settings);
            return;
          }
          charsUsed += used;
          leftoverBlocks.push(...beyond);
          showMoreButton(settings);
          void translateBlocks(within, settings);
        }, 800);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    async function translatePage(): Promise<void> {
      if (translating) return;
      const settings = await getSettings();
      if (settings.excludedSites.includes(location.hostname)) return;

      const blocks = collectBlocks();
      const { within, beyond, used } = splitByBudget(blocks, settings.maxCharsPerPage - charsUsed);
      charsUsed += used;
      leftoverBlocks = beyond;
      showMoreButton(settings);
      await translateBlocks(within, settings);
      startObserver(settings);
    }

    // --- message handling ------------------------------------------------------

    // Synchronous sendResponse — Chrome MV3 ignores Promises returned from listeners.
    browser.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
      if (msg?.type === 'translatePage') {
        void translatePage();
        sendResponse({ ok: true });
      } else if (msg?.type === 'restorePage') {
        restore();
        sendResponse({ ok: true });
      } else if (msg?.type === 'getPageState') {
        const state: PageState = { translated, translating, blocksTranslated };
        sendResponse(state);
      }
    });
  },
});
