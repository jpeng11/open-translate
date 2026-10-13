import test from 'node:test';
import assert from 'node:assert/strict';
import {readingWindow,viewportOrder} from '../../extension/src/page-window.mjs';
const article=Array.from({length:200},(_,id)=>({id,top:id*500,bottom:id*500+480,characters:500}));
test('long-page prefetch fills two waves and stays bounded by paragraphs and source characters',()=>{
 const selected=readingWindow(article,{height:900,batchSize:3,concurrency:6});assert.equal(selected.length,36);assert.deepEqual(selected.map(x=>x.id),Array.from({length:36},(_,i)=>i));
 assert.equal(readingWindow(article,{height:900,batchSize:16,concurrency:8}).length,64);
 assert.equal(readingWindow(article.map(x=>({...x,characters:8000})),{height:900,batchSize:3,concurrency:6}).length,6);
 assert.equal(readingWindow(article,{height:900,batchSize:1,concurrency:1}).length,2);
});
test('scrolling reprioritizes the new viewport instead of submitting the old document prefix',()=>{
 const moved=article.map(x=>({...x,top:x.top-50000,bottom:x.bottom-50000}));
 const selected=readingWindow(moved,{height:900,batchSize:3,concurrency:6});assert.deepEqual(selected.slice(0,2).map(x=>x.id),[100,101]);assert.ok(!selected.some(x=>x.id===0));
 assert.deepEqual(viewportOrder([moved[0],moved[100],moved[101]],900).map(x=>x.id),[100,101,0]);
});
test('short articles remain eager and oversized first paragraphs are not silently skipped',()=>{
 assert.equal(readingWindow(article.slice(0,16),{height:900,eager:true}).length,16);
 assert.equal(readingWindow([{...article[0],characters:50000}],{height:900}).length,1);
});
test('a small configured window never strands paragraphs that are already visible',()=>{
 const visible=article.slice(0,20).map((x,i)=>({...x,top:i*20,bottom:i*20+18,characters:8000}));
 assert.equal(readingWindow([...visible,...article.slice(20)],{height:900,batchSize:1,concurrency:1}).length,20);
});
