// A partial comparison is useful evidence; differences must remain visible.
export function validateComparison(value,reference,implementationSha256) {
 if(!value || value.schema!==1 || value.reference?.commit!==reference.commit || value.reference?.version!==reference.version || value.reference?.contentSha256!==reference.contentSha256)throw new Error('Comparison reference identity does not match the frozen original.');
 if(value.implementationSha256!==implementationSha256)throw new Error('Comparison evidence is stale for this implementation; rebuild and rerun the corresponding reference suite.');
 if(!Array.isArray(value.cases) || !value.cases.length)throw new Error('Comparison contains no observed cases.');
 const names=new Set(),counts={matched:0,different:0,'reference-unresolved':0};
 for(const item of value.cases){
  if(!item || typeof item.name!=='string' || !item.name || names.has(item.name) || !Object.hasOwn(counts,item.status))throw new Error('Comparison contains duplicate or invalid cases.');
  names.add(item.name);
  if(item.status==='matched' && (item.original?.status!=='observed' || item.replacement?.status!=='observed' || JSON.stringify(item.original.value)!==JSON.stringify(item.replacement.value)))throw new Error('A matched comparison needs equal observations from both implementations.');
  if(item.status==='reference-unresolved' && item.original?.status==='observed')throw new Error('An unresolved reference cannot be a completed original observation.');
  counts[item.status]++;
 }
 if(value.status==='passed' && (counts.different || counts['reference-unresolved']))throw new Error('A passing suite cannot contain differences or unknown reference behavior.');
 return counts;
}
