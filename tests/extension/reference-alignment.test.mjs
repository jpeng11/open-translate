import test from 'node:test';import assert from 'node:assert/strict';
import {alignMissingReferences} from '../../extension/src/reference-alignment.mjs';
import {domLayout,treeRepairMarkup} from '../../extension/src/formatted-recovery.mjs';
test('exact unique leaf phrases retain all text and allow sibling reordering without input mutation',()=>{
 const source='<ot0>red</ot0> and <ot1>blue</ot1>',value={root:['bleu puis rouge'],'0':['rouge'],'1':['bleu']},before=structuredClone(value);
 const aligned=alignMissingReferences(value,domLayout(source),new Set());
 assert.equal(treeRepairMarkup(source).restore(aligned),'<ot1>bleu</ot1> puis <ot0>rouge</ot0>');assert.deepEqual(value,before);
});
test('missing, repeated or overlapping matches are rejected instead of guessed',()=>{
 const layout=domLayout('<ot0>one</ot0><ot1>two</ot1>');
 for(const value of [{root:['alpha alpha beta'],'0':['alpha'],'1':['beta']},{root:['alpha'],'0':['alpha'],'1':['beta']},{root:['alpha'],'0':['alpha'],'1':['pha']},{root:['a'],'0':[''],'1':['a']}])assert.equal(alignMissingReferences(value,layout,new Set()),null);
});
test('atoms and omitted parents are never fabricated from plain text',()=>{
 assert.equal(alignMissingReferences({root:['citation'],'0':null},domLayout('<ot0/>'),new Set()),null);
 assert.equal(alignMissingReferences({root:['outer inner'],'0':['outer inner'],'1':['inner']},domLayout('<ot0>outer <ot1>inner</ot1></ot0>'),new Set()),null);
});
test('only the original parent is eligible for matching',()=>{
 const layout=domLayout('<ot0>outer <ot1>inner</ot1></ot0><ot2>other</ot2>');
 const value={root:[{ref:'0'},{ref:'2'}],'0':['outside'],'1':['inside'],'2':['inside']};
 assert.equal(alignMissingReferences(value,layout,new Set(['0','2'])),null);
});
test('matching cannot bisect a Latin word',()=>{
 const layout=domLayout('<ot0>art</ot0>');
 assert.equal(alignMissingReferences({root:['party'],'0':['art']},layout,new Set()),null);
 assert.ok(alignMissingReferences({root:['art.'],'0':['art']},layout,new Set()));
});
