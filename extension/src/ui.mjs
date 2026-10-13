import {setUiText} from './i18n.mjs';
import {LANGUAGES,batches} from './core.mjs';
export const api=globalThis.browser || chrome;
export const $=id=>document.getElementById(id);
export async function send(message) {const response=await api.runtime.sendMessage(message);if(!response?.ok)throw new Error(response?.error?.message || 'Open Translate is unavailable.');return response.result;}
export function status(id,text,error=false){const node=$(id);setUiText(node,text);node.classList.toggle('error',error);}
export function languages(){for(const [code,label]of LANGUAGES){const option=document.createElement('option');option.value=code;option.label=label;$('languages').append(option);}}
export function download(data,name,mime='text/plain') {
  const url=URL.createObjectURL(new Blob([data],{type:mime})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export async function translateAll(items,config,progress=()=>{},signal) {
  const grouped=batches(items,config.batchSize,12000),results=new Array(grouped.length);
  let cursor=0,completed=0,failure;
  const cancelled=()=>new DOMException('Translation cancelled.','AbortError');
  async function run(){
    while(!failure && cursor<grouped.length){
      if(signal?.aborted){failure=cancelled();return;}
      const index=cursor++,batch=grouped[index];
      try{
        const result=await send({type:'translate',job:{source_lang:config.source,target_lang:config.target,text_list:batch}});
        if(signal?.aborted){failure=cancelled();return;}
        if(failure)return;
        results[index]=result.translations.map(item=>item.text);completed+=batch.length;progress(completed,items.length);
      }catch(error){failure ||= error;return;}
    }
  }
  await Promise.all(Array.from({length:Math.min(config.concurrency || 1,grouped.length)},run));
  if(signal?.aborted)throw cancelled();
  if(failure)throw failure;
  return results.flat();
}
export function resultRows(id,items,translated,limit=100) {
  const root=$(id);root.replaceChildren();
  for(let i=0;i<Math.min(items.length,limit);i++) {
    const row=document.createElement('div');row.className='result';const source=document.createElement('p'),target=document.createElement('p');
    source.textContent=items[i];target.textContent=translated?.[i] || '';source.dir=target.dir='auto';row.append(source,target);root.append(row);
  }
  if(items.length>limit){const note=document.createElement('p');note.className='muted';note.textContent=`Showing the first ${limit} of ${items.length} segments. Downloads include every segment.`;root.append(note);}
}
export function action(id,statusId,callback) {
  $(id).addEventListener('click',async()=>{const button=$(id);button.disabled=true;try{await callback();}catch(error){status(statusId,error.message,true);}finally{button.disabled=false;}});
}
