// Isolated reference transport research; does not measure real model speed.
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {REFERENCE_NETWORK_ARGS} from './reference-network.mjs';
const root=process.cwd(),reference=process.argv[2]&&resolve(process.argv[2]);
if(!reference)throw Error('Usage: node scripts/reference-latency.mjs /private/reference-extension [output-directory] [rich]');
const rich=process.argv[4]==='rich';
const referenceBytes=await readFile(reference+'/content_main.js');
if(createHash('sha256').update(referenceBytes).digest('hex')!=='bfe7e3e640bf90bb6b1103b0fe2e097068a751ca182beadc0bba25a8e38cda4c')throw Error('Reference differs from pinned bundle');
if(JSON.parse(await readFile(reference+'/manifest.json')).version!=='1.33.3')throw Error('Reference version differs');
const output=resolve(process.argv[3]||'dist/rev/translation-latency-reproduction');
if(!output.startsWith(root+'/dist/'))throw Error('Raw research captures must stay in ignored dist/');
await mkdir(output,{recursive:true,mode:0o700});
const requests=[];
const fixture='<!doctype html><html lang="en"><head><title>Translation latency observation</title></head><body><main><p id="sample">Machine translation helps readers understand <a href="https://example.org/languages">different languages</a> and <b>new ideas</b>. This complete paragraph is independent test text for observing translation requests and formatted output.</p></main></body></html>';
const server=createServer(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');if(req.method==='OPTIONS'){res.end();return;}if(req.method==='GET'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}let raw='';for await(const c of req)raw+=c;let body;try{body=JSON.parse(raw);}catch{res.statusCode=400;res.end();return;}requests.push({at:new Date().toISOString(),path:req.url,body});await writeFile(output+'/requests.json',JSON.stringify(requests,null,2));
 const source=body.messages.at(-1).content.split('\n\n').slice(1).join('\n\n');
 const content='本地模拟译文：'+source; // Echo markers for transport inspection, not a quality/latency benchmark.
 if(body.stream){res.setHeader('Content-Type','text/event-stream');res.write('data: '+JSON.stringify({choices:[{index:0,delta:{content},finish_reason:null}]})+'\n\n');res.write('data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');res.end();}else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content}}]}));}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp('/tmp/ot-rev-original-');let context;
async function rea(args,name){const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[root+'/node_modules/rea-agents/scripts/rea.mjs',...args,'--json']);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);const timer=setTimeout(()=>p.kill('SIGKILL'),60000);p.on('error',reject);p.on('close',code=>{clearTimeout(timer);code?reject(Error('REA failed '+err.slice(0,150))):resolve(out);});});await writeFile(output+'/'+name+'.json',result);const obj=JSON.parse(result);if(obj.error||obj.ok===false)throw Error('REA error envelope');return obj;}
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox',...REFERENCE_NETWORK_ARGS,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--disable-extensions-except='+reference,'--load-extension='+reference]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 await worker.evaluate(async ({origin,rich})=>{const config={translationService:'openai-custom',targetLanguage:'zh-CN',sourceLanguage:'en',translationServices:{'openai-custom':{dualEnableRichTranslate:rich,provider:'custom',APIKEY:'local-fixture-only',apiUrl:origin+'/v1/chat/completions',model:'fixture-model',apiProtocol:'openai-chat-completions',enableFallback:false}}};await chrome.storage.local.set({fullLocalUserConfig:config,localConfig:config});},{origin,rich});
 const page=await context.newPage();await page.goto(origin+'/page');await page.waitForTimeout(1500);
 const [port]=String(await readFile(profile+'/DevToolsActivePort')).trim().split('\n');const endpoint='http://127.0.0.1:'+port;
 await rea(['list-browser-targets',endpoint],'targets');
 const target=(await(await fetch(endpoint+'/json/list')).json()).find(x=>x.url===page.url());
 const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(x=>x.url===url).id,page.url());
 await Promise.all([rea(['inspect-web-page',endpoint,target.id,'--include-script-sources','--include-accessibility-text','--include-json-body-shapes','--observation-ms','5000'],'page-evidence'),(async()=>{await page.waitForTimeout(1000);await worker.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{to:'content:main',from:'popup:main',payload:{method:'toggleTranslatePage',data:{trigger:'popup'}}}),tabId);await page.waitForTimeout(6000);})()]);
 const state=await page.locator('#sample').evaluate(el=>({source:el.firstChild.textContent,targets:[...el.querySelectorAll('.immersive-translate-target-inner')].map(n=>({text:n.textContent,links:n.querySelectorAll('a').length,bold:n.querySelectorAll('b,strong').length})),originalLinks:[...el.querySelectorAll('a')].filter(n=>!n.closest('.immersive-translate-target-wrapper')).length}));
 const sha=x=>createHash('sha256').update(x).digest('hex');
 const summary={referenceVersion:JSON.parse(await readFile(reference+'/manifest.json')).version,contentSha256:sha(await readFile(reference+'/content_main.js')),fixtureSha256:sha(fixture),browser:context.browser().version(),customOpenAIEndpointConfirmed:requests.length>0,richMode:rich,commercialCredentialsUsed:false,requests:requests.map(x=>({path:x.path,stream:x.body.stream??false,model:x.body.model,fields:Object.keys(x.body),messages:x.body.messages?.map(m=>({role:m.role,characters:m.content.length,hasMarkup:/<[^>]+>|\{\d+\}/.test(m.content)}))})),state,limitations:['Provider is a deterministic local fixture. Timings do not measure a commercial model. REA is passive; Playwright configured the extension and triggered translation. External hostname resolution blocked; packaged defaults are pinned.']};
 summary.status=requests.length>0&&state.targets.length===1&&state.targets[0].links===(rich?1:0)&&state.targets[0].bold===(rich?1:0)?'passed':'failed';
 await writeFile(output+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 if(summary.status!=='passed')process.exitCode=1;
}finally{await context?.close();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true});}
