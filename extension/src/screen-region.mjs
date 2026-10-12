export const SCREEN_REGIONS=Object.freeze({bottom:{left:0,top:.7,width:1,height:.3},top:{left:0,top:0,width:1,height:.3},full:{left:0,top:0,width:1,height:1}});
export function normalizeScreenRegion(value=SCREEN_REGIONS.bottom) {
  if(typeof value==='string' && Object.hasOwn(SCREEN_REGIONS,value))value=SCREEN_REGIONS[value];
  if(typeof value==='number')value={left:0,top:1-value,width:1,height:value};
  if(!value || typeof value!=='object' || ['left','top','width','height'].some(key=>!Number.isFinite(value[key])))throw new Error('Choose a valid screen subtitle region.');
  const {left,top,width,height}=value;
  if(left<0 || top<0 || width<.02 || height<.02 || left+width>1.000001 || top+height>1.000001)throw new Error('Screen subtitle region must fit inside the shared video.');
  return {left,top,width,height};
}
export function regionFromDrag(start,end) {
  const clamp=value=>Math.min(1,Math.max(0,value)),left=Math.min(clamp(start.x),clamp(end.x)),top=Math.min(clamp(start.y),clamp(end.y)),width=Math.abs(clamp(start.x)-clamp(end.x)),height=Math.abs(clamp(start.y)-clamp(end.y));
  return normalizeScreenRegion({left,top,width,height});
}
export function bindScreenRegionSelection(video,onRegion) {
  let start,box;const document=video.ownerDocument,previousCursor=video.style.cursor,position=event=>{const rect=video.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height};};
  const removeBox=()=>{box?.remove();box=null;};
  const down=event=>{if(event.button!==0 || !video.videoWidth)return;start=position(event);event.preventDefault();video.setPointerCapture(event.pointerId);removeBox();box=document.createElement('div');box.style.cssText='position:fixed;pointer-events:none;border:2px solid #159b7b;background:#159b7b22;z-index:2147483647';box.setAttribute('data-ot-region-selection','');document.body.append(box);};
  const move=event=>{if(!start || !box)return;const rect=video.getBoundingClientRect(),end=position(event);box.style.left=rect.left+Math.min(start.x,end.x)*rect.width+'px';box.style.top=rect.top+Math.min(start.y,end.y)*rect.height+'px';box.style.width=Math.abs(start.x-end.x)*rect.width+'px';box.style.height=Math.abs(start.y-end.y)*rect.height+'px';};
  const up=event=>{if(!start)return;const origin=start;start=null;removeBox();try{onRegion(regionFromDrag(origin,position(event)));}catch{}if(video.hasPointerCapture(event.pointerId))video.releasePointerCapture(event.pointerId);};
  const cancel=()=>{start=null;removeBox();};video.style.cursor='crosshair';video.addEventListener('pointerdown',down);video.addEventListener('pointermove',move);video.addEventListener('pointerup',up);video.addEventListener('pointercancel',cancel);
  return ()=>{cancel();video.style.cursor=previousCursor;video.removeEventListener('pointerdown',down);video.removeEventListener('pointermove',move);video.removeEventListener('pointerup',up);video.removeEventListener('pointercancel',cancel);};
}
