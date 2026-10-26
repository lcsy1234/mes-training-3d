import { warehousePanel, palletInfo } from './warehouse-panels.js';
import { palletBalances, warehouseLedger } from './warehouse-state.js';
import './factory.css';
import { createFactoryScene } from './factory-scene.js';
import { ZONES } from './factory-layout.js';
import { CHAPTERS, MATERIALS, createFactoryState, act, ledger, scaleStatus, traceTag, tagName, kg } from './factory-state.js';
import { escape, zonePanel, taskPanel, printDesk, tagDesk } from './factory-panels.js';
const $=s=>document.querySelector(s);
const sessions={bucket:createFactoryState(),bag:createFactoryState('bag')};
let state=sessions.bucket,mode='overview',panel='station',zone='control',scene=null,error='',toastTimer;
let values=defaults('bucket');
function defaults(kind){return {warehouse:'wms',palletId:kind==='bag'?'WMS-P01':'WMS-P02',issueKg:kind==='bag'?150:75,warehouseView:'warehouse',campaign:'DEMO-P01',batch:'DEMO-A',sourceId:kind==='bag'?'RAW-150':'RAW-20',count:3,labelType:kind==='bag'?'bag':'bucket',workBucket:1,targetBucket:1,device:'D-01',tagId:''};}
$('#home').href=import.meta.env.BASE_URL;
$('#basic-link').href=`${import.meta.env.BASE_URL}basic.html`;
$('#basic-link').target='_blank';$('#basic-link').rel='noopener';
function syncValues(){
  for(const [id,key] of Object.entries({'warehouse-type':'warehouse','pallet-choice':'palletId','issue-qty':'issueKg','campaign':'campaign','batch':'batch','source-choice':'sourceId','count':'count','label-type':'labelType','work-bucket':'workBucket','target-bucket':'targetBucket','device':'device','tag-choice':'tagId'}))if($('#'+id))values[key]=$('#'+id).value;
}
function notify(message){clearTimeout(toastTimer);$('#factory-toast').textContent=message;$('#factory-toast').hidden=false;toastTimer=setTimeout(()=>{$('#factory-toast').hidden=true;},4500);}
function renderPanel(){
  $('#tab-station').classList.toggle('active',panel==='station');$('#tab-task').classList.toggle('active',panel==='task');
  $('#tab-warehouse').classList.toggle('active',panel==='warehouse');
  $('#operation-content').innerHTML=panel==='warehouse'?warehousePanel(state,values):panel==='task'?taskPanel(state,values):zonePanel(zone);
  $('#operation-error').hidden=!error;$('#operation-error').textContent=error;
  if(panel==='task'||panel==='warehouse')syncValues();updateScale();
}
function render(){
  $('#mode-warehouse').classList.toggle('active',mode==='warehouse');
  $('#mode-overview').classList.toggle('active',mode==='overview');$('#mode-training').classList.toggle('active',mode==='training'&&state.mode==='bucket');$('#mode-bag').classList.toggle('active',mode==='training'&&state.mode==='bag');
  $('#view-title').textContent=zone==='overview'?'工厂全景':ZONES[zone].name;
  $('#zone-nav').innerHTML=Object.entries(ZONES).map(([id,z])=>`<button data-zone="${id}" class="${id===zone?'active':''}" aria-pressed="${id===zone}"><span>${z.code}</span>${z.name}</button>`).join('');
  $('#lesson-progress').hidden=mode!=='training';
  $('#lesson-progress').innerHTML=CHAPTERS.slice(0,state.mode==='bag'?2:3).map((c,i)=>`<button data-chapter="${i}" class="${i<state.chapter||state.finished?'done':i===state.chapter?'current':''}" ${i===state.chapter?'aria-current="step"':''}><span>${i<state.chapter||state.finished?'✓ 已完成':'CHAPTER '+String(i+1).padStart(2,'0')}</span>${c.title}</button>`).join('');
  renderPanel();
  const l=ledger(state),completed=state.packageTasks.filter(t=>t.done).length;
  const w=warehouseLedger(state);
  const quotas=Object.values(state.pallets).filter(p=>p.signedGrams>0).map(p=>`${p.id} 已签${kg(p.signedGrams)} / 已用${kg(p.preparedGrams)} / 可用${kg(p.signedGrams-p.preparedGrams)}kg`).join('；');
  $('#physical-summary').textContent=state.chapter===0?`仓库未领${kg(w.warehouseGrams)}kg，待签收${kg(w.inTransitGrams)}kg，已签收${kg(l.receivedGrams)}kg。`:state.chapter===1?`${quotas}。整包直接备料；散称按规则脱包并去皮。`:`按任务桶号汇集；已记录 ${state.feeds.length} 次独立投料。`;
  $('#task-summary').textContent=state.finished?'本轮演练完成，业务、标签与数量账已核对。':`整包 ${completed}/3 份 · 称量 ${state.smallTasks.filter(t=>t.done).length}/${state.mode==='bag'?0:3} 份 · 当前${CHAPTERS[state.chapter].title}。`;
  $('#quantity-summary').textContent=`签收 ${kg(l.receivedGrams)} − 已投 ${kg(l.fedGrams)} ＝ 签收范围余量 ${kg(l.remainingGrams)}kg · 差额 ${kg(l.differenceGrams)}kg（仓库未领量另记）`;
  $('#print-jobs').innerHTML=printDesk(state);$('#tag-cards').innerHTML=tagDesk(state,$('#all-tags').checked?'all':'current');
  $('#label-count').textContent=Object.values(state.tags).filter(t=>t.kind!=='raw').length;
  $('#event-count').textContent=state.events.length;
  $('#factory-records').innerHTML=state.events.length?state.events.slice(-30).reverse().map(e=>`<div class="record-row ${e.success?'':'error'}"><time>${new Date(e.time).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})}</time><strong>${e.success?'✓ 已执行':'! 已拦截'}</strong><p>${escape(e.message)}</p></div>`).join(''):'<p class="records-empty">从工厂全景开始探索，进入实训后记录每一次业务操作与拦截原因。</p>';
}
function selectZone(id,closeup=true){
  syncValues();if(!ZONES[id])return;zone=id;scene?.select(zone,closeup);
  panel=['warehouse','receipt'].includes(id)?'warehouse':'station';
  if(panel==='warehouse'){values.warehouseView=id;mode='warehouse';}
  if(id==='receipt'&&state.receiptOrders.some(r=>r.status==='pending'))dispatch('receive',{campaign:state.campaign,batch:'DEMO-A'});
  else render();
}
function showPallet(id){
  const p=palletBalances(state,id);if(!p)return;
  values.warehouse=p.warehouse;values.palletId=id;
  $('#trace-title').textContent=`${id} · 托盘码信息`;
  const payload={palletCode:p.id,warehouse:p.warehouse,material:MATERIALS[p.material],batch:p.batch,initialKg:p.initialGrams/1000,currentPalletKg:p.palletRemainingGrams/1000,unissuedKg:p.warehouseGrams/1000,pendingReceiptKg:p.inTransitGrams/1000,signedKg:p.signedGrams/1000,preparedKg:p.preparedGrams/1000,signedAvailableKg:p.signedAvailableGrams/1000};
  $('#trace-content').innerHTML=palletInfo(state,id)+`<h3>模拟码读取内容</h3><pre>${escape(JSON.stringify(payload,null,2))}</pre><p>码唯一关联当前托盘；重量按记录实时读取。这里模拟扫码读取，不连接扫描枪或真实WMS。</p>`;
  if(!$('#trace-dialog').open)$('#trace-dialog').showModal();
}
function switchTraining(kind){
  syncValues();sessions[state.mode]=state;
  if(state.mode!==kind){state=sessions[kind];values=defaults(kind);}
  mode='training';panel='task';zone=CHAPTERS[Math.min(state.chapter,2)].zone;error='';
  scene?.select(zone);scene?.update(state);render();
}
function dispatch(type,payload={}){
  if(!scene){notify('请等待教学模型载入后再操作。');return;}
  syncValues();const result=act(state,type,payload,Date.now());state=result.state;sessions[state.mode]=state;
  error=result.ok?'':result.message;
  if(!result.ok)notify('已拦截：'+result.message);
  if(result.ok){
    if(type==='advance'){mode='training';if(state.chapter===1)values.sourceId=state.roots.find(id=>state.tags[id].material==='BULK'&&state.tags[id].received&&state.tags[id].remainingGrams>0);panel='task';zone=CHAPTERS[Math.min(state.chapter,2)].zone;scene.select(zone);}
    if(type==='weigh'){const pending=state.smallTasks.find(t=>!t.done);if(pending)values.workBucket=pending.bucket;}
    if(type==='feed'){zone='process';scene.select(zone);}
    if(type==='prepare-tea'){const tag=Object.values(state.tags).find(t=>t.kind==='tea');values.tagId=tag?.id||values.tagId;}
    scene.update(state,type);notify(result.message);
  }
  render();
  if(type==='advance'&&result.ok)$('#chapter-title')?.focus({preventScroll:true});
}
function updateScale(){
  if(!$('#scale-status'))return;
  const status=scaleStatus(state,Date.now());$('#scale-status').textContent=status.text;$('#scale-status').className=`scale-status ${status.kind}`;
  scene?.updateScale(state,Date.now());
}
function showTrace(id){
  const chain=traceTag(state,id);if(!chain.length){notify('暂未找到这张标签。');return;}
  $('#trace-title').textContent=`${id} · 来源追溯`;
  $('#trace-content').innerHTML='<p>当前标签在上，来源在下。转换会扣减父码余额并创建子码，打印和补打不改变重量。</p>'+chain.map((t,i)=>`${i?'<div class="trace-arrow">↑ 继承来源与批次</div>':''}<div class="trace-node"><strong>${tagName(t.kind)} · ${t.id}</strong><p>${MATERIALS[t.material]} · ${t.batch} · ${t.bucket?'任务桶号 '+t.bucket:'原料/脱包容器'}<br>标签重量 ${kg(t.grams)}kg · 可用余额 ${kg(t.remainingGrams)}kg<br>托盘 ${t.palletId||'多来源：请查看父码'} · 关联单据 ${(t.receiptIds||[]).join('、')||'—'}<br>位置 ${escape(t.location)} · ${t.printed?'纸张已输出':'纸张待输出'} · ${t.attached?'已核对贴附':'待核对贴附'}</p>${t.allocations.length?'<small>本次来源分配：'+t.allocations.map(a=>a.id+' '+kg(a.grams)+'kg').join('，')+'</small>':''}</div>`).join('');
  if(!$('#trace-dialog').open)$('#trace-dialog').showModal();
}
function sourceBalances(){
  $('#trace-title').textContent='来源余额与数量账';
  const tags=Object.values(state.tags).filter(t=>state.roots.includes(t.id)||t.kind==='unpack');
  const l=ledger(state);
  $('#trace-content').innerHTML=`<p>来源码与子标签余额分别记录；下方总量会包含尚未投料的备料标签，避免仅看原码余额产生误解。</p><table class="source-balance"><thead><tr><th>来源</th><th>累计签收/标签量</th><th>剩余</th><th>交接</th></tr></thead><tbody>${tags.map(t=>`<tr><td><button data-action="trace" data-tag-id="${t.id}">${t.id} ↗</button></td><td>${kg(t.grams)}kg</td><td>${kg(t.remainingGrams)}kg</td><td>${t.received?'已签收/继承':'待签收'}</td></tr>`).join('')}</tbody></table><div class="learning-note">已签收 ${kg(l.receivedGrams)}kg＝现场各有效码余额 ${kg(l.remainingGrams)}kg＋已投料 ${kg(l.fedGrams)}kg；差额 ${kg(l.differenceGrams)}kg。</div>`;
  if(!$('#trace-dialog').open)$('#trace-dialog').showModal();
}
function reset(){state=createFactoryState(state.mode);sessions[state.mode]=state;values=defaults(state.mode);error='';zone=mode==='training'?'warehouse':'control';scene?.update(state);scene?.select(zone,false);scene?.reset();panel=mode==='training'?'task':'station';render();notify('本轮演练已重置，来源余额与任务状态恢复初始值。');}
function exportReport(){
  const data={title:'MES 工厂前处理实训记录',version:4,simulated:true,exportedAt:new Date().toISOString(),ledger:ledger(state),warehouseLedger:warehouseLedger(state),...state};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`MES-工厂实训-${state.mode}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('change',e=>{
  if(e.target.id==='all-tags'){render();return;}
  syncValues();
  if(['warehouse-type','pallet-choice'].includes(e.target.id)){if(e.target.id==='warehouse-type')values.palletId=values.palletId.replace(/^(WMS|TEMP)/,values.warehouse==='wms'?'WMS':'TEMP');const p=state.pallets[values.palletId];if(p)values.issueKg=Math.min(p.warehouseGrams,{BULK:state.mode==='bag'?150000:75000,SMALL:1500,TEA:3000}[p.material])/1000;render();return;}
  if(e.target.id==='gross'){const value=Number(e.target.value);dispatch('gross',{grams:Number.isFinite(value)?Math.round(value*1000):NaN});}
});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.zone){selectZone(b.dataset.zone);return;}
  if(b.dataset.chapter){selectZone(CHAPTERS[Number(b.dataset.chapter)].zone);return;}
  const action=b.dataset.action;if(!action)return;syncValues();
  const actions={
    warehouse:()=>selectZone('warehouse'),
    'warehouse-tab':()=>{panel='warehouse';renderPanel();},
    'scan-pallet':()=>dispatch('scan-pallet',{palletId:values.palletId}),
    'pallet-details':()=>showPallet(b.dataset.palletId||values.palletId),
    issue:()=>dispatch('issue',{palletId:values.palletId,grams:Math.round(Number($('#issue-qty')?.value)*1000),campaign:values.campaign,batch:values.batch}),
    overview:()=>{mode='overview';panel='station';zone='control';scene?.select(zone,false);scene?.reset();render();},
    start:()=>switchTraining('bucket'),bag:()=>switchTraining('bag'),
    'station-tab':()=>{panel='station';renderPanel();},'task-tab':()=>{mode='training';panel='task';render();},
    'return-view':()=>{scene?.reset();$('#view-title').textContent='工厂全景';},'focus-current':()=>scene?.select(zone),
    help:()=>$('#help-dialog').showModal(),'close-help':()=>$('#help-dialog').close(),'close-trace':()=>$('#trace-dialog').close(),
    receive:()=>dispatch('receive',{campaign:values.campaign,batch:values.batch}),scan:()=>dispatch('scan',{sourceId:values.sourceId}),
    'remove-source':()=>dispatch('remove-source',{sourceId:b.dataset.sourceId}),
    package:()=>dispatch('package',{count:Number(values.count),labelType:values.labelType}),advance:()=>dispatch('advance'),
    unpack:()=>dispatch('unpack',{sourceId:b.dataset.sourceId||'SMALL-RAW'}),
    'apply-gross':()=>dispatch('gross',{grams:Math.round(Number($('#gross').value)*1000)}),gross:()=>{},add:()=>dispatch('gross',{grams:state.scale.grossGrams+100}),'fine-add':()=>dispatch('gross',{grams:state.scale.grossGrams+10}),minus:()=>dispatch('gross',{grams:state.scale.grossGrams-10}),
    empty:()=>dispatch('gross',{grams:100}),tare:()=>dispatch('tare'),weigh:()=>dispatch('weigh',{bucket:Number(values.workBucket)}),
    print:()=>dispatch('print',{jobId:b.dataset.jobId}),'paper-fail':()=>dispatch('print',{jobId:b.dataset.jobId,fail:true}),
    attach:()=>dispatch('attach',{tagId:b.dataset.tagId,bucket:Number(document.getElementById(`attach-${b.dataset.tagId}`)?.value)}),
    'prepare-tea':()=>dispatch('prepare-tea'),collect:()=>dispatch('collect',{tagId:values.tagId,bucket:Number(b.dataset.targetBucket||values.targetBucket)}),
    feed:()=>dispatch('feed',{tagId:values.tagId,bucket:Number(values.targetBucket),device:values.device}),
    trace:()=>showTrace(b.dataset.tagId),'show-sources':sourceBalances,'play-flow':()=>{scene?.playFlow();notify('播放教学流转：调配液→UHT→无菌罐→灌装封盖→包装码垛。');},reset,export:exportReport,
  };
  actions[action]?.();
});
document.addEventListener('dragstart',e=>{const card=e.target.closest('[data-tag-id][draggable=true]');if(card){e.dataTransfer.setData('text/plain',card.dataset.tagId);e.dataTransfer.effectAllowed='move';}});
document.addEventListener('dragover',e=>{const target=e.target.closest('[data-drop-bucket]');if(target){e.preventDefault();target.classList.add('drag-over');}});
document.addEventListener('dragleave',e=>{e.target.closest('[data-drop-bucket]')?.classList.remove('drag-over');});
document.addEventListener('drop',e=>{const target=e.target.closest('[data-drop-bucket]');if(!target)return;e.preventDefault();target.classList.remove('drag-over');dispatch('collect',{tagId:e.dataTransfer.getData('text/plain'),bucket:Number(target.dataset.dropBucket)});});
render();
try{
  scene=await createFactoryScene({onSelect:selectZone,onTag:showTrace,onPallet:showPallet,onProgress:(n,total)=>{$('#factory-load-progress').textContent=`已载入 ${n} / ${total} 类模型`;},onDropTag:(tagId,bucket)=>dispatch(state.chapter===2?'collect':'attach',{tagId,bucket})});
  scene.update(state);$('#factory-loading').hidden=true;render();
}catch(e){
  console.error('Factory initialization failed',e);$('#factory-loading').innerHTML='<strong>模型载入未完成</strong><span>请检查网络连接后刷新重试。</span><button class="action-primary" id="reload-factory">重新载入</button>';$('#reload-factory').onclick=()=>location.reload();
}
setInterval(updateScale,150);
