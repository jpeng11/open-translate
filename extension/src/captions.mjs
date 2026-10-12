import {parseSubtitles,subtitleSeconds} from './subtitles.mjs';
export const CAPTION_SELECTORS='.ytp-caption-segment,.player-timedtext-text-container,.vjs-text-track-cue,.jw-text-track-cue,.shaka-text-container,[data-ot-caption],[data-subtitle],[role="log"][aria-live]';
export function captionRoots(document) {
  const roots=[document];for(let i=0;i<roots.length;i++)for(const element of roots[i].querySelectorAll('*'))if(element.shadowRoot && !element.hasAttribute('data-ot-ui'))roots.push(element.shadowRoot);return roots;
}
export function cueText(cue) {return typeof cue.getCueAsHTML==='function'?cue.getCueAsHTML().textContent: String(cue.text || '').replace(/<[^>]+>/g,'');}
export class CaptionReader {
  constructor({document=globalThis.document,emit,status=()=>{}}){this.document=document;this.emit=emit;this.status=status;this.tracks=new Map();this.observers=new Map();this.running=false;this.last='';}
  start(config={}) {
    this.stop();this.config=config;this.running=true;
    try{this.document.querySelector(config.captionSelector || CAPTION_SELECTORS);}catch{this.running=false;throw new Error('The caption selector is invalid.');}
    this.refresh();this.timer=setInterval(()=>this.refresh(),1500);this.poll=setInterval(()=>this.scan(),150);return this;
  }
  refresh() {
    if(!this.running)return;this.roots=captionRoots(this.document);
    for(const root of this.roots)if(!this.observers.has(root)){
      const observer=new MutationObserver(()=>{clearTimeout(this.debounce);this.debounce=setTimeout(()=>this.scan(),40);});observer.observe(root,{subtree:true,childList:true,characterData:true});this.observers.set(root,observer);
    }
    for(const [root,observer]of this.observers)if(root!==this.document && !root.host?.isConnected){observer.disconnect();this.observers.delete(root);}
    for(const root of this.roots)for(const video of root.querySelectorAll('video,audio')){
      const candidates=Array.from(video.textTracks || []).filter(t=>['subtitles','captions',''].includes(t.kind));
      const current=Array.from(this.tracks).find(([track,value])=>value.video===video && candidates.includes(track) && track.mode!=='disabled')?.[0];
      const selected=candidates.find(t=>t.mode==='showing') || current || candidates.find(t=>this.config.source!=='auto' && t.language?.split('-')[0]===this.config.source?.split('-')[0]) || candidates[0];
      for(const [track,value]of this.tracks)if(value.video===video && track!==selected){track.removeEventListener('cuechange',value.listener);if(track.mode==='hidden')track.mode=value.mode==='showing'?'disabled':value.mode;this.tracks.delete(track);}
      if(selected && !this.tracks.has(selected)){
        const mode=selected.mode,listener=()=>this.scan();selected.mode='hidden';selected.addEventListener('cuechange',listener);this.tracks.set(selected,{mode,listener,video});
      }else if(selected?.mode==='showing')selected.mode='hidden';
    }
    for(const [track,value]of this.tracks)if(!value.video.isConnected){track.removeEventListener('cuechange',value.listener);track.mode=value.mode;this.tracks.delete(track);}
    this.scan();
  }
  scan() {
    if(!this.running)return;
    const values=[];for(const root of this.roots || [])for(const node of root.querySelectorAll(this.config.captionSelector || CAPTION_SELECTORS)){
      if(node.closest?.('[data-ot-ui],[aria-hidden="true"]'))continue;
      const style=node.ownerDocument.defaultView?.getComputedStyle(node);if(style?.display==='none' || style?.visibility==='hidden')continue;
      if(node.getClientRects && !node.getClientRects().length)continue;
      const text=node.textContent.trim();if(text)values.push(text);
    }
    if(!values.length)for(const [track]of this.tracks)for(const cue of track.activeCues || [])values.push(cueText(cue));
    const text=Array.from(new Set(values)).join('\n').trim();if(text===this.last || text.length>6000)return;this.last=text;this.emit(text);
  }
  stop() {
    this.running=false;clearInterval(this.timer);clearInterval(this.poll);clearTimeout(this.debounce);
    for(const observer of this.observers.values())observer.disconnect();this.observers.clear();
    for(const [track,{mode,listener}]of this.tracks){track.removeEventListener('cuechange',listener);if(track.mode==='hidden')track.mode=mode;}this.tracks.clear();this.last='';
  }
}
export function installSubtitleSidecar(video,text,name='subtitles.srt') {
  if(text.length>4*1024*1024)throw new Error('Subtitle file exceeds 4 MB.');
  const format=name.split('.').at(-1).toLowerCase(),document=parseSubtitles(text,format),track=video.addTextTrack('subtitles',name,'');track.mode='hidden';
  for(const cue of document.cues){const start=subtitleSeconds(cue.start),end=subtitleSeconds(cue.end);if(!Number.isFinite(start) || !Number.isFinite(end) || end<=start)continue;track.addCue(new VTTCue(start,end,cue.text.replace(/\{[^}]*\}/g,'')));}
  return ()=>{track.mode='disabled';for(const cue of Array.from(track.cues || []))track.removeCue(cue);};
}
export class CaptionOverlay {
  constructor({document=globalThis.document,onClose=()=>{}}={}) {
    this.document=document;this.host=document.createElement('div');this.host.setAttribute('data-ot-ui','');this.host.setAttribute('data-ot-captions','');
    const shadow=this.host.attachShadow({mode:'closed'}),style=document.createElement('style');style.textContent=':host([hidden]){display:none!important}:host{all:initial;position:fixed;left:50%;bottom:8%;transform:translateX(-50%);width:max-content;max-width:90vw;z-index:2147483647;pointer-events:none}section{position:relative;box-sizing:border-box;max-width:90vw;padding:8px 24px;background:#000b;border-radius:6px;text-align:center;font:22px/1.4 system-ui,sans-serif;color:white;text-shadow:0 1px 3px #000}p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}p:last-of-type{font-size:1.08em;font-weight:650}button{position:absolute;right:0;top:0;pointer-events:auto;font:16px system-ui;background:#0007;border:0;color:#fff;border-radius:4px;cursor:pointer}';
    const section=document.createElement('section');section.setAttribute('role','status');section.setAttribute('aria-live','polite');this.source=document.createElement('p');this.target=document.createElement('p');this.source.dir=this.target.dir='auto';const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Stop caption translation');close.onclick=()=>{this.hide();onClose();};section.append(this.source,this.target,close);shadow.append(style,section);this.relocate=()=>{if(!this.host.hidden)(document.fullscreenElement || document.documentElement).append(this.host);};document.addEventListener('fullscreenchange',this.relocate);this.host.hidden=true;
  }
  show(source,target,{bilingual=true}={}){this.source.textContent=bilingual?source:'';this.source.hidden=!bilingual;this.target.textContent=target;this.host.hidden=false;this.relocate();}
  hide(){this.host.hidden=true;this.source.textContent=this.target.textContent='';}
  destroy(){this.document.removeEventListener('fullscreenchange',this.relocate);this.host.remove();}
}
