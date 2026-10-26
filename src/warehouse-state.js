// Teaching records only: no WMS, warehouse or MES API writes.
const check=(condition,message)=>{if(!condition)throw new Error(message);};
export function createWarehouse(seeds){
  const pallets={},tags={},roots=[];
  for(const warehouse of ['wms','virtual'])for(const [i,[source,material,grams]]of seeds.entries()){
    const id=`${warehouse==='wms'?'WMS':'TEMP'}-P${String(i+1).padStart(2,'0')}`;
    const sourceId=warehouse==='wms'?source:`V-${source}`;
    pallets[id]={id,sourceId,warehouse,material,batch:'DEMO-A',initialGrams:grams,warehouseGrams:grams,signedGrams:0,preparedGrams:0};
    tags[sourceId]={id:sourceId,kind:'raw',material,batch:'DEMO-A',grams:0,remainingGrams:0,initialGrams:grams,received:false,printed:true,attached:true,bucket:0,parentIds:[],allocations:[],location:'warehouse',itemGrams:25000,palletId:id,receiptIds:[]};
    roots.push(sourceId);
  }
  return {pallets,tags,roots,issueRecords:[],receiptOrders:[]};
}
export function palletBalances(s,id){
  const p=s.pallets[id];if(!p)return null;
  const inTransitGrams=s.receiptOrders.filter(r=>r.palletId===id&&r.status==='pending').reduce((n,r)=>n+r.grams,0);
  return {...p,inTransitGrams,signedAvailableGrams:p.signedGrams-p.preparedGrams,palletRemainingGrams:p.initialGrams-p.preparedGrams};
}
export function warehouseLedger(s){
  const pallets=Object.values(s.pallets);
  const initialGrams=pallets.reduce((n,p)=>n+p.initialGrams,0),warehouseGrams=pallets.reduce((n,p)=>n+p.warehouseGrams,0);
  const signedGrams=pallets.reduce((n,p)=>n+p.signedGrams,0),inTransitGrams=s.receiptOrders.filter(r=>r.status==='pending').reduce((n,r)=>n+r.grams,0);
  return {initialGrams,warehouseGrams,inTransitGrams,signedGrams,differenceGrams:initialGrams-warehouseGrams-inTransitGrams-signedGrams};
}
function signIssue(s,issue,receiptId){
  const pallet=s.pallets[issue.palletId],source=s.tags[pallet.sourceId];
  source.grams+=issue.grams;source.remainingGrams+=issue.grams;source.received=true;source.location='receipt';source.receiptIds.push(receiptId);
  pallet.signedGrams+=issue.grams;issue.status='signed';
}
export function issueMaterial(s,p,newId){
  check(!s.finished&&s.chapter<=2,'本轮已进入投料或已结束，请重新演练后领料。');
  check(p.campaign===s.campaign,'领料产程不一致。');
  const pallet=s.pallets[p.palletId];check(pallet,'托盘码不存在，请重新扫码。');
  check(p.batch===pallet.batch,'领料批次与托盘批次不一致。');
  check(Number.isSafeInteger(p.grams)&&p.grams>0,'领料量必须为正数，精确到克。');
  const duplicate=p.requestKey&&s.issueRecords.find(i=>i.requestKey===p.requestKey);
  if(duplicate){check(duplicate.palletId===pallet.id&&duplicate.grams===p.grams,'重复请求编号与原领料内容不一致。');return '已存在相同领料单，不重复发货或增加签收量。';}
  check(p.grams<=pallet.warehouseGrams,'领料量超过该托盘未领余量。');
  const issue={id:newId(s,'ISSUE'),palletId:pallet.id,sourceId:pallet.sourceId,warehouse:pallet.warehouse,material:pallet.material,batch:pallet.batch,campaign:s.campaign,grams:p.grams,status:'dispatched',requestKey:p.requestKey||null};
  pallet.warehouseGrams-=p.grams;s.issueRecords.push(issue);
  if(pallet.warehouse==='wms'){
    const receipt={id:newId(s,'RECEIPT'),issueId:issue.id,palletId:pallet.id,sourceId:pallet.sourceId,campaign:issue.campaign,batch:issue.batch,grams:p.grams,status:'pending'};
    s.receiptOrders.push(receipt);issue.receiptId=receipt.id;
    return `模拟WMS已发货，生成领料单 ${issue.id} 和签收单 ${receipt.id}；进入签收区后自动签收，当前尚不可备料。`;
  }
  signIssue(s,issue,issue.id);return `厂内虚拟仓已取用并自动签收；领料单 ${issue.id} 已保存，仍按签收量限制备料。`;
}
export function receivePending(s,p){
  check(!s.finished&&s.chapter<=2,'当前阶段不能签收新的领料。');
  check(p.campaign===s.campaign,'产程不一致，请选择 DEMO-P01。');check(p.batch==='DEMO-A','签收批次不一致。');
  const pending=s.receiptOrders.filter(r=>r.status==='pending');
  check(pending.length||s.issueRecords.some(i=>i.status==='signed'),'没有待签收单，请先在实际仓模拟WMS发货，或从虚拟仓领料。');
  for(const receipt of pending){
    check(receipt.campaign===s.campaign&&receipt.batch===p.batch,'签收单产程或批次不匹配。');
    const issue=s.issueRecords.find(i=>i.id===receipt.issueId);check(issue&&issue.status==='dispatched','签收单关联的发货记录无效。');
    signIssue(s,issue,receipt.id);receipt.status='signed';
  }
  return pending.length?`物料签收已自动处理 ${pending.length} 张签收单；每张仅入账一次，使用量不能超过已签收量。`:'签收记录已处理，无重复入账。';
}
export function registerPreparation(s,allocations){
  for(const a of allocations){const source=s.tags[a.id],pallet=s.pallets[source.palletId];
    check(pallet,'备料来源缺少托盘关联。');
    check(a.grams<=pallet.signedGrams-pallet.preparedGrams,'备料使用量超过该托盘已签收可用量。');
    pallet.preparedGrams+=a.grams;
  }
}
export function availableUnpacked(s,material){return Object.values(s.tags).filter(t=>t.kind==='unpack'&&t.material===material&&t.printed&&t.attached&&t.remainingGrams>0);}
export function receivingReady(s){
  const needs=s.mode==='bag'?{BULK:150000}:{BULK:75000,SMALL:1500,TEA:3000};
  return Object.keys(needs).every(material=>Object.values(s.pallets).some(p=>p.material===material&&p.signedGrams>0));
}
