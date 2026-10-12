import * as pdfjs from 'pdfjs-dist';
import {PDFDocument} from 'pdf-lib';
import {recognize,drawTextRegion} from './ocr.mjs';
const api=globalThis.browser || chrome;
pdfjs.GlobalWorkerOptions.workerSrc=api.runtime.getURL('vendor/pdf.worker.mjs');
export async function importPdf(file,progress=()=>{},ocrLanguage='eng') {
  if(file.size>30*1024*1024)throw new Error('Choose a PDF smaller than 30 MiB.');
  const document=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:api.runtime.getURL('vendor/cmaps/'),cMapPacked:true,
    standardFontDataUrl:api.runtime.getURL('vendor/standard_fonts/'),wasmUrl:api.runtime.getURL('vendor/pdf-wasm/'),isEvalSupported:false}).promise;
  if(document.numPages>200)throw new Error('Split PDFs longer than 200 pages before translating.');
  const pages=[],items=[];
  for(let index=1;index<=document.numPages;index++) {
    progress(`Reading PDF page ${index}/${document.numPages}`);
    const page=await document.getPage(index),viewport=page.getViewport({scale:1.5});
    const canvas=documentElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    const content=await page.getTextContent();const lines=[];
    for(const item of content.items) {
      if(!item.str?.trim())continue;
      const matrix=pdfjs.Util.transform(viewport.transform,item.transform),height=Math.max(4,Math.hypot(matrix[2],matrix[3]));
      const bbox={x0:matrix[4],y0:matrix[5]-height,x1:matrix[4]+item.width*1.5,y1:matrix[5]+height*.2};
      const previous=lines.at(-1);
      if(previous && Math.abs(previous.bbox.y0-bbox.y0)<height*.45 && bbox.x0-previous.bbox.x1<height*2 && bbox.x0>=previous.bbox.x0) {
        previous.text+=' '+item.str;previous.bbox.x1=Math.max(previous.bbox.x1,bbox.x1);previous.bbox.y1=Math.max(previous.bbox.y1,bbox.y1);
      }else lines.push({text:item.str,bbox});
    }
    if(!lines.length) {
      progress(`Recognizing scanned PDF page ${index}/${document.numPages}`);
      const ocr=await recognize(canvas,ocrLanguage,progress);lines.push(...ocr.paragraphs);
    }
    const offset=items.length;items.push(...lines.map(line=>line.text));
    pages.push({canvas,lines,offset,width:page.getViewport({scale:1}).width,height:page.getViewport({scale:1}).height});
    page.cleanup();
  }
  await document.destroy();
  if(!items.length)throw new Error('No readable text found in the PDF.');
  return {name:file.name,format:'pdf',items,pages,async export(translated,bilingual=true) {
    const output=await PDFDocument.create();
    for(const page of pages) {
      if(bilingual){const original=output.addPage([page.width,page.height]);const image=await output.embedPng(page.canvas.toDataURL('image/png'));original.drawImage(image,{x:0,y:0,width:page.width,height:page.height});}
      const translatedCanvas=renderPdfPage(page,translated),image=await output.embedPng(translatedCanvas.toDataURL('image/png'));
      output.addPage([page.width,page.height]).drawImage(image,{x:0,y:0,width:page.width,height:page.height});
    }
    return {data:await output.save(),mime:'application/pdf',extension:'pdf'};
  }};
}
function documentElement(name){return globalThis.document.createElement(name);}
export function renderPdfPage(page,translated) {
  const canvas=documentElement('canvas');canvas.width=page.canvas.width;canvas.height=page.canvas.height;
  const context=canvas.getContext('2d');context.drawImage(page.canvas,0,0);
  page.lines.forEach((line,index)=>{if(line.bbox)drawTextRegion(context,translated[page.offset+index],line.bbox);});return canvas;
}
