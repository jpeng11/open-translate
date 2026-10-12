export const SPEECH_RATE=16000;
export function encodeWav(samples,rate=SPEECH_RATE) {
  const bytes=new ArrayBuffer(44+samples.length*2),view=new DataView(bytes),text=(at,value)=>Array.from(value).forEach((char,index)=>view.setUint8(at+index,char.charCodeAt(0)));
  text(0,'RIFF');view.setUint32(4,36+samples.length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);
  samples.forEach((value,index)=>view.setInt16(44+index*2,Math.round(Math.max(-1,Math.min(1,value))*(value<0?32768:32767)),true));return new Blob([bytes],{type:'audio/wav'});
}
export class PcmSegmenter {
  constructor({sampleRate,seconds=3,vad=true,emit}) {
    if(!Number.isFinite(sampleRate) || sampleRate<8000)throw new Error('Invalid audio sample rate.');
    this.rate=sampleRate;this.max=Math.round(SPEECH_RATE*Math.max(2,Math.min(5,Number(seconds) || 3)));this.vad=vad;this.emit=emit;this.offset=0;this.samples=[];this.total=0;this.start=0;this.silence=0;this.voiced=false;
  }
  push(frame) {
    const step=this.rate/SPEECH_RATE,converted=[];let at=this.offset;
    for(;at<frame.length;at+=step)converted.push(frame[Math.floor(at)]);this.offset=at-frame.length;
    const rms=Math.sqrt(converted.reduce((sum,x)=>sum+x*x,0)/Math.max(1,converted.length)),voice=rms>.009;
    if(voice){this.voiced=true;this.silence=0;}else this.silence+=converted.length;
    for(const value of converted){this.samples.push(value);this.total++;if(this.samples.length>=this.max)this.flush();}
    if(this.vad && this.voiced && this.silence>=SPEECH_RATE*.5 && this.samples.length>=SPEECH_RATE*.5)this.flush();
    if(this.vad && !this.voiced && this.samples.length>SPEECH_RATE*.2){const count=this.samples.length-Math.round(SPEECH_RATE*.2);this.samples.splice(0,count);this.start+=count;}
  }
  flush() {
    const part=this.samples.length && (this.voiced || !this.vad)?{samples:Float32Array.from(this.samples),start:this.start/SPEECH_RATE,end:this.total/SPEECH_RATE}:null;
    this.samples=[];this.start=this.total;this.voiced=false;this.silence=0;
    if(part)this.emit(part);
  }
}
