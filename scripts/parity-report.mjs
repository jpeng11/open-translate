import {implementationDigest} from './parity-source.mjs';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(await readFile('docs/parity/baseline.json','utf8'));
const evidence=JSON.parse(await readFile('docs/parity/reference-results.json','utf8'));
if(evidence.status!=='passed' || evidence.reference.commit!==baseline.reference.commit || evidence.reference.version!==baseline.reference.version)throw new Error('Missing or incompatible reference acceptance evidence.');
if(evidence.implementationSha256!==await implementationDigest())throw new Error('Reference evidence is stale for this implementation; rebuild and rerun parity:reference.');
const allowed=new Set(['verified','partial','unverified']);
for(const area of baseline.areas){if(!allowed.has(area.status))throw new Error('Invalid parity state.');for(const path of area.replacementTests)await access(path);for(const name of area.originalCases || [])if(!evidence.cases.includes(name))throw new Error('Missing reference case: '+name);if(area.status==='verified' && (!area.originalCases?.length || area.remaining))throw new Error('A verified area needs complete paired original evidence and no known outstanding acceptance.');}
const outstanding=baseline.areas.filter(area=>area.status!=='verified');
const report={reference:baseline.reference,referenceEvidenceSha256:createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),fullParity:outstanding.length===0,pairedReferenceCases:evidence.cases.length,areas:baseline.areas};
await mkdir('dist/parity',{recursive:true});await writeFile('dist/parity/report.json',JSON.stringify(report,null,2)+'\n');
console.log(`Pinned original: ${baseline.reference.version} (${baseline.reference.commit.slice(0,7)})`);console.log(`Paired reference cases: ${evidence.cases.length}; complete product parity: ${report.fullParity?'VERIFIED':'NOT VERIFIED'}`);for(const area of baseline.areas)console.log(`${area.status.padEnd(10)} ${area.id}: ${area.remaining || 'paired acceptance complete'}`);
if(process.argv.includes('--strict') && outstanding.length)process.exitCode=1;
