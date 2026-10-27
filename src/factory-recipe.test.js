import test from 'node:test';
import assert from 'node:assert/strict';
import {factoryRecipe} from './factory-recipe.js';
import {createCampaign,campaignAct,campaignLedger,issuePlan} from './campaign-state.js';
test('home uses six screenshot materials in each warehouse, each initially 999kg',()=>{
  const c=factoryRecipe(),s=createCampaign(c);
  for(const type of ['wms','virtual']){
    const stock=s.pallets.filter(p=>p.warehouseType===type);
    assert.equal(stock.length,6);assert.ok(stock.every(p=>p.initial===999000));
    assert.deepEqual(stock.map(p=>p.material),['TC000571','TJ000602','TJ100027','XJ100272','YL01RP2604001','YL02XJ2607006']);
  }
  assert.equal(s.tasks.length,16);
  assert.deepEqual(issuePlan(s).map(g=>[g.material,g.grams]),[['TC000571',105000],['XJ100272',19980],['TJ000602',20000]]);
  assert.match(c.notes,/原资料按件/);
});
test('home warehouse manual issue and whole preparation share the same quantity ledger',()=>{
  let s=createCampaign(factoryRecipe());
  const act=(type,p)=>{const r=campaignAct(s,type,p);assert.ok(r.ok,r.message);s=r.state;};
  act('issue',{pallet:'TEMP-P01',grams:33000,campaign:s.config.campaign});
  act('prepare',{task:'B1:WHOLE',pallet:'TEMP-P01'});
  const p=s.pallets.find(p=>p.id==='TEMP-P01');
  assert.equal(p.warehouse,966000);assert.equal(p.available,8000);assert.equal(p.prepared,25000);
  assert.equal(s.pallets.find(p=>p.id==='WMS-P01').warehouse,999000);
  assert.equal(campaignLedger(s).difference,0);
  assert.equal(campaignAct(s,'issue',{pallet:p.id,grams:966001,campaign:s.config.campaign}).ok,false);
});
