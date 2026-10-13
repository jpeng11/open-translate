// Optional live/paid comparison. Never logs the connection file or credentials.
// First obtain the sample with benchmark-page.mjs; this compares identical text.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DEFAULTS,validateSettings,endpoint,translationPrompt,parseJson,orderedResult,responseJson} from '../extension/src/core.mjs';
const [connection,sampleFile,output,...models]=process.argv.slice(2);
if(!output)throw Error('Usage: node scripts/benchmark-models.mjs /private/connection.json page-speed-translations.json report.json [model ...]');
const supplied=JSON.parse(await readFile(connection,'utf8'));
const config=validateSettings({...DEFAULTS,...supplied,provider:'openai',model:models[0] || supplied.model});
const sample=JSON.parse(await readFile(sampleFile,'utf8'));
if(!Array.isArray(sample.items) || !sample.items.length || sample.items.length>32 || sample.items.some(x=>typeof x.source!=='string'))throw Error('Expected 1–32 source paragraphs from the page benchmark.');
const texts=sample.items.map(x=>x.source),items=texts.map((text,id)=>({text,id}));
if(texts.join('').length>20000)throw Error('Sample exceeds 20,000 characters.');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const report={schema:1,startedAt:new Date().toISOString(),sourceUrl:sample.sourceUrl,sample:{paragraphs:texts.length,words:texts.join(' ').trim().split(/\s+/).length,sha256:hash(texts)},sourceLanguage:'en',targetLanguage:'zh-CN',method:'Sequential identical plain-text requests; stream=false, max_tokens=6000, no application cache. Includes endpoint routing and generation; excludes browser rendering. One run per model; upstream caching and load are uncontrolled. Item/Chinese checks do not certify semantic completeness.',runs:[]};
for(const model of models.length?models:[config.model]){
 const run={model,startedAt:new Date().toISOString(),reasoningEffort:config.reasoningEffort || 'model default',jsonMode:config.jsonMode};report.runs.push(run);
 console.log(JSON.stringify({event:'start',model}));const start=performance.now();
 try{
  const body={model,messages:translationPrompt({source_lang:'en',target_lang:'zh-CN'},items),stream:false,max_tokens:6000};
  if(config.reasoningEffort)body.reasoning_effort=config.reasoningEffort;
  if(config.jsonMode)body.response_format={type:'json_object'};
  const headers={'Content-Type':'application/json'};if(config.apiKey)headers.Authorization='Bearer '+config.apiKey;
  const response=await fetch(endpoint(config.apiUrl),{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(config.timeout*1000)});
  run.httpStatus=response.status;
  const data=await responseJson(response);run.completeMs=Math.round(performance.now()-start);
  const usage=data.usage || {};
  run.usage={promptTokens:usage.prompt_tokens,completionTokens:usage.completion_tokens,reasoningTokens:usage.completion_tokens_details?.reasoning_tokens,cachedTokens:usage.prompt_tokens_details?.cached_tokens};
  const choice=data.choices?.[0];run.finishReason=choice?.finish_reason;
  if(choice?.finish_reason!=='stop' || choice.message?.refusal || choice.message?.tool_calls?.length || choice.message?.function_call)throw Error('Incomplete model answer');
  const result=orderedResult(parseJson(choice.message?.content),items.map(i=>i.id));
  run.chineseParagraphs=result.filter(x=>/\p{Script=Han}/u.test(x.text)).length;
  run.characters=result.reduce((sum,x)=>sum+x.text.length,0);
  if(run.chineseParagraphs!==texts.length)throw Error('Missing Chinese paragraphs');
  run.status='passed';run.outputSha256=hash(result);
 }catch(error){run.status='failed';run.elapsedMs=Math.round(performance.now()-start);run.error=error.name==='TimeoutError'?'Request timeout':error.code || (run.httpStatus===200?'Invalid or incomplete translation':'Request failed');}
 console.log(JSON.stringify(run));await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
