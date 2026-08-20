import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { testConnection } from '@/lib/provider';
import { translateWithCache } from '@/lib/cache';
import { getSettings } from '@/lib/settings';
import { TRANSLATE_PORT } from '@/lib/messaging';
import type { TranslateRequest, TranslateResponse, RuntimeMessage } from '@/lib/messaging';

const MAX_CONCURRENT = 3;

export default defineBackground(() => {
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
