import {candidates,serialize,insertTranslation,restoreElement,sourceNodes,own,unwrapSegments,PAGE_STYLE} from './dom.mjs';
import {pageRule} from './site-adapters.mjs';
import {CaptionReader,CaptionOverlay,captionRoots,installSubtitleSidecar} from './captions.mjs';
const api=globalThis.browser || chrome;
let config={},active=false,epoch=0,processing=0,drainScheduled=false,scanTimer,viewportTimer,hovered,input,lastSelection='',captionOn=false,captionLast='';
const states=new Map(),queue=new Set(),roots=new Set();let completed=0,failed=0,lastError='';
const send=async message=>{const response=await api.runtime.sendMessage(message);if(!response?.ok)throw new Error(response?.error?.message || 'Open Translate is unavailable.');return response.result;};
const translate=texts=>send({type:'translate',job:{source_lang:config.source || 'auto',target_lang:config.target || 'en',text_list:texts}});
let host,panel;
function notification(text,result=false) {
  if(!host) {
    host=document.createElement('div');host.setAttribute('data-ot-ui','');host.style.cssText='position:fixed;z-index:2147483647;right:20px;bottom:20px;';
    const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');
    style.textContent=':host{all:initial}section{box-sizing:border-box;font:14px/1.5 system-ui,sans-serif;width:340px;max-height:60vh;overflow:auto;padding:18px;background:#f4f3ed;color:#12232e;border:1px solid #bdcfc9;border-top:4px solid #087f75;border-radius:8px;box-shadow:0 8px 40px #12232e26}header{display:flex;justify-content:space-between;font-weight:650;margin-bottom:10px}button{font:inherit;cursor:pointer;border:0;background:#dceddf;border-radius:6px;color:inherit;padding:5px 9px;margin:6px 6px 0 0}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}';
    panel=document.createElement('section');panel.setAttribute('aria-live','polite');shadow.append(style,panel);document.documentElement.append(host);
  }
  panel.replaceChildren();const header=document.createElement('header');header.textContent='Open Translate';const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Close translation');close.onclick=()=>host.remove();header.append(close);panel.append(header);
  if(!host.isConnected)document.documentElement.append(host);
  const body=document.createElement('p');body.textContent=text;panel.append(body);
  if(result) {
    const copy=document.createElement('button');copy.textContent='Copy';copy.onclick=()=>navigator.clipboard.writeText(text).catch(()=>notification('Clipboard access was denied.'));
    const speak=document.createElement('button');speak.textContent='Listen';speak.onclick=()=>{speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=config.target;speechSynthesis.speak(utterance);};panel.append(copy,speak);
  }
}
function report(){notification(`Translated ${completed} paragraphs${failed?`; ${failed} failed. Restore and retry after checking your agent.`:''}`);}
const visibility=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){visibility.unobserve(entry.target);enqueue(entry.target);}},{rootMargin:'600px 0px'});
function enqueue(element) {if(!active || !element.isConnected)return;const state=states.get(element);if(state?.status==='pending'||state?.status==='done'||state?.status==='error')return;queue.add(element);scheduleDrain();}
function viewportChanged(){if(active && !viewportTimer)viewportTimer=setTimeout(()=>{viewportTimer=undefined;if(active)scan();},120);}
addEventListener('resize',viewportChanged,{passive:true});
function addRoot(root) {
  if(roots.has(root))return;roots.add(root);
  root.addEventListener('scroll',viewportChanged,{capture:true,passive:true});
  const style=document.createElement('style');style.setAttribute('data-ot-ui','');style.textContent=PAGE_STYLE;(root.head || root).append(style);
  const observer=new MutationObserver(records=>{
    if(!active && !captionOn)return;
    const relevant=records.some(record=>{
      if(record.target.parentElement?.closest('[data-ot-target],[data-ot-ui]') || record.target.nodeType===1 && record.target.closest('[data-ot-target],[data-ot-ui]'))return false;
      const changed=[...record.addedNodes,...record.removedNodes];return !changed.length || changed.some(n=>!own(n));
    });
    if(relevant){clearTimeout(scanTimer);scanTimer=setTimeout(()=>{if(active)scan();if(captionOn)scanCaptions();},180);}
  });observer.observe(root,{childList:true,characterData:true,subtree:true});
}
function scan() {
  if(!active)return;
  try {
    for(const [element,state] of states) {
      if(!element.isConnected){states.delete(element);queue.delete(element);continue;}
      const current=serialize(element).text;
      if(current!==state.text){restoreElement(element);states.delete(element);}
    }
    for(const root of roots) {
      for(const element of candidates(root,pageRule(config,location.href)))if(!states.has(element)) {
        const box=element.getBoundingClientRect();
        if(box.bottom>-600 && box.top<innerHeight+600)enqueue(element);else visibility.observe(element);
      }
      for(const element of root.querySelectorAll('*'))if(element.shadowRoot)addRoot(element.shadowRoot);
    }
  }catch(error){notification(error.message);}
}
function scheduleDrain() {
  if(drainScheduled)return;
  drainScheduled=true;
  // Collect the synchronous scan before sending: the first paragraph should
  // not consume a full CLI session while its neighbours are still enqueued.
  queueMicrotask(()=>{drainScheduled=false;drain();});
}
function drain() {
  while(active && queue.size && processing<(config.concurrency || 1)) {
    const currentEpoch=epoch;
    const pending=[];let chars=0;for(const element of queue){const length=serialize(element).text.length;if(pending.length && (pending.length>=(config.batchSize || 4) || chars+length>12000))break;pending.push(element);chars+=length;}pending.forEach(el=>queue.delete(el));
    const work=pending.filter(el=>el.isConnected).map(element=>{const serialized=serialize(element);const state={element,serialized,text:serialized.text,status:'pending'};states.set(element,state);return state;});
    if(!work.length)continue;
    processing++;
    translate(work.map(item=>item.text)).then(response=>{
      if(currentEpoch!==epoch || !active)return;
      response.translations.forEach((entry,index)=>{
        const state=work[index];
        if(!state.element.isConnected || serialize(state.element).text!==state.text){states.delete(state.element);return;}
        try{insertTranslation(state.element,state.serialized.render(entry.text),config);state.status='done';completed++;}
        catch(error){state.status='error';failed++;lastError=error.message;notification(error.message);}
      });report();
    }).catch(error=>{
      if(currentEpoch===epoch){for(const state of work)state.status='error';failed+=work.length;lastError=error.message;notification(error.message);}
    }).finally(()=>{processing--;if(active && queue.size)scheduleDrain();});
  }
}
async function start() {
  config=await send({type:'settings.public'});
  if(config.disabled)throw new Error('Translation is disabled for this site. Change its rule in Settings.');
  if(active || states.size)restore();
  active=true;completed=failed=0;lastError='';epoch++;addRoot(document);scan();return {active:true};
}
function restore(){active=false;epoch++;queue.clear();visibility.disconnect();for(const element of states.keys())restoreElement(element);states.clear();for(const root of roots)unwrapSegments(root);completed=failed=0;host?.remove();return {active:false};}
async function selection(text) {
  const selected=text || window.getSelection()?.toString() || lastSelection;
  if(!selected?.trim())throw new Error('Select some text first.');
  notification('Translating selection…');const result=await translate([selected]);notification(result.translations[0].text,true);return {};
}
async function translateInput() {
  const element=document.activeElement?.matches('input,textarea,[contenteditable="true"]')?document.activeElement:input;
  if(!element || element.tagName==='INPUT' && !['text','search','url','tel'].includes(element.type) || element.readOnly || element.disabled)throw new Error('Focus a text input first. Password and email fields are excluded.');
  const original=element.isContentEditable?element.textContent:element.value;
  if(!original?.trim())throw new Error('The input is empty.');
  const result=await send({type:'translate',job:{source_lang:config.source || 'auto',target_lang:config.inputTarget || 'en',text_list:[original]}});
  if((element.isContentEditable?element.textContent:element.value)!==original)throw new Error('The input changed while translating. Try again.');
  if(element.isContentEditable)element.textContent=result.translations[0].text;
  else {const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,result.translations[0].text);}
  element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));return {};
}
const captionReader=new CaptionReader({document,emit:text=>{if(text)void caption(text);else {captionLast='';captionOverlay?.hide();}},status:text=>notification(text)});
let sidecarCleanup,captionOverlay;
async function caption(text) {
  const value=text.trim();if(!value || value===captionLast || value.length>3000)return;captionLast=value;
  try {const result=await translate([value]);if(captionOn && captionLast===value){captionOverlay ||= new CaptionOverlay({onClose:()=>{captionOn=false;captionReader.stop();captionLast='';}});captionOverlay.show(value,result.translations[0].text,{bilingual:config.mode!=='translation'});}}catch(error){notification(error.message);}
}
function scanCaptions() {if(captionOn)captionReader.scan();}
api.runtime.onMessage.addListener((message,_sender,reply)=>{
  const action=async()=>{
    switch(message.type) {
      case 'page.start':return start();
      case 'translate-page':return active?restore():start();
      case 'page.restore':return restore();
      case 'translate-selection':config=await send({type:'settings.public'});return selection(message.selection);
      case 'translate-input':config=await send({type:'settings.public'});return translateInput();
      case 'page.status':return {active,completed,failed,error:lastError};
      case 'captions.toggle':config=await send({type:'settings.public'});captionOn=!captionOn;addRoot(document);if(captionOn)captionReader.start(config);else {captionReader.stop();captionLast='';captionOverlay?.hide();}scanCaptions();notification(captionOn?'Caption translation is on. Enable the video’s subtitles.':'Caption translation is off.');return {captionOn};
      case 'captions.sidecar':{const video=captionRoots(document).flatMap(root=>Array.from(root.querySelectorAll('video')))[0];if(!video)throw new Error('Open a page with a video before adding subtitles.');sidecarCleanup?.();sidecarCleanup=installSubtitleSidecar(video,message.text,message.name);if(captionOn)captionReader.scan();return {};}
      case 'page.mode':{config.mode=message.mode;for(const [el,state]of states)if(state.status==='done'){restoreElement(el);states.delete(el);}if(active)scan();return {};}
      default:return {};
    }
  };
  action().then(result=>reply({ok:true,...result}),error=>{notification(error.message);reply({ok:false,error:error.message});});return true;
});
document.addEventListener('focusin',event=>{if(event.target.matches('input,textarea,[contenteditable="true"]'))input=event.target;},true);
document.addEventListener('contextmenu',event=>{if(event.target.matches('input,textarea,[contenteditable="true"]'))input=event.target;},true);
document.addEventListener('pointerover',event=>{hovered=event.target.closest?.('p,li,td,blockquote,h1,h2,h3,div');},true);
document.addEventListener('keydown',event=>{
  if(event.altKey && event.shiftKey && event.code==='KeyH' && config.hover && hovered){event.preventDefault();void selection(sourceNodes(hovered).map(n=>n.textContent).join('')).catch(e=>notification(e.message));}
});
document.addEventListener('mouseup',event=>{
  if(event.composedPath().includes(host))return;const selected=window.getSelection()?.toString().trim();
  if(selected)lastSelection=selected;
  if(config.selection && selected && !event.target.closest('input,textarea,[contenteditable]'))void selection(selected).catch(e=>notification(e.message));
});
send({type:'settings.public'}).then(value=>{config=value;if(config.autoTranslate && !config.disabled)void start();}).catch(()=>{});

// pushState/replaceState run in the page world, so isolated-world monkeypatches
// do not observe real SPA navigation. URL checks also cover those transitions.
let currentUrl=location.href,navigationEpoch=0;
async function navigationChanged() {
  if(location.href===currentUrl)return;
  currentUrl=location.href;const version=++navigationEpoch,wasActive=active;
  if(active || states.size)restore();
  try {const next=await send({type:'settings.public'});if(version!==navigationEpoch)return;config=next;if(!config.disabled && (wasActive || config.autoTranslate))await start();}catch{}
}
addEventListener('popstate',()=>void navigationChanged());
addEventListener('hashchange',()=>void navigationChanged());
setInterval(()=>void navigationChanged(),1000);
