import {implementationDigest} from './parity-source.mjs';
import {validateComparison} from './parity-evidence.mjs';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(await readFile('docs/parity/baseline.json','utf8'));
const evidence=JSON.parse(await readFile('docs/parity/reference-results.json','utf8'));
const digest=await implementationDigest();
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
if(evidence.status!=='passed' || evidence.reference.commit!==baseline.reference.commit || evidence.reference.version!==baseline.reference.version)throw new Error('Missing or incompatible reference acceptance evidence.');
if(evidence.implementationSha256!==digest)throw new Error('Reference evidence is stale for this implementation; rebuild and rerun parity:reference.');
const suites=[];
for(const suite of baseline.comparisonSuites || []){
 if(!baseline.areas.some(area=>area.id===suite.area))throw new Error('Unknown comparison area: '+suite.area);
 const result=JSON.parse(await readFile(suite.path,'utf8'));
 suites.push({...suite,counts:validateComparison(result,evidence.reference,digest),evidenceSha256:sha(result),cases:result.cases});
}
const allowed=new Set(['verified','partial','unverified']);
for(const area of baseline.areas){
 if(!allowed.has(area.status))throw new Error('Invalid parity state.');
 for(const path of area.replacementTests)await access(path);
 for(const name of area.originalCases || [])if(!evidence.cases.includes(name))throw new Error('Missing reference case: '+name);
 if(area.status==='verified' && (!area.originalCases?.length || area.remaining || suites.some(suite=>suite.area===area.id && (suite.counts.different || suite.counts['reference-unresolved']))))throw new Error('A verified area needs complete paired original evidence and no known outstanding acceptance.');
}
const outstanding=baseline.areas.filter(area=>area.status!=='verified');
const report={reference:baseline.reference,implementationSha256:digest,referenceEvidenceSha256:sha(evidence),fullParity:outstanding.length===0,pairedReferenceCases:evidence.cases.length+suites.reduce((sum,suite)=>sum+suite.counts.matched,0),comparisonSuites:suites,areas:baseline.areas};
await mkdir('dist/parity',{recursive:true});await writeFile('dist/parity/report.json',JSON.stringify(report,null,2)+'\n');
console.log(`Pinned original: ${baseline.reference.version} (${baseline.reference.commit.slice(0,7)})`);
console.log(`Matched paired reference cases: ${report.pairedReferenceCases}; complete product parity: ${report.fullParity?'VERIFIED':'NOT VERIFIED'}`);
for(const suite of suites)console.log(`${suite.id}: ${suite.counts.matched} matched; ${suite.counts.different} different; ${suite.counts['reference-unresolved']} reference unresolved`);
for(const area of baseline.areas)console.log(`${area.status.padEnd(10)} ${area.id}: ${area.remaining || 'paired acceptance complete'}`);
if(process.argv.includes('--strict') && outstanding.length)process.exitCode=1;
