// Local glyph masking and harmonic background reconstruction. This keeps image
// pixels outside recognized word boxes untouched and never uploads image data.
export function inpaintRegions(image,boxes,{iterations=35,padding=3}={}) {
  if(!Number.isInteger(padding) || padding<1 || padding>8)throw new RangeError('Inpainting padding must be between one and eight pixels.');
  const {width,height,data}=image,original=new Uint8ClampedArray(data),mask=new Uint8Array(width*height),regions=[];
  for(const box of boxes){
    // OCR boxes describe the detected core, sometimes excluding the outer
    // antialiasing pixels. Sample outside that fringe and include it in the mask.
    const x0=Math.max(1,Math.floor(box.x0)-padding),y0=Math.max(1,Math.floor(box.y0)-padding),x1=Math.min(width-2,Math.ceil(box.x1)+padding),y1=Math.min(height-2,Math.ceil(box.y1)+padding);
    if(x1<=x0 || y1<=y0)continue;
    const edge=[[],[],[]];for(let x=x0;x<=x1;x++)for(const y of [y0,y1])for(let c=0;c<3;c++)edge[c].push(original[(y*width+x)*4+c]);
    for(let y=y0+1;y<y1;y++)for(const x of [x0,x1])for(let c=0;c<3;c++)edge[c].push(original[(y*width+x)*4+c]);
    const background=edge.map(values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]);
    for(let y=y0+1;y<y1;y++)for(let x=x0+1;x<x1;x++){
      const i=y*width+x,p=i*4,difference=Math.max(...background.map((value,c)=>Math.abs(original[p+c]-value)));
      if(difference<30)continue;mask[i]=1;for(let c=0;c<3;c++)data[p+c]=background[c];
    }
    regions.push({x0,y0,x1,y1});
  }
  // Dilate one pixel to remove antialiasing fringes without replacing a rectangle.
  const initial=new Uint8Array(mask);for(const {x0,y0,x1,y1}of regions)for(let y=y0+1;y<y1;y++)for(let x=x0+1;x<x1;x++){
    const i=y*width+x;if(!initial[i] && [i-1,i+1,i-width,i+width].some(n=>initial[n]))mask[i]=1;
  }
  for(let pass=0;pass<iterations;pass++)for(const {x0,y0,x1,y1}of regions)for(let y=y0+1;y<y1;y++)for(let x=x0+1;x<x1;x++){
    const i=y*width+x;if(!mask[i])continue;for(let c=0;c<3;c++)data[i*4+c]=(data[(i-1)*4+c]+data[(i+1)*4+c]+data[(i-width)*4+c]+data[(i+width)*4+c])/4;
  }
  return image;
}
export function textDirection(text){return /^[^\p{L}]*[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u.test(text)?'rtl':'ltr';}
export function wrapText(context,text,width) {
  const lines=[];
  for(const paragraph of String(text).split(/\r?\n/)){
    const parts=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter(undefined,{granularity:'word'}).segment(paragraph),x=>x.segment):paragraph.match(/\S+\s*|\s+/gu) || [''];let line='';
    for(const part of parts){if(context.measureText(line+part).width<=width){line+=part;continue;}if(line.trim()){lines.push(line.trimEnd());line='';}
      const glyphs=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(part),x=>x.segment):Array.from(part);
      for(const glyph of glyphs){if(line && context.measureText(line+glyph).width>width){lines.push(line.trimEnd());line='';}line+=glyph;}}
    lines.push(line.trimEnd());
  }
  return lines;
}
