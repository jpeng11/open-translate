// Optional acceptance check against the user's real engine. Never prints credentials.
import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {DEFAULTS,validateSettings} from '../extension/src/core.mjs';
const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/live-check.mjs /private/path/connection.json');
const config=validateSettings({...DEFAULTS,...JSON.parse(await readFile(file,'utf8')),source:'fr',target:'en',batchSize:2,concurrency:1});
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="fr"><head><title>Open Translate · live agent acceptance</title><style>body{margin:80px auto;max-width:700px;font:22px/1.7 system-ui;color:#20372e;background:#f8f9f4}p{margin:35px 0}a{color:#21735c}</style></head><body><main><p id="first">Bonjour <b>monde</b> {0}.</p><p id="second">Merci pour votre aide.</p></main></body></html>');});
let context;
try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox',`--disable-extensions-except=${resolve('dist/chrome')}`,`--load-extension=${resolve('dist/chrome')}`]});
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:10000});await worker.evaluate(async settings=>chrome.storage.local.set({settings}),config);
 const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url).id,page.url());await worker.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'page.start'}),tabId);
 const deadline=Date.now()+config.timeout*1000+10000;while(await page.locator('[data-ot-target]').count()<2){const state=await worker.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'page.status'}),tabId);if(state.failed)throw new Error('Live engine: '+state.error+' Original text was retained.');if(Date.now()>deadline)throw new Error('Live provider did not finish within its configured deadline.');await new Promise(resolve=>setTimeout(resolve,200));}const first=await page.locator('#first [data-ot-target]').innerText(),second=await page.locator('#second [data-ot-target]').innerText();if(!first.includes('{0}') || !await page.locator('#first [data-ot-target] b').count() || first.includes('Bonjour') || second.includes('Merci'))throw new Error('Live provider failed translation/markup acceptance.');
 await mkdir('dist/acceptance',{recursive:true});await page.screenshot({path:'dist/acceptance/live-agent-page.png',fullPage:true});console.log(JSON.stringify({ok:true,browser:context.browser().version(),provider:config.provider,translations:[first,second],inlineFormatting:true,numericPlaceholder:true},null,2));
 await worker.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'page.restore'}),tabId);if(await page.locator('[data-ot-target]').count())throw new Error('Original restoration failed.');
}finally{await context?.close();await new Promise(r=>server.close(r));}
