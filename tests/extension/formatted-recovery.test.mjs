import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,translateBatch,protect} from '../../extension/src/core.mjs';
import {createEngine} from '../../extension/src/engine.mjs';
const settings={...DEFAULTS,provider:'openai',model:'fixture',timeout:5};
const job=text_list=>({source_lang:'en',target_lang:'fr',text_list});
const reply=translations=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({translations})}}]}));
const input=init=>JSON.parse(JSON.parse(init.body).messages.at(-1).content);

test('lost markers repair only failed paragraphs with full context, glossary, nesting and citations',async()=>{
 const source='Read <ot0>Open Translate</ot0>, <ot1>this <ot2>guide</ot2></ot1>.<ot3/>',requests=[];
 const result=await translateBatch(job(['Already good.',source]),{...settings,glossary:[{source:'Open Translate',target:'OT™'}]},async(_url,init)=>{
  const p=input(init);requests.push(p);
  if(!p.repair)return reply([{id:1,text:'Lisez ce guide.'},{id:0,text:'Déjà bon.'}]);
  assert.equal(p.items.length,1);const item=p.items[0];assert.equal(item.id,1);assert.equal(item.draft,'Lisez ce guide.');
  assert.ok(item.required_markers.includes('<ot3/>'));assert.ok(item.required_markers.some(x=>x.startsWith('⟦OT')));
  return reply([{id:item.id,text:item.text.replace('Read','Lisez').replace('this','ce').replace('guide','guide traduit')}]);
 });
 assert.equal(requests.length,2);
 assert.deepEqual(result.translations.map(x=>x.text),['Déjà bon.','Lisez <ot0>OT™</ot0>, <ot1>ce <ot2>guide traduit</ot2></ot1>.<ot3/>']);
});

test('changed native parents are caught before the DOM; valid sibling reordering needs no repair',async()=>{
 const p=protect('<ot0>outer <ot1>inner</ot1></ot0>',[],'layout',false);
 assert.throws(()=>p.restore('<ot0>extérieur</ot0><ot1>intérieur</ot1>'),e=>e.code==='placeholder_mismatch');
 const siblings=protect('<ot0>one</ot0><ot1>two</ot1>',[],'layout',false);
 assert.equal(siblings.restore('<ot1>deux</ot1><ot0>un</ot0>'),'<ot1>deux</ot1><ot0>un</ot0>');
 let calls=0;
 const result=await translateBatch(job(['<ot0>outer <ot1>inner</ot1></ot0>']),settings,async(_url,init)=>{
  calls++;return reply([{id:0,text:input(init).repair?'<ot0>extérieur <ot1>intérieur</ot1></ot0>':'<ot0>extérieur</ot0><ot1>intérieur</ot1>'}]);
 });
 assert.equal(calls,2);assert.equal(result.translations[0].text,'<ot0>extérieur <ot1>intérieur</ot1></ot0>');
});

test('repair attempts stop after two invalid results and never accept missing markers',async()=>{
 const attempts=[];
 await assert.rejects(translateBatch(job(['<ot0>Hello</ot0>']),settings,async(_url,init)=>{
  attempts.push(input(init).repair || 0);return reply([{id:0,text:'Bonjour sans balises'}]);
 }),e=>e.code==='placeholder_mismatch');
 assert.deepEqual(attempts,[0,1,2]);
});

test('a second repair uses the latest failed draft and can recover without resubmitting good paragraphs',async()=>{
 const seen=[];
 const result=await translateBatch(job(['Good','<ot0>One</ot0>','<ot0>Two</ot0>']),settings,async(_url,init)=>{
  const p=input(init);seen.push(p.items.map(x=>x.id));
  if(!p.repair)return reply([{id:0,text:'Bon'},{id:1,text:'Un'},{id:2,text:'Deux'}]);
  const item=p.items[0];
  if(item.id===1&&p.repair===1)return reply([{id:1,text:'<ot>Un</ot>'}]);
  if(item.id===1)assert.equal(item.draft,'<ot>Un</ot>');
  return reply([{id:item.id,text:item.id===1?'<ot0>Un</ot0>':'<ot0>Deux</ot0>'}]);
 });
 assert.deepEqual(seen,[[0,1,2],[1],[1],[2]]);
 assert.deepEqual(result.translations.map(x=>x.text),['Bon','<ot0>Un</ot0>','<ot0>Deux</ot0>']);
});

test('repair still rejects duplicate, missing or invented IDs instead of guessing a match',async()=>{
 for(const entries of [[],[{id:0,text:'x'},{id:0,text:'x'}],[{id:9,text:'x'}]]){
  let calls=0;
  await assert.rejects(translateBatch(job(['<ot0>Hello</ot0>']),settings,async(_url,init)=>{
   calls++;return reply(input(init).repair?entries:[{id:0,text:'Bonjour'}]);
  }),e=>e.code==='invalid_translation_batch');assert.equal(calls,2);
 }
});

test('repair shares the original timeout and abort signal',async()=>{
 let calls=0,signal;
 await assert.rejects(translateBatch(job(['<ot0>Hello</ot0>']),{...settings,timeout:.05},async(_url,init)=>{
  calls++;if(calls===1){signal=init.signal;return reply([{id:0,text:'Bonjour'}]);}
  assert.equal(init.signal,signal);
  return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 }),e=>e.code==='translation_timeout');
 assert.equal(calls,2);assert.equal(signal.aborted,true);
});

test('malformed source markup and provider refusals cannot trigger format repair',async()=>{
 for(const [source,refusal] of [['<ot0>broken',false],['<ot0>Hello</ot0>',true]]){
  let calls=0;
  await assert.rejects(translateBatch(job([source]),settings,async()=>{
   calls++;return refusal?new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{refusal:'no',content:'{}'}}]})):reply([{id:0,text:'Bonjour'}]);
  }));assert.equal(calls,1);
 }
});

test('repair stays inside the engine concurrency limit across simultaneous jobs',async()=>{
 const previous=globalThis.fetch;let active=0,peak=0,calls=0;
 globalThis.fetch=async(_url,init)=>{
  peak=Math.max(peak,++active);calls++;await new Promise(r=>setTimeout(r,10));active--;
  const p=input(init);return reply(p.items.map(x=>({id:x.id,text:p.repair?'Traduit '+x.text:'lost all formatting'})));
 };
 try{
  const engine=createEngine();const result=await Promise.all(Array.from({length:3},(_,i)=>engine.translate(job([`<ot0>Hello ${i}</ot0>`]),{...settings,concurrency:2})));
  assert.equal(peak,2);assert.equal(calls,6);assert.ok(result.every(r=>r.translations[0].text.includes('<ot0>Hello')));
 }finally{globalThis.fetch=previous;}
});
