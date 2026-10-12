import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import {BounceSidebar} from './rare/bounce-sidebar';
import {AnimatedCounter} from './rare/animated-counter';
import FluidOrb from './rare/fluid-orb';
function wrap(node:React.ReactNode){return <MotionConfig reducedMotion="user">{node}</MotionConfig>;}
function Navigation({items}:{items:{label:string;href:string}[]}){
  const [hash,setHash]=useState(location.hash || '#home');
  useEffect(()=>{const change=()=>setHash(location.hash || '#home');window.addEventListener('hashchange',change);return ()=>window.removeEventListener('hashchange',change);},[]);
  const index=Math.max(0,items.findIndex(item=>item.href===hash));
  return <BounceSidebar items={items} value={index} dotColor="#087f75" className="workspace-navigation" />;
}
function Progress({scope}:{scope:string}){
  const [progress,setProgress]=useState<{done:number;total:number}|null>(null);
  useEffect(()=>{const status=document.getElementById(`${scope}-status`);if(!status)return;const observe=()=>{const match=status.textContent?.match(/Translated (\d+)\/(\d+)/);if(match)setProgress({done:Number(match[1]),total:Number(match[2])});else if(/Reading|ready to translate|Recognizing|Image ready|timed cues ready/.test(status.textContent || ''))setProgress(null);};const observer=new MutationObserver(observe);observer.observe(status,{childList:true,characterData:true,subtree:true});return ()=>observer.disconnect();},[scope]);
  if(!progress)return null;
  return <div className="translation-meter"><div className="meter-count"><AnimatedCounter value={progress.done} duration={.35}/><span className="meter-divider">/</span><AnimatedCounter value={progress.total} duration={.35}/><span className="meter-label">segments translated</span></div><progress max={progress.total} value={progress.done} aria-label={`${progress.done} of ${progress.total} segments translated`}/></div>;
}
export function mountRareUI(){
  const nav=document.getElementById('rare-navigation');if(nav){const items=Array.from(nav.querySelectorAll('a')).map(link=>({label:link.textContent || '',href:link.hash}));createRoot(nav).render(wrap(<Navigation items={items}/>));}
  for(const [id,size]of [['engine-orb',116],['popup-orb',24]] as const){const node=document.getElementById(id);if(node)createRoot(node).render(wrap(<FluidOrb size={size} color="#087f75"/>));}
  for(const scope of ['document','subtitle','image']){const node=document.getElementById(`${scope}-progress`);if(node)createRoot(node).render(wrap(<Progress scope={scope}/>));}
}
