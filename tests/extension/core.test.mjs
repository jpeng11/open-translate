import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,endpoint,validateSettings,validateJob,protect,translateBatch,publicSettings,batches} from '../../extension/src/core.mjs';
const settings={...DEFAULTS,provider:'openai',model:'test-model',apiKey:'private-key'};
const envelope=value=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
test('endpoints preserve prefixes and queries and reject embedded credentials',()=>{
 assert.equal(endpoint('https://example.org/api/v1?route=x'),'https://example.org/api/v1/chat/completions?route=x');
 assert.equal(endpoint('http://localhost:1234'),'http://localhost:1234/v1/chat/completions');
 assert.throws(()=>endpoint('https://key@example.org/v1'));
 assert.throws(()=>endpoint('file:///tmp/api'));
});
test('strict input and configuration validation',()=>{
 assert.throws(()=>validateJob({source_lang:'fr',target_lang:'auto',text_list:['Bonjour']}));
 assert.throws(()=>validateJob({source_lang:'fr',target_lang:'en',text_list:[3]}));
 assert.throws(()=>validateSettings({...settings,concurrency:100}));
 assert.throws(()=>validateSettings({...settings,glossary:[{source:'',target:'x'}]}));
 assert.equal(validateSettings(settings).provider,'openai');
});
test('public settings apply hostname rules without exposing credentials',()=>{
 const result=publicSettings({...settings,rules:[{host:'*.example.org',target:'ja',include:'main p'}]},'https://a.example.org/x');
 assert.equal(result.target,'ja');assert.equal(result.include,'main p');
 assert.equal(result.apiKey,undefined);assert.equal(result.apiUrl,undefined);assert.equal(result.bridgeUrl,undefined);
 assert.equal(publicSettings({...settings,rules:[{host:'*.example.org',disabled:true}]},'https://notexample.org').disabled,undefined);
});
test('protected markup and glossary must occur exactly once',()=>{
 const item=protect('Bonjour <b>{0}</b> Open Translate',[{source:'Open Translate',target:'Open Translate™'}],'testnonce');
 assert.equal(item.restore(item.text.replace('Bonjour','Hello')),'Hello <b>{0}</b> Open Translate™');
 assert.throws(()=>item.restore(item.text.replace(/⟦[^⟧]+⟧/,'')));
 assert.throws(()=>item.restore(item.text+item.text));
});
test('real request shape, reordered IDs and blank items',async()=>{
 let request;
 const result=await translateBatch({source_lang:'fr',target_lang:'en',text_list:['Bonjour {0}',' ','Merci']},settings,async(url,init)=>{
  request={url,init};const body=JSON.parse(init.body);const job=JSON.parse(body.messages[1].content);
  return envelope({translations:job.items.toReversed().map(item=>({id:item.id,text:item.text.replace('Bonjour','Hello').replace('Merci','Thanks'),detected_source_lang:'fr'}))});
 });
 assert.deepEqual(result.translations.map(i=>i.text),['Hello {0}',' ','Thanks']);
 assert.equal(request.init.headers.Authorization,'Bearer private-key');assert.equal(request.init.redirect,'error');
 assert.equal(JSON.parse(request.init.body).tools,undefined);
});
test('bridge uses exact configured URL and normalizes ordered results',async()=>{
 const config={...DEFAULTS,bridgeUrl:'http://127.0.0.1:8765/translate?token=private'};
 const result=await translateBatch({source_lang:'fr',target_lang:'en',text_list:['Bonjour']},config,async(url,init)=>{
  assert.equal(url,config.bridgeUrl);assert.equal(JSON.parse(init.body).text_list[0],'Bonjour');
  return new Response(JSON.stringify({translations:[{text:'Hello',detected_source_lang:'fr'}]}));
 });assert.equal(result.translations[0].text,'Hello');
});
test('provider failures and incomplete batches never become translated text',async()=>{
 for(const response of [new Response('private-key source',{status:401}),envelope({translations:[]}),envelope({translations:[{id:2,text:'x'}]})]) {
  await assert.rejects(translateBatch({source_lang:'fr',target_lang:'en',text_list:['Bonjour']},settings,async()=>response),e=>!e.message.includes('private-key source'));
 }
});
test('empty batches avoid provider calls and batching bounds requests',async()=>{
 assert.deepEqual((await translateBatch({source_lang:'en',target_lang:'fr',text_list:['',' ']},settings,()=>{throw Error('called');})).translations.map(i=>i.text),['',' ']);
 assert.deepEqual(batches(['a','b','c'],2),[['a','b'],['c']]);
 assert.deepEqual(batches(['aaa','bbb'],5,5),[['aaa'],['bbb']]);
});
test('bridge preserves its native placeholder contract without redundant opaque wrapping',async()=>{
 const config={...DEFAULTS,bridgeUrl:'http://127.0.0.1:8765/translate?token=private'};
 const job={source_lang:'fr',target_lang:'en',text_list:['Bonjour {0}monde{1} {2}.']};
 const fetcher=async(_url,init)=>{assert.equal(JSON.parse(init.body).text_list[0],job.text_list[0]);return new Response(JSON.stringify({translations:[{text:'Hello {0}world{1} {2}.'}]}));};
 assert.equal((await translateBatch(job,config,fetcher)).translations[0].text,'Hello {0}world{1} {2}.');
 await assert.rejects(translateBatch(job,config,async()=>new Response(JSON.stringify({translations:[{text:'Hello world.'}]}))),error=>error.code==='placeholder_mismatch');
});
test('known bridge errors have useful messages without exposing response bodies',async()=>{
 const job={source_lang:'fr',target_lang:'en',text_list:['Bonjour']};
 await assert.rejects(translateBatch(job,DEFAULTS,async()=>new Response(JSON.stringify({error:{code:'agy_tool_use',message:'private source secret'}}),{status:502})),error=>error.code==='agy_tool_use' && !error.message.includes('private source secret'));
});

test('formatting boundaries cannot be reordered by a direct endpoint or bridge',()=>{
 for(const direct of [true,false]){
  const item=protect('Bonjour <b>monde</b> {0}',[],'ordercheck',direct);
  const markers=item.text.match(direct?/⟦[^⟧]+⟧/g:/<[^>]+>|\{\d+\}/g);
  const changed=item.text.replace(markers[0],'TEMP').replace(markers[1],markers[0]).replace('TEMP',markers[1]);
  assert.throws(()=>item.restore(changed),error=>error.code==='placeholder_mismatch');
 }
 // Glossary tokens are allocated after markup; validation follows their actual text order.
 const item=protect('Open Translate <b>bonjour</b>',[{source:'Open Translate',target:'Open Translate™'}],'mixedorder');
 assert.equal(item.restore(item.text),'Open Translate™ <b>bonjour</b>');
});
test('tool and legacy function responses are rejected even when they contain valid translations',async()=>{
 const content=JSON.stringify({translations:[{id:0,text:'Hello'}]});
 for(const extra of [{finish_reason:'tool_calls'},{finish_reason:'function_call'},
  {message:{tool_calls:[{id:'call_1',type:'function',function:{name:'browse',arguments:'{}'}}]}},
  {message:{function_call:{name:'browse',arguments:'{}'}}}]){
  const choice={finish_reason:'stop',...extra,message:{content,...extra.message}};
  await assert.rejects(translateBatch({source_lang:'fr',target_lang:'en',text_list:['Bonjour']},settings,
   async()=>new Response(JSON.stringify({choices:[choice]}))),error=>error.code==='invalid_agent_response');
 }
});
