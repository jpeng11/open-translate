import bidiFactory from 'bidi-js';
const bidi=bidiFactory();
export function visualPdfRuns(text,fontForCharacter=()=>true) {
  const embedding=bidi.getEmbeddingLevels(text),mirrors=bidi.getMirroredCharactersMap(text,embedding.levels),order=Array.from({length:text.length},(_,index)=>index);
  for(const [start,end]of bidi.getReorderSegments(text,embedding))order.splice(start,end-start+1,...order.slice(start,end+1).reverse());
  const ranks=new Uint32Array(text.length);order.forEach((logicalIndex,visualIndex)=>ranks[logicalIndex]=visualIndex);
  const runs=[];let index=0;
  for(const character of text) {
    const display=mirrors.get(index) || character,level=embedding.levels[index],font=fontForCharacter(display),last=runs.at(-1);
    if(font){if(last && last.font===font && last.level===level && last.end===index){last.text+=display;last.end+=character.length;last.visualIndex=Math.min(last.visualIndex,ranks[index]);}else runs.push({text:display,font,level,start:index,end:index+character.length,visualIndex:ranks[index],direction:level%2?'rtl':'ltr'});}
    index+=character.length;
  }
  return runs.sort((a,b)=>a.visualIndex-b.visualIndex);
}
