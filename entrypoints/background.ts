import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { testConnection, translateImage } from '@/lib/provider';
import { translateWithCache } from '@/lib/cache';
import { fetchImageAsDataUrl } from '@/lib/images';
import { getSettings } from '@/lib/settings';
import { TRANSLATE_PORT } from '@/lib/messaging';
import type {
  TranslateRequest,
  TranslateResponse,
  RuntimeMessage,
  ImageTranslationMessage,
} from '@/lib/messaging';

const MAX_CONCURRENT = 3;
const IMAGE_MENU_ID = 'ot-translate-image';

/**
 * Chrome kills an idle MV3 service worker after ~30s, and a pending fetch does
 * NOT count as activity. While provider calls are in flight, poke an extension
 * API every 20s to reset the idle timer so slow models can't get us killed
 * mid-translation.
 */
let inFlightJobs = 0;
let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

function trackJob(delta: 1 | -1): void {
  inFlightJobs += delta;
  if (inFlightJobs > 0 && keepaliveTimer === undefined) {
    keepaliveTimer = setInterval(() => void browser.runtime.getPlatformInfo(), 20_000);
  } else if (inFlightJobs === 0 && keepaliveTimer !== undefined) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = undefined;
  }
}

async function handleImageTranslation(srcUrl: string, tabId: number): Promise<void> {
  const send = (msg: ImageTranslationMessage) =>
    browser.tabs.sendMessage(tabId, msg).catch(() => {
      // Tab navigated away or has no content script — nothing to report to.
    });

  await send({ type: 'imageTranslation', status: 'pending', srcUrl });
  trackJob(1);
  try {
    const settings = await getSettings();
    const dataUrl = await fetchImageAsDataUrl(srcUrl);
    const text = await translateImage(settings, dataUrl);
    await send({ type: 'imageTranslation', status: 'done', srcUrl, text });
  } catch (err) {
    await send({
      type: 'imageTranslation',
      status: 'error',
      srcUrl,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    trackJob(-1);
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: IMAGE_MENU_ID,
      title: 'Translate this image',
      contexts: ['image'],
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== IMAGE_MENU_ID || !info.srcUrl || !tab?.id) return;
    void handleImageTranslation(info.srcUrl, tab.id);
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== TRANSLATE_PORT) return;

    let active = 0;
    const queue: TranslateRequest[] = [];
    let disconnected = false;
    port.onDisconnect.addListener(() => {
      disconnected = true;
      queue.length = 0;
    });

    const pump = async () => {
      while (!disconnected && active < MAX_CONCURRENT && queue.length > 0) {
        const req = queue.shift()!;
        active++;
        trackJob(1);
        void (async () => {
          let response: TranslateResponse;
          try {
            const settings = await getSettings();
            if (settings.authMode === 'grokOauth') {
              if (!settings.grokTokens) {
                throw new Error('Not signed in with Grok. Open the extension options first.');
              }
            } else if (!settings.apiKey && !settings.baseUrl.includes('localhost')) {
              throw new Error('No API key configured. Open the extension options first.');
            }
            const translations = await translateWithCache(req.texts, settings);
            response = { type: 'result', id: req.id, translations };
          } catch (err) {
            response = {
              type: 'error',
              id: req.id,
              message: err instanceof Error ? err.message : String(err),
            };
          }
          active--;
          trackJob(-1);
          if (!disconnected) {
            try {
              port.postMessage(response);
            } catch {
              disconnected = true;
            }
            void pump();
          }
        })();
      }
    };

    port.onMessage.addListener((msg: TranslateRequest) => {
      if (msg?.type !== 'translate') return;
      queue.push(msg);
      void pump();
    });
  });

  // Chrome MV3 ignores Promises returned from onMessage listeners,
  // so async handlers must call sendResponse and return true.
  browser.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
    if (msg?.type === 'testConnection') {
      void testConnection(msg.settings).then(sendResponse);
      return true;
    }
    if (msg?.type === 'translateSnippets') {
      void (async () => {
        try {
          const settings = await getSettings();
          const translations = await translateWithCache(msg.texts, settings);
          sendResponse({ ok: true, translations });
        } catch (err) {
          sendResponse({ ok: false, message: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }
  });
});
