import * as pdfjs from 'pdfjs-dist';
import {exportSearchablePdf} from './pdf-export.mjs';
import {accessiblePdfHtml,readingOrder} from './pdf-layout.mjs';
import {recognize,drawTextRegion} from './ocr.mjs';
const api=globalThis.browser || chrome;
pdfjs.GlobalWorkerOptions.workerSrc=api.runtime.getURL('vendor/pdf.worker.mjs');
export async function importPdf(file,progress=()=>{},ocrLanguage='eng') {
  if(file.size>30*1024*1024)throw new Error('Choose a PDF smaller than 30 MiB.');
  const sourceBytes=new Uint8Array(await file.arrayBuffer());
  const document=await pdfjs.getDocument({data:sourceBytes.slice(),cMapUrl:api.runtime.getURL('vendor/cmaps/'),cMapPacked:true,
    standardFontDataUrl:api.runtime.getURL('vendor/standard_fonts/'),wasmUrl:api.runtime.getURL('vendor/pdf-wasm/'),isEvalSupported:false}).promise;
  if(document.numPages>200){await document.destroy();throw new Error('Split PDFs longer than 200 pages before translating.');}
  const pages=[],items=[];
  for(let index=1;index<=document.numPages;index++) {
    progress(`Reading PDF page ${index}/${document.numPages}`);
    const page=await document.getPage(index),viewport=page.getViewport({scale:1.5});
    if(viewport.width*viewport.height>32e6){await document.destroy();throw new Error(`PDF page ${index} exceeds 32 megapixels. Reduce its page dimensions before translating.`);}
    const render=async({annotations=true}={})=>{const canvas=documentElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport,annotationMode:annotations?pdfjs.AnnotationMode.ENABLE:pdfjs.AnnotationMode.DISABLE}).promise;return canvas;};
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
      const canvas=await render();const ocr=await recognize(canvas,ocrLanguage,progress);canvas.width=canvas.height=0;lines.push(...ocr.paragraphs);
    }
    const ordered=readingOrder(lines),offset=items.length;items.push(...ordered.map(line=>line.text));
    pages.push({render,lines:ordered,offset,scale:1.5,transform:page.getViewport({scale:1}).transform,width:page.getViewport({scale:1}).width,height:page.getViewport({scale:1}).height});
    page.cleanup();
  }
  if(!items.length){await document.destroy();throw new Error('No readable text found in the PDF.');}
  return {name:file.name,format:'pdf',items,pages,dispose:()=>document.destroy(),
    exportAccessibleHtml(translated,bilingual=true,target=''){return accessiblePdfHtml(file.name,pages,translated,bilingual,target);},
    async export(translated,bilingual=true,target=''){return exportSearchablePdf({sourceBytes,pages,translated,bilingual,name:file.name,target});}
  };
}
function documentElement(name){return globalThis.document.createElement(name);}
export async function renderPdfPage(page,translated,original) {
  const source=original || await page.render();
  const canvas=documentElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const context=canvas.getContext('2d');context.drawImage(source,0,0);
  page.lines.forEach((line,index)=>{if(line.bbox)drawTextRegion(context,translated[page.offset+index],line.bbox);});return canvas;
}
