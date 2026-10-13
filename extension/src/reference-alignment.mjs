// Restore an omitted leaf reference only when its model-supplied translation
// occurs exactly once in plain text of the original parent. No fuzzy matching,
// new translated text, atom invention, reparenting or overlapping replacements.
export function alignMissingReferences(value,layout,seen) {
  const edits=[];
  for(const [id,node] of layout){
    if(seen.has(id))continue;
    if(node.atom||[...layout.values()].some(child=>child.parent===id))return null;
    const parts=value[id];if(!Array.isArray(parts)||parts.some(part=>typeof part!=='string'))return null;
    const phrase=parts.join('');if(!phrase.trim())return null;
    const parent=node.parent??'root',matches=[];
    for(const [index,text] of value[parent].entries()){
      if(typeof text!=='string')continue;
      for(let start=text.indexOf(phrase);start>=0;start=text.indexOf(phrase,start+1))matches.push({parent,index,start,end:start+phrase.length,id});
    }
    if(matches.length!==1)return null;
    const match=matches[0],text=value[parent][match.index],word=/[\p{Script=Latin}\p{Script=Cyrillic}\p{N}]/u;
    if(word.test(phrase[0])&&word.test(text[match.start-1]||'')||word.test(phrase.at(-1))&&word.test(text[match.end]||''))return null;
    if(edits.some(edit=>edit.parent===parent&&edit.index===match.index&&edit.start<match.end&&match.start<edit.end))return null;
    edits.push(match);
  }
  const aligned={...value};
  for(const parent of new Set(edits.map(edit=>edit.parent))){
    aligned[parent]=value[parent].flatMap((part,index)=>{
      const matches=edits.filter(edit=>edit.parent===parent&&edit.index===index).sort((a,b)=>a.start-b.start);
      if(!matches.length)return [part];
      const output=[];let offset=0;
      for(const match of matches){output.push(part.slice(offset,match.start),{ref:match.id});offset=match.end;}
      output.push(part.slice(offset));return output;
    });
  }
  return aligned;
}
