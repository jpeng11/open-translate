import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_LANGUAGES,resolveLocale,t} from '../../extension/src/i18n.mjs';
import {MESSAGES} from '../../extension/src/ui-messages.mjs';
test('interface locale resolves browser regional tags and falls back predictably',()=>{assert.equal(resolveLocale(['zh-TW']),'zh');assert.equal(resolveLocale(['fr-CA','en-US']),'fr');assert.equal(resolveLocale(['de-DE','ja-JP']),'ja');assert.equal(resolveLocale(['de-DE']),'en');assert.equal(resolveLocale([]),'en');assert.equal(resolveLocale(['ko_KR']),'ko');});
test('every catalog entry has five translations and retains substitution fields',()=>{for(const [key,values]of Object.entries(MESSAGES)){for(const [code]of UI_LANGUAGES){const translated=t(key,code);assert.ok(translated.trim(),`${key}/${code}`);if(code!=='en')assert.equal(typeof values[code],'string',`${key}/${code}`);assert.deepEqual(translated.match(/\{\w+\}/g)?.sort()||[],key.match(/\{\w+\}/g)?.sort()||[]);}}assert.equal(t('Provider model abc123','fr'),'Provider model abc123');assert.equal(t('Save & test','en'),'Save & test');});
