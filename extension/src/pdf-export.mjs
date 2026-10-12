import {PDFDocument} from 'pdf-lib';
import {preparePdfNavigation,normalizeTranslatedPage} from './pdf-navigation.mjs';
import {repairPdfBackground,pdfBackgroundColor,pdfHasArtwork} from './pdf-background.mjs';
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
    const rotated=Math.abs(line.angle || 0)>.001,layoutWidth=rotated?line.textWidth/scale:width;
    const height=rotated?Math.max(8,line.textHeight/scale*1.2):Math.max(originalHeight,room),text=translated[page.offset+index];
    const layout=fitPdfText(text,layoutWidth,height,fonts.measure,Math.min(18,(rotated?line.textHeight/scale:originalHeight)*.8),6);
    return {line,index,text,x,y,width,height,originalHeight,rotated,layoutWidth,...layout};
  });
}
export async function exportSearchablePdf({sourceBytes,pages,translated,bilingual=true,fontLoader,name='Translated document',target=''}) {
  if(translated.length!==pages.reduce((count,page)=>count+page.lines.length,0))throw new Error('Translation count does not match the PDF.');
  const output=await PDFDocument.load(sourceBytes),navigation=preparePdfNavigation(output,{bilingual}),translatedPages=[];
  if(navigation.originalPages.length!==pages.length)throw new Error('PDF page count changed during translation.');
  const fonts=await createPdfFonts(output,translated,fontLoader);output.setTitle(name);output.setCreator('Open Translate');if(target)output.setLanguage(target);
  const overflow=[];
  for(let pageIndex=0;pageIndex<pages.length;pageIndex++) {
    const page=pages[pageIndex];
    const regions=pdfTextRegions(page,translated,fonts),canvas=await page.render({annotations:false});
    const context=canvas.getContext('2d'),scale=page.scale || 1.5;
    const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    for(const region of regions){const background=pdfBackgroundColor(pixels,{x0:region.x*scale,y0:region.y*scale,x1:(region.x+region.width)*scale,y1:(region.y+region.originalHeight)*scale});region.color=background[0]*.2126+background[1]*.7152+background[2]*.0722<128?[1,1,1]:[0,0,0];if(!region.rotated && region.lines.length*region.lineHeight>region.originalHeight && pdfHasArtwork(pixels,{x0:region.x*scale,y0:(region.y+region.originalHeight)*scale,x1:(region.x+region.width)*scale,y1:(region.y+region.height)*scale},background)){region.height=region.originalHeight;Object.assign(region,fitPdfText(region.text,region.width,region.height,fonts.measure,region.size,6));}}
    repairPdfBackground(pixels,page.lines.flatMap(line=>line.wordBoxes?.length?line.wordBoxes:line.bbox?[line.bbox]:[]));context.putImageData(pixels,0,0);
    const image=await output.embedPng(canvas.toDataURL('image/png'));
    const next=bilingual?output.insertPage(pageIndex*2+1,[page.width,page.height]):navigation.originalPages[pageIndex];if(!bilingual)normalizeTranslatedPage(next,page);translatedPages.push(next);next.drawImage(image,{x:0,y:0,width:page.width,height:page.height});
    for(const region of regions) {
      if(!region.fits){overflow.push({page:pageIndex+1,text:region.text});fonts.draw(next,`[${overflow.length}]`,{x:region.x,y:page.height-region.y-9,size:8});continue;}
      region.lines.forEach((line,lineIndex)=>{
        const angle=region.rotated?region.line.angle:0,shift=textDirection(line)==='rtl'?region.layoutWidth-fonts.measure(line,region.size):0;
        const x=region.rotated?region.line.baseline.x/scale+Math.sin(angle)*lineIndex*region.lineHeight+Math.cos(angle)*shift:region.x+shift;
        const y=region.rotated?page.height-region.line.baseline.y/scale-Math.cos(angle)*lineIndex*region.lineHeight+Math.sin(angle)*shift:page.height-region.y-region.size-lineIndex*region.lineHeight;
        fonts.draw(next,line,{x,y,size:region.size,color:region.color,angle});
      });
    }
    if(navigation.signatures.affected.has(pageIndex)){const warning='Source digital signature invalidated by translation.';fonts.draw(next,warning,{x:10,y:10,size:7});if(bilingual){const original=navigation.originalPages[pageIndex],box=original.getCropBox();fonts.draw(original,warning,{x:box.x+10,y:box.y+10,size:7});}}
    canvas.width=canvas.height=0;
  }
  // Never silently clip a longer translation. Complete text continues on an
  // appended searchable page, referenced from the original layout position.
  let continuation,y;
  for(let index=0;index<overflow.length;index++) {
    const entry=overflow[index],layout=fitPdfText(`[${index+1}] Page ${entry.page}\n${entry.text}`,500,1e9,fonts.measure,11,11);
    for(const line of layout.lines){if(!continuation || y<45){continuation=output.addPage([595,842]);y=790;}fonts.draw(continuation,line,{x:textDirection(line)==='rtl'?550-fonts.measure(line,11):45,y,size:11});y-=15;}y-=15;
  }
  navigation.finish(translatedPages,pages);
  await output.attach(new TextEncoder().encode(accessiblePdfHtml(name,pages,translated,bilingual,target).data),'translation-accessible.html',{mimeType:'text/html',description:'Reflowable translation with logical Unicode text and page reading order.'});
  return {data:await output.save({updateFieldAppearances:false}),mime:'application/pdf',extension:'pdf',overflowCount:overflow.length,removedSignatureFields:navigation.signatures.removed};
}
