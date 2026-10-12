import {t,uiLocale} from '../src/i18n.mjs';
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import {BounceSidebar} from './rare/bounce-sidebar';
import {AnimatedCounter} from './rare/animated-counter';
import FluidOrb from './rare/fluid-orb';
function wrap(node:React.ReactNode){return <MotionConfig reducedMotion="user">{node}</MotionConfig>;}
function useUiLocale(){const [locale,setLocale]=useState(uiLocale);useEffect(()=>{const change=()=>setLocale(uiLocale());window.addEventListener('ot-ui-language',change);return ()=>window.removeEventListener('ot-ui-language',change);},[]);return locale;}
function Navigation({items}:{items:{label:string;href:string}[]}){
  useUiLocale();
  const [hash,setHash]=useState(location.hash || '#home');
  useEffect(()=>{const change=()=>setHash(location.hash || '#home');window.addEventListener('hashchange',change);return ()=>window.removeEventListener('hashchange',change);},[]);
  const index=Math.max(0,items.findIndex(item=>item.href===hash));
  return <BounceSidebar items={items.map(item=>({...item,label:t(item.label)}))} value={index} dotColor="#087f75" className="workspace-navigation" />;
}
function Progress({scope}:{scope:string}){
  useUiLocale();
  const [progress,setProgress]=useState<{done:number;total:number}|null>(null);
  useEffect(()=>{const status=document.getElementById(`${scope}-status`);if(!status)return;const observe=()=>{const source=status.dataset.uiSource || status.textContent || '';const match=source.match(/Translated (\d+)\/(\d+)/);if(match)setProgress({done:Number(match[1]),total:Number(match[2])});else if(/Reading|ready to translate|Recognizing|Image ready|timed cues ready/.test(source))setProgress(null);};const observer=new MutationObserver(observe);observer.observe(status,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-ui-source']});return ()=>observer.disconnect();},[scope]);
  if(!progress)return null;
  return <div className="translation-meter"><div className="meter-count"><AnimatedCounter value={progress.done} duration={.35}/><span className="meter-divider">/</span><AnimatedCounter value={progress.total} duration={.35}/><span className="meter-label">{t('segments translated')}</span></div><progress max={progress.total} value={progress.done} aria-label={`${progress.done} of ${progress.total} segments translated`}/></div>;
}
export function mountRareUI(){
  const nav=document.getElementById('rare-navigation');if(nav){const items=Array.from(nav.querySelectorAll('a')).map(link=>({label:link.dataset.uiLabel || link.textContent || '',href:link.hash}));createRoot(nav).render(wrap(<Navigation items={items}/>));}
  for(const [id,size]of [['engine-orb',116],['popup-orb',24]] as const){const node=document.getElementById(id);if(node)createRoot(node).render(wrap(<FluidOrb size={size} color="#087f75"/>));}
  for(const scope of ['document','subtitle','image']){const node=document.getElementById(`${scope}-progress`);if(node)createRoot(node).render(wrap(<Progress scope={scope}/>));}
}
