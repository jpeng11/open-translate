import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../../extension/src/engine.mjs';
import {DEFAULTS} from '../../extension/src/core.mjs';
const settings={...DEFAULTS,provider:'openai',model:'fixture',timeout:5};
const job=text=>({source_lang:'en',target_lang:'fr',text_list:[text]});
const response=init=>{const body=JSON.parse(init.body),value=JSON.parse(body.messages[1].content);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({translations:value.items.map(item=>({id:item.id,text:'translated '+item.text}))})}}]}));};
test('engine deduplicates equal jobs and bounds global concurrency',async()=>{
 const original=globalThis.fetch;let active=0,max=0,calls=0;globalThis.fetch=async(_,init)=>{calls++;max=Math.max(max,++active);await new Promise(r=>setTimeout(r,15));active--;return response(init);};
 try{const engine=createEngine();await Promise.all([engine.translate(job('same'),settings),engine.translate(job('same'),settings),engine.translate(job('other'),settings)]);assert.equal(calls,2);assert.equal(max,1);await engine.translate(job('same'),settings);assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('cache clearing during an unfinished request prevents later persistence',async()=>{
 const original=globalThis.fetch;let release,calls=0;globalThis.fetch=async(_,init)=>{calls++;if(calls===1)await new Promise(r=>release=r);return response(init);};
 try{const engine=createEngine(),pending=engine.translate(job('pending'),settings);while(!release)await new Promise(r=>setTimeout(r,1));await engine.clear();release();await pending;await engine.translate(job('pending'),settings);assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('cache entries are isolated by provider credentials',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async(_,init)=>{calls++;return response(init);};try{const engine=createEngine();await engine.translate(job('same'),{...settings,apiKey:'one'});await engine.translate(job('same'),{...settings,apiKey:'two'});assert.equal(calls,2);}finally{globalThis.fetch=original;}});
