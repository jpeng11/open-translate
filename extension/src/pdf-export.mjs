import {PDFDocument} from 'pdf-lib';
import {createPdfFonts} from './pdf-fonts.mjs';
import {fitPdfText,textDirection,accessiblePdfHtml} from './pdf-layout.mjs';
export function pdfTextRegions(page,translated,fonts) {
  const scale=page.scale || 1.5;
  return page.lines.map((line,index)=>{
    const bbox=line.bbox || {x0:30*scale,y0:(30+index*25)*scale,x1:(page.width-30)*scale,y1:(50+index*25)*scale};
    const x=Math.max(0,bbox.x0/scale),y=Math.max(0,bbox.y0/scale),width=Math.min(page.width-x,Math.max(1,(bbox.x1-bbox.x0)/scale));
    const originalHeight=Math.max(8,(bbox.y1-bbox.y0)/scale);
    // Expansion may use empty space until the next line in the same column.
    const below=page.lines.map(entry=>entry.bbox).filter(box=>box && box.y0>bbox.y0+1 && box.x0<bbox.x1 && box.x1>bbox.x0).map(box=>box.y0/scale-y-1);
    const room=Math.min(page.height-y-4,below.length?Math.min(...below):Math.max(originalHeight,Math.min(90,page.height-y-4)));
    const height=Math.max(originalHeight,room),text=translated[page.offset+index];
    const layout=fitPdfText(text,width,height,fonts.measure,Math.min(18,originalHeight*.8),6);
    return {line,index,text,x,y,width,height,originalHeight,...layout};
  });
}
export async function exportSearchablePdf({sourceBytes,pages,translated,bilingual=true,fontLoader,name='Translated document',target=''}) {
  if(translated.length!==pages.reduce((count,page)=>count+page.lines.length,0))throw new Error('Translation count does not match the PDF.');
  const source=await PDFDocument.load(sourceBytes),output=await PDFDocument.create();
  const fonts=await createPdfFonts(output,translated,fontLoader);output.setTitle(name);output.setCreator('Open Translate');if(target)output.setLanguage(target);
  const overflow=[];
  for(let pageIndex=0;pageIndex<pages.length;pageIndex++) {
    const page=pages[pageIndex];if(bilingual){const [original]=await output.copyPages(source,[pageIndex]);output.addPage(original);}
    const regions=pdfTextRegions(page,translated,fonts),canvas=await page.render();
    const context=canvas.getContext('2d'),scale=page.scale || 1.5;
    for(const region of regions){context.fillStyle='white';context.fillRect(region.x*scale-1,region.y*scale-1,region.width*scale+2,Math.min(region.height,Math.max(region.originalHeight,region.lines.length*region.lineHeight))*scale+2);}
    const image=await output.embedPng(canvas.toDataURL('image/png'));
    const next=output.addPage([page.width,page.height]);next.drawImage(image,{x:0,y:0,width:page.width,height:page.height});
    for(const region of regions) {
      if(!region.fits){overflow.push({page:pageIndex+1,text:region.text});fonts.draw(next,`[${overflow.length}]`,{x:region.x,y:page.height-region.y-9,size:8});continue;}
      region.lines.forEach((line,lineIndex)=>fonts.draw(next,line,{x:textDirection(line)==='rtl'?region.x+region.width-fonts.measure(line,region.size):region.x,y:page.height-region.y-region.size-lineIndex*region.lineHeight,size:region.size}));
    }
    canvas.width=canvas.height=0;
  }
  // Never silently clip a longer translation. Complete text continues on an
  // appended searchable page, referenced from the original layout position.
  let continuation,y;
  for(let index=0;index<overflow.length;index++) {
    const entry=overflow[index],layout=fitPdfText(`[${index+1}] Page ${entry.page}\n${entry.text}`,500,1e9,fonts.measure,11,11);
    for(const line of layout.lines){if(!continuation || y<45){continuation=output.addPage([595,842]);y=790;}fonts.draw(continuation,line,{x:textDirection(line)==='rtl'?550-fonts.measure(line,11):45,y,size:11});y-=15;}y-=15;
  }
  await output.attach(new TextEncoder().encode(accessiblePdfHtml(name,pages,translated,bilingual,target).data),'translation-accessible.html',{mimeType:'text/html',description:'Reflowable translation with logical Unicode text and page reading order.'});
  return {data:await output.save(),mime:'application/pdf',extension:'pdf',overflowCount:overflow.length};
}
