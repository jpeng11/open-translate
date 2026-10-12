const RTL=/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
export function textDirection(text) {for(const character of String(text)){if(RTL.test(character))return 'rtl';if(/\p{L}/u.test(character))return 'ltr';}return 'ltr';}
export function readingOrder(lines) {
  // Detect a clear gutter before reordering columns. Content-stream order stays
  // intact when geometry is ambiguous (tables, marginalia or overlapping boxes).
  if(lines.length<4 || lines.some(line=>!line.bbox))return lines;
  const starts=[...new Set(lines.map(line=>line.bbox.x0))].sort((a,b)=>a-b),width=Math.max(...lines.map(line=>line.bbox.x1))-Math.min(...starts);
  let choice;
  for(let index=1;index<starts.length;index++) {
    const split=(starts[index-1]+starts[index])/2,left=lines.filter(line=>line.bbox.x0<split && line.bbox.x1<starts[index]),right=lines.filter(line=>line.bbox.x0>=starts[index]),spanning=lines.filter(line=>!left.includes(line) && !right.includes(line));
    if(left.length<2 || right.length<2)continue;
    const gap=Math.min(...right.map(line=>line.bbox.x0))-Math.max(...left.map(line=>line.bbox.x1));
    if(gap<Math.max(12,width*.04))continue;
    const overlap=Math.min(Math.max(...left.map(line=>line.bbox.y1)),Math.max(...right.map(line=>line.bbox.y1)))-Math.max(Math.min(...left.map(line=>line.bbox.y0)),Math.min(...right.map(line=>line.bbox.y0)));
    if(overlap<=0 || spanning.length>lines.length/3)continue;
    if(!choice || gap>choice.gap)choice={left,right,spanning,gap};
  }
  if(!choice)return lines;
  const order=(a,b)=>a.bbox.y0-b.bbox.y0 || a.bbox.x0-b.bbox.x0,output=[];let after=-Infinity;
  for(const boundary of [...choice.spanning.sort(order),null]) {
    const before=boundary?.bbox.y0 ?? Infinity;
    const columns=lines.filter(line=>textDirection(line.text)==='rtl').length>lines.length/2?[choice.right,choice.left]:[choice.left,choice.right];
    for(const column of columns)output.push(...column.filter(line=>line.bbox.y0>=after && line.bbox.y0<before).sort(order));
    if(boundary){output.push(boundary);after=before;}
  }
  return output;
}
export function wrapPdfText(text,width,measure) {
  const result=[];for(const paragraph of String(text).split(/\r?\n/)) {
    let line='';const pieces=paragraph.match(/\S+\s*|\s+/gu) || [''];
    for(const piece of pieces){if(measure(line+piece)<=width){line+=piece;continue;}if(line.trim()){result.push(line.trimEnd());line='';}if(measure(piece)<=width){line=piece;continue;}
      // CJK and overlong URLs have no spaces. Grapheme boundaries keep combining
      // marks and emoji sequences together instead of splitting UTF-16 code units.
      const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(piece)].map(item=>item.segment):Array.from(piece);
      for(const character of segments){if(line && measure(line+character)>width){result.push(line.trimEnd());line='';}line+=character;}
    }
    result.push(line.trimEnd());
  }return result;
}
export function fitPdfText(text,width,height,measure,preferred=12,minimum=6) {
  width=Math.max(1,width);height=Math.max(1,height);let size=Math.max(minimum,preferred),lines;
  while(true){lines=wrapPdfText(text,width,value=>measure(value,size));if(lines.length*size*1.25<=height || size<=minimum)break;size=Math.max(minimum,size-.5);}
  return {lines,size,lineHeight:size*1.25,fits:lines.length*size*1.25<=height};
}
export function escapeHtml(value){return String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
export function accessiblePdfHtml(name,pages,translated,bilingual=true,target='') {
  const sections=pages.map((page,pageIndex)=>`<section aria-labelledby="page-${pageIndex}"><h2 id="page-${pageIndex}">Page ${pageIndex+1}</h2>${page.lines.map((line,index)=>`<div class="segment">${bilingual?`<p class="source" dir="auto">${escapeHtml(line.text)}</p>`:''}<p class="target" dir="auto"${target?` lang="${escapeHtml(target)}"`:''}>${escapeHtml(translated[page.offset+index])}</p></div>`).join('')}</section>`).join('');
  return {data:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)} — translation</title><style>body{font:1.1rem/1.65 system-ui,sans-serif;max-width:75ch;margin:2rem auto;padding:1rem}section{break-after:page}.segment{margin:1em 0}.source{color:#555}.target{margin-block-start:.3em}</style></head><body><main><h1>${escapeHtml(name)}</h1>${sections}</main></body></html>`,mime:'text/html;charset=utf-8',extension:'html'};
}
