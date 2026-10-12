const OMIT='script,style,noscript,textarea,input,select,option,button,pre,svg,math,canvas,iframe,object,embed,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[translate="no"],[data-ot-ui],[data-ot-target]';
export const BLOCKS='p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption,dt,dd,summary,div,section,article,label';
const INLINE=new Set(['A','SPAN','EM','STRONG','B','I','U','S','SMALL','SUP','SUB','MARK','ABBR','CITE','Q','DEL','INS','BDI','BDO','TIME','RUBY','RT','RP']);
export function own(node) {return node.nodeType===1 && (node.hasAttribute('data-ot-ui') || node.hasAttribute('data-ot-target'));}
export function ignored(node,exclude='') {
  const element=node.nodeType===1?node:node.parentElement;
  return !element || !!element.closest(OMIT+(exclude?','+exclude:''));
}
export function sourceNodes(element) {
  const source=Array.from(element.children).find(n=>n.hasAttribute('data-ot-source'));
  return Array.from((source || element).childNodes).filter(n=>!own(n));
}
function safeClone(element) {
  const clone=document.createElement(element.localName);
  for(const name of ['title','lang','dir'])if(element.hasAttribute(name))clone.setAttribute(name,element.getAttribute(name));
  if(element.tagName==='A') {
    const href=element.getAttribute('href') || '';
    try {const url=new URL(href,element.baseURI);if(['http:','https:','mailto:'].includes(url.protocol)){clone.href=url.href;clone.target='_blank';clone.rel='noopener noreferrer';}}catch{}
  }
  return clone;
}
export function serialize(element) {
  const markers=[];
  const put=value=>{const token='{'+markers.length+'}';markers.push(value);return token;};
  const walk=node=>{
    if(node.nodeType===3)return node.textContent.replace(/\{\{?\d+\}\}?/g,text=>put({type:'atom',node:document.createTextNode(text)}));
    if(node.nodeType!==1 || own(node))return '';
    if(node.tagName==='BR')return put({type:'atom',node:document.createElement('br')});
    if(['CODE','KBD','SAMP'].includes(node.tagName)) {const copy=document.createElement(node.localName);copy.textContent=node.textContent;return put({type:'atom',node:copy});}
    if(!INLINE.has(node.tagName))return Array.from(node.childNodes,walk).join('');
    const open=put({type:'open',node:safeClone(node),source:node});
    const inner=Array.from(node.childNodes,walk).join('');
    return open+inner+put({type:'close',source:node});
  };
  // Text placeholders above receive their own atomic DOM marker.
  const text=sourceNodes(element).map(walk).join('');
  return {text,render(translated) {
    const fragment=document.createDocumentFragment(),stack=[{node:fragment,source:null}];
    const counts=new Map();let offset=0;
    for(const match of translated.matchAll(/\{(\d+)\}/g)) {
      const marker=markers[Number(match[1])];
      if(!marker)continue;
      stack.at(-1).node.append(document.createTextNode(translated.slice(offset,match.index)));
      counts.set(Number(match[1]),(counts.get(Number(match[1])) || 0)+1);
      if(marker.type==='open') {const clone=marker.node.cloneNode(false);stack.at(-1).node.append(clone);stack.push({node:clone,source:marker.source});}
      else if(marker.type==='close') {if(stack.length===1 || stack.at(-1).source!==marker.source)throw new Error('Agent changed inline formatting order.');stack.pop();}
      else stack.at(-1).node.append(marker.node.cloneNode(true));
      offset=match.index+match[0].length;
    }
    if(stack.length!==1 || markers.some((_,i)=>counts.get(i)!==1))throw new Error('Agent changed an inline formatting marker.');
    fragment.append(document.createTextNode(translated.slice(offset)));
    return fragment;
  }};
}
export function candidates(root,rule={}) {
  const selector=rule.include || BLOCKS;
  const elements=[...(root.nodeType===1 && root.matches(selector)?[root]:[]),...root.querySelectorAll(selector)];
  return elements.filter(element=>{
    if(ignored(element,rule.exclude) || element.closest('[hidden],[aria-hidden="true"]'))return false;
    if(!rule.include && element.querySelector(BLOCKS))return false;
    const text=sourceNodes(element).map(n=>n.textContent).join('').trim();
    if(!text || !/[\p{L}]/u.test(text))return false;
    const style=getComputedStyle(element);
    return style.display!=='none' && style.visibility!=='hidden';
  }).slice(0,5000);
}
export function restoreElement(element) {
  for(const child of Array.from(element.children))if(child.hasAttribute('data-ot-target'))child.remove();
  const source=Array.from(element.children).find(n=>n.hasAttribute('data-ot-source'));
  if(source){source.replaceWith(...Array.from(source.childNodes));}
}
export function insertTranslation(element,fragment,settings) {
  restoreElement(element);
  if(settings.mode==='translation') {
    const original=document.createElement('span');original.setAttribute('data-ot-source','');original.hidden=true;
    original.append(...Array.from(element.childNodes));element.append(original);
  }
  const target=document.createElement('span');target.setAttribute('data-ot-target','');target.setAttribute('translate','no');
  target.className='ot-target ot-style-'+settings.style;target.lang=settings.target;target.dir='auto';target.append(fragment);element.append(target);
}
export const PAGE_STYLE=`[data-ot-target]{display:block!important;font-size:1em;line-height:1.55;margin:.4em 0 .65em;white-space:pre-wrap;overflow-wrap:anywhere;text-align:start}[data-ot-source][hidden]{display:none!important}.ot-style-underline{text-decoration:underline;text-decoration-color:#9cbab2;text-underline-offset:.25em;text-decoration-thickness:1px}.ot-style-muted{opacity:.72}.ot-style-box{padding:.6em .8em;border-inline-start:3px solid #32846d;background:color-mix(in srgb,#32846d 7%,transparent);border-radius:4px}[data-ot-ui]{all:initial}`;
