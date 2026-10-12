import test from 'node:test';
import assert from 'node:assert/strict';
import {validateComparison} from '../../scripts/parity-evidence.mjs';
const reference={version:'1.33.3',commit:'pinned',contentSha256:'original-hash'};
const sample=()=>({schema:1,reference,implementationSha256:'current',buildEvidence:{schema:1,implementationSha256:'current',bundleSha256:'a'.repeat(64)},status:'differences-or-unknowns',cases:[
 {name:'visible-text',status:'matched',original:{status:'observed',value:'Bonjour'},replacement:{status:'observed',value:'Bonjour'}},
 {name:'links',status:'different',original:{status:'observed',value:false},replacement:{status:'observed',value:true}},
 {name:'input',status:'reference-unresolved',original:{status:'unobserved'},replacement:{status:'observed',value:'Bonjour'}}]});
test('comparison evidence keeps mismatches and original unknowns separate from matches',()=>{
 assert.deepEqual(validateComparison(sample(),reference,'current'),{matched:1,different:1,'reference-unresolved':1});
 const falsePass=sample();falsePass.status='passed';assert.throws(()=>validateComparison(falsePass,reference,'current'));
 const falseMatch=sample();falseMatch.cases[1].status='matched';assert.throws(()=>validateComparison(falseMatch,reference,'current'));
 const missingObservation=sample();missingObservation.cases[0].original.status='unobserved';assert.throws(()=>validateComparison(missingObservation,reference,'current'));
});
test('comparison evidence rejects stale implementations, changed originals and duplicate cases',()=>{
 assert.throws(()=>validateComparison(sample(),reference,'later'));
 assert.throws(()=>validateComparison(sample(),{...reference,commit:'other'},'current'));
 const duplicate=sample();duplicate.cases.push(duplicate.cases[0]);assert.throws(()=>validateComparison(duplicate,reference,'current'));
});
