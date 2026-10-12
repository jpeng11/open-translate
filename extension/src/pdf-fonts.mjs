import fontkit from '@pdf-lib/fontkit';
import {PDFHexString,PDFName,PDFOperator,PDFOperatorNames,setFillingRgbColor,beginText,endText,setFontAndSize,setTextMatrix,showText} from 'pdf-lib';
import {visualPdfRuns} from './pdf-bidi.mjs';
const FONTS=[['NotoSans-Regular.ttf',/./u],['NotoSansArabic-Regular.ttf',/[\u0600-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u],['NotoSansHebrew-Regular.ttf',/[\u0590-\u05ff\ufb1d-\ufb4f]/u],['NotoSansDevanagari-Regular.ttf',/[\u0900-\u097f]/u],['NotoSansThai-Regular.ttf',/[\u0e00-\u0e7f]/u],['NotoSansCJKsc-Regular.ttf',/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7ff\uf900-\ufaff\uff00-\uffef\u{20000}-\u{3134f}]/u]];
export async function createPdfFonts(output,texts,loader=async name=>new Uint8Array(await(await fetch((globalThis.browser || chrome).runtime.getURL('assets/fonts/'+name))).arrayBuffer())) {
  output.registerFontkit(fontkit);const needed=new Set([FONTS[0][0]]);
  for(const text of texts)for(const [name,pattern]of FONTS.slice(1))if(pattern.test(text))needed.add(name);
  const fonts=[];for(const name of needed){const bytes=await loader(name),face=fontkit.create(bytes),font=await output.embedFont(bytes,{subset:true});fonts.push({name,face,font});}
  const fontKeys=new WeakMap();
  function chooseFont(character) {
    const code=character.codePointAt(0),chosen=fonts.find(item=>FONTS.find(([name])=>name===item.name)[1].test(character) && item.name!==FONTS[0][0] && item.face.hasGlyphForCodePoint(code)) || fonts.find(item=>item.face.hasGlyphForCodePoint(code));
    if(!chosen){if(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufe00-\ufe0f]/u.test(character))return null;throw new Error(`PDF font does not support U+${code.toString(16).toUpperCase()}. Download the accessible HTML version to retain this character.`);}return chosen;
  }
  function runs(text){return visualPdfRuns(text.replace(/\t/g,'    '),chooseFont);}
  function layout(run){return run.font.face.layout(run.text,undefined,undefined,undefined,run.direction);}
  function measure(text,size){return runs(text).reduce((sum,run)=>sum+layout(run).advanceWidth/run.font.face.unitsPerEm*size,0);}
  function draw(page,text,{x,y,size,color=[0,0,0],angle=0}) {
    let cursor=0;const parts=runs(text),cos=Math.cos(angle),sin=Math.sin(angle);
    // ActualText records logical Unicode independently of shaped visual glyph order.
    page.pushOperators(setFillingRgbColor(...color),PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence,[PDFName.of('Span'),output.context.obj({ActualText:PDFHexString.fromText(text)})]));
    for(const run of parts) {
      const {face,font}=run.font,shaped=layout(run),automatic=face.layout(run.text),encoded=font.encodeText(run.text).asString(),scale=size/face.unitsPerEm;
      // PDF-lib allocates subset glyph IDs while encoding with Fontkit's inferred
      // script direction. Reuse those IDs in Unicode-bidi resolved visual order.
      const glyphCodes=new Map(),hexLength=encoded.length/automatic.glyphs.length;
      automatic.glyphs.forEach((glyph,index)=>glyphCodes.set(glyph.id,encoded.slice(index*hexLength,(index+1)*hexLength)));
      let keys=fontKeys.get(page);if(!keys){keys=new Map();fontKeys.set(page,keys);}let key=keys.get(font);if(!key){key=page.node.newFontDictionary(font.name,font.ref);keys.set(font,key);}
      page.pushOperators(beginText(),setFontAndSize(key,size));
      for(let index=0;index<shaped.glyphs.length;index++) {
        const position=shaped.positions[index],code=glyphCodes.get(shaped.glyphs[index].id);
        if(!code)throw new Error('PDF shaping produced an unsupported directional glyph. Download accessible HTML instead.');
        page.pushOperators(setTextMatrix(cos,sin,-sin,cos,x+cos*(cursor+position.xOffset*scale)-sin*position.yOffset*scale,y+sin*(cursor+position.xOffset*scale)+cos*position.yOffset*scale),showText(PDFHexString.of(code)));
        cursor+=position.xAdvance*scale;
      }
      page.pushOperators(endText());
    }
    page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }
  return {measure,draw,fonts};
}
