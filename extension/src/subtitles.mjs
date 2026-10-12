export function parseSubtitles(text,format='srt') {
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  if(format==='ass' || format==='ssa') {
    const lines=text.split('\n');let fields=['Layer','Start','End','Style','Name','MarginL','MarginR','MarginV','Effect','Text'];
    const cues=[];
    lines.forEach((line,lineIndex)=>{
      if(/^Format:/i.test(line))fields=line.slice(line.indexOf(':')+1).split(',').map(s=>s.trim());
      if(!/^Dialogue:/i.test(line))return;
      const raw=line.slice(line.indexOf(':')+1).trimStart();const parts=[];let rest=raw;
      for(let i=0;i<fields.length-1;i++){const comma=rest.indexOf(',');if(comma<0)throw new Error('Invalid ASS dialogue.');parts.push(rest.slice(0,comma));rest=rest.slice(comma+1);}parts.push(rest);
      const at=fields.indexOf('Text'),start=fields.indexOf('Start'),end=fields.indexOf('End');
      if(at<0 || start<0 || end<0)throw new Error('ASS dialogue format is missing text or timing.');
      cues.push({id:String(cues.length+1),text:parts[at].replace(/\\N/gi,'\n'),start:parts[start],end:parts[end],lineIndex,parts,textIndex:at});
    });
    if(!cues.length)throw new Error('No subtitle dialogue found.');
    return {format,lines,cues};
  }
  const formatVtt=format==='vtt' || text.startsWith('WEBVTT');
  const chunks=text.split(/\n{2,}/),cues=[];
  for(let blockIndex=0;blockIndex<chunks.length;blockIndex++) {
    const lines=chunks[blockIndex].split('\n');const index=lines.findIndex(line=>line.includes('-->'));
    if(index<0)continue;
    const timing=lines[index].match(/^\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})(.*)$/);
    if(!timing)throw new Error('Invalid subtitle timestamp.');
    cues.push({id:index?lines.slice(0,index).join('\n'):String(cues.length+1),start:timing[1],end:timing[2],settings:timing[3],text:lines.slice(index+1).join('\n').replace(/\n+$/,''),blockIndex});
  }
  if(!cues.length)throw new Error('No timed subtitle cues found.');
  return {format:formatVtt?'vtt':'srt',chunks,cues};
}
export function exportSubtitles(document,translated,bilingual=true) {
  if(translated.length!==document.cues.length)throw new Error('Subtitle count does not match.');
  const combine=(cue,index)=>bilingual?cue.text+'\n'+translated[index]:translated[index];
  if(['ass','ssa'].includes(document.format)) {
    const lines=[...document.lines];document.cues.forEach((cue,index)=>{const parts=[...cue.parts];parts[cue.textIndex]=combine(cue,index).replaceAll('\n','\\N');lines[cue.lineIndex]='Dialogue: '+parts.join(',');});return lines.join('\n');
  }
  const chunks=[...document.chunks];document.cues.forEach((cue,index)=>{
    const prefix=cue.id && !(document.format==='vtt' && /^\d+$/.test(cue.id))?cue.id+'\n':'';
    const id=document.format==='srt'?(cue.id || String(index+1))+'\n':prefix;
    chunks[cue.blockIndex]=id+cue.start+' --> '+cue.end+cue.settings+'\n'+combine(cue,index);
  });return chunks.join('\n\n');
}
export function subtitleSeconds(value) {return value.replace(',','.').split(':').reduce((total,part)=>total*60+Number(part),0);}
