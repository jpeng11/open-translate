import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSubtitles,exportSubtitles,subtitleSeconds} from '../../extension/src/subtitles.mjs';
test('SRT preserves timing, markup and multiline cue order',()=>{
 const input='1\n00:00:01,000 --> 00:00:03,250\nBonjour\nmonde\n\n2\n00:00:04,000 --> 00:00:05,000\nMerci';
 const doc=parseSubtitles(input);assert.equal(doc.cues.length,2);
 const output=exportSubtitles(doc,['Hello\nworld','Thanks'],true);
 assert.ok(output.includes('00:00:01,000 --> 00:00:03,250\nBonjour\nmonde\nHello\nworld'));
 assert.equal(subtitleSeconds(doc.cues[0].end),3.25);
});
test('VTT retains header, cue identifiers and settings',()=>{
 const doc=parseSubtitles('WEBVTT\n\nintro\n00:01.000 --> 00:02.000 align:start\nBonjour','vtt');
 assert.equal(exportSubtitles(doc,['Hello'],false),'WEBVTT\n\nintro\n00:01.000 --> 00:02.000 align:start\nHello');
});
test('ASS keeps style fields and commas inside text',()=>{
 const input='[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Bonjour, monde';
 const doc=parseSubtitles(input,'ass');assert.equal(doc.cues[0].text,'Bonjour, monde');
 assert.ok(exportSubtitles(doc,['Hello, world'],true).endsWith('Bonjour, monde\\NHello, world'));
});
test('untimed and malformed subtitle inputs fail explicitly',()=>{
 assert.throws(()=>parseSubtitles('plain text'));assert.throws(()=>parseSubtitles('1\ninvalid --> timestamp\nBonjour'));
});
