// Live/paid full-catalog page benchmark. Credentials stay in private temp files.
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {endpoint,responseJson} from '../extension/src/core.mjs';
import {implementationDigest} from './parity-source.mjs';
const [connection,directory,...only]=process.argv.slice(2);
if(!directory)throw Error('Usage: node scripts/benchmark-catalog.mjs /private/connection.json output-directory [model ...]');
const config=JSON.parse(await readFile(connection,'utf8')),output=resolve(directory);
await mkdir(output,{recursive:true});
const headers={};if(config.apiKey)headers.Authorization='Bearer '+config.apiKey;
const catalog=await responseJson(await fetch(endpoint(config.apiUrl,'models'),{headers,redirect:'error',signal:AbortSignal.timeout(20000)}));
if(!Array.isArray(catalog.data)||catalog.data.some(x=>typeof x.id!=='string'))throw Error('Invalid model catalogue');
const entries=[...new Map(catalog.data.map(x=>[x.id,x])).values()].filter(x=>!only.length||only.includes(x.id));
if(only.some(id=>!entries.some(x=>x.id===id)))throw Error('Requested model missing from catalogue');
const digest=await implementationDigest();
const report={schema:1,suite:'live-model-catalog',startedAt:new Date().toISOString(),status:'running',implementationSha256:digest,targetCompleteMs:10000,method:'Original-format 977-word page, clean extension profile per model, batch 4, concurrency 4, application cache off. Two different providers may run at once; never two models of the same provider. Routing groups run alone after individual routes. Each attempt has a 45-second translation deadline; a timeout is a failed target attempt, not a completed-translation latency. Upstream caching/load uncontrolled. One screening run per model; fastest candidates need isolated repetition and quality review.',catalog:entries.map(x=>({id:x.id,reasoningLevels:(x.supported_reasoning_levels||[]).map(y=>y.effort)})),runs:[]};
let saving=Promise.resolve();
const save=()=>{const snapshot=JSON.stringify(report,null,2)+'\n';return saving=saving.then(()=>writeFile(join(output,'catalog.json'),snapshot));};
await save();
const temp=await mkdtemp(join(tmpdir(),'ot-catalog-'));
async function run(model,index){
 const levels=(model.supported_reasoning_levels||[]).map(x=>x.effort);
 // Only send efforts supported by both the catalogue and the product UI.
 const effort=['none','low','medium','high'].find(x=>levels.includes(x)) || '';
 const dir=join(output,String(index).padStart(2,'0')+'-'+model.id.replace(/[^a-zA-Z0-9_.-]/g,'-'));
 await mkdir(dir,{recursive:true});
 const file=join(temp,index+'.json');
 await writeFile(file,JSON.stringify({...config,provider:'openai',model:model.id,reasoningEffort:effort,timeout:45,jsonMode:true}),{mode:0o600});
 console.log(JSON.stringify({event:'start',model:model.id,reasoningEffort:effort||'default'}));
 let log='';
 const code=await new Promise((done,reject)=>{
  const child=spawn(process.execPath,['scripts/benchmark-page.mjs',file,'4','formatted','4',dir,'45'],{stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log+=chunk;});
  const timer=setTimeout(()=>child.kill('SIGTERM'),120000);
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);done(code);});
 });
 await rm(file,{force:true});
 let page;
 try{page=JSON.parse(await readFile(join(dir,'page-speed.json'),'utf8'));}catch{page={status:'failed',error:'Benchmark process did not produce a report'};}
 const result={model:model.id,exitCode:code,...page,logSha256:createHash('sha256').update(log).digest('hex'),meetsTarget:code===0&&page.status==='passed'&&page.completeMs<=10000};
 report.runs.push(result);await save();
 console.log(JSON.stringify({event:'result',model:model.id,status:result.status,completeMs:result.completeMs,paragraphs:page.progress?.done,error:page.error,meetsTarget:result.meetsTarget}));
}
try{
 const pending=entries.map((model,index)=>({model,index})).filter(x=>!x.model.id.startsWith('group/'));
 const busy=new Set();
 async function worker(){while(pending.length){const index=pending.findIndex(x=>!busy.has(x.model.id.split('/')[0]));if(index<0){await new Promise(r=>setTimeout(r,250));continue;}const [next]=pending.splice(index,1),provider=next.model.id.split('/')[0];busy.add(provider);try{await run(next.model,next.index);}finally{busy.delete(provider);}}}
 await Promise.all([worker(),worker()]);
 for(const [index,model]of entries.entries())if(model.id.startsWith('group/'))await run(model,index);
 report.status=report.runs.length===entries.length?'completed':'incomplete';
 if(await implementationDigest()!==digest)report.status='invalid-source-changed';
 report.finishedAt=new Date().toISOString();await save();
 console.log(JSON.stringify({event:'finished',status:report.status,models:report.runs.length,passed:report.runs.filter(x=>x.status==='passed').length,withinTarget:report.runs.filter(x=>x.meetsTarget).length}));
}finally{await rm(temp,{recursive:true,force:true});}
