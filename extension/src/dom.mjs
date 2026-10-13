const OMIT='script,style,noscript,textarea,input,select,option,button,pre,svg,math,canvas,iframe,object,embed,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[translate="no"],[data-ot-ui],[data-ot-target]';
export const BLOCKS='p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption,dt,dd,summary,div,section,article,label,body,main,header,footer,nav,address,aside,caption,legend,details,[data-ot-segment]';
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
// Reference numbers and punctuation need no translation. Keep their entire
// sanitized inline tree locally, instead of asking the model to copy every
// nested span boundary. Use the same element/attribute policy as normal text.
function literalInline(node) {
  if(node.nodeType===3)return document.createTextNode(node.textContent);
  const result=document.createDocumentFragment();
  if(node.nodeType!==1 || own(node) || ignored(node))return result;
  if(node.tagName==='BR')return document.createElement('br');
  if(['CODE','KBD','SAMP'].includes(node.tagName)){
    const copy=document.createElement(node.localName);copy.textContent=node.textContent;return copy;
  }
  const copy=INLINE.has(node.tagName)?safeClone(node):result;
  copy.append(...Array.from(node.childNodes,literalInline));return copy;
}
export function serialize(element) {
  const markers=[];
  const put=value=>{const token='{'+markers.length+'}';markers.push(value);return token;};
  const walk=node=>{
    if(node.nodeType===3)return node.textContent.replace(/\{\{?\d+\}\}?/g,text=>put({type:'atom',node:document.createTextNode(text)}));
    if(node.nodeType!==1 || own(node) || ignored(node))return '';
    if(node.tagName==='BR')return put({type:'atom',node:document.createElement('br')});
    if(['CODE','KBD','SAMP'].includes(node.tagName)) {const copy=document.createElement(node.localName);copy.textContent=node.textContent;return put({type:'atom',node:copy});}
    if(!INLINE.has(node.tagName))return Array.from(node.childNodes,walk).join('');
    if(!/[\p{L}]/u.test(node.textContent || ''))return put({type:'atom',node:literalInline(node)});
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
// A container can contain both bare text/links and nested block paragraphs.
// Wrap only its direct inline runs, retaining the actual source nodes and their
// event listeners. Restoring the page unwraps these temporary spans again.
function segmentMixed(element,selector,exclude) {
  if(!element.querySelector(selector) || element.hasAttribute('data-ot-segment'))return;
  let run=[];
  const flush=()=>{
    if(run.some(node=>/[\p{L}]/u.test(node.textContent || ''))) {
      const segment=document.createElement('span');segment.setAttribute('data-ot-segment','');
      element.insertBefore(segment,run[0]);segment.append(...run);
    }
    run=[];
  };
  for(const node of Array.from(element.childNodes)) {
    const boundary=node.nodeType===1 && (own(node) || ignored(node,exclude) || node.matches(selector) || node.querySelector(selector));
    if(boundary || node.nodeType!==1 && node.nodeType!==3)flush();else run.push(node);
  }
  flush();
}
export function candidates(root,rule={}) {
  const selector=rule.include || BLOCKS+(rule.hints?','+rule.hints:'');
  const elements=[...(root.nodeType===1 && root.matches(selector)?[root]:[]),...root.querySelectorAll(selector)];
  for(const element of elements)if(!ignored(element,rule.exclude))segmentMixed(element,selector,rule.exclude);
  const segments=Array.from(root.querySelectorAll('[data-ot-segment]'));
  const eligible=[...new Set([...elements,...segments])].filter(element=>{
    if(ignored(element,rule.exclude) || element.closest('[hidden],[aria-hidden="true"]'))return false;
    if(!element.hasAttribute('data-ot-segment') && element.querySelector(selector))return false;
    const text=sourceNodes(element).map(n=>n.textContent).join('').trim();
    if(!text || !/[\p{L}]/u.test(text))return false;
    const style=getComputedStyle(element);
    return style.display!=='none' && style.visibility!=='hidden';
  });
  // Keep observation bounded without permanently excluding the document tail.
  // A scroll rescan can bring any paragraph into this viewport-first window.
  if(eligible.length<=5000)return eligible;
  const nearby=[],offscreen=[];
  for(const element of eligible){const box=element.getBoundingClientRect();(box.bottom>-600 && box.top<innerHeight+600?nearby:offscreen).push(element);}
  return [...nearby,...offscreen].slice(0,5000);
}
export function unwrapSegments(root) {
  for(const segment of root.querySelectorAll('[data-ot-segment]'))segment.replaceWith(...Array.from(segment.childNodes));
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
export const PAGE_STYLE=`[data-ot-target]{display:block!important;font-size:1em;line-height:1.55;margin:.4em 0 .65em;white-space:pre-wrap;overflow-wrap:anywhere;text-align:start}[data-ot-source][hidden]{display:none!important}.ot-style-underline{text-decoration:underline;text-decoration-color:#087f75;text-underline-offset:.25em;text-decoration-thickness:1px}.ot-style-muted{opacity:.72}.ot-style-box{padding:.6em .8em;border-inline-start:3px solid #087f75;background:color-mix(in srgb,#087f75 7%,transparent);border-radius:4px}[data-ot-ui]{all:initial}`;
