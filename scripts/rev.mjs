// REA-backed, isolated browser evidence. Captures live under ignored dist/rev.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const [command,url,extension]=process.argv.slice(2);
const runner=resolve('node_modules/rea-agents/scripts/rea.mjs');
async function rea(args,destination){
 const stdout=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[runner,...args,'--json'],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='',oversized=false;
  const timer=setTimeout(()=>child.kill('SIGKILL'),60000);
  child.stdout.on('data',data=>{stdout+=data;if(stdout.length>32e6){oversized=true;child.kill('SIGKILL');}});
  child.stderr.on('data',data=>{if(stderr.length<65536)stderr+=data;});
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);if(code || oversized)reject(new Error('REA failed or exceeded its runtime/output limit; '+stderr.slice(0,500)));else resolve(stdout);});
 });
 await writeFile(destination,stdout);const result=JSON.parse(stdout);
 if(result.error || result.ok===false || result.status==='error')throw new Error('REA returned an error envelope; inspect the private evidence file.');return result;
}
if(command==='compare' && url){
 const suites=extension==='--all'?['reference-parity','reference-web','reference-media']:['reference-parity'];
 let result=0;for(const suite of suites){const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[`scripts/${suite}.mjs`,url],{stdio:'inherit'});child.on('error',reject);child.on('close',resolve);});if(code!==0)result=1;}process.exit(result);
}
if(command!=='capture' || !url)throw new Error('Usage: npm run rev -- capture https://target.example [path/to/reference-extension]');
const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search)throw new Error('Use an HTTP(S) URL without credentials or query tokens.');
const profile=await mkdtemp(join(tmpdir(),'open-translate-rev-')),output=resolve('dist/rev/'+new Date().toISOString().replaceAll(':','-'));await mkdir(output,{recursive:true,mode:0o700});let context;
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',...(extension?[`--disable-extensions-except=${resolve(extension)}`,`--load-extension=${resolve(extension)}`]:[])]});
 const page=await context.newPage();await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(1500);
 const [port]=String(await readFile(join(profile,'DevToolsActivePort'))).trim().split('\n');const endpoint='http://127.0.0.1:'+port;
 const discovery=await rea(['list-browser-targets',endpoint],join(output,'targets.json'));
 // Let REA own target discovery; CDP exact URL selects only the declared page.
 const targets=await (await fetch(endpoint+'/json/list')).json();const target=targets.find(t=>t.type==='page' && t.url===page.url());if(!target)throw new Error('Declared page target was not found.');
 await rea(['inspect-web-page',endpoint,target.id,'--include-script-sources','--include-accessibility-text','--observation-ms','1000'],join(output,'page-evidence.json'));
 await rea(['capture-web-screenshot',endpoint,target.id],join(output,'screenshot-evidence.json'));
 await page.screenshot({path:join(output,'viewport.png')});
 const metadata={tool:'rea-agents',version:'6.4.0',url:page.url(),browser:context.browser().version(),capturedAt:new Date().toISOString(),extension:extension?resolve(extension):null,scope:'Fresh profile; declared page only. Passive observation is not interaction acceptance. Raw evidence may contain public proprietary scripts and must not be redistributed.'};await writeFile(join(output,'capture.json'),JSON.stringify(metadata,null,2));console.log('REA evidence saved privately:',output);
}finally{await context?.close();await rm(profile,{recursive:true,force:true});}
