import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PcmSegmenter,encodeWav} from '../../extension/src/audio-pcm.mjs';
import {inpaintRegions,textDirection,wrapText} from '../../extension/src/image-inpaint.mjs';
import {modelInfo,verifyModel,OCR_LANGUAGES} from '../../extension/src/ocr-data.mjs';
import {speechEndpoint} from '../../extension/src/speech.mjs';
import {patchTesseractWorker} from '../../scripts/ocr-worker-patch.mjs';
import {cueText,CaptionReader,installSubtitleSidecar} from '../../extension/src/captions.mjs';
const frame=(size,value)=>new Float32Array(size).fill(value);
test('every PCM segment is independently decodable WAV with sample-based times',async()=>{
 const parts=[],segmenter=new PcmSegmenter({sampleRate:48000,seconds:2,emit:part=>parts.push(part)});
 for(let i=0;i<300;i++)segmenter.push(frame(480,.1));segmenter.flush();assert.equal(parts.length,2);assert.deepEqual(parts.map(p=>[p.start,p.end,p.samples.length]),[[0,2,32000],[2,3,16000]]);
 for(const part of parts){const bytes=await encodeWav(part.samples).arrayBuffer(),view=new DataView(bytes);assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint32(40,true),part.samples.length*2);assert.equal(bytes.byteLength,44+part.samples.length*2);}
});
test('VAD skips idle silence, retains preroll and closes speech at a pause',()=>{
 const parts=[],segmenter=new PcmSegmenter({sampleRate:16000,seconds:3,emit:p=>parts.push(p)});
 for(let i=0;i<100;i++)segmenter.push(frame(160,0));assert.equal(parts.length,0);
 for(let i=0;i<60;i++)segmenter.push(frame(160,.12));for(let i=0;i<55;i++)segmenter.push(frame(160,0));
 assert.equal(parts.length,1);assert.equal(parts[0].start,.8);assert.equal(parts[0].end,2.1);segmenter.flush();assert.equal(parts.length,1);
});
test('PCM fractional resampling keeps accurate durations over many blocks',()=>{
 const parts=[],segmenter=new PcmSegmenter({sampleRate:44100,vad:false,emit:p=>parts.push(p)});
 for(let i=0;i<100;i++)segmenter.push(frame(441,.03));segmenter.flush();assert.equal(parts[0].samples.length,16000);assert.equal(parts[0].end,1);
});
test('local inpainting removes glyph pixels and preserves colored background/outside pixels',()=>{
 const width=30,height=20,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*4;data.set([180+x,210,190,255],at);}
 for(let y=7;y<13;y++)for(let x=12;x<15;x++)data.set([0,0,0,255],(y*width+x)*4);
 const before=new Uint8ClampedArray(data);inpaintRegions({width,height,data},[{x0:10,y0:5,x1:17,y1:15}]);
 const center=(10*width+13)*4;assert.ok(data[center]>180);assert.equal(data[center+1],210);assert.equal(data[center+3],255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x<9 || x>18 || y<4 || y>16)assert.deepEqual(data.slice((y*width+x)*4,(y*width+x)*4+4),before.slice((y*width+x)*4,(y*width+x)*4+4));
});
test('RTL text and grapheme wrapping preserve combining marks/newlines',()=>{
 assert.equal(textDirection('“مرحبا بالعالم'),'rtl');assert.equal(textDirection('Hello world'),'ltr');assert.equal(textDirection('שלום'),'rtl');
 const context={measureText:text=>({width:Array.from(text).length*10})};assert.deepEqual(wrapText(context,'Hi\nthere',100),['Hi','there']);const combined='e\u0301e\u0301';assert.deepEqual(wrapText(context,combined,20),['e\u0301','e\u0301']);
});
test('124 pinned OCR models reject invalid IDs and corrupt data before worker loading',async()=>{
 assert.equal(OCR_LANGUAGES.length,124);const info=modelInfo('fra');assert.match(info.url,/87416418657359cb625c412a48b6e1d6d41c29bd\/fra.traineddata$/);assert.throws(()=>modelInfo('../eng'));assert.throws(()=>modelInfo('__proto__'));await assert.rejects(verifyModel('fra',new Uint8Array(4)),/invalid size/);
});
test('Tesseract object-language initialization uses code and build rejects upstream drift',async()=>{
 const source=await readFile('node_modules/tesseract.js/dist/worker.min.js','utf8');const patched=patchTesseractWorker(source);assert.ok(patched.includes('t?t:t.code})).join("+")'));assert.throws(()=>patchTesseractWorker('different version'),/changed/);
});
test('bridge speech auto derives authenticated route and hosted override stays separate',()=>{
 assert.deepEqual(speechEndpoint({provider:'bridge',bridgeUrl:'http://localhost:8765/translate?token=private'}),{url:'http://localhost:8765/v1/audio/transcriptions?token=private',model:'local-whisper',key:undefined});assert.deepEqual(speechEndpoint({speechUrl:'https://speech.example/v1',speechModel:'whisper',speechKey:'key'}),{url:'https://speech.example/v1/audio/transcriptions',model:'whisper',key:'key'});
});
test('native caption reader restores disabled tracks and sidecar cue timing',()=>{
 const oldObserver=globalThis.MutationObserver,oldCue=globalThis.VTTCue;globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.VTTCue=class{constructor(startTime,endTime,text){Object.assign(this,{startTime,endTime,text});}};
 try{
  const track=new EventTarget();Object.assign(track,{mode:'disabled',kind:'subtitles',language:'en',activeCues:[{text:'Hello <b>world</b>'}],cues:[],addCue(cue){this.cues.push(cue);},removeCue(cue){this.cues.splice(this.cues.indexOf(cue),1);}});
  const video={textTracks:[track],isConnected:true,paused:false,currentTime:1,addTextTrack(){return track;}},document={querySelector(){},querySelectorAll(selector){return selector==='video,audio'?[video]:[];}};
  const values=[],reader=new CaptionReader({document,emit:text=>values.push(text)});reader.start({source:'auto'});assert.equal(track.mode,'hidden');assert.equal(values[0],'Hello world');track.activeCues=[];track.dispatchEvent(new Event('cuechange'));assert.equal(values.at(-1),'');reader.stop();assert.equal(track.mode,'disabled');
  const cleanup=installSubtitleSidecar(video,'1\n00:00:01,100 --> 00:00:03,200\nSidecar','a.srt');assert.equal(track.cues[0].startTime,1.1);assert.equal(track.cues[0].endTime,3.2);cleanup();assert.equal(track.cues.length,0);
 }finally{globalThis.MutationObserver=oldObserver;globalThis.VTTCue=oldCue;}
 assert.equal(cueText({getCueAsHTML:()=>({textContent:'Native plain text'})}),'Native plain text');
});
test('segment flush clears state before a queue-overload callback can stop capture',()=>{
 let count=0;const segmenter=new PcmSegmenter({sampleRate:16000,emit:()=>{count++;segmenter.flush();}});segmenter.push(frame(160,.2));segmenter.flush();assert.equal(count,1);
});
test('live cancellation drops pending results and overload does not flush into a full queue',async()=>{
 const oldChrome=globalThis.chrome,calls=[],emitted=[];let release;const gate=new Promise(resolve=>release=resolve);
 globalThis.chrome={runtime:{sendMessage:async message=>{calls.push(message.type);if(message.type==='transcribe'){await gate;return {ok:true,result:{text:'pending speech'}};}return {ok:true,result:{translations:[{text:'translated'}]}};}}};
 try{
  const {LiveSession}=await import('../../extension/src/live.mjs');const statuses=[],live=new LiveSession({source:'auto',target:'en'},item=>emitted.push(item),text=>statuses.push(text));live.enqueue(encodeWav(frame(160,.2)),0,.01);await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(calls,['transcribe']);live.cancel();release();await live.chain;assert.deepEqual(emitted,[]);assert.ok(!calls.includes('translate'));
  live.pending=4;live.running=true;live.stream={getTracks:()=>[]};live.segmenter={flush(){throw new Error('Must not flush into a full queue');}};live.enqueue(encodeWav(frame(160,.2)),1,1.01);assert.equal(live.running,false);assert.match(statuses.at(-1),/falling behind/);
 }finally{globalThis.chrome=oldChrome;}
});
