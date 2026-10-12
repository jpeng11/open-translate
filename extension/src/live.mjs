import {send} from './ui.mjs';
const base64=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);};
export class LiveSession {
  constructor(config,emit,status){this.config=config;this.emit=emit;this.status=status;this.running=false;this.pending=0;this.chain=Promise.resolve();}
  async start(source) {
    if(!this.config.speechUrl || !this.config.speechModel)throw new Error('Set your speech endpoint and model under Connection first.');
    this.stream=source==='microphone'?await navigator.mediaDevices.getUserMedia({audio:true}):await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
    if(!this.stream.getAudioTracks().length){this.stream.getTracks().forEach(t=>t.stop());throw new Error('No audio was shared. Choose a browser tab and enable Share tab audio.');}
    this.running=true;this.started=performance.now();this.audio=new MediaStream(this.stream.getAudioTracks());
    this.stream.getTracks().forEach(track=>track.addEventListener('ended',()=>this.stop()));try{this.record();}catch(error){this.stop();throw error;}
    this.status('Listening. Processing 15-second audio segments…');
  }
  record() {
    if(!this.running)return;
    const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
    const recorder=new MediaRecorder(this.audio,mime?{mimeType:mime}:{}),chunks=[],start=(performance.now()-this.started)/1000;this.recorder=recorder;
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.onstop=()=>{
      clearTimeout(this.timer);const end=(performance.now()-this.started)/1000;
      const blob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});
      if(this.running)this.record();
      if(!blob.size)return;
      if(blob.size>5*1024*1024 || this.pending>=4){this.status('Speech processing is falling behind. Capture stopped; reduce endpoint latency.');this.stop();return;}
      this.pending++;
      this.chain=this.chain.then(async()=>{
        const speech=await send({type:'transcribe',audio:await base64(blob),mime:blob.type});
        if(!speech.text.trim())return;
        const result=await send({type:'translate',job:{source_lang:this.config.source,target_lang:this.config.target,text_list:[speech.text]}});
        this.emit({start,end,source:speech.text,text:result.translations[0].text});
      }).catch(error=>this.status(error.message,true)).finally(()=>{this.pending--;});
    };
    recorder.start();this.timer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},15000);
  }
  stop(){if(!this.running && !this.stream)return;this.running=false;clearTimeout(this.timer);if(this.recorder?.state!=='inactive')this.recorder?.stop();this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.status('Capture stopped. Finishing any pending segments…');}
}
export function transcriptSrt(items) {
  const stamp=seconds=>{const ms=Math.round(seconds*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(v=>String(v).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};
  return items.map((item,index)=>`${index+1}\n${stamp(item.start)} --> ${stamp(item.end)}\n${item.source}\n${item.text}`).join('\n\n');
}
