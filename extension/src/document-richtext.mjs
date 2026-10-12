// Formatting is a skeleton owned by the importer, never HTML supplied by a model.
// Tags are opaque to the translation provider and contain no executable content.
const MARKER=/<ot-(?:text|end) data-ot="\d+"\s*\/>/g;
export function previewDocumentText(text) {return String(text).replace(MARKER,'');}
export function encodeTextSpans(values) {
  if(values.length===1)return {text:values[0],decode(value){return [String(value)];}};
  const markers=values.flatMap((_,index)=>[`<ot-text data-ot="${index}"/>`,`<ot-end data-ot="${index}"/>`]);
  return {text:values.map((value,index)=>markers[index*2]+value+markers[index*2+1]).join(''),decode(value) {
    value=String(value);const found=[...value.matchAll(MARKER)];
    if(found.length!==markers.length || found.some((match,index)=>match[0]!==markers[index]))throw new Error('The translation changed document formatting markers. The original document was retained.');
    const result=values.map((_,index)=>value.slice(found[index*2].index+found[index*2][0].length,found[index*2+1].index));
    // Text outside the skeleton is placed at its edges; markup remains plain text.
    result[0]=value.slice(0,found[0].index)+result[0];result[result.length-1]+=value.slice(found.at(-1).index+found.at(-1)[0].length);
    for(let index=1;index<values.length;index++) {
      const between=value.slice(found[index*2-1].index+found[index*2-1][0].length,found[index*2].index);
      result[index-1]+=between;
    }
    return result;
  }};
}
function nodePath(root,node) {const path=[];while(node!==root){path.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes,node));node=node.parentNode;}return path;}
function pathNode(root,path){return path.reduce((node,index)=>node.childNodes[index],root);}
export function textSkeleton(root,textNodes) {
  const paths=textNodes.map(node=>nodePath(root,node)),spans=encodeTextSpans(textNodes.map(node=>node.textContent));
  return {text:spans.text,apply(clone,translated){const values=spans.decode(translated);paths.forEach((path,index)=>{const node=pathNode(clone,path);node.textContent=values[index];if(node.namespaceURI==='http://schemas.openxmlformats.org/wordprocessingml/2006/main')node.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');});return clone;}};
}
