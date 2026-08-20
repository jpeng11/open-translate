import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { translateBatch, testConnection } from '@/lib/provider';
import { getSettings } from '@/lib/settings';
import type { Settings } from '@/lib/settings';
import { TRANSLATE_PORT } from '@/lib/messaging';
import type { TranslateRequest, TranslateResponse, RuntimeMessage } from '@/lib/messaging';

const MAX_CONCURRENT = 3;

/** djb2 — short stable cache keys for (model, targetLang, text). */
function hashKey(model: string, lang: string, text: string): string {
  const input = `${model}|${lang}|${text}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `ot:${(hash >>> 0).toString(36)}:${input.length.toString(36)}`;
}

async function cacheGet(keys: string[]): Promise<Record<string, string>> {
  try {
    return (await browser.storage.session.get(keys)) as Record<string, string>;
  } catch {
    return {};
  }
}

async function cacheSet(entries: Record<string, string>): Promise<void> {
  try {
    await browser.storage.session.set(entries);
  } catch {
    // Session cache is best-effort; quota errors must not fail translation.
  }
}

/** Translate texts, serving repeats from the session cache so revisits don't re-bill the user. */
async function translateWithCache(texts: string[], settings: Settings): Promise<string[]> {
  const keys = texts.map((t) => hashKey(settings.model, settings.targetLang, t));
  const cached = await cacheGet(keys);

  const missingIndexes = texts.map((_, i) => i).filter((i) => cached[keys[i]!] === undefined);
  if (missingIndexes.length > 0) {
    const fresh = await translateBatch(missingIndexes.map((i) => texts[i]!), settings);
    const newEntries: Record<string, string> = {};
    missingIndexes.forEach((textIndex, j) => {
      cached[keys[textIndex]!] = fresh[j] ?? '';
      newEntries[keys[textIndex]!] = fresh[j] ?? '';
    });
    await cacheSet(newEntries);
  }

  return texts.map((_, i) => cached[keys[i]!] ?? '');
}

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
