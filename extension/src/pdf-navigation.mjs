import {PDFArray,PDFDict,PDFName,PDFNumber,PDFRef,PDFString,PDFHexString,degrees} from 'pdf-lib';
const key=PDFName.of;
function resolve(document,value){return document.context.lookup(value);}
function name(value){return value instanceof PDFName?value.decodeText():'';}
function decode(value){return value instanceof PDFString || value instanceof PDFHexString?value.decodeText():'';}
function safeAction(document,value) {
  const action=resolve(document,value);if(!(action instanceof PDFDict))return false;
  const type=name(action.get(key('S')));
  if(type==='GoTo' || type==='ResetForm')return true;
  if(type==='Named')return ['FirstPage','LastPage','NextPage','PrevPage','GoBack','GoForward'].includes(name(action.get(key('N'))));
  return type==='URI' && /^(https?:|mailto:)/i.test(decode(resolve(document,action.get(key('URI')))));
}
function removeSignatureFields(document,pages) {
  const form=document.catalog.lookupMaybe(key('AcroForm'),PDFDict),affected=new Set();let removed=0;
  if(!form)return {removed,affected};
  const annotationPages=new Map();pages.forEach((page,index)=>{const annotations=page.node.lookupMaybe(key('Annots'),PDFArray);for(let i=0;i<(annotations?.size() || 0);i++){const ref=annotations.get(i),dict=resolve(document,ref);annotationPages.set(dict,{page,index,ref});}});
  const visited=new Set();
  function prune(array,inheritedType='') {
    if(!(array instanceof PDFArray))return;
    for(let index=array.size()-1;index>=0;index--) {
      const reference=array.get(index),field=resolve(document,reference);if(!(field instanceof PDFDict) || visited.has(field))continue;visited.add(field);
      const type=name(field.get(key('FT'))) || inheritedType,kids=field.lookupMaybe(key('Kids'),PDFArray);
      if(type==='Sig') {
        removed++;const widgets=kids?Array.from({length:kids.size()},(_,i)=>resolve(document,kids.get(i))):[field];
        for(const widget of widgets) {
          const owner=annotationPages.get(widget);if(!owner)continue;affected.add(owner.index);
          const annots=owner.page.node.lookupMaybe(key('Annots'),PDFArray);for(let i=annots.size()-1;i>=0;i--)if(resolve(document,annots.get(i))===widget)annots.remove(i);
          // Keep only the visual appearance as a non-signature stamp. The page
          // receives a visible invalidation notice before export completes.
          if(widget.has(key('AP'))){const stamp=widget.clone();for(const name of ['FT','V','Parent','Kids','AA','A','Lock','SV'])stamp.delete(key(name));stamp.set(key('Subtype'),key('Stamp'));stamp.set(key('Contents'),PDFString.of('Source signature appearance only; digital signature invalidated by translation.'));stamp.set(key('P'),owner.page.ref);annots.push(document.context.register(stamp));}
        }
        const value=field.get(key('V'));if(value instanceof PDFRef)document.context.delete(value);for(const name of ['FT','V','ByteRange','Contents','Lock','SV'])field.delete(key(name));array.remove(index);
      }else if(kids){prune(kids,type);if(kids.size()===0 && !type)array.remove(index);}
    }
  }
  prune(form.lookupMaybe(key('Fields'),PDFArray));form.delete(key('SigFlags'));document.catalog.delete(key('Perms'));return {removed,affected};
}
function pageLabels(document,pages) {
  const root=document.catalog.lookupMaybe(key('PageLabels'),PDFDict);if(!root)return null;
  const entries=[];const visited=new Set();function walk(node){if(!(node instanceof PDFDict)||visited.has(node))return;visited.add(node);const nums=node.lookupMaybe(key('Nums'),PDFArray);for(let i=0;i<(nums?.size() || 0);i+=2){const index=resolve(document,nums.get(i)),definition=resolve(document,nums.get(i+1));if(index instanceof PDFNumber && definition instanceof PDFDict)entries.push({index:index.asNumber(),definition});}const kids=node.lookupMaybe(key('Kids'),PDFArray);for(let i=0;i<(kids?.size() || 0);i++)walk(resolve(document,kids.get(i)));}walk(root);entries.sort((a,b)=>a.index-b.index);
  const roman=value=>{let result='';for(const [number,letters]of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(value>=number){result+=letters;value-=number;}return result;};
  return pages.map((_,index)=>{const entry=entries.findLast(entry=>entry.index<=index);if(!entry)return String(index+1);const definition=entry.definition,start=definition.lookupMaybe(key('St'),PDFNumber)?.asNumber() || 1,n=index-entry.index+start,style=name(definition.get(key('S'))),prefix=decode(resolve(document,definition.get(key('P'))));let suffix='';if(style==='D')suffix=String(n);else if(style==='R'||style==='r')suffix=n>3999?String(n):roman(n);else if(style==='A'||style==='a')suffix=String.fromCharCode(65+(n-1)%26).repeat(Math.floor((n-1)/26)+1);if(style==='r'||style==='a')suffix=suffix.toLowerCase();return prefix+suffix;});
}
export function preparePdfNavigation(document,{bilingual=true}={}) {
  const originalPages=[...document.getPages()],labels=pageLabels(document,originalPages),signatures=removeSignatureFields(document,originalPages);
  // Keep passive navigation and form values. Scripts and submitting/launching
  // actions are not part of a translation export's interactive form contract.
  for(const [,object]of document.context.enumerateIndirectObjects())if(object instanceof PDFDict){object.delete(key('AA'));const action=object.get(key('A'));if(action && !safeAction(document,action))object.delete(key('A'));if(object.has(key('Next')) && object.has(key('S')))object.delete(key('Next'));}
  document.catalog.delete(key('AA'));const open=document.catalog.get(key('OpenAction'));if(open && !(resolve(document,open) instanceof PDFArray) && !safeAction(document,open))document.catalog.delete(key('OpenAction'));
  const names=document.catalog.lookupMaybe(key('Names'),PDFDict);names?.delete(key('JavaScript'));
  const destTypes=new Set(['XYZ','Fit','FitH','FitV','FitR','FitB','FitBH','FitBV']);
  // Resolve any numeric local destination to its native page reference before
  // interleaving pages. Named destinations and outline refs then remain stable.
  const visited=new Set();function destinations(object){object=resolve(document,object);if(!object || visited.has(object))return;visited.add(object);if(object instanceof PDFArray){const first=resolve(document,object.get(0)),second=object.size()>1?name(object.get(1)):'';if(first instanceof PDFNumber && destTypes.has(second)){const page=originalPages[first.asNumber()];if(page)object.set(0,page.ref);}for(let i=0;i<object.size();i++)destinations(object.get(i));}else if(object instanceof PDFDict)for(const [field,value]of object.entries())if(!['Parent','P','Pages','Resources','Contents','AP','Metadata'].includes(field.decodeText()))destinations(value);}
  destinations(document.catalog.get(key('Outlines')));destinations(document.catalog.get(key('Dests')));destinations(names?.get(key('Dests')));destinations(document.catalog.get(key('OpenAction')));for(const page of originalPages)destinations(page.node.get(key('Annots')));
  const originalAnnotations=originalPages.map(page=>{const annotations=page.node.lookupMaybe(key('Annots'),PDFArray);return annotations?Array.from({length:annotations.size()},(_,index)=>resolve(document,annotations.get(index))):[];});
  function finish(translatedPages,geometries=[]) {
    const remap=value=> {
      const destination=resolve(document,value);if(!(destination instanceof PDFArray))return value;
      const next=destination.clone(),ref=next.get(0),index=originalPages.findIndex(page=>page.ref.toString()===ref?.toString());if(index<0)return value;
      next.set(0,translatedPages[index].ref);const geometry=geometries[index],type=name(next.get(1)),number=i=>resolve(document,next.get(i)) instanceof PDFNumber?resolve(document,next.get(i)).asNumber():null;
      if(!geometry?.transform)return next;
      if(type==='XYZ' && number(2)!==null && number(3)!==null){const [x,y]=pdfTargetPoint(geometry,number(2),number(3));next.set(2,PDFNumber.of(x));next.set(3,PDFNumber.of(y));}
      else if(type==='FitR' && [2,3,4,5].every(i=>number(i)!==null)){const rect=pdfTargetRect(geometry,[2,3,4,5].map(number));rect.forEach((n,i)=>next.set(i+2,PDFNumber.of(n)));}
      else if(['FitH','FitBH','FitV','FitBV'].includes(type) && number(2)!==null){const horizontal=type.endsWith('H'),rotation=Math.abs(geometry.transform[1])>Math.abs(geometry.transform[0]),point=pdfTargetPoint(geometry,horizontal?0:number(2),horizontal?number(2):0),newHorizontal=rotation?!horizontal:horizontal;next.set(1,key(type.startsWith('FitB')?(newHorizontal?'FitBH':'FitBV'):(newHorizontal?'FitH':'FitV')));next.set(2,PDFNumber.of(point[newHorizontal?1:0]));}
      return next;
    };
    const transformAnnotation=(annotation,geometry)=>{if(!geometry?.transform)return;const rect=annotation.lookupMaybe(key('Rect'),PDFArray);if(rect?.size()===4){const values=Array.from({length:4},(_,i)=>resolve(document,rect.get(i))).map(value=>value instanceof PDFNumber?value.asNumber():NaN);if(values.every(Number.isFinite))annotation.set(key('Rect'),document.context.obj(pdfTargetRect(geometry,values)));}const quad=annotation.lookupMaybe(key('QuadPoints'),PDFArray);if(quad && quad.size()%2===0){const values=[];for(let i=0;i<quad.size();i+=2){const x=resolve(document,quad.get(i)),y=resolve(document,quad.get(i+1));if(!(x instanceof PDFNumber && y instanceof PDFNumber))return;values.push(...pdfTargetPoint(geometry,x.asNumber(),y.asNumber()));}annotation.set(key('QuadPoints'),document.context.obj(values));}};
    if(labels){const nums=[];labels.forEach((label,index)=>{nums.push(bilingual?index*2:index,document.context.obj({P:PDFHexString.fromText(label)}));if(bilingual)nums.push(index*2+1,document.context.obj({P:PDFHexString.fromText(label+' · translation')}));});document.catalog.set(key('PageLabels'),document.context.obj({Nums:nums}));}
    if(bilingual)originalAnnotations.forEach((annotations,index)=>{
      const target=translatedPages[index];for(const annotation of annotations)if(annotation instanceof PDFDict) {
        const subtype=name(annotation.get(key('Subtype')));if(!['Link','Widget'].includes(subtype))continue;
        let template=annotation,parent,parentRef;
        if(subtype==='Widget') {
          parentRef=annotation.get(key('Parent'));parent=resolve(document,parentRef);
          if(annotation.has(key('FT')) || !(parent instanceof PDFDict && parent.has(key('Kids')))) {
            // Split a combined field/widget into one terminal field and separate
            // widgets before adding a second view of the same editable value.
            const sourcePage=originalPages[index],annots=sourcePage.node.lookupMaybe(key('Annots'),PDFArray);let fieldRef;
            for(let i=0;i<(annots?.size() || 0);i++)if(resolve(document,annots.get(i))===annotation){fieldRef=annots.get(i);break;}
            if(!(fieldRef instanceof PDFRef))continue;
            parent=annotation;parentRef=fieldRef;template=annotation.clone();
            for(const field of ['FT','T','TU','TM','Ff','V','DV','Kids','Parent','DA','Q','Opt','MaxLen'])template.delete(key(field));template.set(key('Parent'),fieldRef);template.set(key('P'),sourcePage.ref);
            const originalWidget=document.context.register(template);
            for(let i=0;i<annots.size();i++)if(annots.get(i)===fieldRef)annots.set(i,originalWidget);
            for(const field of ['Type','Subtype','Rect','AP','P','AS','MK','F','Border','BS','A','C','H','NM','M','Contents','StructParent'])parent.delete(key(field));parent.set(key('Kids'),document.context.obj([originalWidget]));
          }
        }
        const copy=template.clone();copy.set(key('P'),target.ref);copy.delete(key('NM'));transformAnnotation(copy,geometries[index]);
        if(subtype==='Widget'){copy.set(key('Parent'),parentRef);const reference=document.context.register(copy);parent.lookup(key('Kids'),PDFArray).push(reference);target.node.addAnnot(reference);continue;}
        const direct=copy.get(key('Dest')),action=copy.lookupMaybe(key('A'),PDFDict);
        if(direct)copy.set(key('Dest'),remap(direct));if(action && name(action.get(key('S')))==='GoTo'){const next=action.clone();next.set(key('D'),remap(action.get(key('D'))));copy.set(key('A'),next);}
        // Named destinations deliberately retain their native target; duplicating
        // the name tree would change the original bookmark contract.
        target.node.addAnnot(document.context.register(copy));
      }
    });
    else {
      originalAnnotations.forEach((annotations,index)=>annotations.forEach(annotation=>{if(annotation instanceof PDFDict)transformAnnotation(annotation,geometries[index]);}));
      // Apply transforms in place to original destination arrays. Retaining their
      // refs keeps both outline and name-tree users bound to the same target.
      const seen=new Set();function walk(object){object=resolve(document,object);if(!object||seen.has(object))return;seen.add(object);if(object instanceof PDFArray){if(object.size()>1 && destTypes.has(name(object.get(1)))){const next=remap(object);if(next!==object)for(let i=0;i<object.size();i++)object.set(i,next.get(i));return;}for(let i=0;i<object.size();i++)walk(object.get(i));}else if(object instanceof PDFDict)for(const [field,value]of object.entries())if(!['Parent','P','Pages','Resources','Contents','AP','Metadata'].includes(field.decodeText()))walk(value);}
      walk(document.catalog.get(key('Outlines')));walk(document.catalog.get(key('Dests')));walk(names?.get(key('Dests')));walk(document.catalog.get(key('OpenAction')));originalPages.forEach(page=>walk(page.node.get(key('Annots'))));
    }
  }
  return {originalPages,signatures,originalAnnotations,finish};
}
export function normalizeTranslatedPage(page,geometry) {
  // Retain the page object reference used by bookmarks, links and form widgets.
  // Replace its paint resources, not its identity or annotation/field graph.
  page.node.set(key('Contents'),page.doc.context.obj([]));page.node.set(key('Resources'),page.doc.context.obj({}));page.setRotation(degrees(0));page.setMediaBox(0,0,geometry.width,geometry.height);page.setCropBox(0,0,geometry.width,geometry.height);
  for(const field of ['BleedBox','TrimBox','ArtBox','StructParents'])page.node.delete(key(field));
}

export function pdfTargetPoint(geometry,x,y){const [a,b,c,d,e,f]=geometry.transform || [1,0,0,-1,0,geometry.height];return [a*x+c*y+e,geometry.height-(b*x+d*y+f)];}
export function pdfTargetRect(geometry,[x0,y0,x1,y1]){const points=[[x0,y0],[x0,y1],[x1,y0],[x1,y1]].map(([x,y])=>pdfTargetPoint(geometry,x,y));return [Math.min(...points.map(point=>point[0])),Math.min(...points.map(point=>point[1])),Math.max(...points.map(point=>point[0])),Math.max(...points.map(point=>point[1]))];}
