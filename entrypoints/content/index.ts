import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { getSettings } from '@/lib/settings';
import type { Settings } from '@/lib/settings';
import { TRANSLATE_PORT } from '@/lib/messaging';
import type { TranslateResponse, RuntimeMessage, PageState } from '@/lib/messaging';
import { collectBlocks, ensureStyles, injectTranslation, markError } from './dom';
import { initQuickTools } from './quick-tools';

const MAX_BATCH_ITEMS = 30;
const MAX_BATCH_CHARS = 4000;

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let translating = false;
    let charsUsed = 0;
    let leftoverBlocks: HTMLElement[] = [];
    let observer: MutationObserver | null = null;

    const doneCount = () => document.querySelectorAll('[data-ot-state="done"]').length;

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
      translating = false;
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
        if (
          current.length > 0 &&
          (current.length >= MAX_BATCH_ITEMS || chars + len > MAX_BATCH_CHARS)
        ) {
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
            els.forEach((el, i) => {
              delete el.dataset.otState;
              injectTranslation(el, msg.translations[i] ?? '', settings.displayMode);
            });
          } else {
            els.forEach((el) => markError(el, msg.message));
          }
          if (pending.size === 0) resolve();
        });
        port.onDisconnect.addListener(() => resolve());

        batches.forEach((els, id) => {
          els.forEach((el) => {
            el.dataset.otState = 'pending';
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
              !n.closest('.ot-translation, .ot-original, #ot-more-btn, #ot-sel-trigger, #ot-sel-panel'),
          ),
        );
        if (!relevant || translating) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const blocks = collectBlocks();
          if (blocks.length === 0) return;
          const budget = settings.maxCharsPerPage - charsUsed;
          if (budget <= 0) {
            leftoverBlocks.push(...blocks);
            showMoreButton(settings);
            return;
          }
          const { within, beyond, used } = splitByBudget(blocks, budget);
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
        const blocksTranslated = doneCount();
        const state: PageState = {
          translated: blocksTranslated > 0,
          translating,
          blocksTranslated,
        };
        sendResponse(state);
      }
    });

    initQuickTools();
  },
});
