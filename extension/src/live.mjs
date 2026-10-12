import {send,api} from './ui.mjs';
import {PcmSegmenter,encodeWav} from './audio-pcm.mjs';
const base64=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);};
export class LiveSession {
  constructor(config,emit,status){this.config=config;this.emit=emit;this.status=status;this.running=false;this.pending=0;this.chain=Promise.resolve();this.generation=0;this.attempt=0;this.endedListeners=[];}
  async start(source) {
    if(this.running || this.starting)return;
    if(this.pending)throw new Error('Wait for pending speech segments to finish, or cancel them before starting again.');
    if(this.config.provider!=='bridge' && (!this.config.speechUrl || !this.config.speechModel))throw new Error('Set your speech endpoint and model under Connection first.');
    const attempt=++this.attempt;this.starting=true;
    let stream;
    try{stream=source==='microphone'?await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}):await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});}
    catch(error){if(attempt===this.attempt)this.starting=false;throw error;}
    if(attempt!==this.attempt){stream.getTracks().forEach(t=>t.stop());throw new DOMException('Capture start was cancelled.','AbortError');}
    this.stream=stream;
    if(!stream.getAudioTracks().some(track=>track.readyState!=='ended')){stream.getTracks().forEach(t=>t.stop());this.stream=null;this.starting=false;throw new Error('No audio was shared. Choose a browser tab and enable Share tab audio.');}
    this.running=true;this.started=performance.now();this.audio=new MediaStream(this.stream.getAudioTracks());
    this.stream.getTracks().forEach(track=>{const listener=()=>this.stop();track.addEventListener('ended',listener);this.endedListeners.push([track,listener]);});
    try{
      try{this.context=new AudioContext({sampleRate:16000});}catch{this.context=new AudioContext();}await this.context.resume();
      if(attempt!==this.attempt)throw new DOMException('Capture start was cancelled.','AbortError');
      this.segmenter=new PcmSegmenter({sampleRate:this.context.sampleRate,seconds:this.config.liveSegmentSeconds || 3,vad:this.config.liveVad!==false,emit:part=>this.enqueue(encodeWav(part.samples),part.start,part.end)});
      this.source=this.context.createMediaStreamSource(this.audio);this.gain=this.context.createGain();this.gain.gain.value=0;this.gain.connect(this.context.destination);
      if(this.context.audioWorklet && typeof AudioWorkletNode!=='undefined'){
        await this.context.audioWorklet.addModule(api.runtime.getURL('audio-worklet.mjs'));
        if(attempt!==this.attempt)throw new DOMException('Capture start was cancelled.','AbortError');
        this.capture=new AudioWorkletNode(this.context,'open-translate-capture');this.capture.port.onmessage=event=>{if(this.running)this.segmenter.push(event.data);};this.source.connect(this.capture);this.capture.connect(this.gain);
      }else{
        // PCM fallback stays independently decodable, unlike timesliced WebM.
        this.capture=this.context.createScriptProcessor(2048,1,1);this.capture.onaudioprocess=event=>{if(this.running)this.segmenter.push(event.inputBuffer.getChannelData(0));};this.source.connect(this.capture);this.capture.connect(this.gain);
      }
      this.status(`Listening. Translating audio in ${this.config.liveSegmentSeconds || 3}-second segments; pauses finish a segment early…`);
    }catch(error){if(attempt===this.attempt)this.cancel();throw error;}finally{if(attempt===this.attempt)this.starting=false;}
  }
  enqueue(blob,start,end) {
    if(this.pending>=4){this.stop(false);this.status('Speech processing is falling behind. Capture stopped; reduce endpoint latency.',true);return;}
    const generation=this.generation;this.pending++;
    this.chain=this.chain.then(async()=>{
      if(generation!==this.generation)return;
      const speech=await send({type:'transcribe',audio:await base64(blob),mime:blob.type});
      if(generation!==this.generation || !speech.text.trim())return;
      const result=await send({type:'translate',job:{source_lang:this.config.source,target_lang:this.config.target,text_list:[speech.text]}});
      if(generation===this.generation)this.emit({start,end,source:speech.text,text:result.translations[0].text});
    }).catch(error=>{if(generation===this.generation)this.status(error.message,true);}).finally(()=>{this.pending--;if(!this.running && !this.pending && generation===this.generation)this.status('Capture stopped. Transcript is ready.');});
  }
  stop(flush=true){
    this.attempt++;this.starting=false;if(!this.running && !this.stream)return;this.running=false;if(flush)this.segmenter?.flush();
    if(this.capture?.port)this.capture.port.onmessage=null;if(this.capture)this.capture.onaudioprocess=null;
    this.capture?.disconnect();this.source?.disconnect();this.gain?.disconnect();this.context?.close().catch(()=>{});
    for(const [track,listener]of this.endedListeners)track.removeEventListener('ended',listener);this.endedListeners=[];
    this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.audio=null;this.status(this.pending?'Capture stopped. Finishing pending segments…':'Capture stopped.');
  }
  cancel(){this.generation++;this.stop(false);this.status('Capture cancelled. Pending results were discarded.');}
}
export function transcriptSrt(items) {
  const stamp=seconds=>{const ms=Math.max(0,Math.round(seconds*1000));return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(v=>String(v).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};
  return items.map((item,index)=>`${index+1}\n${stamp(item.start)} --> ${stamp(item.end)}\n${item.source}\n${item.text}`).join('\n\n');
}
