// Diagnostic: load the built extension, open every UI surface, report errors.
import { chromium } from '@playwright/test';
import path from 'node:path';

const EXT = path.resolve('.output/chrome-mv3');
const SHOTS = '/tmp/ot-diagnose';

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extId = new URL(sw.url()).host;
console.log('service worker OK:', sw.url());

const swErrors = [];
sw.on('console', (msg) => {
  if (msg.type() === 'error') swErrors.push(msg.text());
});

for (const pageName of ['popup.html', 'options.html', 'documents.html']) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  try {
    await page.goto(`chrome-extension://${extId}/${pageName}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const rootHtmlLen = await page
      .locator('#root')
      .innerHTML()
      .then((h) => h.length)
      .catch(() => -1);
    await page.screenshot({ path: `${SHOTS}-${pageName}.png` });
    console.log(`${pageName}: rendered=${rootHtmlLen > 50} rootHtmlLen=${rootHtmlLen} errors=${JSON.stringify(errors)}`);
  } catch (err) {
    console.log(`${pageName}: FAILED TO LOAD - ${err.message}`);
  }
  await page.close();
}

// Content script check on a real page
const page = await context.newPage();
const pageErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') pageErrors.push(msg.text());
});
await page.goto('https://example.com', { waitUntil: 'domcontentloaded' }).catch((e) => console.log('nav fail:', e.message));
await page.waitForTimeout(1000);
const pageState = await sw.evaluate(async () => {
  const tabs = await chrome.tabs.query({ url: 'https://example.com/' });
  if (!tabs[0]?.id) return 'no tab';
  try {
    return await chrome.tabs.sendMessage(tabs[0].id, { type: 'getPageState' });
  } catch (e) {
    return `sendMessage failed: ${e.message}`;
  }
});
console.log('content script getPageState:', JSON.stringify(pageState));
console.log('page console errors:', JSON.stringify(pageErrors));
console.log('sw console errors:', JSON.stringify(swErrors));

await context.close();
