import {MESSAGES} from './ui-messages.mjs';
export const UI_LANGUAGES=[['zh','中文'],['en','English'],['fr','Français'],['es','Español'],['ja','日本語'],['ko','한국어']];
const KEY='open-translate.ui-language',supported=new Set(UI_LANGUAGES.map(([code])=>code));
export function resolveLocale(values=[]){for(const value of values){const code=String(value).toLowerCase().split(/[-_]/)[0];if(supported.has(code))return code;}return 'en';}
let locale=resolveLocale(globalThis.navigator?.languages || []);
try{const saved=localStorage.getItem(KEY);if(supported.has(saved))locale=saved;}catch{}
export const uiLocale=()=>locale;
export function t(message,language=locale){return MESSAGES[message]?.[language] || message;}
const texts=[],attributes=[],statuses=new Map();let initialized=false;
function redraw(){
 document.documentElement.lang=locale;
 for(const {node,source}of texts)if(node.isConnected)node.nodeValue=source.replace(source.trim(),t(source.trim()));
 for(const {node,name,source}of attributes)if(node.isConnected)node.setAttribute(name,t(source));
 for(const [node,source]of statuses)if(node.isConnected)node.textContent=translateStatus(source);
 document.querySelectorAll('[data-ui-language]').forEach(select=>select.value=locale);
 window.dispatchEvent(new CustomEvent('ot-ui-language'));
}
export function setUiLocale(value){if(!supported.has(value))return;locale=value;try{localStorage.setItem(KEY,value);}catch{}redraw();}
export function translateStatus(text){
 if(MESSAGES[text])return t(text);
 const rules=[[/^Translated (\d+)\/(\d+) (segments|cues|text regions)$/,(_,done,total)=>t('Translated {done}/{total}').replace('{done}',done).replace('{total}',total)], [/^Page (\d+) of (\d+)$/,(_,page,total)=>t('Page {page} of {total}').replace('{page}',page).replace('{total}',total)], [/^(\d+) text segments ready to translate\.$/,(_,n)=>t('{count} text segments ready to translate.').replace('{count}',n)], [/^(\d+) timed cues ready\.$/,(_,n)=>t('{count} timed cues ready.').replace('{count}',n)]];
 for(const [pattern,replace]of rules)if(pattern.test(text))return text.replace(pattern,replace);
 for(const prefix of ['Connected. Translation: ','OpenAI-compatible endpoint · '])if(text.startsWith(prefix))return t(prefix.trim())+' '+text.slice(prefix.length);
 return text;
}
export function setUiText(node,text){if(!node)return;statuses.set(node,text);node.dataset.uiSource=text;node.textContent=translateStatus(text);}
export function initializeUiLanguage(){
 if(initialized)return;initialized=true;
 // Register authored interface text once. User input, translations and document
 // previews are never traversed again, so changing locale cannot rewrite them.
 document.querySelectorAll('#rare-navigation a').forEach(node=>node.dataset.uiLabel=node.textContent);
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const node=walker.currentNode;if(node.parentElement?.closest('script,style,textarea,code,[data-ui-language],#rare-navigation'))continue;const source=node.nodeValue;if(MESSAGES[source.trim()])texts.push({node,source});}
 for(const node of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]'))for(const name of ['title','aria-label','placeholder','alt']){const source=node.getAttribute(name);if(source&&MESSAGES[source])attributes.push({node,name,source});}
 if(MESSAGES[document.title]){const node=document.querySelector('title')?.firstChild;if(node)texts.push({node,source:document.title});}
 for(const select of document.querySelectorAll('[data-ui-language]')){select.replaceChildren(...UI_LANGUAGES.map(([code,label])=>{const option=document.createElement('option');option.value=code;option.textContent=label;return option;}));select.addEventListener('change',()=>setUiLocale(select.value));}
 window.addEventListener('storage',event=>{if(event.key===KEY){locale=supported.has(event.newValue)?event.newValue:resolveLocale(navigator.languages);redraw();}});
 redraw();
}
