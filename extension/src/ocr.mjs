import {createWorker} from 'tesseract.js';
import {languageData,modelInfo} from './ocr-data.mjs';
import {inpaintRegions,textDirection,wrapText} from './image-inpaint.mjs';
import {normalizeOcrText} from './ocr-text.mjs';
export {OCR_LANGUAGES,OCR_LANGUAGE_COMBINATIONS,OCR_MODEL_REVISION} from './ocr-data.mjs';
const api=globalThis.browser || chrome;
let worker,language,currentProgress=()=>{},queue=Promise.resolve();
export function recognize(image,lang='eng',progress=()=>{}) {
  const task=queue.then(()=>recognizeJob(image,lang,progress));queue=task.catch(()=>{});return task;
}
async function recognizeJob(image,lang,progress) {
  const codes=lang.split('+');if(codes.length>4 || new Set(codes).size!==codes.length)throw new Error('Choose up to four distinct OCR languages.');codes.forEach(modelInfo);currentProgress=progress;
  if(!worker || lang!==language) {
    await worker?.terminate();worker=null;language=null;
    const models=await Promise.all(codes.map(code=>languageData(code,api,progress)));
    worker=await createWorker(models,1,{workerPath:api.runtime.getURL('vendor/ocr/worker.min.js'),corePath:api.runtime.getURL('vendor/ocr/'),
      cacheMethod:'none',workerBlobURL:false,logger:message=>currentProgress(message.status+(message.progress?' '+Math.round(message.progress*100)+'%':''))});language=lang;
  }
  const {data}=await worker.recognize(image,{}, {text:true,blocks:true});
  const paragraphs=[];
  for(const block of data.blocks || [])for(const paragraph of block.paragraphs || []) {
    const text=normalizeOcrText(paragraph.text || paragraph.lines?.map(l=>l.text).join('\n') || '',lang).trim();
    if(text)paragraphs.push({text,bbox:paragraph.bbox,confidence:paragraph.confidence,wordBoxes:paragraph.lines?.flatMap(line=>(line.words || []).map(word=>word.bbox).filter(Boolean)) || []});
  }
  const text=normalizeOcrText(data.text,lang);
  if(!paragraphs.length && text.trim())paragraphs.push({text:text.trim(),bbox:null,confidence:data.confidence});
  return {text,paragraphs,confidence:data.confidence};
}
export function canvasImage(source) {
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  canvas.getContext('2d').drawImage(source,0,0);return canvas;
}
export function drawTextRegion(context,text,bbox,scale=1,{erase=true,color='#172a25'}={}) {
  const x=bbox.x0*scale,y=bbox.y0*scale,width=(bbox.x1-bbox.x0)*scale,height=(bbox.y1-bbox.y0)*scale;
  context.save();context.beginPath();context.rect(x-2,y-2,width+4,height+4);context.clip();
  if(erase){context.fillStyle='#fff';context.fillRect(x-2,y-2,width+4,height+4);}context.fillStyle=color;context.textBaseline='top';context.direction=textDirection(text);context.textAlign=context.direction==='rtl'?'right':'left';
  let size=Math.min(28*scale,Math.max(8*scale,height*.7)),lines;
  do{context.font=`${size}px system-ui, sans-serif`;lines=wrapText(context,text,Math.max(1,width));if(lines.length*size*1.2<=height || size<=5*scale)break;size-=.5*scale;}while(true);
  lines.forEach((line,index)=>context.fillText(line,context.direction==='rtl'?x+width:x,y+index*size*1.2,width));context.restore();
}
export function imageOverlay(image,paragraphs,translated) {
  const canvas=canvasImage(image),ctx=canvas.getContext('2d');
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),boxes=paragraphs.flatMap(p=>p.wordBoxes?.length?p.wordBoxes:p.bbox?[p.bbox]:[]);
  inpaintRegions(pixels,boxes);ctx.putImageData(pixels,0,0);
  paragraphs.forEach((paragraph,index)=>{if(!paragraph.bbox)return;
    const box=paragraph.bbox,x=Math.max(0,Math.min(canvas.width-1,Math.floor(box.x0))),y=Math.max(0,Math.min(canvas.height-1,Math.floor(box.y0))),offset=(y*canvas.width+x)*4;
    const brightness=.2126*pixels.data[offset]+.7152*pixels.data[offset+1]+.0722*pixels.data[offset+2];
    drawTextRegion(ctx,translated[index],box,1,{erase:false,color:brightness<128?'#fff':'#172a25'});
  });return canvas;
}
