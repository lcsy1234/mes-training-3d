import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryState, act, ledger } from './factory-state.js';
import { palletBalances, warehouseLedger, receivingProgress, receivingReady } from './warehouse-state.js';
const ok=(s,type,p={})=>{const r=act(s,type,p);assert.equal(r.ok,true,r.message);return r.state;};
const issue=(s,palletId,grams,extra={})=>ok(s,'issue',{palletId,grams,campaign:'DEMO-P01',batch:'DEMO-A',...extra});
const receive=s=>ok(s,'receive',{campaign:'DEMO-P01',batch:'DEMO-A'});
function prep(s,source='RAW-77'){
  return ok(s,'scan',{sourceId:source});
}
function moveToPreparation(s){
  s=ok(s,'advance');
  s=ok(s,'unpack',{sourceId:'SMALL-RAW'});
  for(const j of s.printJobs)s=ok(s,'print',{jobId:j.id});
  for(const t of Object.values(s.tags).filter(t=>t.kind==='unpack'))s=ok(s,'attach',{tagId:t.id,bucket:0});
  return ok(s,'scan',{sourceId:'RAW-77'});
}
test('each pallet code identifies its warehouse, material, batch and independent quantity',()=>{
  const s=createFactoryState();const p=s.pallets['WMS-P02'];
  assert.equal(p.sourceId,'RAW-77');assert.equal(p.warehouse,'wms');assert.equal(p.material,'BULK');
  assert.equal(p.initialGrams,77000);assert.equal(p.batch,'DEMO-A');
  assert.notEqual(p.id,s.pallets['TEMP-P02'].id);assert.equal(ledger(s).receivedGrams,0);
});
test('WMS dispatch generates receipt; source cannot be used until automatic signing',()=>{
  let s=issue(createFactoryState(),'WMS-P02',75000);
  assert.equal(s.issueRecords.length,1);assert.equal(s.receiptOrders.length,1);
  assert.equal(s.receiptOrders[0].status,'pending');assert.equal(s.tags['RAW-77'].received,false);
  assert.equal(palletBalances(s,'WMS-P02').warehouseGrams,2000);
  assert.equal(palletBalances(s,'WMS-P02').signedGrams,0);
  assert.equal(warehouseLedger(s).inTransitGrams,75000);
  assert.equal(act(s,'unpack',{sourceId:'RAW-77'}).ok,false);
  s=receive(s);assert.equal(s.receiptOrders[0].status,'signed');assert.equal(ledger(s).receivedGrams,75000);
  assert.equal(s.tags['RAW-77'].remainingGrams,75000);
  const before=structuredClone(s.pallets);s=receive(s);assert.deepEqual(s.pallets,before);
  assert.equal(s.receiptOrders.length,1);assert.equal(s.issueRecords.length,1);
});
test('virtual warehouse withdrawals automatically sign and always keep an issue record',()=>{
  let s=issue(createFactoryState(),'TEMP-P02',50000);
  assert.equal(s.issueRecords[0].warehouse,'virtual');assert.equal(s.issueRecords[0].status,'signed');
  assert.equal(s.receiptOrders.length,0);assert.equal(s.tags['V-RAW-77'].remainingGrams,50000);
  assert.equal(palletBalances(s,'TEMP-P02').warehouseGrams,27000);
  assert.equal(palletBalances(s,'WMS-P02').warehouseGrams,77000);
  assert.equal(warehouseLedger(s).differenceGrams,0);
});
test('one signed material can enter preparation while missing branches remain visible',()=>{
  let s=issue(createFactoryState(),'TEMP-P02',75000);
  const progress=receivingProgress(s);
  assert.deepEqual(progress.map(x=>[x.material,x.signedGrams,x.ready]),[
    ['BULK',75000,true],['SMALL',0,false],['TEA',0,false],
  ]);
  assert.equal(receivingReady(s),true);
  s=issue(s,'TEMP-P03',1500);s=issue(s,'TEMP-P04',3000);
  assert.equal(receivingReady(s),true);
});
test('invalid or repeated issuance cannot inflate stock or receipt quota',()=>{
  let s=createFactoryState();
  for(const grams of [0,-1,77001,1.5,Infinity])assert.equal(act(s,'issue',{palletId:'WMS-P02',grams,campaign:'DEMO-P01',batch:'DEMO-A'}).ok,false);
  assert.equal(act(s,'receive',{campaign:'DEMO-P01',batch:'DEMO-A'}).ok,false);
  assert.equal(act(s,'issue',{palletId:'MISSING',grams:1,campaign:'DEMO-P01',batch:'DEMO-A'}).ok,false);
  assert.equal(act(s,'issue',{palletId:'WMS-P02',grams:1,campaign:'DEMO-P02',batch:'DEMO-A'}).ok,false);
  s=issue(s,'WMS-P02',50000,{requestKey:'ISSUE-ONCE'});s=issue(s,'WMS-P02',50000,{requestKey:'ISSUE-ONCE'});
  assert.equal(s.issueRecords.length,1);assert.equal(s.receiptOrders.length,1);
  assert.equal(palletBalances(s,'WMS-P02').warehouseGrams,27000);
});
test('a 77kg pallet signed for 75kg permits only 75kg preparation, preserving 2kg',()=>{
  let s=createFactoryState();for(const [id,grams]of [['WMS-P02',75000],['WMS-P03',1500],['WMS-P04',3000]])s=issue(s,id,grams);
  s=moveToPreparation(receive(s));s=ok(s,'package',{count:2,labelType:'bucket'});
  let b=palletBalances(s,'WMS-P02');assert.equal(b.palletRemainingGrams,27000);assert.equal(b.signedAvailableGrams,25000);assert.equal(b.warehouseGrams,2000);
  const before=structuredClone(s);assert.equal(act(s,'package',{count:2,labelType:'bucket'}).ok,false);
  assert.deepEqual(s,before);s=ok(s,'package',{count:1,labelType:'bucket'});
  b=palletBalances(s,'WMS-P02');assert.equal(b.preparedGrams,75000);assert.equal(b.palletRemainingGrams,2000);assert.equal(b.signedAvailableGrams,0);
  const job=s.printJobs.at(-1);s=ok(s,'print',{jobId:job.id,fail:true});s=ok(s,'print',{jobId:job.id});s=ok(s,'print',{jobId:job.id});
  assert.equal(palletBalances(s,'WMS-P02').preparedGrams,75000);assert.equal(ledger(s).differenceGrams,0);
});
test('supplementary loose-material receipts create a new unpack label without rewriting the old one',()=>{
  let s=createFactoryState();for(const [id,grams]of [['WMS-P02',75000],['WMS-P03',1000],['WMS-P04',3000]])s=issue(s,id,grams);
  s=moveToPreparation(receive(s));const first=s.unpackedSources['SMALL-RAW'];
  s=issue(s,'WMS-P03',500);s=receive(s);s=ok(s,'unpack',{sourceId:'SMALL-RAW'});const second=s.unpackedSources['SMALL-RAW'];
  assert.notEqual(first,second);assert.equal(s.tags[first].grams,1000);assert.equal(s.tags[second].grams,500);
  assert.equal(s.tags[second].palletId,'WMS-P03');assert.equal(palletBalances(s,'WMS-P03').signedGrams,1500);
});
test('partly signed pallets can prepare only that part, then replenish without rewriting old labels',()=>{
  let s=createFactoryState();for(const [id,grams]of [['WMS-P02',50000],['WMS-P03',1500],['WMS-P04',3000]])s=issue(s,id,grams);
  s=moveToPreparation(receive(s));
  const rejected=act(s,'package',{count:3,labelType:'bucket'});assert.equal(rejected.ok,false);assert.match(rejected.message,/50kg.*75kg/);
  s=ok(s,'package',{count:2,labelType:'bucket'});assert.equal(palletBalances(s,'WMS-P02').signedAvailableGrams,0);
  const firstLabels=Object.values(s.tags).filter(t=>t.kind==='overall').map(t=>({id:t.id,grams:t.grams}));
  s=issue(s,'WMS-P02',25000);s=receive(s);
  assert.deepEqual(Object.values(s.tags).filter(t=>t.kind==='overall').map(t=>({id:t.id,grams:t.grams})),firstLabels);
  s=ok(s,'package',{count:1,labelType:'bucket'});assert.equal(palletBalances(s,'WMS-P02').palletRemainingGrams,2000);
});
test('virtual warehouse sources complete direct whole-package and loose-weighing preparation with provenance',()=>{
  let s=createFactoryState();for(const [id,grams]of [['TEMP-P02',75000],['TEMP-P03',1500],['TEMP-P04',3000]])s=issue(s,id,grams);
  s=ok(s,'advance');s=ok(s,'unpack',{sourceId:'V-SMALL-RAW'});
  const printAll=s=>{for(const j of s.printJobs.filter(j=>j.status!=='printed'))s=ok(s,'print',{jobId:j.id});for(const t of Object.values(s.tags).filter(t=>t.kind!=='raw'&&!t.attached))s=ok(s,'attach',{tagId:t.id,bucket:t.bucket});return s;};
  s=printAll(s);s=ok(s,'scan',{sourceId:'V-RAW-77'});s=printAll(ok(s,'package',{count:3,labelType:'bucket'}));
  for(const bucket of [1,2,3]){s=ok(s,'tare');s=ok(s,'gross',{grams:600});const r=act(s,'weigh',{bucket},Date.now()+1500);assert.equal(r.ok,true,r.message);s=printAll(r.state);}
  s=printAll(ok(s,'prepare-tea'));s=ok(s,'advance');const tags=Object.values(s.tags).filter(t=>['overall','weigh','tea'].includes(t.kind));
  for(const t of tags)s=ok(s,'collect',{tagId:t.id,bucket:t.bucket});
  for(const kind of ['overall','tea','weigh'])for(const t of tags.filter(t=>t.kind===kind))s=ok(s,'feed',{tagId:t.id,bucket:t.bucket,device:{overall:'D-01',tea:'E-01',weigh:'M-01'}[kind]});
  s=ok(s,'advance');assert.equal(s.finished,true);assert.equal(ledger(s).receivedGrams,79500);assert.equal(ledger(s).fedGrams,79500);assert.equal(warehouseLedger(s).differenceGrams,0);
  assert.ok(tags.every(t=>t.palletId.startsWith('TEMP-')));assert.equal(palletBalances(s,'WMS-P02').preparedGrams,0);
});
test('one preparation tag can combine pallets while keeping each receipt quota independent',()=>{
  let s=createFactoryState();for(const [id,grams]of [['WMS-P01',20000],['WMS-P02',55000],['WMS-P03',1500],['WMS-P04',3000]])s=issue(s,id,grams);
  s=ok(receive(s),'advance');s=ok(s,'unpack',{sourceId:'SMALL-RAW'});
  for(const j of s.printJobs)s=ok(s,'print',{jobId:j.id});for(const t of Object.values(s.tags).filter(t=>t.kind==='unpack'))s=ok(s,'attach',{tagId:t.id,bucket:0});
  for(const id of ['RAW-20','RAW-77'])s=ok(s,'scan',{sourceId:id});
  s=ok(s,'package',{count:3,labelType:'bucket'});const t=Object.values(s.tags).find(t=>t.kind==='overall');
  assert.equal(t.parentIds.length,2);assert.equal(t.palletId,null);
  assert.equal(palletBalances(s,'WMS-P01').preparedGrams,20000);assert.equal(palletBalances(s,'WMS-P02').preparedGrams,55000);
  assert.equal(palletBalances(s,'WMS-P02').signedAvailableGrams,0);assert.equal(palletBalances(s,'WMS-P02').palletRemainingGrams,22000);
});
