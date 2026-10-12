import {readFile, mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';

// The checked-in SVG is the only artwork source. Browser builds use the
// checked-in PNGs, so installing Chromium is only needed when editing the logo.
const svg = await readFile('extension/assets/identity.svg', 'utf8');
const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const browser = await chromium.launch({headless: true, args: ['--no-sandbox']});
try {
  const page = await browser.newPage({deviceScaleFactor: 1, colorScheme: 'light'});
  await mkdir('docs/assets', {recursive: true});
  for (const size of [16, 32, 48, 128, 512]) {
    await page.setViewportSize({width: size, height: size});
    await page.setContent(`<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="${source}"></body></html>`);
    await page.locator('img').evaluate(image => image.decode());
    const path = size === 512 ? 'docs/assets/logo.png' : `extension/assets/icon${size}.png`;
    await page.screenshot({path, omitBackground: true});
    console.log(path);
  }
  await page.setViewportSize({width: 1200, height: 630});
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"></head>
    <body style="margin:0;background:#f4f3ed;color:#12232e;font-family:Arial,Helvetica,sans-serif">
      <main style="height:630px;box-sizing:border-box;padding:100px;display:flex;align-items:center;gap:60px">
        <img src="${source}" width="240" height="240" alt="">
        <div><h1 style="font-size:64px;letter-spacing:-3px;line-height:1.1;margin:0 0 28px;font-weight:700">Open Translate</h1>
        <p style="font-size:27px;line-height:1.5;margin:0">Don’t let language stand<br>between you and the world.</p>
        <p style="font-size:16px;color:#087f75;letter-spacing:2px;margin:32px 0 0">YOUR WORLD. YOUR AI.</p></div>
      </main>
    </body></html>`);
  await page.locator('img').evaluate(image => image.decode());
  await page.screenshot({path: 'docs/assets/social-card.png'});
  console.log('docs/assets/social-card.png');
} finally {
  await browser.close();
}
