/**
 * E2E smoke test: loads the built extension into Chromium, points it at a mock
 * OpenAI-compatible server, translates a fixture page, and restores it.
 *
 * Prereq: `pnpm build` (assert below fails fast if the build is missing).
 */
import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Worker } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const EXTENSION_PATH = path.resolve('.output/chrome-mv3');

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Fixture</title></head>
<body>
  <h1>The History of Tea Ceremonies Around the World</h1>
  <p>Tea has been cultivated for thousands of years, and every culture that adopted it developed rituals of its own.</p>
  <p>In Japan, the tea ceremony is a choreographed art form where every gesture carries meaning and centuries of tradition.</p>
  <p>British afternoon tea, by contrast, grew out of nineteenth-century social habits and remains a beloved daily custom.</p>
</body>
</html>`;

function startMockServer(): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/page.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(FIXTURE_HTML);
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const body = JSON.parse(raw);
        const userContent: string = body.messages.find(
          (m: { role: string }) => m.role === 'user',
        ).content;
        let reply: string;
        try {
          const texts = JSON.parse(userContent);
          reply = JSON.stringify(texts.map((t: string) => `[ZH] ${t}`));
        } catch {
          reply = `[ZH] ${userContent}`; // single-item fallback path
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: reply } }] }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

let context: BrowserContext;
let serviceWorker: Worker;
let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  expect(fs.existsSync(path.join(EXTENSION_PATH, 'manifest.json'))).toBe(true);

  const started = await startMockServer();
  server = started.server;
  baseUrl = `http://127.0.0.1:${started.port}`;

  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
  serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  await serviceWorker.evaluate(async (providerBase: string) => {
    await chrome.storage.local.set({
      settings: {
        authMode: 'apiKey',
        baseUrl: providerBase,
        apiKey: 'test-key',
        grokTokens: null,
        model: 'mock-model',
        targetLang: 'zh-CN',
        neverTranslateLangs: [],
        displayMode: 'bilingual',
        maxCharsPerPage: 100000,
        excludedSites: [],
        videoSubtitles: true,
        glossary: '',
        autoTranslateSites: [],
      },
    });
  }, `${baseUrl}/v1`);
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

test('translates a page through the mock provider and restores it', async () => {
  const page = await context.newPage();
  const pageUrl = `${baseUrl}/page.html`;
  await page.goto(pageUrl);

  const sendToTab = (message: unknown) =>
    serviceWorker.evaluate(
      async ({ url, msg }: { url: string; msg: unknown }) => {
        const tabs = await chrome.tabs.query({ url });
        if (!tabs[0]?.id) throw new Error(`No tab found for ${url}`);
        return chrome.tabs.sendMessage(tabs[0].id, msg);
      },
      { url: pageUrl, msg: message },
    );

  await sendToTab({ type: 'translatePage' });

  const translations = page.locator('.ot-translation');
  await expect(translations.first()).toContainText('[ZH]', { timeout: 15_000 });
  expect(await translations.count()).toBeGreaterThanOrEqual(3);

  // Bilingual mode: originals stay visible alongside translations.
  await expect(page.locator('body')).toContainText('Tea has been cultivated');
  await expect(page.locator('body')).toContainText('[ZH] Tea has been cultivated');

  await sendToTab({ type: 'restorePage' });
  await expect(translations).toHaveCount(0);
  await expect(page.locator('body')).toContainText('Tea has been cultivated');
  await expect(page.locator('body')).not.toContainText('[ZH]');
});
