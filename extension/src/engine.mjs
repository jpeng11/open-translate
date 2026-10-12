import {translateBatch, TranslationError} from './core.mjs';
const TTL=7*24*60*60*1000;
let database;
async function db() {
  if (!database) database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('open-translate-cache',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('batches',{keyPath:'key'}).createIndex('time','time');
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
  });
  return database;
}
async function store(action,key,value) {
  const database=await db();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction('batches',action==='get'?'readonly':'readwrite');
    const table=transaction.objectStore('batches');
    const request=action==='get'?table.get(key):action==='put'?table.put({key,value,time:Date.now()}):table.clear();
    transaction.oncomplete=()=>resolve(request.result); transaction.onerror=()=>reject(transaction.error);
  });
}
async function prune() {
  const database=await db();
  const transaction=database.transaction('batches','readwrite');
  const request=transaction.objectStore('batches').index('time').openCursor(null,'prev');
  let count=0;
  request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;if(++count>1000 || cursor.value.time<Date.now()-TTL)cursor.delete();cursor.continue();};
}
export function createEngine() {
  const memory=new Map(), waiting=[], inFlight=new Map(); let active=0;
  const drain=()=>{
    while(waiting.length && active<waiting[0].settings.concurrency) {
      const next=waiting.shift(); active++;
      translateBatch(next.job,next.settings).then(next.resolve,next.reject).finally(()=>{active--;drain();});
    }
  };
  return {
    async translate(job, settings) {
      const signature=JSON.stringify({job,provider:settings.provider,url:settings.provider==='bridge'?settings.bridgeUrl:settings.apiUrl,
        model:settings.model,glossary:settings.glossary,jsonMode:settings.jsonMode});
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature));
      const key=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      const saved=memory.get(key);
      if(saved && saved.time>Date.now()-TTL) return saved.value;
      if(settings.cache) {
        try {const saved=await store('get',key);if(saved && saved.time>Date.now()-TTL)return saved.value;}catch{}
      }
      if(inFlight.has(key))return inFlight.get(key);
      if(waiting.length>=100)throw new TranslationError('busy','Too many pending translation batches.');
      const promise=new Promise((resolve,reject)=>{waiting.push({job,settings,resolve,reject});drain();});
      inFlight.set(key,promise);
      try {
        const value=await promise; memory.set(key,{value,time:Date.now()});
        if(memory.size>200)memory.delete(memory.keys().next().value);
        if(settings.cache)try{await store('put',key,value);await prune();}catch{}
        return value;
      }finally{inFlight.delete(key);}
    },
    async clear() {memory.clear();await store('clear').catch(()=>{});}
  };
}
