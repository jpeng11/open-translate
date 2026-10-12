import {OCR_MODELS,OCR_MODEL_REVISION} from './ocr-models.mjs';
export {OCR_MODEL_REVISION};
const bundled=new Set(['eng','chi_sim','jpn']);
const names={eng:'English',chi_sim:'简体中文',chi_tra:'繁體中文',jpn:'日本語',kor:'한국어',fra:'Français',deu:'Deutsch',spa:'Español',por:'Português',ita:'Italiano',rus:'Русский',ara:'العربية',heb:'עברית',hin:'हिन्दी',tha:'ไทย',vie:'Tiếng Việt',tur:'Türkçe',ukr:'Українська',nld:'Nederlands',pol:'Polski',fas:'فارسی',ind:'Bahasa Indonesia',swe:'Svenska',dan:'Dansk',fin:'Suomi',ell:'Ελληνικά',ces:'Čeština',ron:'Română',hun:'Magyar',bul:'Български'};
export const OCR_LANGUAGES=Object.keys(OCR_MODELS).map(code=>[code,names[code] || code.replaceAll('_',' ')]);
export function modelInfo(code) {
  const info=Object.hasOwn(OCR_MODELS,code)?OCR_MODELS[code]:null;if(!info)throw new Error('Unsupported OCR language. Choose an available language model.');
  return {...info,url:`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${OCR_MODEL_REVISION}/${code}.traineddata`};
}
export async function verifyModel(code,data) {
  const info=modelInfo(code);if(data.byteLength!==info.bytes)throw new Error('OCR language download has an invalid size.');
  // Git object IDs bind both the exact bytes and their length to the pinned tree.
  const header=new TextEncoder().encode(`blob ${data.byteLength}\0`),object=new Uint8Array(header.length+data.byteLength);object.set(header);object.set(new Uint8Array(data),header.length);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',object)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==info.gitBlob)throw new Error('OCR language integrity check failed.');
}
async function database() {
  return new Promise((resolve,reject)=>{const request=indexedDB.open('open-translate-ocr-data',1);request.onupgradeneeded=()=>request.result.createObjectStore('models');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
async function cached(key,value) {
  const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('models',value?'readwrite':'readonly'),store=tx.objectStore('models'),request=value?store.put(value,key):store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}
}
export async function languageData(code,api,progress=()=>{},signal) {
  const info=modelInfo(code);
  if(bundled.has(code))return {code,data:new Uint8Array(await (await fetch(api.runtime.getURL(`vendor/ocr-data/${code}.traineddata.gz`),{signal})).arrayBuffer())};
  const key=`${OCR_MODEL_REVISION}/${code}`;let data=await cached(key).catch(()=>null);
  if(data){try{await verifyModel(code,data);return {code,data:new Uint8Array(data)};}catch{data=null;}}
  progress(`Downloading ${names[code] || code} OCR model (${(info.bytes/1048576).toFixed(1)} MB). Future use works offline…`);
  const response=await fetch(info.url,{signal:signal || AbortSignal.timeout(120000),credentials:'omit',redirect:'error'});
  if(!response.ok)throw new Error('OCR language download failed. Check your connection and try again.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>info.bytes){await reader.cancel();throw new Error('OCR language download exceeded its expected size.');}chunks.push(value);}
  data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  await verifyModel(code,data);await cached(key,data.buffer).catch(()=>{});return {code,data};
}
