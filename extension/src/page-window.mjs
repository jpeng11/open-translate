// Keep a bounded amount of work ready without translating an entire long page.
export const viewportDistance=(item,height)=>item.bottom<0?-item.bottom:item.top>height?item.top-height:0;
export function viewportOrder(items,height) {
  return [...items].sort((a,b)=>viewportDistance(a,height)-viewportDistance(b,height)||a.top-b.top);
}
export function readingWindow(items,{height,batchSize=4,concurrency=1,eager=false,maxCharacters=48000}={}) {
  if(eager)return items;
  const limit=Math.min(64,batchSize*concurrency*2),selected=[];
  let characters=0;
  for(const item of viewportOrder(items,height)){
    const visible=viewportDistance(item,height)===0;
    if(!visible&&selected.length>=limit)break;
    if(!visible&&selected.length&&characters+item.characters>maxCharacters)break;
    selected.push(item);characters+=item.characters;
  }
  return selected;
}
