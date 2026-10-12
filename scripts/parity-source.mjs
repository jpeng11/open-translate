import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
// Bind paired runtime evidence to implementation inputs, not mutable docs.
export async function implementationDigest(){
 const hash=createHash('sha256');
 async function visit(path){for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(path,entry.name);if(entry.isDirectory())await visit(file);else {hash.update(file+'\0');hash.update(await readFile(file));}}}
 await visit('extension');for(const file of ['package-lock.json','scripts/build.mjs','scripts/browser-manifests.mjs','scripts/ocr-worker-patch.mjs']){hash.update(file+'\0');hash.update(await readFile(file));}return hash.digest('hex');
}
