import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryState, act, ledger, scaleStatus, traceTag, chapterReady } from './factory-state.js';
function ok(s, type, payload = {}, now = 0) {
  const r = act(s, type, payload, now);
  assert.equal(r.ok, true, `${type}: ${r.message}`); return r.state;
}
function received(mode = 'bucket') {
  let s=createFactoryState(mode);
  for(const p of Object.values(s.pallets).filter(p=>p.warehouse==='wms'))s=ok(s,'issue',{palletId:p.id,grams:p.initialGrams,campaign:'DEMO-P01',batch:'DEMO-A'});
  return ok(ok(s,'receive',{campaign:'DEMO-P01',batch:'DEMO-A'}),'advance');
}
function printed(s) {
  for (const job of s.printJobs.filter(j=>j.status!=='printed')) s=ok(s,'print',{jobId:job.id});
  for (const tag of Object.values(s.tags).filter(t=>t.kind!=='raw'&&!t.attached)) s=ok(s,'attach',{tagId:tag.id,bucket:tag.bucket});
  return s;
}
function preparedSources(mode='bucket', include20=false) {
  let s=received(mode);
  if(mode!=='bag')s=ok(s,'unpack',{sourceId:'SMALL-RAW'});
  return printed(s);
}
const sourceId=(s,root)=>s.unpackedSources[root]||root;
function packaged() {
  let s=preparedSources();s=ok(s,'scan',{sourceId:'RAW-77'});
  return printed(ok(s,'package',{count:3,labelType:'bucket'}));
}
function readyToFeed() {
  let s=packaged();
  for(const bucket of [1,2,3]){
    s=ok(s,'tare',{},10);s=ok(s,'gross',{grams:600},100);s=printed(ok(s,'weigh',{bucket},1100));
  }
  s=printed(ok(s,'prepare-tea'));
  return ok(s,'advance');
}
test('receiving validates campaign and batch before unpacking',()=>{
  const s=createFactoryState();assert.equal(act(s,'advance').ok,false);
  assert.equal(act(s,'unpack',{sourceId:'RAW-77'}).ok,false);
  assert.equal(act(s,'receive',{campaign:'DEMO-P02',batch:'DEMO-A'}).ok,false);
  assert.equal(act(s,'receive',{campaign:'DEMO-P01',batch:'DEMO-B'}).ok,false);
  assert.equal(ledger(s).receivedGrams,0);
});
test('unpacking is limited to loose weighing and does not complete preparation or feeding',()=>{
  let s=received();assert.equal(s.chapter,1);
  s=ok(s,'scan',{sourceId:'RAW-77'});
  s=ok(s,'package',{count:3,labelType:'bucket'});
  assert.equal(act(s,'weigh',{bucket:1},5000).ok,false);
  assert.equal(act(s,'unpack',{sourceId:'RAW-77'}).ok,false);
  s=ok(s,'unpack',{sourceId:'SMALL-RAW'});
  const id=sourceId(s,'SMALL-RAW'),t=s.tags[id];
  assert.equal(t.kind,'unpack');
  assert.deepEqual(t.parentIds,['SMALL-RAW']);assert.equal(t.remainingGrams,5000);
  assert.equal(s.tags['SMALL-RAW'].remainingGrams,0);assert.equal(ledger(s).remainingGrams,105000);
  assert.equal(ledger(s).fedGrams,0);assert.equal(s.packageTasks.filter(t=>t.done).length,3);
  assert.equal(act(s,'advance').ok,false);
  const job=s.printJobs.find(j=>j.id===t.jobId);s=ok(s,'print',{jobId:job.id,fail:true});
  assert.equal(act(s,'attach',{tagId:id,bucket:0}).ok,false);s=printed(s);
  assert.equal(chapterReady(s),false);s=printed(s);
});
test('20kg signed whole-pack source cannot complete 25kg; duplicate scans cannot inflate balance',()=>{
  let s=preparedSources('bucket',true),id='RAW-20';s=ok(s,'scan',{sourceId:id});
  assert.equal(act(s,'scan',{sourceId:id}).ok,false);
  const r=act(s,'package',{count:1,labelType:'bucket'});assert.equal(r.ok,false);
  assert.equal(r.state.tags[id].remainingGrams,20000);assert.equal(r.state.selectedSources.length,1);
  assert.equal(r.state.packageTasks.filter(t=>t.done).length,0);
});
test('whole-package route accepts signed pallet codes and rejects wrong or unsigned sources',()=>{
  let s=preparedSources();
  for(const id of ['WRONG','UNSIGNED'])assert.equal(act(s,'scan',{sourceId:id}).ok,false);
  s=ok(s,'scan',{sourceId:'RAW-77'});
  for(const count of [4,0,-1,1.5,NaN])assert.equal(act(s,'package',{count,labelType:'bucket'}).ok,false);
});
test('77kg signed pallet source yields 75kg whole-package preparation and 2kg balance',()=>{
  let s=preparedSources(),id='RAW-77';s=ok(s,'scan',{sourceId:id});const before=structuredClone(s);
  s=ok(s,'package',{count:3,labelType:'bucket'});
  assert.equal(before.tags[id].remainingGrams,77000);assert.equal(s.tags[id].remainingGrams,2000);
  assert.equal(s.tags['RAW-20'].remainingGrams,20000);
  const labels=Object.values(s.tags).filter(t=>t.kind==='overall');assert.equal(labels.length,3);
  assert.deepEqual(labels.map(t=>t.bucket),[1,2,3]);
  assert.ok(labels.every(t=>t.grams===25000&&t.parentIds.includes(id)));
  assert.deepEqual(traceTag(s,labels[0].id).map(t=>t.kind),['overall','raw']);
  assert.equal(ledger(s).differenceGrams,0);assert.equal(chapterReady(s),false);
});
test('printing recovery changes neither quantities nor completed tasks',()=>{
  let s=preparedSources();s=ok(s,'scan',{sourceId:sourceId(s,'RAW-77')});s=ok(s,'package',{count:3,labelType:'bucket'});
  const job=s.printJobs.at(-1),ids=[...job.tagIds],before=ledger(s);
  s=ok(s,'print',{jobId:job.id,fail:true});assert.equal(s.printJobs.at(-1).status,'failed');
  assert.equal(s.packageTasks.filter(t=>t.done).length,3);
  assert.equal(act(s,'package',{count:3,labelType:'bucket'}).ok,false);
  assert.equal(act(s,'attach',{tagId:ids[0],bucket:1}).ok,false);
  s=ok(s,'print',{jobId:job.id});s=ok(s,'print',{jobId:job.id});assert.deepEqual(ledger(s),before);
  assert.deepEqual(s.printJobs.at(-1).tagIds,ids);
  assert.equal(act(s,'attach',{tagId:ids[0],bucket:2}).ok,false);
  assert.equal(chapterReady(printed(s)),false,'small ingredient and tea preparation are still missing');
});
test('bag course uses signed whole packages directly and creates six labels for three tasks',()=>{
  let s=preparedSources('bag');s=ok(s,'scan',{sourceId:'RAW-150'});
  s=ok(s,'package',{count:3,labelType:'bag'});const tags=Object.values(s.tags).filter(t=>t.kind==='overall');
  assert.equal(tags.length,6);assert.ok(tags.every(t=>t.grams===25000));
  assert.equal(s.packageTasks.filter(t=>t.done).length,3);s=ok(printed(s),'advance');
  assert.equal(s.finished,true);assert.equal(ledger(s).fedGrams,0);
});
test('loose weighing and whole-package preparation can run independently in one preparation area',()=>{
  let s=preparedSources();s=ok(s,'tare',{},0);s=ok(s,'gross',{grams:600},100);s=ok(s,'weigh',{bucket:1},1100);
  assert.equal(s.smallTasks[0].done,true);assert.equal(s.packageTasks.some(t=>t.done),false);
  assert.equal(act(s,'feed',{tagId:s.smallTasks[0].tagIds[0],bucket:1,device:'M-01'}).ok,false);
});
test('weighing checks empty tare, net weight, stability and source inheritance',()=>{
  let s=packaged();assert.equal(act(s,'weigh',{bucket:1},5000).ok,false);
  s=ok(s,'gross',{grams:600},10);assert.equal(act(s,'tare',{},20).ok,false);
  s=ok(s,'gross',{grams:100},30);s=ok(s,'tare',{},40);s=ok(s,'gross',{grams:580},100);
  assert.equal(scaleStatus(s,2000).kind,'under');assert.equal(act(s,'weigh',{bucket:1},2000).ok,false);
  s=ok(s,'gross',{grams:620},100);assert.equal(scaleStatus(s,2000).kind,'over');
  s=ok(s,'gross',{grams:600},200);assert.equal(act(s,'weigh',{bucket:1},1199).ok,false);
  s=ok(s,'weigh',{bucket:1},1200);const t=Object.values(s.tags).find(t=>t.kind==='weigh');
  assert.equal(t.grams,500);assert.equal(s.tags[s.unpackId].remainingGrams,4500);
  assert.deepEqual(traceTag(s,t.id).map(t=>t.kind),['weigh','unpack','raw']);assert.equal(ledger(s).differenceGrams,0);
});
test('scale boundaries are inclusive and each change restarts stability',()=>{
  let s=ok(preparedSources(),'tare',{},0);
  for(const grams of [590,610])assert.equal(scaleStatus(ok(s,'gross',{grams},100),1100).kind,'ready');
  s=ok(s,'gross',{grams:600},100);s=ok(s,'gross',{grams:601},900);assert.equal(scaleStatus(s,1100).kind,'settling');
  assert.equal(act(s,'gross',{grams:Infinity}).ok,false);
});
test('tea is prepared before gathering and both branches must finish before feeding',()=>{
  let s=packaged();assert.equal(chapterReady(s),false);
  s=printed(ok(s,'prepare-tea'));assert.equal(s.teaPrepared,true);assert.equal(act(s,'advance').ok,false);
  assert.ok(Object.values(s.tags).filter(t=>t.kind==='tea').every(t=>t.parentIds.includes('TEA-RAW')));
});
test('gathering rejects wrong buckets, missing items and wrong equipment',()=>{
  let s=readyToFeed();const big=Object.values(s.tags).find(t=>t.kind==='overall');
  assert.equal(act(s,'collect',{tagId:big.id,bucket:2}).ok,false);
  const shortage=act(s,'feed',{tagId:big.id,bucket:1,device:'D-01'});assert.match(shortage.message,/赤藓糖醇.*小料.*茶叶/);
  for(const t of Object.values(s.tags).filter(t=>['overall','weigh','tea'].includes(t.kind)))s=ok(s,'collect',{tagId:t.id,bucket:t.bucket});
  assert.equal(act(s,'feed',{tagId:big.id,bucket:1,device:'E-01'}).ok,false);
  const small=Object.values(s.tags).find(t=>t.kind==='weigh');assert.equal(act(s,'feed',{tagId:small.id,bucket:1,device:'M-01'}).ok,false);
});
test('corrected full flow conserves quantities and rejects repeated feeding',()=>{
  let s=readyToFeed();const tags=Object.values(s.tags).filter(t=>['overall','weigh','tea'].includes(t.kind));
  for(const t of tags)s=ok(s,'collect',{tagId:t.id,bucket:t.bucket});
  for(const kind of ['overall','tea','weigh'])for(const t of tags.filter(t=>t.kind===kind))s=ok(s,'feed',{tagId:t.id,bucket:t.bucket,device:{overall:'D-01',tea:'E-01',weigh:'M-01'}[kind]});
  assert.equal(act(s,'feed',{tagId:tags[0].id,bucket:1,device:'D-01'}).ok,false);
  assert.deepEqual(ledger(s),{receivedGrams:105000,remainingGrams:25500,fedGrams:79500,differenceGrams:0});
  assert.equal(s.tags['RAW-20'].remainingGrams,20000);s=ok(s,'advance');assert.equal(s.finished,true);
});
test('preparation labels are displayed as prepared, never as feeding',async()=>{
  const {tagDesk}=await import('./factory-panels.js');
  const s=printed(ok(packaged(),'prepare-tea'));
  const html=tagDesk(s,'all');
  assert.match(html,/整包码/);
  assert.match(html,/茶叶整包备料码/);
  assert.doesNotMatch(html,/已投料/);
  assert.equal(s.feeds.length,0);
});

