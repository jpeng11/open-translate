import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.chrome={runtime:{sendMessage:()=>{throw Error('unconfigured');}}};
const {translateAll}=await import('../../extension/src/ui.mjs');
const config={source:'en',target:'zh-CN',batchSize:2,concurrency:2};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){const requests=[];chrome.runtime.sendMessage=message=>new Promise(resolve=>requests.push({message,resolve}));return requests;}
function finish(request){request.resolve({ok:true,result:{translations:request.message.job.text_list.map(text=>({text:'译'+text}))}});}
test('document batches overlap within the limit and reassemble out-of-order results',async()=>{
 const requests=fixture(),progress=[];
 const pending=translateAll(['a','b','c','d','e','f'],config,done=>progress.push(done));
 assert.equal(requests.length,2);finish(requests[1]);await tick();assert.equal(requests.length,3);
 finish(requests[2]);await tick();finish(requests[0]);
 assert.deepEqual(await pending,['译a','译b','译c','译d','译e','译f']);assert.deepEqual(progress,[2,4,6]);
});
test('document cancellation stops queued batches and ignores active responses',async()=>{
 const requests=fixture(),abort=new AbortController(),progress=[];
 const pending=translateAll(['a','b','c','d','e','f'],config,done=>progress.push(done),abort.signal);
 const rejected=assert.rejects(pending,{name:'AbortError'});abort.abort();requests.forEach(finish);await rejected;
 assert.equal(requests.length,2);assert.deepEqual(progress,[]);
});
test('one failed document batch prevents new work and partial success',async()=>{
 const requests=fixture(),progress=[];
 const pending=translateAll(['a','b','c','d','e','f'],config,done=>progress.push(done));
 const rejected=assert.rejects(pending,/Provider failed/);
 requests[1].resolve({ok:false,error:{message:'Provider failed'}});await tick();finish(requests[0]);await rejected;
 assert.equal(requests.length,2);assert.deepEqual(progress,[]);
});
test('single-concurrency and empty document inputs remain bounded',async()=>{
 const requests=fixture();assert.deepEqual(await translateAll([],config),[]);assert.equal(requests.length,0);
 const pending=translateAll(['a','b','c'],{...config,concurrency:1});assert.equal(requests.length,1);
 finish(requests[0]);await tick();assert.equal(requests.length,2);finish(requests[1]);assert.deepEqual(await pending,['译a','译b','译c']);
});
