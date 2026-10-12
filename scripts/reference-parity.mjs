import {REFERENCE_NETWORK_ARGS,REFERENCE_NETWORK_POLICY} from './reference-network.mjs';
// Independent implementation and the pinned reference run in separate clean
// profiles against the same local fixture. No reference code is redistributed.
import {implementationDigest,verifyBuildEvidence} from './parity-source.mjs';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const implementationSha256=await implementationDigest();
const buildEvidence=await verifyBuildEvidence('dist/chrome',implementationSha256);
const reference=process.argv[2];if(!reference)throw new Error('Usage: npm run parity:reference -- /private/path/to/reference-extension');
const manifest=JSON.parse(await readFile(join(reference,'manifest.json'),'utf8'));
if(manifest.version!=='1.33.3')throw new Error('Reference must be pinned version 1.33.3. Review/update the baseline before changing versions.');
const referenceContentSha256=createHash('sha256').update(await readFile(join(reference,'content_main.js'))).digest('hex');
if(referenceContentSha256!=='bfe7e3e640bf90bb6b1103b0fe2e097068a751ca182beadc0bba25a8e38cda4c')throw new Error('Reference content hash does not match the frozen baseline.');
const fixture='<!doctype html><html lang="en"><head><title>Reference parity fixture</title></head><body><main><p id="first">Hello <b>world</b> {0}. This is a complete English sentence for the translation test.</p><p id="second">Thank you for your help.</p><pre id="code">Hello code</pre><p id="excluded" translate="no">Hello excluded</p><textarea>Hello input</textarea></main></body></html>';
const translate=text=>text.replaceAll('Hello','Bonjour').replaceAll('world','monde').replaceAll('Thank you for your help','Merci pour votre aide').replaceAll('This is a complete English sentence for the translation test.','Ceci est une phrase complète pour le test de traduction.');
const requests=[];const server=createServer(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');if(req.method==='OPTIONS'){res.end();return;}if(req.url==='/page'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}if(req.method!=='POST'){res.statusCode=404;res.end();return;}let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);requests.push(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({translations:body.text_list.map(text=>({text:translate(text),detected_source_lang:'en'}))}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const output=resolve('dist/parity');await mkdir(output,{recursive:true});await rm(join(output,'reference-results.json'),{force:true});const results={};
try{for(const kind of ['original','replacement']){
 const directory=resolve(kind==='original'?reference:'dist/chrome');let context;
 try{
  context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,viewport:{width:900,height:600},ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox',...REFERENCE_NETWORK_ARGS,`--disable-extensions-except=${directory}`,`--load-extension=${directory}`]});const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');const id=worker.url().split('/')[2];
  await worker.evaluate(async({kind,url})=>{if(kind==='original'){const settings={translationService:'custom',targetLanguage:'fr',sourceLanguage:'en',translationServices:{custom:{name:'Local parity fixture',url,langs:'en,fr',requestTimeout:10000,placeholderDelimiters:['{','}'],maxTextGroupLengthPerRequest:8,maxTextLengthPerRequest:3000,concurrencyLimit:1}}};await chrome.storage.local.set({fullLocalUserConfig:settings,localConfig:settings});}else await chrome.storage.local.set({settings:{provider:'bridge',bridgeUrl:url,source:'en',target:'fr',style:'plain',mode:'bilingual',timeout:10,batchSize:1}});},{kind,url:origin+'/translate'});
  const page=await context.newPage();await page.goto(origin+'/page');await page.waitForTimeout(1500);const before=await page.locator('main').innerHTML();const beforeContents=await page.locator('main>p').evaluateAll(nodes=>nodes.map(n=>n.innerHTML));await page.evaluate(()=>{window.sourceBold=document.querySelector('#first b');});
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url).id,page.url());
  const toggle=()=>worker.evaluate(({tabId,kind})=>chrome.tabs.sendMessage(tabId,kind==='original'?{to:'content:main',from:'popup:main',payload:{method:'toggleTranslatePage',data:{trigger:'popup'}}}:{type:'page.start'}),{tabId,kind});
  const target=kind==='original'?'.immersive-translate-target-inner':'[data-ot-target]';
  await toggle();await expect(page.locator('#first '+target)).toHaveText('Bonjour monde {0}. Ceci est une phrase complète pour le test de traduction.',{timeout:15000});await expect(page.locator('#second '+target)).toHaveText('Merci pour votre aide.');
  await expect(page.locator('#code '+target)).toHaveCount(0);await expect(page.locator('#excluded '+target)).toHaveCount(0);await expect(page.locator('textarea '+target)).toHaveCount(0);
  const semantics={codeExcluded:true,translateNoExcluded:true,inputExcluded:true,sourcePreserved:await page.evaluate(()=>document.querySelector('#first').firstChild.textContent==='Hello ' && window.sourceBold===document.querySelector('#first b')),first:await page.locator('#first '+target).textContent(),second:await page.locator('#second '+target).textContent(),targetLanguage:await page.locator(kind==='original'?'#first .immersive-translate-target-wrapper':'#first [data-ot-target]').getAttribute('lang')};
  await page.screenshot({caret:'initial',path:join(output,kind+'-bilingual.png')});
  await page.evaluate(()=>{const node=document.createElement('p');node.id='dynamic';node.textContent='Hello dynamic';document.querySelector('main').append(node);});await expect(page.locator('#dynamic '+target)).toHaveText('Bonjour dynamic',{timeout:15000});semantics.dynamic=await page.locator('#dynamic '+target).textContent();await page.locator('#dynamic').evaluate(node=>node.remove());
  if(kind==='original')await toggle();else await worker.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'page.restore'}),tabId);
  await expect(page.locator(target)).toHaveCount(0);semantics.sourceContentRestored=JSON.stringify(await page.locator('main>p').evaluateAll(nodes=>nodes.map(n=>n.innerHTML)))===JSON.stringify(beforeContents);const after=await page.locator('main').innerHTML();const exactDomRestored=after===before;await writeFile(join(output,kind+'-restoration.json'),JSON.stringify({before,after},null,2));
  if(!semantics.sourcePreserved || !semantics.sourceContentRestored)throw new Error(kind+' failed exact source/restoration acceptance.');
  const popup=await context.newPage();await popup.setViewportSize({width:316,height:700});await popup.goto(`chrome-extension://${id}/popup.html`);await popup.waitForTimeout(600);await popup.screenshot({path:join(output,kind+'-popup.png'),fullPage:true});
  results[kind]={semantics,exactDomRestored};
 }catch(error){await writeFile(join(output,kind+'-failure.json'),JSON.stringify({error:error.message,fixtureRequests:requests},null,2));throw error;}finally{await context?.close();}
}
 await verifyBuildEvidence('dist/chrome',implementationSha256);
 if(JSON.stringify(results.original.semantics)!==JSON.stringify(results.replacement.semantics))throw new Error('Semantic behavior differs from pinned reference.');
 if(await implementationDigest()!==implementationSha256)throw new Error('Implementation changed during comparison; rerun against a stable build.');
 const report={schema:1,networkPolicy:REFERENCE_NETWORK_POLICY,implementationSha256,buildEvidence,createdAt:new Date().toISOString(),reference:{version:manifest.version,commit:'c470f0aca3c75b2785c9009a0ac48e78ead34126',contentSha256:referenceContentSha256},fixtureSha256:createHash('sha256').update(fixture).digest('hex'),cases:['page-bilingual-text','page-source-preservation','page-placeholder','page-target-language','page-source-content-restoration','page-code-exclusion','page-translate-no-exclusion','page-input-exclusion','page-dynamic-content'],results,status:'passed',scope:'Only the listed deterministic desktop page cases. Captured popup screenshots are review evidence, not a claim of pixel equality. No live commercial translation service or complete site/document/media parity was tested.'};
 await writeFile(join(output,'reference-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await new Promise(r=>server.close(r));}
