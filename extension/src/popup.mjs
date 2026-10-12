import {mountRareUI} from '../ui/mount.tsx';
import {$,api,send,status,languages} from './ui.mjs';
languages();let settings;
send({type:'settings.get'}).then(config=>{settings=config;$('target').value=config.target;$('mode').value=config.mode;}).catch(error=>status('status',error.message,true));
for(const id of ['translate-page','page.restore','translate-selection','translate-input','captions.toggle'])$(id).onclick=async()=>{
  try {
    if(!settings)throw new Error('Settings are still loading.');
    if(settings.target!==$('target').value || settings.mode!==$('mode').value)settings=await send({type:'settings.save',settings:{...settings,target:$('target').value,mode:$('mode').value}});
    const response=await send({type:'page.command',command:id==='translate-page'?'page.start':id});
    if(response?.ok===false)throw new Error(response.error);
    status('status',id==='page.restore'?'Original page restored.':'Ready. Translation appears on the page.');
  }catch(error){status('status',error.message,true);}
};
$('workspace').onclick=()=>api.runtime.openOptionsPage();

mountRareUI();
