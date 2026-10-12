import {DEFAULTS,validateSettings,publicSettings,validateJob,TranslationError} from './core.mjs';
import {createEngine} from './engine.mjs';
const api=globalThis.browser || chrome;
const engine=createEngine();
let creating;
// Chromium content scripts must not read stored provider credentials.
const ready=api.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'}) || Promise.resolve();
async function settings() {await ready;return {...DEFAULTS,...(await api.storage.local.get('settings')).settings};}
const trusted=sender=>sender.id===api.runtime.id && sender.url?.startsWith(api.runtime.getURL(''));
async function engineCall(type,job,config) {
  if(!api.offscreen) return type==='engine.clear'?engine.clear():engine.translate(job,config);
  const contexts=await api.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[api.runtime.getURL('engine.html')]});
  if(!contexts.length) {
    creating ||= api.offscreen.createDocument({url:'engine.html',reasons:['WORKERS'],justification:'Keep the user-owned translation engine available during long local model requests.'}).finally(()=>creating=null);
    await creating;
  }
  const response=await api.runtime.sendMessage({destination:'engine',type,job,settings:config});
  if(!response?.ok)throw new TranslationError(response?.error?.code || 'engine_unavailable',response?.error?.message || 'Translation engine is unavailable.');
  return response.result;
}
async function activeCommand(type,extra={}) {
  const [tab]=await api.tabs.query({active:true,currentWindow:true});
  if(!tab?.id)throw new Error('Open a webpage first.');
  try {return await api.tabs.sendMessage(tab.id,{type,...extra});}
  catch {throw new Error('This browser page cannot be translated. Open a normal website and reload it after installing the extension.');}
}
async function handle(message,sender) {
  if(sender.id!==api.runtime.id)throw new Error('Unknown extension sender.');
  if(message.type==='keepalive')return {};
  if(message.type==='settings.public')return publicSettings(await settings(),sender.url);
  if(message.type==='translate') {
    const config=await settings();
    if(sender.tab && publicSettings(config,sender.url).disabled)throw new Error('Translation is disabled by the site rule.');
    return engineCall('engine.translate',validateJob(message.job),config);
  }
  if(!trusted(sender))throw new Error('This action is available only in Open Translate.');
  switch(message.type) {
    case 'settings.get':return settings();
    case 'settings.save':{const config=validateSettings(message.settings);await api.storage.local.set({settings:config});await engineCall('engine.clear');return config;}
    case 'cache.clear':await engineCall('engine.clear');return {};
    case 'page.command':return activeCommand(message.command,message.options);
    case 'image.pending':{const {pendingImage}=await api.storage.session.get('pendingImage');await api.storage.session.remove('pendingImage');if(!pendingImage || Date.now()-pendingImage.time>600000)return {};return engineCall('engine.image',{url:pendingImage.url},await settings());}
    case 'capture':{const [tab]=await api.tabs.query({active:true,currentWindow:true});return {image:await api.tabs.captureVisibleTab(tab.windowId,{format:'png'})};}
    case 'transcribe':return engineCall('engine.transcribe',message,await settings());
    default:throw new Error('Unknown Open Translate action.');
  }
}
api.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.destination==='engine')return false;
  handle(message || {},sender).then(result=>reply({ok:true,result}),error=>reply({ok:false,error:{code:error.code || 'request_failed',message:error.message || 'Request failed.'}}));
  return true;
});
api.runtime.onInstalled.addListener(()=>{
  api.contextMenus.removeAll().then(()=>{
    api.contextMenus.create({id:'translate-selection',title:'Translate selection with Open Translate',contexts:['selection']});
    api.contextMenus.create({id:'translate-page',title:'Translate page with Open Translate',contexts:['page']});
    api.contextMenus.create({id:'translate-input',title:'Translate this input with Open Translate',contexts:['editable']});
    api.contextMenus.create({id:'translate-image',title:'Translate image with Open Translate',contexts:['image']});
  }).catch(()=>{});
});
api.contextMenus.onClicked.addListener((info,tab)=>{
  if(info.menuItemId==='translate-image')api.storage.session.set({pendingImage:{url:info.srcUrl,time:Date.now()}}).then(()=>api.tabs.create({url:api.runtime.getURL('app.html#images')})).catch(()=>{});
  else api.tabs.sendMessage(tab.id,{type:info.menuItemId,selection:info.selectionText},{frameId:info.frameId || 0}).catch(()=>{});
});
api.commands.onCommand.addListener(command=>activeCommand(command).catch(()=>{}));
