import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {browserManifest} from '../../scripts/browser-manifests.mjs';
import {siteAdapter,pageRule} from '../../extension/src/site-adapters.mjs';
import {createSettingsStore} from '../../extension/src/settings-store.mjs';
const source=JSON.parse(await readFile(new URL('../../extension/manifest.json',import.meta.url)));
test('Firefox desktop/Android and Safari manifests use event backgrounds without Chromium-only permission',()=>{
 for(const browser of ['firefox','safari']){const value=browserManifest(source,browser);assert.deepEqual(value.background,{scripts:['background.js'],persistent:false});assert.ok(!value.permissions.includes('offscreen'));assert.equal(value.minimum_chrome_version,undefined);assert.equal(value.content_scripts[0].all_frames,true);}
 const firefox=browserManifest(source,'firefox');assert.equal(firefox.browser_specific_settings.gecko_android.strict_min_version,'142.0');assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required,['websiteContent']);
 assert.equal(browserManifest(source,'chrome').background.service_worker,'background.js');assert.ok(source.permissions.includes('offscreen'));
});
test('public site adapters match complete host labels and preserve user scopes',()=>{
 assert.equal(siteAdapter('https://github.com/a/b').id,'github-markdown');assert.equal(siteAdapter('https://en.wikipedia.org/wiki/Test').id,'knowledge-articles');assert.equal(siteAdapter('https://github.com.attacker.invalid').id,'generic');
 const result=pageRule({include:'.my-article',exclude:'.my-secret'},'https://github.com/a/b');assert.equal(result.include,'.my-article');assert.equal(result.hints,'');assert.ok(result.exclude.includes('.my-secret'));assert.ok(result.exclude.includes('.monaco-editor'));
});
function fixture() {
 let saved,legacy={settings:{apiKey:'legacy-secret'}},reads=0;
 const api={storage:{local:{async get(){reads++;return {...legacy};},async remove(){delete legacy.settings;},async set(value){Object.assign(legacy,value);}}}};
 const open=()=>{
   const request={};queueMicrotask(()=>{request.result={transaction(_name,mode){const tx={};tx.objectStore=()=>({get(){const op={result:saved};queueMicrotask(()=>tx.oncomplete());return op;},put(value){saved=structuredClone(value);const op={};queueMicrotask(()=>tx.oncomplete());return op;}});return tx;}};request.onsuccess();});return request;
 };
 return {api,open,get legacy(){return legacy;},get reads(){return reads;}};
}
test('non-Chromium credentials migrate to extension-origin database and ignore later content storage writes',async()=>{
 const f=fixture(),store=createSettingsStore(f.api,f.open);assert.equal((await store.get()).apiKey,'legacy-secret');assert.equal(f.legacy.settings,undefined);await f.api.storage.local.set({settings:{apiKey:'content-attacker'}});assert.equal((await store.get()).apiKey,'legacy-secret');await store.set({apiKey:'new-trusted-secret'});assert.equal((await store.get()).apiKey,'new-trusted-secret');assert.equal(f.reads,1);
});
