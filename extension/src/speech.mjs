import {endpoint,responseJson} from './core.mjs';
export async function transcribe(message,config) {
  if(!config.speechUrl || !config.speechModel)throw new Error('Configure a speech endpoint and model under Connection first.');
  if(typeof message.audio!=='string' || message.audio.length>8*1024*1024 || !['audio/webm','audio/ogg','audio/wav','audio/mpeg','video/webm','audio/mp4'].includes(message.mime))throw new Error('Unsupported or oversized audio chunk.');
  const bytes=Uint8Array.from(atob(message.audio),c=>c.charCodeAt(0));
  const form=new FormData();form.append('file',new Blob([bytes],{type:message.mime}),message.mime.includes('ogg')?'audio.ogg':message.mime.includes('mpeg')?'audio.mp3':message.mime.includes('mp4')?'audio.m4a':'audio.webm');
  form.append('model',config.speechModel);
  const headers={};if(config.speechKey)headers.Authorization='Bearer '+config.speechKey;
  const response=await responseJson(await fetch(endpoint(config.speechUrl,'audio/transcriptions'),{method:'POST',headers,body:form,signal:AbortSignal.timeout(config.timeout*1000),redirect:'error',credentials:'omit'}));
  if(typeof response.text!=='string')throw new Error('Speech endpoint must return a JSON text field.');
  return {text:response.text};
}
