import {LANGUAGES,batches} from './core.mjs';
export const api=globalThis.browser || chrome;
export const $=id=>document.getElementById(id);
export async function send(message) {const response=await api.runtime.sendMessage(message);if(!response?.ok)throw new Error(response?.error?.message || 'Open Translate is unavailable.');return response.result;}
export function status(id,text,error=false){const node=$(id);node.textContent=text;node.classList.toggle('error',error);}
export function languages(){for(const [code,label]of LANGUAGES){const option=document.createElement('option');option.value=code;option.label=label;$('languages').append(option);}}
export function download(data,name,mime='text/plain') {
  const url=URL.createObjectURL(new Blob([data],{type:mime})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export async function translateAll(items,config,progress=()=>{},signal) {
  const output=[];let completed=0;
  for(const batch of batches(items,config.batchSize,12000)) {
    if(signal?.aborted)throw new DOMException('Translation cancelled.','AbortError');
    const result=await send({type:'translate',job:{source_lang:config.source,target_lang:config.target,text_list:batch}});
    if(signal?.aborted)throw new DOMException('Translation cancelled.','AbortError');
    output.push(...result.translations.map(item=>item.text));completed+=batch.length;progress(completed,items.length);
  }
  return output;
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
