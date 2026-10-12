// Firefox/Safari do not implement Chrome's TRUSTED_CONTEXTS access restriction.
// Their content-script IndexedDB uses the website origin, so credentials live only
// in the extension origin's database; storage.local is never the durable vault.
export function createSettingsStore(api,openDatabase=()=>indexedDB.open('open-translate-private',1)) {
  let ready;
  const database=()=>ready ||= new Promise((resolve,reject)=>{
    const request=openDatabase();
    request.onupgradeneeded=()=>request.result.createObjectStore('settings');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  async function access(mode,value) {
    const db=await database();return new Promise((resolve,reject)=>{
      const transaction=db.transaction('settings',mode),table=transaction.objectStore('settings');
      const request=mode==='readonly'?table.get('connection'):table.put(value,'connection');
      transaction.oncomplete=()=>resolve(request.result);transaction.onerror=()=>reject(transaction.error);
    });
  }
  if(api.storage.local.setAccessLevel) {
    const restricted=api.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
    return {async get(){await restricted;return (await api.storage.local.get('settings')).settings;},async set(settings){await restricted;await api.storage.local.set({settings});}};
  }
  // Only inspect legacy storage once. Later writes from a content context must
  // never overwrite the trusted configuration through a migration side door.
  const migrated=(async()=>{const saved=await access('readonly');const {settings}=await api.storage.local.get('settings');if(!saved && settings)await access('readwrite',settings);await api.storage.local.remove('settings');})();
  return {async get(){await migrated;return access('readonly');},async set(settings){await migrated;await access('readwrite',settings);}};
}
