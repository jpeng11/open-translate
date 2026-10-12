import {build} from 'esbuild';
import {readFile,writeFile,mkdir,rm,cp,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {zipSync} from 'fflate';
import {browserManifest} from './browser-manifests.mjs';
import {implementationDigest,bundleDigest} from './parity-source.mjs';
import {patchTesseractWorker} from './ocr-worker-patch.mjs';
const implementationSha256=await implementationDigest();
async function stamp(directory,browser){if(await implementationDigest()!==implementationSha256)throw new Error('Source changed during build; rebuild a stable checkout.');const value={schema:1,browser,implementationSha256,bundleSha256:await bundleDigest(directory)};await writeFile(join(directory,'build-evidence.json'),JSON.stringify(value,null,2)+'\n');}
const output='dist/chrome';await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const entry of ['background','content','engine-host','engine-worker'])await build({entryPoints:[`extension/src/${entry}.mjs`],bundle:true,format:'iife',platform:'browser',target:'chrome116',outfile:`${output}/${entry}.js`,legalComments:'eof'});
execFileSync(process.execPath,['node_modules/@tailwindcss/cli/dist/index.mjs','-i','extension/ui/rare.css','-o',`${output}/rare.css`,'--minify'],{stdio:'inherit'});
await build({entryPoints:['extension/src/app.mjs','extension/src/popup.mjs'],bundle:true,splitting:true,format:'esm',platform:'browser',target:'chrome116',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},outdir:output,legalComments:'eof'});
await cp('extension/pages',output,{recursive:true});await cp('extension/assets',`${output}/assets`,{recursive:true});const manifest=browserManifest(JSON.parse(await readFile('extension/manifest.json','utf8')),'chrome');await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2));
await mkdir(`${output}/vendor/ocr`,{recursive:true});await mkdir(`${output}/vendor/ocr-data`,{recursive:true});
await writeFile(`${output}/vendor/ocr/worker.min.js`,patchTesseractWorker(await readFile('node_modules/tesseract.js/dist/worker.min.js','utf8')));
for(const name of await readdir('node_modules/tesseract.js-core'))if(/-lstm\.(?:wasm|wasm\.js|js)$/.test(name))await cp(`node_modules/tesseract.js-core/${name}`,`${output}/vendor/ocr/${name}`);
for(const lang of ['eng','chi_sim','jpn'])await cp(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,`${output}/vendor/ocr-data/${lang}.traineddata.gz`);
await cp('node_modules/pdfjs-dist/build/pdf.worker.mjs',`${output}/vendor/pdf.worker.mjs`);
for(const [source,destination]of [['cmaps','cmaps'],['standard_fonts','standard_fonts'],['wasm','pdf-wasm']])await cp(`node_modules/pdfjs-dist/${source}`,`${output}/vendor/${destination}`,{recursive:true});
await cp('LICENSE',`${output}/LICENSE`);
await cp('extension/src/audio-worklet.mjs',`${output}/audio-worklet.mjs`);
let notices='Open Translate: MIT. Independent implementation; not affiliated with Immersive Translate.\n\n';
notices+=await readFile('extension/ui/rare/LICENSE','utf8');notices+='\nRare UI https://rareui.com — upstream component provenance in source repository.\n\n';
for(const pkg of ['bidi-js','@pdf-lib/fontkit','react','react-dom','motion','clsx','tailwind-merge','fflate','pdf-lib','pdfjs-dist','tesseract.js','tesseract.js-core']){const meta=JSON.parse(await readFile(`node_modules/${pkg}/package.json`,'utf8'));notices+=`${pkg} ${meta.version} — ${meta.license}\n`;for(const filename of ['LICENSE','LICENSE.md','LICENSE.txt']){try{notices+=await readFile(`node_modules/${pkg}/${filename}`,'utf8');break;}catch{}}notices+='\n\n';}
notices+='OCR language models: Tesseract tessdata, Apache-2.0, packaged by @tesseract.js-data at 1.0.0.\nhttps://github.com/tesseract-ocr/tessdata\n';await writeFile(`${output}/THIRD_PARTY_NOTICES.txt`,notices);
await stamp(output,'chrome');
const entries={};async function collect(dir,prefix=''){for(const item of await readdir(dir,{withFileTypes:true})){const key=prefix+item.name;if(item.isDirectory())await collect(join(dir,item.name),key+'/');else entries[key]=new Uint8Array(await readFile(join(dir,item.name)));}}await collect(output);await writeFile('dist/open-translate-chrome.zip',zipSync(entries,{level:6}));
console.log(`Built Chrome/Edge extension: ${output}; archive: dist/open-translate-chrome.zip (${Math.round((await readFile('dist/open-translate-chrome.zip')).length/1024/1024)} MiB)`);

for(const browser of ['edge','firefox','safari']){const directory=`dist/${browser}`;await rm(directory,{recursive:true,force:true});await cp(output,directory,{recursive:true});const manifest=browserManifest(JSON.parse(await readFile('extension/manifest.json','utf8')),browser);await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest,null,2));await stamp(directory,browser);const browserEntries={...entries,'build-evidence.json':new Uint8Array(await readFile(join(directory,'build-evidence.json'))),'manifest.json':new TextEncoder().encode(JSON.stringify(manifest,null,2))};await writeFile(`dist/open-translate-${browser}.zip`,zipSync(browserEntries,{level:6}));console.log(`Built ${browser}: ${directory}`);}