test('whole-package preparation uses signed pallet material directly without unpacking',()=>{
  let s=received();
  assert.equal(s.chapter,1);
  assert.equal(Object.values(s.tags).some(t=>t.kind==='unpack'&&t.material==='BULK'),false);
  s=ok(s,'scan',{sourceId:'RAW-77'});
  s=ok(s,'package',{count:3,labelType:'bucket'});
  const labels=Object.values(s.tags).filter(t=>t.kind==='overall');
  assert.equal(labels.length,3);
  assert.ok(labels.every(t=>t.parentIds.includes('RAW-77')));
  assert.deepEqual(traceTag(s,labels[0].id).map(t=>t.kind),['overall','raw']);
});

test('only loose weighing requires unpacking and empty-container tare in the preparation area',()=>{
  let s=received();
  assert.equal(act(s,'tare',{},0).ok,false,'cannot tare before the loose material is unpacked');
  s=ok(s,'unpack',{sourceId:'SMALL-RAW'});
  s=printed(s);
  assert.equal(act(s,'weigh',{bucket:1},2000).ok,false,'loose weighing still requires tare');
  s=ok(s,'tare',{},0);
  s=ok(s,'gross',{grams:600},100);
  s=ok(s,'weigh',{bucket:1},1100);
  const label=Object.values(s.tags).find(t=>t.kind==='weigh');
  assert.deepEqual(traceTag(s,label.id).map(t=>t.kind),['weigh','unpack','raw']);
});
