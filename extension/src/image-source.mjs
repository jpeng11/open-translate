import {TranslationError} from './core.mjs';
export async function fetchImage(url) {
  const parsed=new URL(url);
  if(!['http:','https:','data:'].includes(parsed.protocol) || parsed.username || parsed.password)throw new Error('This image address cannot be loaded. Use a screenshot or choose an image file.');
  if(parsed.protocol==='data:' && !/^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,/i.test(url))throw new Error('Choose a supported bitmap image.');
  const response=await fetch(parsed.href,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new TranslationError('image_http','Cannot load this image. Save it locally or capture its webpage area.');
  const mime=(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if(!/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(mime))throw new Error('Choose a PNG, JPEG, WebP, GIF, BMP or AVIF image.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024)throw new Error('This image exceeds 8 MiB. Download it and use Choose an image instead.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  let binary='';for(const chunk of chunks)for(let i=0;i<chunk.length;i+=16384)binary+=String.fromCharCode(...chunk.subarray(i,i+16384));
  return {image:`data:${mime};base64,${btoa(binary)}`};
}
