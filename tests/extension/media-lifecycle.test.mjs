import test from 'node:test';
import assert from 'node:assert/strict';
import {videoContentRect} from '../../extension/src/screen-region.mjs';
import {CaptionReader} from '../../extension/src/captions.mjs';

class Track extends EventTarget {
 constructor(kind){super();this.kind=kind;this.readyState='live';this.listeners=new Set();}
 addEventListener(type,fn,...args){if(type==='ended')this.listeners.add(fn);super.addEventListener(type,fn,...args);}
 removeEventListener(type,fn,...args){if(type==='ended')this.listeners.delete(fn);super.removeEventListener(type,fn,...args);}
 stop(){this.readyState='ended';}
 end(){this.readyState='ended';this.dispatchEvent(new Event('ended'));}
}
class Stream {constructor(tracks){this.tracks=tracks;}getTracks(){return this.tracks;}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}}
const contexts=[],calls=[];
class Audio {
 constructor(){this.sampleRate=16000;this.state='suspended';contexts.push(this);}
 async resume(){this.state='running';}
 node(){return {connect(){},disconnect(){this.disconnected=true;}};}
 createMediaStreamSource(){return this.source=this.node();}
 createGain(){return Object.assign(this.node(),{gain:{value:1}});}
 createScriptProcessor(){return this.capture=this.node();}
 async close(){this.state='closed';}
}
const original=new Map(['chrome','navigator','MediaStream','AudioContext','AudioWorkletNode','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
for(const [key,value]of Object.entries({chrome:{runtime:{sendMessage:async message=>{calls.push(message);return {ok:true,result:message.type==='transcribe'?{text:'Speech phrase'}:{translations:[{text:'Translated phrase'}]}};}}},navigator:{mediaDevices:{}},MediaStream:Stream,AudioContext:Audio,AudioWorkletNode:undefined}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
const {LiveSession}=await import('../../extension/src/live.mjs');
const {ScreenCaptionSession}=await import('../../extension/src/screen-captions.mjs');
test.after(()=>{for(const [key,descriptor]of original)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
const config={provider:'bridge',source:'auto',target:'en',liveSegmentSeconds:2,liveVad:true};
const makeLive=()=>{const items=[],statuses=[],session=new LiveSession(config,item=>items.push(item),text=>statuses.push(text));return {session,items,statuses};};

test('declined microphone and late permission grants leave no capture resources',async()=>{
 const count=contexts.length,{session}=makeLive();navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Permission denied','NotAllowedError');};await assert.rejects(session.start('microphone'),{name:'NotAllowedError'});assert.equal(session.running,false);assert.equal(session.starting,false);assert.equal(contexts.length,count);
 const stream=new Stream([new Track('audio')]);let grant;navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>grant=resolve);const pending=session.start('microphone');session.cancel();grant(stream);await assert.rejects(pending,{name:'AbortError'});assert.equal(stream.getTracks()[0].readyState,'ended');assert.equal(contexts.length,count);
});
test('silence uploads nothing and stop flushes speech once then closes every resource',async()=>{
 const stream=new Stream([new Track('audio')]),{session,items}=makeLive();navigator.mediaDevices.getUserMedia=async()=>stream;const at=calls.length;await session.start('microphone');const audio=session.context,capture=session.capture;const process=samples=>capture.onaudioprocess({inputBuffer:{getChannelData:()=>samples}});
 for(let i=0;i<30;i++)process(new Float32Array(1600));assert.equal(calls.length,at);process(new Float32Array(1600).fill(.2));session.stop();await session.chain;assert.equal(items.length,1);assert.equal(calls.length,at+2);assert.equal(items[0].end,3.1);assert.ok(items[0].start>=2.7);assert.equal(audio.state,'closed');assert.equal(capture.onaudioprocess,null);assert.equal(capture.disconnected,true);assert.equal(session.source.disconnected,true);assert.equal(stream.getTracks()[0].listeners.size,0);assert.equal(session.audio,null);assert.equal(session.stream,null);
 session.stop();assert.equal(items.length,1);
});
test('browser-ended live tracks release audio nodes and repeated starts leave no listeners',async()=>{
 const {session}=makeLive();for(let i=0;i<5;i++){const audio=new Track('audio'),video=new Track('video'),stream=new Stream([audio,video]);navigator.mediaDevices.getDisplayMedia=async()=>stream;await session.start('tab');const context=session.context;video.end();assert.equal(session.running,false);assert.equal(context.state,'closed');assert.ok(stream.getTracks().every(t=>t.readyState==='ended' && !t.listeners.size));}
});
test('full live queue stops capture, drains at most four items and requires pending work to finish',async()=>{
 const old=chrome.runtime.sendMessage;let release;const gate=new Promise(resolve=>release=resolve);chrome.runtime.sendMessage=async message=>{if(message.type==='transcribe'){await gate;return {ok:true,result:{text:'Queued'}};}return {ok:true,result:{translations:[{text:'Translated'}]}};};
 const stream=new Stream([new Track('audio')]),{session,items,statuses}=makeLive();navigator.mediaDevices.getUserMedia=async()=>stream;
 try{await session.start('microphone');for(let i=0;i<5;i++)session.enqueue(new Blob([new Uint8Array(44)],{type:'audio/wav'}),i,i+1);assert.equal(session.running,false);assert.equal(session.pending,4);assert.match(statuses.at(-1),/falling behind/);assert.equal(stream.getTracks()[0].readyState,'ended');await assert.rejects(session.start('microphone'),/pending speech/);release();await session.chain;assert.equal(items.length,4);assert.equal(session.pending,0);}finally{release();chrome.runtime.sendMessage=old;}
});
test('capture setup failure and streams without shared audio release all granted tracks',async()=>{
 const noAudio=new Stream([new Track('video')]),{session}=makeLive();navigator.mediaDevices.getDisplayMedia=async()=>noAudio;await assert.rejects(session.start('tab'),/No audio/);assert.equal(noAudio.getTracks()[0].readyState,'ended');
 const stream=new Stream([new Track('audio')]);navigator.mediaDevices.getUserMedia=async()=>stream;const saved=Audio.prototype.resume;Audio.prototype.resume=async()=>{throw new Error('Audio device unavailable');};try{await assert.rejects(session.start('microphone'),/unavailable/);assert.equal(session.running,false);assert.equal(session.context.state,'closed');assert.equal(stream.getTracks()[0].listeners.size,0);assert.equal(stream.getTracks()[0].readyState,'ended');}finally{Audio.prototype.resume=saved;}
});
test('screen permission decline, late grant, ended sharing and missing video clean up',async()=>{
 const videos=[];globalThis.document={createElement:()=>{const video={async play(){},pause(){this.paused=true;}};videos.push(video);return video;}};const session=new ScreenCaptionSession(config,()=>{},()=>{});session.loop=()=>{};
 navigator.mediaDevices.getDisplayMedia=async()=>{throw new DOMException('Declined','NotAllowedError');};await assert.rejects(session.start(),{name:'NotAllowedError'});assert.equal(session.starting,false);
 let grant;const late=new Stream([new Track('video')]);navigator.mediaDevices.getDisplayMedia=()=>new Promise(resolve=>grant=resolve);const pending=session.start();session.stop();grant(late);await assert.rejects(pending,{name:'AbortError'});assert.equal(late.getTracks()[0].readyState,'ended');assert.equal(videos.length,0);
 const noVideo=new Stream([new Track('audio')]);navigator.mediaDevices.getDisplayMedia=async()=>noVideo;await assert.rejects(session.start(),/No video/);assert.equal(noVideo.getTracks()[0].readyState,'ended');
 for(let i=0;i<3;i++){const stream=new Stream([new Track('video')]);navigator.mediaDevices.getDisplayMedia=async()=>stream;const video=await session.start();assert.equal(video.srcObject,stream);stream.getTracks()[0].end();assert.equal(video.srcObject,null);assert.equal(video.paused,true);assert.equal(session.running,false);assert.equal(stream.getTracks()[0].listeners.size,0);}
});
test('preview coordinates follow letterboxing, object positions, cover cropping and resize',()=>{
 const style={objectFit:'contain',objectPosition:'50% 50%'},video={videoWidth:1000,videoHeight:500,getBoundingClientRect:()=>({left:10,top:20,width:500,height:500}),ownerDocument:{defaultView:{getComputedStyle:()=>style}}};assert.deepEqual(videoContentRect(video),{left:10,top:145,width:500,height:250,clip:{left:10,top:20,width:500,height:500}});
 style.objectPosition='left top';assert.equal(videoContentRect(video).top,20);style.objectFit='cover';style.objectPosition='50% 50%';assert.deepEqual(videoContentRect(video),{left:-240,top:20,width:1000,height:500,clip:{left:10,top:20,width:500,height:500}});
 style.objectFit='contain';video.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100});assert.deepEqual(videoContentRect(video),{left:0,top:0,width:200,height:100,clip:{left:0,top:0,width:200,height:100}});
});
test('caption overlap preserves multiline RTL, reselecting native captions hides duplicates',()=>{
 const saved=globalThis.MutationObserver;globalThis.MutationObserver=class{observe(){}disconnect(){}};try{const track=Object.assign(new EventTarget(),{mode:'showing',kind:'subtitles',language:'ar',activeCues:[{text:'مرحبا\nبالعالم'},{text:'سطر متداخل'}]}),video={textTracks:[track],isConnected:true},document={querySelector(){},querySelectorAll:selector=>selector==='video,audio'?[video]:[]},values=[],reader=new CaptionReader({document,emit:text=>values.push(text)});reader.start({source:'ar'});assert.equal(values[0],'مرحبا\nبالعالم\nسطر متداخل');track.mode='showing';reader.refresh();assert.equal(track.mode,'hidden');reader.stop();assert.equal(track.mode,'showing');reader.start({source:'ar'});track.activeCues=[];reader.scan();assert.equal(values.at(-1),'');reader.stop();assert.equal(reader.observers.size,0);assert.equal(reader.tracks.size,0);}finally{globalThis.MutationObserver=saved;}
});

test('CJK OCR removes segmentation separators without changing Latin, Korean or line breaks',async()=>{
 const {normalizeOcrText}=await import('../../extension/src/ocr-text.mjs');assert.equal(normalizeOcrText('中 文 翻 译 测试','chi_sim'),'中文翻译测试');assert.equal(normalizeOcrText('Hello 世 界\n日本 語 の 翻 訳','eng+jpn'),'Hello 世界\n日本語の翻訳');assert.equal(normalizeOcrText('한국어 번역','kor'),'한국어 번역');assert.equal(normalizeOcrText('A B 中 文','eng'),'A B 中 文');
});

test('inpainting includes antialiasing strokes just outside tight OCR bounds',async()=>{
 const {inpaintRegions}=await import('../../extension/src/image-inpaint.mjs'),width=32,height=24,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set([205,220,232,255],i);for(let y=7;y<=15;y++)for(let x=9;x<=20;x++)if(x<12 || x>18)data.set([20,30,40,255],(y*width+x)*4);inpaintRegions({width,height,data},[{x0:10,y0:7,x1:19,y1:15}]);for(let y=7;y<=15;y++)for(let x=9;x<=20;x++)assert.ok(data[(y*width+x)*4]>190);assert.deepEqual([...data.slice(0,4)],[205,220,232,255]);
});

test('OCR and PDF callers can choose different mask fringes without altering outer pixels',async()=>{
 const {inpaintRegions}=await import('../../extension/src/image-inpaint.mjs'),width=32,height=24,make=()=>{const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set([205,220,232,255],i);data.set([20,30,40,255],(10*width+8)*4);return {width,height,data};},ocr=make(),pdf=make(),box={x0:10,y0:7,x1:19,y1:15};inpaintRegions(ocr,[box]);inpaintRegions(pdf,[box],{padding:2});assert.ok(ocr.data[(10*width+8)*4]>190);assert.equal(pdf.data[(10*width+8)*4],20);assert.throws(()=>inpaintRegions(make(),[box],{padding:0}),RangeError);
});
