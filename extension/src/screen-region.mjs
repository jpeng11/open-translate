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
// A preview can contain letterboxing or crop its source with object-fit. Map
// pointer coordinates to the decoded video rather than to the element's border.
export function videoContentRect(video) {
  const rect=video.getBoundingClientRect(),style=video.ownerDocument?.defaultView?.getComputedStyle(video) || {},number=value=>Number.parseFloat(value) || 0;
  const left=rect.left+number(style.borderLeftWidth)+number(style.paddingLeft),top=rect.top+number(style.borderTopWidth)+number(style.paddingTop),width=Math.max(0,rect.width-number(style.borderLeftWidth)-number(style.borderRightWidth)-number(style.paddingLeft)-number(style.paddingRight)),height=Math.max(0,rect.height-number(style.borderTopWidth)-number(style.borderBottomWidth)-number(style.paddingTop)-number(style.paddingBottom));
  const content={left,top,width,height};if(!video.videoWidth || !video.videoHeight || !width || !height)return {...content,clip:content};
  const fit=style.objectFit || 'fill';let scale;
  if(fit==='contain' || fit==='scale-down')scale=Math.min(width/video.videoWidth,height/video.videoHeight,fit==='scale-down'?1:Infinity);
  else if(fit==='cover')scale=Math.max(width/video.videoWidth,height/video.videoHeight);
  else if(fit==='none')scale=1;
  const renderedWidth=scale===undefined?width:video.videoWidth*scale,renderedHeight=scale===undefined?height:video.videoHeight*scale,position=(style.objectPosition || '50% 50%').trim().split(/\s+/),offset=(token,space)=>token?.endsWith('%')?space*number(token)/100:token==='left'||token==='top'?0:token==='right'||token==='bottom'?space:token==='center'||!token?space/2:number(token);
  if(position.length===1){if(['top','bottom'].includes(position[0]))position.unshift('50%');else position.push('50%');}else if(['top','bottom'].includes(position[0]))position.reverse();
  return {left:left+offset(position[0],width-renderedWidth),top:top+offset(position[1],height-renderedHeight),width:renderedWidth,height:renderedHeight,clip:content};
}
export function bindScreenRegionSelection(video,onRegion) {
  let start,box;const document=video.ownerDocument,previousCursor=video.style.cursor,position=event=>{const rect=videoContentRect(video),clip=rect.clip,x=Math.max(Math.max(rect.left,clip.left),Math.min(Math.min(rect.left+rect.width,clip.left+clip.width),event.clientX)),y=Math.max(Math.max(rect.top,clip.top),Math.min(Math.min(rect.top+rect.height,clip.top+clip.height),event.clientY));return {x:(x-rect.left)/rect.width,y:(y-rect.top)/rect.height};};
  const removeBox=()=>{box?.remove();box=null;};
  const down=event=>{if(event.button!==0 || !video.videoWidth)return;const rect=videoContentRect(video);if(event.clientX<rect.left || event.clientX>rect.left+rect.width || event.clientY<rect.top || event.clientY>rect.top+rect.height)return;start=position(event);event.preventDefault();video.setPointerCapture(event.pointerId);removeBox();box=document.createElement('div');box.style.cssText='position:fixed;pointer-events:none;border:2px solid var(--ot-accent,#159b7b);background:color-mix(in srgb,var(--ot-accent,#159b7b) 15%,transparent);z-index:2147483647';box.setAttribute('data-ot-region-selection','');document.body.append(box);};
  const move=event=>{if(!start || !box)return;const rect=videoContentRect(video),end=position(event);box.style.left=rect.left+Math.min(start.x,end.x)*rect.width+'px';box.style.top=rect.top+Math.min(start.y,end.y)*rect.height+'px';box.style.width=Math.abs(start.x-end.x)*rect.width+'px';box.style.height=Math.abs(start.y-end.y)*rect.height+'px';};
  const up=event=>{if(!start)return;const origin=start;start=null;removeBox();try{onRegion(regionFromDrag(origin,position(event)));}catch{}if(video.hasPointerCapture(event.pointerId))video.releasePointerCapture(event.pointerId);};
  const cancel=()=>{start=null;removeBox();};video.style.cursor='crosshair';video.addEventListener('pointerdown',down);video.addEventListener('pointermove',move);video.addEventListener('pointerup',up);video.addEventListener('pointercancel',cancel);
  return ()=>{cancel();video.style.cursor=previousCursor;video.removeEventListener('pointerdown',down);video.removeEventListener('pointermove',move);video.removeEventListener('pointerup',up);video.removeEventListener('pointercancel',cancel);};
}
