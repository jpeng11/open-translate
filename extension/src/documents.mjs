import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {parseSubtitles,exportSubtitles} from './subtitles.mjs';
import {textSkeleton,previewDocumentText} from './document-richtext.mjs';
const MAX_BYTES=30*1024*1024,MAX_EXPANDED=100*1024*1024;
export function extension(name) {return name.toLowerCase().split('.').at(-1);}
function unzip(data) {
  let expanded=0;
  const files=unzipSync(data,{filter(entry){expanded+=entry.originalSize;if(expanded>MAX_EXPANDED)throw new Error('Expanded archive exceeds 100 MiB.');return true;}});
  return files;
}
const ACTIVE='script,noscript,iframe,object,embed,form,input,textarea,button,base,foreignObject,animate,animateMotion,animateTransform,set,feImage';
const SKIP=ACTIVE+',style,svg,math,pre,code,[translate="no"]';
const CSS_PROPERTIES=new Set('color background-color font font-family font-size font-weight font-style font-variant text-decoration text-align text-indent text-transform letter-spacing word-spacing line-height white-space vertical-align direction unicode-bidi display margin margin-top margin-bottom margin-left margin-right padding padding-top padding-bottom padding-left padding-right border border-color border-style border-width border-radius width height max-width min-width table-layout border-collapse list-style-type break-before break-after page-break-before page-break-after'.split(' '));
function safeCss(style) {
  const output=[];for(let index=0;index<style.length;index++){const key=style[index],value=style.getPropertyValue(key);if(CSS_PROPERTIES.has(key) && !/[<>\\]|url\s*\(|expression\s*\(|@import|behavior|javascript:/i.test(value))output.push(key+':'+value+(style.getPropertyPriority(key)?' !important':''));}return output.join(';');
}
function safeHref(value,packaged=false) {return /^(https?:|mailto:|#)/i.test(value) || packaged && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value) && !value.includes('\\');}
function sanitize(doc,packaged=false) {
  doc.querySelectorAll(ACTIVE+',meta').forEach(node=>node.remove());
  for(const link of doc.querySelectorAll('link'))if(!(packaged && link.getAttribute('rel')==='stylesheet' && safeHref(link.getAttribute('href') || '',true) && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link.getAttribute('href') || '')))link.remove();
  for(const style of doc.querySelectorAll('style')) {
    // CSSOM parsing is browser-owned. No network-bearing declarations are retained.
    const sheet=new CSSStyleSheet();try{sheet.replaceSync(style.textContent);}catch{style.remove();continue;}
    style.textContent=Array.from(sheet.cssRules).filter(rule=>rule.type===1 && !/[<>]/.test(rule.selectorText)).map(rule=>rule.selectorText+'{'+safeCss(rule.style)+'}').join('\n');
  }
  for(const node of doc.querySelectorAll('*'))for(const attribute of Array.from(node.attributes)) {
    const key=attribute.name.toLowerCase();
    if(key.startsWith('on') || ['srcset','formaction','srcdoc','action'].includes(key))node.removeAttribute(attribute.name);
    if(key==='style'){const holder=globalThis.document.createElement('span');holder.setAttribute('style',attribute.value);const value=safeCss(holder.style);if(value)node.setAttribute('style',value);else node.removeAttribute('style');}
    if(key==='src' && !(node.localName==='img' && (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(attribute.value) || packaged && safeHref(attribute.value,true) && !/^(https?:|mailto:|#)/i.test(attribute.value))))node.removeAttribute(attribute.name);
    if((key==='href' || key==='xlink:href') && (!safeHref(attribute.value,packaged) || ['use','image'].includes(node.localName) && !attribute.value.startsWith('#')))node.removeAttribute(attribute.name);
    if(['fill','stroke','filter','mask','clip-path','cursor'].includes(key) && /url\s*\(/i.test(attribute.value) && !/^url\(#[a-z0-9_-]+\)$/i.test(attribute.value))node.removeAttribute(attribute.name);
  }
}
function paragraphs(doc) {
  const selector='p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption,div';
  return Array.from(doc.querySelectorAll(selector)).filter(node=>!node.closest(SKIP) && !node.querySelector(selector) && node.textContent.trim());
}
function htmlTextNodes(root) {
  const nodes=[];const walk=node=>{for(const child of node.childNodes){if(child.nodeType===3 && child.textContent && !child.parentElement?.closest(SKIP))nodes.push(child);else if(child.nodeType===1)walk(child);}};walk(root);return nodes;
}
function htmlSkeletons(doc){return paragraphs(doc).map(node=>({node,skeleton:textSkeleton(node,htmlTextNodes(node))})).filter(entry=>entry.skeleton.text.trim());}
function epubChapterNames(files) {
  const fallback=Object.keys(files).filter(name=>/\.(xhtml|html|htm)$/i.test(name)),ordered=[];
  try {
    const container=new DOMParser().parseFromString(strFromU8(files['META-INF/container.xml']),'application/xml');
    const path=container.getElementsByTagNameNS('*','rootfile')[0]?.getAttribute('full-path');
    if(!path || !files[path])return fallback;
    const opf=new DOMParser().parseFromString(strFromU8(files[path]),'application/xml'),manifest=new Map(Array.from(opf.getElementsByTagNameNS('*','item')).map(item=>[item.getAttribute('id'),item.getAttribute('href')]));
    for(const item of opf.getElementsByTagNameNS('*','itemref')) {
      const href=manifest.get(item.getAttribute('idref'));if(!href)continue;
      const url=new URL(href,'https://epub.invalid/'+path),name=decodeURIComponent(url.pathname.slice(1));
      if(url.origin==='https://epub.invalid' && fallback.includes(name) && !ordered.includes(name))ordered.push(name);
    }
  }catch{}return [...ordered,...fallback.filter(name=>!ordered.includes(name))];
}
function preview(items){return items.map(previewDocumentText);}
function checkResults(translated,count){if(!Array.isArray(translated) || translated.length!==count || translated.some(text=>typeof text!=='string'))throw new Error('Translation count does not match the document.');}
export async function importDocument(file) {
  if(file.size>MAX_BYTES)throw new Error('Choose a document smaller than 30 MiB.');
  const format=extension(file.name),data=new Uint8Array(await file.arrayBuffer());
  if(['srt','vtt','ass','ssa'].includes(format)) {
    const parsed=parseSubtitles(strFromU8(data),format);
    return {name:file.name,format,items:parsed.cues.map(c=>c.text),cues:parsed.cues,
      export(translated,bilingual){return {data:exportSubtitles(parsed,translated,bilingual),mime:'text/plain',extension:format};}};
  }
  if(format==='docx') {
    const files=unzip(data);if(!files['word/document.xml'])throw new Error('Invalid DOCX document.');
    const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main',parts=[],items=[];
    for(const [name,bytes]of Object.entries(files))if(/^word\/(?:document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/.test(name)) {
      const doc=new DOMParser().parseFromString(strFromU8(bytes),'application/xml');
      if(doc.querySelector('parsererror'))throw new Error('DOCX XML is invalid.');
      const nodes=Array.from(doc.getElementsByTagNameNS(ns,'p')).filter(p=>!Array.from(p.getElementsByTagNameNS(ns,'p')).length && Array.from(p.getElementsByTagNameNS(ns,'t')).some(t=>t.textContent.trim()));
      const skeletons=nodes.map(p=>textSkeleton(p,Array.from(p.getElementsByTagNameNS(ns,'t'))));
      const offset=items.length;items.push(...skeletons.map(entry=>entry.text));parts.push({name,doc,nodes,skeletons,offset});
    }
    return {name:file.name,format,items,previewItems:preview(items),preview,export(translated,bilingual) {
      checkResults(translated,items.length);const output={...files};
      for(const {name,doc,nodes,skeletons,offset}of parts) {
        const copy=doc.cloneNode(true),copies=Array.from(copy.getElementsByTagNameNS(ns,'p')).filter(p=>!Array.from(p.getElementsByTagNameNS(ns,'p')).length && Array.from(p.getElementsByTagNameNS(ns,'t')).some(t=>t.textContent.trim()));
        copies.forEach((p,index)=>{const next=skeletons[index].apply(p.cloneNode(true),translated[offset+index]);if(bilingual){for(const node of [next,...next.querySelectorAll('*')])for(const attr of ['w14:paraId','w14:textId'])node.removeAttribute(attr);for(const tag of ['bookmarkStart','bookmarkEnd'])Array.from(next.getElementsByTagNameNS(ns,tag)).forEach(n=>n.remove());p.after(next);}else p.replaceWith(next);});
        output[name]=strToU8(new XMLSerializer().serializeToString(copy));
      }
      return {data:zipSync(output),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',extension:'docx'};
    }};
  }
  if(format==='epub') {
    const files=unzip(data);const docs=[];const items=[];
    for(const name of epubChapterNames(files)) {
      const doc=new DOMParser().parseFromString(strFromU8(files[name]),'application/xhtml+xml');
      if(doc.querySelector('parsererror'))throw new Error('An EPUB chapter contains invalid XHTML.');sanitize(doc,true);
      const entries=htmlSkeletons(doc);const offset=items.length;items.push(...entries.map(entry=>entry.skeleton.text));docs.push({name,doc,entries,offset});
    }
    for(const [name,bytes]of Object.entries(files))if(/\.css$/i.test(name)){const sheet=new CSSStyleSheet();try{sheet.replaceSync(strFromU8(bytes));files[name]=strToU8(Array.from(sheet.cssRules).filter(rule=>rule.type===1 && !/[<>]/.test(rule.selectorText)).map(rule=>rule.selectorText+'{'+safeCss(rule.style)+'}').join('\n'));}catch{files[name]=strToU8('');}}
    if(!items.length)throw new Error('No readable text found in the EPUB.');
    return {name:file.name,format,items,previewItems:preview(items),preview,export(translated,bilingual) {
      checkResults(translated,items.length);const output={...files};
      for(const {name,doc,entries,offset}of docs) {
        const copy=doc.cloneNode(true),copies=htmlSkeletons(copy);
        copies.forEach(({node},index)=>{const next=entries[index].skeleton.apply(node.cloneNode(true),translated[offset+index]);next.setAttribute('dir','auto');if(bilingual){next.removeAttribute('id');next.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));next.setAttribute('class',(next.getAttribute('class') || '')+' open-translate-target');node.after(next);}else node.replaceWith(next);});
        output[name]=strToU8(new XMLSerializer().serializeToString(copy));
      }
      // EPUB requires the mimetype member first and uncompressed.
      const entries={};if(output.mimetype)entries.mimetype=[output.mimetype,{level:0}];
      for(const [name,value]of Object.entries(output))if(name!=='mimetype')entries[name]=value;
      return {data:zipSync(entries),mime:'application/epub+zip',extension:'epub'};
    }};
  }
  const text=strFromU8(data);
  if(['html','htm','xhtml'].includes(format)) {
    const doc=new DOMParser().parseFromString(text,'text/html');sanitize(doc);let entries=htmlSkeletons(doc);
    if(!entries.length){const p=doc.createElement('p');p.textContent=doc.body.textContent;doc.body.replaceChildren(p);entries=htmlSkeletons(doc);}
    const items=entries.map(entry=>entry.skeleton.text);
    return {name:file.name,format:'html',items,previewItems:preview(items),preview,export(translated,bilingual) {
      checkResults(translated,items.length);const copy=doc.cloneNode(true),copies=htmlSkeletons(copy);
      copies.forEach(({node},index)=>{const next=entries[index].skeleton.apply(node.cloneNode(true),translated[index]);next.setAttribute('dir','auto');if(bilingual){next.removeAttribute('id');next.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));node.after(next);}else node.replaceWith(next);});
      return {data:'<!doctype html>\n'+copy.documentElement.outerHTML,mime:'text/html',extension:'html'};
    }};
  }
  if(!['txt','md','markdown'].includes(format))throw new Error('Supported: PDF, EPUB, DOCX, HTML, TXT, Markdown, SRT, VTT and ASS.');
  const pieces=text.split(/(\n\s*\n)/),indices=[];let fenced=false;
  pieces.forEach((piece,index)=>{const fences=(piece.match(/^\s*(?:```|~~~)/gm)||[]).length;if(fences){if(fences%2)fenced=!fenced;return;}if(index%2===0 && piece.trim() && !fenced)indices.push(index);});
  return {name:file.name,format,items:indices.map(i=>pieces[i]),export(translated,bilingual) {
    const output=[...pieces];indices.forEach((part,index)=>output[part]=bilingual?pieces[part]+'\n\n'+translated[index]:translated[index]);
    return {data:output.join(''),mime:'text/plain;charset=utf-8',extension:format==='markdown'?'md':format};
  }};
}
