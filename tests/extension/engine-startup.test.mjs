import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';

test('parallel first requests wait for an offscreen document that exists but is still loading',async()=>{
 let listener,exists=false,ready=false,created=0,sent=0,release;
 const loaded=new Promise(resolve=>release=()=>{ready=true;resolve();});
 const previous=globalThis.chrome;
 globalThis.chrome={
  runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,
   getContexts:async()=>exists?[{}]:[],
   sendMessage:async()=>{sent++;if(!ready)throw Error('Receiving end does not exist.');return {ok:true,result:{translations:[{text:'Bonjour'}]}};},
   onMessage:{addListener:fn=>listener=fn},onInstalled:{addListener(){}},
  },
  storage:{local:{setAccessLevel:async()=>{},get:async()=>({settings:{provider:'openai',model:'test'}})}},
  offscreen:{createDocument:async()=>{created++;exists=true;await loaded;}},
  contextMenus:{onClicked:{addListener(){}}},commands:{onCommand:{addListener(){}}},
 };
 try{
  await import('../../extension/src/background.mjs?startup-test');
  const request=()=>new Promise(resolve=>listener({type:'translate',job:{source_lang:'en',target_lang:'fr',text_list:['Hello']}},{id:'test',url:'https://example.org',tab:{id:1}},resolve));
  const first=request();while(!exists)await pause(0);
  const second=request();await pause(10);
  assert.equal(sent,0,'an existing but loading document must not receive a translation');
  release();const responses=await Promise.all([first,second]);
  assert.equal(created,1);assert.equal(sent,2);assert.ok(responses.every(x=>x.ok));
 }finally{release();globalThis.chrome=previous;}
});
