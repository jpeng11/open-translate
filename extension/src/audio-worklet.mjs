// Audio-rendering thread only; no network or executable code downloads.
class OpenTranslateCapture extends AudioWorkletProcessor {
  constructor(){super();this.buffer=new Float32Array(1024);this.used=0;}
  process(inputs) {
    const channels=inputs[0];if(!channels?.length)return true;
    for(let index=0;index<channels[0].length;index++){
      let value=0;for(const channel of channels)value+=channel[index] || 0;this.buffer[this.used++]=value/channels.length;
      if(this.used===this.buffer.length){this.port.postMessage(this.buffer);this.buffer=new Float32Array(1024);this.used=0;}
    }
    return true;
  }
}
registerProcessor('open-translate-capture',OpenTranslateCapture);
