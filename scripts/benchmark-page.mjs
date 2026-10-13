// Optional paid live benchmark. Connection settings stay in a private file.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const {chromium}=await import(pathToFileURL(resolve('node_modules/playwright-core/index.mjs')));
const {DEFAULTS,validateSettings}=await import(pathToFileURL(resolve('extension/src/core.mjs')));
const {implementationDigest,verifyBuildEvidence}=await import(pathToFileURL(resolve('scripts/parity-source.mjs')));
if(!process.argv[2])throw new Error('Usage: node scripts/benchmark-page.mjs /private/connection.json [batch-size=4] [plain|formatted] [concurrency=1] [output-directory] [total-deadline-seconds] [scenario.json]');
const supplied=JSON.parse(await readFile(process.argv[2],'utf8'));
const scenario=process.argv[8]?JSON.parse(await readFile(process.argv[8],'utf8')):{};
const url=scenario.url||'https://en.wikipedia.org/wiki/Machine_translation';
const requestedWords=scenario.words??1000,target=scenario.target||'zh-CN';
if(!Number.isInteger(requestedWords)||requestedWords<100||requestedWords>50000)throw Error('Invalid sample word count');
const snapshot=scenario.snapshot?await readFile(scenario.snapshot,'utf8'):null;
const config=validateSettings({...DEFAULTS,...supplied,source:'en',target,batchSize:Number(process.argv[3]||4),concurrency:Number(process.argv[5]||1),cache:false,autoTranslate:false,mode:'bilingual',rules:[{host:new URL(url).hostname,include:'p[data-ot-speed]'}]});
const report={schema:1,status:'running',startedAt:new Date().toISOString(),sourceUrl:url,sourceLanguage:'en',targetLanguage:target,provider:config.provider==='bridge'?'Mac local bridge → signed-in AGY CLI':'Configured OpenAI-compatible endpoint',model:supplied.benchmarkModel||(config.provider==='openai'?config.model:'Not identified; verify bridge process configuration'),settings:{batchSize:config.batchSize,concurrency:config.concurrency,timeout:config.timeout,reasoningEffort:config.reasoningEffort || 'model default',cache:false},method:'Real public page in a clean Chromium extension profile. Select approximately the requested word count in complete article paragraphs, restrict translation to them, automatically scroll to untranslated paragraphs. Timer starts immediately before page.start. Model output is nonstreaming. Includes bridge, model, scheduling and DOM rendering; excludes browser/page load. Application cache disabled; upstream prompt caching is uncontrolled.',requests:[],requestTimingNote:'Browser network events may not expose offscreen worker requests; DOM timings are authoritative'};
report.buildEvidence=await verifyBuildEvidence('dist/chrome',await implementationDigest());
const bridgeHash=createHash('sha256');for(const file of ['agent.py','agy.py','fragments.py','server.py']){bridgeHash.update(file+'\0');bridgeHash.update(await readFile('open_translate/'+file));}report.bridgeSourceSha256=bridgeHash.digest('hex');
const outputDir=process.argv[6] || 'dist/benchmarks';
const deadlineSeconds=process.argv[7]===undefined?null:Number(process.argv[7]);
if(deadlineSeconds!==null && (!Number.isFinite(deadlineSeconds)||deadlineSeconds<1||deadlineSeconds>3600))throw Error('Invalid total deadline');
report.totalDeadlineSeconds=deadlineSeconds;
report.scenario={requestedWords,snapshotSha256:snapshot?createHash('sha256').update(snapshot).digest('hex'):null,sourceTitle:scenario.title||'Machine translation'};
await mkdir(outputDir,{recursive:true});
const output=resolve(outputDir,'page-speed.json');const save=()=>writeFile(output,JSON.stringify(report,null,2)+'\n');
let context;
try{
 context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,viewport:{width:1280,height:900},ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox',`--disable-extensions-except=${resolve('dist/chrome')}`,`--load-extension=${resolve('dist/chrome')}`]});
 report.browser=context.browser().version();
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 await worker.evaluate(async settings=>chrome.storage.local.set({settings}),config);
 let start;const tracked=new Map();
 context.on('request',request=>{if(!start||request.method()!=='POST')return;const expected=config.provider==='bridge'?config.bridgeUrl:config.apiUrl;if(!request.url().startsWith(expected))return;let body={};try{body=JSON.parse(request.postData()||'{}');}catch{}const item={index:report.requests.length+1,startedMs:Math.round(performance.now()-start),segments:body.text_list?.length,characters:body.text_list?.reduce((s,x)=>s+x.length,0)};tracked.set(request,item);report.requests.push(item);});
 context.on('requestfinished',request=>{const item=tracked.get(request);if(item)item.finishedMs=Math.round(performance.now()-start);});
 context.on('response',response=>{const item=tracked.get(response.request());if(item)item.httpStatus=response.status();});
 if(snapshot)await context.route(url,route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:snapshot}));
 const page=await context.newPage();const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});if(!response?.ok())throw new Error('Page returned HTTP '+response?.status());
 await page.waitForTimeout(1500);
 const sample=await page.evaluate(({plain,requestedWords})=>{
  const eligible=[...document.querySelectorAll('#mw-content-text p')].filter(p=>{const text=p.textContent.trim();return text.length>=80&&text.length<4000&&!p.closest('table,nav,aside')&&p.checkVisibility();});
  const selected=[];let words=0;
  for(const p of eligible){const count=p.textContent.trim().split(/\s+/).length;if(words>=requestedWords*0.85&&Math.abs(words-requestedWords)<Math.abs(words+count-requestedWords))break;selected.push(p);words+=count;if(words>=requestedWords)break;}
  if(Math.abs(words-requestedWords)>Math.max(200,requestedWords*0.03))throw new Error('Could not select requested sample: '+words+' words from '+eligible.length+' paragraphs');
  if(plain)for(const p of selected)p.textContent=p.textContent;
  window.__otSpeed={items:selected.map((node,index)=>{node.dataset.otSpeed=String(index);return {node,text:node.textContent,html:node.innerHTML,links:[...node.querySelectorAll('a[href]')].map(a=>a.href),formatting:[...node.querySelectorAll('b,strong,i,em,sup,sub')].map(n=>n.localName)};}),events:[]};
  return {words,paragraphs:selected.length,characters:selected.reduce((s,p)=>s+p.textContent.length,0),texts:selected.map(p=>p.textContent)};
 },{plain:process.argv[4]==='plain',requestedWords});
 report.contentMode=process.argv[4]==='plain'?'Plain-text reading view: inline markup removed from selected paragraphs before timing; not original page formatting':'Original public page markup';
 report.sample={words:sample.words,paragraphs:sample.paragraphs,characters:sample.characters,sha256:createHash('sha256').update(JSON.stringify(sample.texts)).digest('hex'),wordCountMethod:'Whitespace-separated tokens in selected complete paragraphs'};
 console.log(JSON.stringify({event:'sample',...report.sample,settings:report.settings}));await save();
 const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url).id,page.url());
 const command=type=>worker.evaluate(({tabId,type})=>chrome.tabs.sendMessage(tabId,{type}),{tabId,type});
 await page.locator('[data-ot-speed="0"]').scrollIntoViewIfNeeded();
 await page.evaluate(()=>{const state=window.__otSpeed;state.start=performance.now();state.observer=new MutationObserver(()=>{const done=state.items.filter(x=>x.node.querySelector(':scope > [data-ot-target]')?.textContent.trim()).length;if(done&&(state.events.at(-1)?.paragraphs!==done))state.events.push({paragraphs:done,ms:Math.round(performance.now()-state.start)});});state.observer.observe(document.body,{childList:true,subtree:true});});
 start=performance.now();const started=await command('page.start');if(!started?.ok)throw new Error('Could not start translation');
 let lastCount=-1,lastLog=0;const deadline=start+(deadlineSeconds===null?Math.max(600000,Math.ceil(sample.paragraphs/4)*config.timeout*1000+30000):deadlineSeconds*1000);
 while(performance.now()<deadline){
  const progress=await page.evaluate(()=>{const state=window.__otSpeed;const pending=state.items.find(x=>!x.node.querySelector(':scope > [data-ot-target]')?.textContent.trim());pending?.node.scrollIntoView({block:'center'});return {done:state.items.filter(x=>x.node.querySelector(':scope > [data-ot-target]')?.textContent.trim()).length,events:state.events};});
  const elapsed=Math.round(performance.now()-start);report.progress={...progress,elapsedMs:elapsed};report.firstTranslationMs=progress.events[0]?.ms;
  if(progress.done!==lastCount||elapsed-lastLog>=15000){console.log(JSON.stringify({event:'progress',done:progress.done,total:sample.paragraphs,elapsedSeconds:Math.round(elapsed/100)/10}));lastCount=progress.done;lastLog=elapsed;await save();}
  const state=await command('page.status');report.extensionState=state;if(state?.failed)throw new Error('Translation failed: '+state.error);
  if(progress.done===sample.paragraphs){report.firstTranslationMs=progress.events[0]?.ms;report.completeMs=progress.events.at(-1)?.ms??elapsed;report.wordsPerSecond=Number((sample.words/(report.completeMs/1000)).toFixed(2));report.status='passed';break;}
  await page.waitForTimeout(250);
 }
 if(report.status!=='passed')throw new Error('Benchmark exceeded total deadline');
 report.preservation=await page.evaluate(()=>{const items=window.__otSpeed.items;return {links:items.reduce((sum,x)=>sum+x.links.length,0),comparison:'Exact per-paragraph multisets; complete sibling phrases may move with translated word order. Renderer independently enforces marker uniqueness, pairing and original parent relationships.',linksPreserved:items.every(x=>JSON.stringify([...x.node.querySelectorAll(':scope > [data-ot-target] a[href]')].map(a=>a.href).sort())===JSON.stringify([...x.links].sort())),formattingPreserved:items.every(x=>JSON.stringify([...x.node.querySelectorAll(':scope > [data-ot-target] b,:scope > [data-ot-target] strong,:scope > [data-ot-target] i,:scope > [data-ot-target] em,:scope > [data-ot-target] sup,:scope > [data-ot-target] sub')].map(n=>n.localName).sort())===JSON.stringify([...x.formatting].sort()))};});
 if(!report.preservation.linksPreserved||!report.preservation.formattingPreserved)throw new Error('Original links or formatting were not retained');
 const result=await page.evaluate(()=>window.__otSpeed.items.map(x=>({source:x.text,translation:x.node.querySelector(':scope > [data-ot-target]').textContent,lang:x.node.querySelector(':scope > [data-ot-target]').lang})));
 const script=target.startsWith('zh')?/\p{Script=Han}/u:target==='ja'?/[\p{Script=Hiragana}\p{Script=Katakana}]/u:target==='ko'?/\p{Script=Hangul}/u:null;
 report.output={translatedParagraphs:result.length,targetScriptParagraphs:script?result.filter(x=>script.test(x.translation)).length:null,unchangedParagraphs:result.filter(x=>x.source.trim()===x.translation.trim()).length,languageValidation:script?'Expected target script present in every paragraph; not a linguistic quality guarantee':'Nonempty changed output; language and meaning need separate review',characters:result.reduce((s,x)=>s+x.translation.length,0),sha256:createHash('sha256').update(JSON.stringify(result)).digest('hex')};
 if(script&&report.output.targetScriptParagraphs!==sample.paragraphs)throw new Error('Some outputs lack the expected target script');
 if(report.output.unchangedParagraphs)throw new Error('Some paragraphs were returned unchanged');
 await writeFile(resolve(outputDir,'page-speed-translations.json'),JSON.stringify({sourceUrl:url,attribution:scenario.attribution||'Wikipedia contributors, Machine translation, CC BY-SA 4.0',items:result},null,2)+'\n');
 await page.locator('[data-ot-speed="0"]').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(outputDir,'page-speed.png')});
 await command('page.restore');report.restored=await page.evaluate(()=>window.__otSpeed.items.every(x=>x.node.innerHTML===x.html));
 if(!report.restored)throw new Error('Original DOM did not restore exactly');
 report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({event:'complete',...report}));
}catch(error){report.status='failed';report.failedAt=new Date().toISOString();delete report.completeMs;delete report.wordsPerSecond;report.error=String(error.message).split('\n')[0].replace(/https?:\/\/[^\s]+/g,'[URL]');await save();console.error(JSON.stringify({event:'failed',error:report.error,progress:report.progress}));process.exitCode=1;}
finally{await context?.close();}
