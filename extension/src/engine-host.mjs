const api=globalThis.browser || chrome;
const worker=new Worker(api.runtime.getURL('engine-worker.js'));
const pending=new Map();let sequence=0;
worker.onmessage=({data})=>{pending.get(data.id)?.(data);pending.delete(data.id);};
api.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.destination!=='engine' || sender.id!==api.runtime.id || !sender.url?.startsWith(api.runtime.getURL('')))return false;
  const id=++sequence;
  const heartbeat=setInterval(()=>api.runtime.sendMessage({type:'keepalive'}).catch(()=>{}),20000);
  pending.set(id,response=>{clearInterval(heartbeat);reply(response);});
  worker.postMessage({...message,id});return true;
});
