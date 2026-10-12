const api=globalThis.browser || chrome;
let worker=new Worker(api.runtime.getURL('engine-worker.js'));
const pending=new Map();let sequence=0;
worker.onerror=()=>{for(const reply of pending.values())reply({ok:false,error:{code:'engine_crashed',message:'Translation engine stopped. Reload the extension to retry.'}});pending.clear();};
worker.onmessage=({data})=>{pending.get(data.id)?.(data);pending.delete(data.id);};
api.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.destination!=='engine' || sender.id!==api.runtime.id || !sender.url?.startsWith(api.runtime.getURL('')))return false;
  const id=++sequence;
  const heartbeat=setInterval(()=>api.runtime.sendMessage({type:'keepalive'}).catch(()=>{}),20000);
  const timeout=setTimeout(()=>{pending.get(id)?.({ok:false,error:{code:'timeout',message:'The translation engine timed out.'}});pending.delete(id);},((message.settings?.timeout || 210)*1000+30000)*101);
  pending.set(id,response=>{clearInterval(heartbeat);clearTimeout(timeout);reply(response);});
  worker.postMessage({...message,id});return true;
});
