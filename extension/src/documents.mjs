import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {parseSubtitles,exportSubtitles} from './subtitles.mjs';
const MAX_BYTES=30*1024*1024,MAX_EXPANDED=100*1024*1024;
export function extension(name) {return name.toLowerCase().split('.').at(-1);}
function unzip(data) {
  let expanded=0;
  const files=unzipSync(data,{filter(entry){expanded+=entry.originalSize;if(expanded>MAX_EXPANDED)throw new Error('Expanded archive exceeds 100 MiB.');return true;}});
  return files;
}
const SKIP='script,style,noscript,iframe,object,embed,form,input,textarea,button,svg,math,pre,code';
function sanitize(doc) {
  doc.querySelectorAll(SKIP+',link,meta,base').forEach(node=>node.remove());
  for(const node of doc.querySelectorAll('*'))for(const attribute of Array.from(node.attributes)) {
    const key=attribute.name.toLowerCase();
    if(key.startsWith('on') || ['src','srcset','style','formaction','srcdoc'].includes(key))node.removeAttribute(attribute.name);
    if(key==='href' && !/^(https?:|mailto:|#)/i.test(attribute.value))node.removeAttribute(attribute.name);
  }
}
function paragraphs(doc) {
  const selector='p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption,div';
  return Array.from(doc.querySelectorAll(selector)).filter(node=>!node.closest(SKIP) && !node.querySelector(selector) && node.textContent.trim());
}
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
    const doc=new DOMParser().parseFromString(strFromU8(files['word/document.xml']),'application/xml');
    if(doc.querySelector('parsererror'))throw new Error('DOCX XML is invalid.');
    const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const nodes=Array.from(doc.getElementsByTagNameNS(ns,'p')).filter(p=>Array.from(p.getElementsByTagNameNS(ns,'t')).some(t=>t.textContent.trim()));
    const items=nodes.map(p=>Array.from(p.getElementsByTagNameNS(ns,'t')).map(t=>t.textContent).join(''));
    return {name:file.name,format,items,export(translated,bilingual) {
      const copy=doc.cloneNode(true);const copies=Array.from(copy.getElementsByTagNameNS(ns,'p')).filter(p=>Array.from(p.getElementsByTagNameNS(ns,'t')).some(t=>t.textContent.trim()));
      copies.forEach((p,index)=>{
        const next=copy.createElementNS(ns,'w:p'),style=Array.from(p.children).find(n=>n.localName==='pPr');if(style)next.append(style.cloneNode(true));
        const run=copy.createElementNS(ns,'w:r'),text=copy.createElementNS(ns,'w:t');text.setAttribute('xml:space','preserve');text.textContent=translated[index];run.append(text);next.append(run);
        if(bilingual)p.after(next);else p.replaceWith(next);
      });
      const output={...files,'word/document.xml':strToU8(new XMLSerializer().serializeToString(copy))};
      return {data:zipSync(output),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',extension:'docx'};
    }};
  }
  if(format==='epub') {
    const files=unzip(data);const docs=[];const items=[];
    for(const [name,bytes]of Object.entries(files))if(/\.(xhtml|html|htm)$/i.test(name)) {
      const doc=new DOMParser().parseFromString(strFromU8(bytes),'application/xhtml+xml');
      if(doc.querySelector('parsererror'))throw new Error('An EPUB chapter contains invalid XHTML.');
      const nodes=paragraphs(doc);for(const node of nodes)items.push(node.textContent);docs.push({name,doc,nodes});
    }
    if(!items.length)throw new Error('No readable text found in the EPUB.');
    return {name:file.name,format,items,export(translated,bilingual) {
      const output={...files};let offset=0;
      for(const {name,doc,nodes}of docs) {
        const copy=doc.cloneNode(true),copies=paragraphs(copy);
        copies.forEach((node,index)=>{const text=translated[offset+index];if(bilingual){const next=copy.createElementNS(node.namespaceURI,'p');next.setAttribute('class','open-translate-target');next.setAttribute('dir','auto');next.textContent=text;node.after(next);}else node.textContent=text;});
        offset+=nodes.length;output[name]=strToU8(new XMLSerializer().serializeToString(copy));
      }
      // EPUB requires the mimetype member first and uncompressed.
      const entries={};if(output.mimetype)entries.mimetype=[output.mimetype,{level:0}];
      for(const [name,value]of Object.entries(output))if(name!=='mimetype')entries[name]=value;
      return {data:zipSync(entries),mime:'application/epub+zip',extension:'epub'};
    }};
  }
  const text=strFromU8(data);
  if(['html','htm','xhtml'].includes(format)) {
    const doc=new DOMParser().parseFromString(text,'text/html');sanitize(doc);const nodes=paragraphs(doc);
    if(!nodes.length){const p=doc.createElement('p');p.textContent=doc.body.textContent;doc.body.replaceChildren(p);nodes.push(p);}
    return {name:file.name,format:'html',items:nodes.map(n=>n.textContent),export(translated,bilingual) {
      const copy=doc.cloneNode(true),copies=paragraphs(copy);
      copies.forEach((node,index)=>{if(bilingual){const p=copy.createElement('p');p.setAttribute('dir','auto');p.textContent=translated[index];node.after(p);}else node.textContent=translated[index];});
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
