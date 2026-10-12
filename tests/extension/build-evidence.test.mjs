import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bundleDigest,verifyBuildEvidence} from '../../scripts/parity-source.mjs';
test('reference acceptance rejects modified, augmented and stale browser bundles',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'open-translate-build-proof-'));
 try{
  await writeFile(join(directory,'content.js'),'original built code');
  const value={schema:1,implementationSha256:'source',bundleSha256:await bundleDigest(directory)};
  await writeFile(join(directory,'build-evidence.json'),JSON.stringify(value));
  assert.deepEqual(await verifyBuildEvidence(directory,'source'),value);
  await assert.rejects(verifyBuildEvidence(directory,'later-source'));
  await writeFile(join(directory,'content.js'),'mutated code');
  await assert.rejects(verifyBuildEvidence(directory,'source'));
  await writeFile(join(directory,'content.js'),'original built code');
  await writeFile(join(directory,'injected.js'),'new script');
  await assert.rejects(verifyBuildEvidence(directory,'source'));
 }finally{await rm(directory,{recursive:true,force:true});}
});
