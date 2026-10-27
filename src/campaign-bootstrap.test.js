import test from 'node:test';
import assert from 'node:assert/strict';
import {bootCampaign} from './campaign-bootstrap.js';
import {createCampaign,issuePlan} from './campaign-state.js';
test('published page starts a usable campaign without uploading JSON or contacting internal services',async()=>{
  let loaded,fetches=0;
  await bootCampaign({local:false,fetchConfig:async()=>{fetches++;throw new Error('must not fetch');},load:async c=>{loaded=createCampaign(c);}});
  assert.ok(loaded?.tasks.length>0);assert.ok(loaded.pallets.every(p=>p.initial===9999000));assert.ok(issuePlan(loaded).length>0);assert.equal(fetches,0);assert.equal(loaded.config.sourceLabel,'公开自定义教学样例（非接口配置）');
});
test('local page prefers private interface configuration',async()=>{
  let loaded;const privateConfig={campaign:'PRIVATE',units:[],lines:[],stock:[]};
  await bootCampaign({local:true,fetchConfig:async()=>privateConfig,load:async c=>{loaded=c;}});
  assert.equal(loaded.campaign,'PRIVATE');assert.equal(loaded.sourceLabel,'本机接口快照配置');
});
test('missing or invalid local configuration falls back visibly to public sample',async()=>{
  let loaded;await bootCampaign({local:true,fetchConfig:async()=>{throw new Error('not found');},load:async c=>{loaded=c;}});
  assert.equal(loaded.sourceLabel,'公开自定义教学样例（非接口配置）');assert.match(loaded.loadNote,/本机配置未载入/);
});
