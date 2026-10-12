import {mountRareUI} from '../ui/mount.tsx';
import {$,api,send,status,languages} from './ui.mjs';
languages();let settings;
send({type:'settings.get'}).then(config=>{settings=config;$('source').value=config.source;$('service').textContent=config.provider==='bridge'?'Local agent bridge ↗':`${config.model || 'OpenAI-compatible'} ↗`;$('hover-toggle').setAttribute('aria-pressed',String(config.hover));$('target').value=config.target;$('mode').value=config.mode;}).catch(error=>status('status',error.message,true));
for(const id of ['translate-page','page.restore','translate-selection','translate-input','captions.toggle'])$(id).onclick=async()=>{
  try {
    if(!settings)throw new Error('Settings are still loading.');
    if(settings.source!==$('source').value || settings.target!==$('target').value || settings.mode!==$('mode').value)settings=await send({type:'settings.save',settings:{...settings,source:$('source').value,target:$('target').value,mode:$('mode').value}});
    const response=await send({type:'page.command',command:id==='translate-page'?'page.start':id});
    if(response?.ok===false)throw new Error(response.error);
    status('status',id==='page.restore'?'Original page restored.':'Ready. Translation appears on the page.');
  }catch(error){status('status',error.message,true);}
};
for(const [id,route]of [['workspace','settings'],['service','connection'],['documents','documents'],['text','text'],['images','images'],['live','live']])$(id).onclick=()=>api.tabs.create({url:api.runtime.getURL('app.html#'+route)});
$('hover-toggle').onclick=async()=>{try{if(!settings)throw new Error('Settings are still loading.');settings=await send({type:'settings.save',settings:{...settings,hover:!settings.hover}});$('hover-toggle').setAttribute('aria-pressed',String(settings.hover));status('status',settings.hover?'Point at a paragraph and press Alt Shift H.':'Mouse hover translation is off.');}catch(error){status('status',error.message,true);}};

mountRareUI();
