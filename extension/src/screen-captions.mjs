import {recognize} from './ocr.mjs';
import {send} from './ui.mjs';
// Explicit user-selected screen/tab capture only. Protected video may appear
// black; this fallback does not and cannot bypass browser capture restrictions.
export class ScreenCaptionSession {
  constructor(config,emit,status){this.config=config;this.emit=emit;this.status=status;this.running=false;this.sequence=0;this.last='';}
  async start() {
    if(this.running)return this.video;
    this.stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:5},audio:false});this.running=true;this.started=performance.now();this.sequence++;
    this.stream.getTracks().forEach(track=>track.addEventListener('ended',()=>this.stop()));this.video=document.createElement('video');this.video.muted=true;this.video.playsInline=true;this.video.autoplay=true;this.video.srcObject=this.stream;
    try{await this.video.play();this.status('Reading visible subtitles from the lower part of the shared screen. Protected video may be hidden by your browser.');void this.loop(this.sequence);return this.video;}catch(error){this.stop();throw error;}
  }
  async loop(sequence) {
    if(!this.running || sequence!==this.sequence)return;
    try{
      if(this.video.videoWidth && this.video.videoHeight){
        const canvas=document.createElement('canvas'),width=this.video.videoWidth,height=this.video.videoHeight,ratio=Math.max(.15,Math.min(.6,Number(this.config.screenCaptionRegion) || .3));
        canvas.width=Math.min(1920,width);canvas.height=Math.round(height*ratio*canvas.width/width);canvas.getContext('2d').drawImage(this.video,0,height*(1-ratio),width,height*ratio,0,0,canvas.width,canvas.height);
        const result=await recognize(canvas,this.config.ocrLanguage || 'eng');if(!this.running || sequence!==this.sequence)return;
        const source=result.text.trim().replace(/[ \t]+/g,' ');if(source && source!==this.last && source.length<3000){
          this.last=source;const start=(performance.now()-this.started)/1000;
          const translated=await send({type:'translate',job:{source_lang:this.config.source,target_lang:this.config.target,text_list:[source]}});
          if(this.running && sequence===this.sequence)this.emit({source,text:translated.translations[0].text,start,end:(performance.now()-this.started)/1000});
        }
      }
    }catch(error){if(this.running && sequence===this.sequence)this.status(error.message,true);}
    if(this.running && sequence===this.sequence)this.timer=setTimeout(()=>this.loop(sequence),2000);
  }
  stop(){this.running=false;this.sequence++;clearTimeout(this.timer);this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;if(this.video)this.video.srcObject=null;this.status('Screen subtitle capture stopped.');}
}
