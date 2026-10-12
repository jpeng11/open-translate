import * as pdfjs from 'pdfjs-dist';
import {exportSearchablePdf} from './pdf-export.mjs';
import {accessiblePdfHtml,readingOrder,fitPdfText} from './pdf-layout.mjs';
import {recognize,drawTextRegion} from './ocr.mjs';
import {repairPdfBackground} from './pdf-background.mjs';
const api=globalThis.browser || chrome;
pdfjs.GlobalWorkerOptions.workerSrc=api.runtime.getURL('vendor/pdf.worker.mjs');
export async function importPdf(file,progress=()=>{},ocrLanguage='eng') {
  if(file.size>30*1024*1024)throw new Error('Choose a PDF smaller than 30 MiB.');
  const sourceBytes=new Uint8Array(await file.arrayBuffer());
  const loadingTask=pdfjs.getDocument({data:sourceBytes.slice(),cMapUrl:api.runtime.getURL('vendor/cmaps/'),cMapPacked:true,
    standardFontDataUrl:api.runtime.getURL('vendor/standard_fonts/'),wasmUrl:api.runtime.getURL('vendor/pdf-wasm/'),isEvalSupported:false});
  let document;try{document=await loadingTask.promise;}catch(error){await loadingTask.destroy();if(error.name==='PasswordException')throw new Error('This PDF requires a password. Unlock a copy locally before translating.');throw error;}
  const dispose=()=>loadingTask.destroy();
  try{
  if(await document.getPermissions()!==null)throw new Error('This PDF is encrypted. Unlock a copy locally before translating.');
  if(document.numPages>200){throw new Error('Split PDFs longer than 200 pages before translating.');}
  const pages=[],items=[];
  for(let index=1;index<=document.numPages;index++) {
    progress(`Reading PDF page ${index}/${document.numPages}`);
    const page=await document.getPage(index),viewport=page.getViewport({scale:1.5});
    if(viewport.width*viewport.height>32e6){throw new Error(`PDF page ${index} exceeds 32 megapixels. Reduce its page dimensions before translating.`);}
    const render=async({annotations=true}={})=>{const canvas=documentElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport,annotationMode:annotations?pdfjs.AnnotationMode.ENABLE:pdfjs.AnnotationMode.DISABLE}).promise;return canvas;};
    const content=await page.getTextContent();const lines=[];
    for(const item of content.items) {
      if(!item.str?.trim())continue;
      const matrix=pdfjs.Util.transform(viewport.transform,item.transform),height=Math.max(4,Math.hypot(matrix[2],matrix[3]));
      const length=Math.hypot(matrix[0],matrix[1]),advance=item.width*1.5;
      const dx=length?matrix[0]/length:1,dy=length?matrix[1]/length:0;
      const corners=[0,advance].flatMap(distance=>[-.2,1].map(up=>({x:matrix[4]+dx*distance+matrix[2]*up,y:matrix[5]+dy*distance+matrix[3]*up})));
      const bbox={x0:Math.max(0,Math.min(...corners.map(p=>p.x))),y0:Math.max(0,Math.min(...corners.map(p=>p.y))),x1:Math.min(viewport.width,Math.max(...corners.map(p=>p.x))),y1:Math.min(viewport.height,Math.max(...corners.map(p=>p.y)))};
      if(bbox.x1<=bbox.x0 || bbox.y1<=bbox.y0)continue;
      const angle=Math.atan2(-dy,dx),baseline={x:matrix[4],y:matrix[5]};
      const previous=lines.at(-1);
      if(Math.abs(angle)<.001 && previous && Math.abs(previous.angle || 0)<.001 && Math.abs(previous.bbox.y0-bbox.y0)<height*.45 && bbox.x0-previous.bbox.x1<height*2 && bbox.x0>=previous.bbox.x0) {
        previous.text+=' '+item.str;previous.bbox.x1=Math.max(previous.bbox.x1,bbox.x1);previous.bbox.y1=Math.max(previous.bbox.y1,bbox.y1);
      }else lines.push({text:item.str,bbox,angle,baseline,textWidth:advance,textHeight:height});
    }
    if(!lines.length) {
      progress(`Recognizing scanned PDF page ${index}/${document.numPages}`);
      const canvas=await render();const ocr=await recognize(canvas,ocrLanguage,progress);canvas.width=canvas.height=0;lines.push(...ocr.paragraphs);
    }
    const ordered=readingOrder(lines),offset=items.length;items.push(...ordered.map(line=>line.text));
    pages.push({render,lines:ordered,offset,scale:1.5,transform:page.getViewport({scale:1}).transform,width:page.getViewport({scale:1}).width,height:page.getViewport({scale:1}).height});
    page.cleanup();
  }
  if(!items.length){throw new Error('No readable text found in the PDF.');}
  return {name:file.name,format:'pdf',items,pages,dispose,
    exportAccessibleHtml(translated,bilingual=true,target=''){return accessiblePdfHtml(file.name,pages,translated,bilingual,target);},
    async export(translated,bilingual=true,target=''){return exportSearchablePdf({sourceBytes,pages,translated,bilingual,name:file.name,target});}
  };
  }catch(error){await dispose();throw error;}
}
function documentElement(name){return globalThis.document.createElement(name);}
export async function renderPdfPage(page,translated,original) {
  const source=original || await page.render();
  const canvas=documentElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const context=canvas.getContext('2d');context.drawImage(source,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  repairPdfBackground(pixels,page.lines.filter(line=>Math.abs(line.angle || 0)>.001).map(line=>line.bbox));context.putImageData(pixels,0,0);
  page.lines.forEach((line,index)=>{
    if(!line.bbox)return;const text=translated[page.offset+index];
    if(Math.abs(line.angle || 0)<.001){drawTextRegion(context,text,line.bbox);return;}
    const layout=fitPdfText(text,line.textWidth,line.textHeight*1.2,(value,size)=>{context.font=`${size}px system-ui,sans-serif`;return context.measureText(value).width;},line.textHeight*.8,9);
    context.save();context.translate(line.baseline.x,line.baseline.y);context.rotate(-line.angle);context.fillStyle='#172a25';context.font=`${layout.size}px system-ui,sans-serif`;context.textBaseline='alphabetic';
    if(layout.fits)layout.lines.forEach((value,i)=>context.fillText(value,0,i*layout.lineHeight));else context.fillText('[continued in export]',0,0,line.textWidth);context.restore();
  });return canvas;
}
