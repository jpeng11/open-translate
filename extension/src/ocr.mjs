import {createWorker} from 'tesseract.js';
const api=globalThis.browser || chrome;
let worker,language;
export async function recognize(image,lang='eng',progress=()=>{}) {
  if(!/^[a-z_]+(?:\+[a-z_]+)*$/.test(lang))throw new Error('Invalid OCR language.');
  if(!worker || lang!==language) {
    await worker?.terminate();
    worker=await createWorker(lang,1,{workerPath:api.runtime.getURL('vendor/ocr/worker.min.js'),corePath:api.runtime.getURL('vendor/ocr/'),
      langPath:api.runtime.getURL('vendor/ocr-data'),workerBlobURL:false,logger:message=>progress(message.status+(message.progress?' '+Math.round(message.progress*100)+'%':''))});language=lang;
  }
  const {data}=await worker.recognize(image,{}, {text:true,blocks:true});
  const paragraphs=[];
  for(const block of data.blocks || [])for(const paragraph of block.paragraphs || []) {
    const text=(paragraph.text || paragraph.lines?.map(l=>l.text).join('\n') || '').trim();
    if(text)paragraphs.push({text,bbox:paragraph.bbox,confidence:paragraph.confidence});
  }
  if(!paragraphs.length && data.text.trim())paragraphs.push({text:data.text.trim(),bbox:null,confidence:data.confidence});
  return {text:data.text,paragraphs,confidence:data.confidence};
}
export function canvasImage(source) {
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  canvas.getContext('2d').drawImage(source,0,0);return canvas;
}
function wrap(context,text,width) {
  const words=text.match(/\S+\s*|\s+/gu) || [text],lines=[];let line='';
  for(const word of words) {
    if(context.measureText(line+word).width<=width){line+=word;continue;}
    if(line.trim()){lines.push(line.trimEnd());line='';}
    for(const letter of word){if(context.measureText(line+letter).width>width && line){lines.push(line);line='';}line+=letter;}
  }
  if(line)lines.push(line.trimEnd());return lines;
}
export function drawTextRegion(context,text,bbox,scale=1) {
  const x=bbox.x0*scale,y=bbox.y0*scale,width=(bbox.x1-bbox.x0)*scale,height=(bbox.y1-bbox.y0)*scale;
  context.fillStyle='#fff';context.fillRect(x-2,y-2,width+4,height+4);context.fillStyle='#172a25';context.textBaseline='top';
  let size=Math.min(28*scale,Math.max(8*scale,height*.7)),lines;
  do{context.font=`${size}px system-ui, sans-serif`;lines=wrap(context,text,Math.max(1,width));if(lines.length*size*1.2<=height || size<=5*scale)break;size-=.5*scale;}while(true);
  lines.forEach((line,index)=>context.fillText(line,x,y+index*size*1.2,width));
}
export function imageOverlay(image,paragraphs,translated) {
  const canvas=canvasImage(image),ctx=canvas.getContext('2d');
  paragraphs.forEach((paragraph,index)=>{if(paragraph.bbox)drawTextRegion(ctx,translated[index],paragraph.bbox);});return canvas;
}
