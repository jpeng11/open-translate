import {transcribe} from './speech.mjs';
import {createEngine} from './engine.mjs';
const engine=createEngine();
self.onmessage=({data})=>{
  (data.type==='engine.clear'?engine.clear():data.type==='engine.transcribe'?transcribe(data.job,data.settings):engine.translate(data.job,data.settings))
    .then(result=>postMessage({id:data.id,ok:true,result}),error=>postMessage({id:data.id,ok:false,error:{code:error.code || 'translation_failed',message:error.message}}));
};
