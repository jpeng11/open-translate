import {endpoint,responseJson} from './core.mjs';
export function speechEndpoint(config) {
  if(config.speechUrl){if(!config.speechModel)throw new Error('Configure a speech model under Connection first.');return {url:endpoint(config.speechUrl,'audio/transcriptions'),model:config.speechModel,key:config.speechKey};}
  if(config.provider!=='bridge')throw new Error('Configure a speech endpoint and model under Connection first.');
  const url=new URL(endpoint(config.bridgeUrl,'translate'));url.pathname=url.pathname.replace(/\/translate\/?$/,'/v1/audio/transcriptions');
  return {url:url.href,model:config.speechModel || 'local-whisper',key:config.speechKey};
}
export async function transcribe(message,config) {
  const speech=speechEndpoint(config);
  if(typeof message.audio!=='string' || message.audio.length>8*1024*1024 || !['audio/webm','audio/ogg','audio/wav','audio/mpeg','video/webm','audio/mp4'].includes(message.mime))throw new Error('Unsupported or oversized audio chunk.');
  const bytes=Uint8Array.from(atob(message.audio),c=>c.charCodeAt(0));
  const form=new FormData();form.append('file',new Blob([bytes],{type:message.mime}),message.mime.includes('wav')?'audio.wav':message.mime.includes('ogg')?'audio.ogg':message.mime.includes('mpeg')?'audio.mp3':message.mime.includes('mp4')?'audio.m4a':'audio.webm');
  form.append('model',speech.model);if(config.source && config.source!=='auto')form.append('language',config.source.split('-')[0]);
  const headers={};if(speech.key)headers.Authorization='Bearer '+speech.key;
  const response=await responseJson(await fetch(speech.url,{method:'POST',headers,body:form,signal:AbortSignal.timeout(config.timeout*1000),redirect:'error',credentials:'omit'}));
  if(typeof response.text!=='string')throw new Error('Speech endpoint must return a JSON text field.');
  return {text:response.text};
}
