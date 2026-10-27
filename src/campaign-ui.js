import './factory.css';
import './campaign.css';
import {createCampaign,campaignAct,campaignLedger,unitTasks,unitReady,missingForUnit,issuePlan} from './campaign-state.js';
import {createFactoryState,kg} from './factory-state.js';
import {createFactoryScene} from './factory-scene.js';
import {ZONES} from './factory-layout.js';
import {TRAINING_NOTICE} from './instruction-config.js';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,scene,unit='',tab='instruction',taskId='',palletId='',scanIds=new Set();
const button=(text,action,attrs='')=>`<button class="action-secondary" data-do="${action}" ${attrs}>${esc(text)}</button>`;
const select=(id,items,current)=>`<select id="${id}">${items.map(([value,text])=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(text)}</option>`).join('')}</select>`;
function message(text,error=false){$('#message').textContent=text;$('#message').className=error?'error-notice':'learning-note';}
function run(type,p={}){const r=campaignAct(state,type,p);state=r.state;message(r.message,!r.ok);if(r.ok){if(type==='review')scanIds.clear();render();scene?.update(sceneState(),type);}return r.ok;}
function sceneState(){
  const s=createFactoryState();s.tags={};s.roots=[];s.pallets={};s.campaign=state.config.campaign;
  state.pallets.forEach((p,i)=>{const id=`${p.warehouseType==='wms'?'WMS':'TEMP'}-P${String(i+1).padStart(2,'0')}`;
    s.pallets[id]={id,displayName:p.id,warehouse:p.warehouseType,initialGrams:p.initial,preparedGrams:p.prepared};
    s.roots.push(p.id);s.tags[p.id]={id:p.id,kind:'raw',material:'BULK',grams:p.signed,remainingGrams:p.available,received:p.signed>0,parentIds:[],location:'receipt',printed:true,attached:true};});
  state.tags.forEach(t=>{const task=state.tasks.find(x=>x.id===t.task);s.tags[t.id]={...t,kind:task.route==='whole'?'overall':'weigh',material:t.owner==='qa'?'SMALL':'BULK',bucket:Number(t.unit.slice(1)),remainingGrams:t.fed?0:t.grams,parentIds:[t.pallet],location:t.fed?task.device:state.reviews.includes(t.unit)?`cart-${Number(t.unit.slice(1))}`:task.route==='whole'?'package':'weigh'};});
  s.feeds=state.feeds;s.chapter=tab==='warehouse'?0:tab==='feed'?2:1;return s;
}
function renderIssueCard(){
  if(!state)return;
  $('#issue-card-title').textContent='领料指示卡 · 自定义教学方案';
  $('#issue-card-content').innerHTML=`<p>${esc(state.config.campaign)} · ${esc(state.config.instruction||'')}</p><p>按指示书的单桶/单釜用量汇总。仓库库存是可领上限，指示卡显示任务计划；实际领取多少由你输入。查看此卡不会领料。</p>${issuePlan(state).map(g=>`<article class="campaign-task"><h3>${esc(g.name)} · ${esc(g.material)}</h3>${g.details.map(d=>`<p>${esc(d.name)}：${kg(d.grams)}kg × ${d.count}${d.unitKind==='kettle'?'釜':'桶'} = ${kg(d.grams*d.count)}kg · ${d.owner==='qa'?'品保':'生产'}</p>`).join('')}<dl class="pallet-quantities"><div><dt>本产程计划领用</dt><dd>${kg(g.grams)}kg</dd></div><div><dt>已领（含待签收，扣除已退）</dt><dd>${kg(g.issued)}kg</dd></div><div><dt>其中待签收</dt><dd>${kg(g.pending)}kg</dd></div><div class="quota"><dt>按计划还需领</dt><dd>${kg(g.remaining)}kg</dd></div><div><dt>仓库可领取余量</dt><dd>${kg(g.warehouse)}kg</dd></div></dl>${g.materials.length>1?`<p>主料／替代料共用这份计划：${g.materials.map(esc).join('、')}。选择其一或按剩余需求领取，不将两者重复相加。</p>`:''}${g.excess?`<p>已超计划领用${kg(g.excess)}kg，可核对是否需要退回余料。</p>`:''}</article>`).join('')}<p>中控抽取行不生成手工领料需求。</p>`;
  $('#issue-card-content').insertAdjacentHTML('afterbegin',`<p class="training-disclaimer">${TRAINING_NOTICE}</p>`);
}
function render(){
  if(!state)return;
  const c=state.config,tasks=unitTasks(state,unit),l=campaignLedger(state);
  $('#campaign-title').textContent=c.campaign;
  $('#campaign-meta').textContent=`${c.product||''} · ${c.factory||''} · 生产：${c.instruction||''} · 品保：${c.qaInstruction||'自定义'}`;
  $('#config-info').textContent=c.notes||'自定义教学配置';
  renderIssueCard();
  $('#ledger').textContent=`仓库未领 ${kg(l.warehouse)}kg · 待签收 ${kg(l.transit)}kg · 签收可用 ${kg(l.available)}kg · 备料待投 ${kg(l.prepared)}kg · 已投 ${kg(l.fed)}kg · 差额 ${kg(l.difference)}kg`;
  $('#unit-nav').innerHTML=c.units.map(u=>`<button data-unit="${esc(u.id)}" class="${u.id===unit?'active':''}"><strong>${esc(u.name||u.id)}</strong><small>${state.processes.includes(u.id)?'✓ 工艺完成':state.reviews.includes(u.id)?'✓ 复核完成':unitReady(state,u.id)?'已齐套，待复核':`${unitTasks(state,u.id).filter(t=>t.tagId).length}/${unitTasks(state,u.id).length} 已备料`}</small></button>`).join('');
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  let html=`<div class="panel-eyebrow">${esc(c.units.find(u=>u.id===unit)?.name||unit)} · 单元独立推进</div>`;
  if(tab==='instruction'){
    html+='<h2>本单元配料明细</h2><p class="form-hint">生产用量按对应桶/釜展开。整包走PDA，非整包及品保走PAD。</p>';
    html+=`<p class="training-disclaimer">${TRAINING_NOTICE}</p>${(c.instructionSources||[]).map(s=>`<div class="learning-note"><strong>${s.owner==='qa'?'品保配料':'生产配料'}指示书</strong><br>${esc(s.code)} · ${esc(s.name)}</div>`).join('')}`;
    html+=tasks.map(t=>`<article class="campaign-task"><strong>${esc(t.name)}</strong><p>${esc(t.material)} · ${t.owner==='qa'?'品保配料':'生产配料'} · ${esc(t.position||'')}</p><b>${kg(t.grams)}kg</b><p>${t.route==='whole'?'PDA · 不上秤、不脱包、不去皮':`PAD · 容差 ±${t.tolerance}g${t.requiresUnpack?' · 本课需脱包':''}`}<br>目标 ${esc(t.device)}</p></article>`).join('');
    html+=tasks.filter(t=>t.sourceCode).map(t=>`<p class="form-hint">${esc(t.name)}：来源${esc(t.sourceCode)}，行${esc(t.sourceRowId)} / 明细${esc(t.sourceDetailId)}；${t.route==='weigh'?`接口净重范围${kg(t.minGrams)}～${kg(t.maxGrams)}kg`:'PDA整包不上秤'}</p>`).join('');
    const controls=c.lines.filter(t=>t.route==='control');
    html+=controls.map(t=>`<div class="learning-note">${esc(t.name)} ${kg(t.grams)}kg：中控抽取，不生成备料任务，不计入手工领料、称量及耗用账。</div>`).join('');
    html+=(c.unsupportedStock||[]).map(p=>`<div class="learning-note">待确认替代料：${esc(p.name)}（${esc(p.material)}），${p.quantity}${esc(p.unit)}。${esc(p.reason)}</div>`).join('');
    html+=button('开始本单元备料','go-prepare');
  }else if(tab==='warehouse'){
    const p=state.pallets.find(p=>p.id===palletId)||state.pallets[0];palletId=p.id;
    html+=`<h2>托盘领料与签收</h2>${button('打开领料指示卡 · 看计划和还需领量','issue-card')}<label class="field">扫描教学托盘码${select('pallet',state.pallets.map(x=>[x.id,`${x.name||x.material} · ${x.id}`]),p.id)}</label><div class="pallet-card"><strong>${esc(p.name||p.material)}</strong><p>${esc(p.id)} · ${esc(p.material)} · ${esc(p.batch)}<br>${p.warehouseType==='wms'?'实际仓 WMS模拟':'虚拟暂存仓'}<br>当前托盘量 ${kg(p.initial-p.prepared)}kg<br>仓库未领 ${kg(p.warehouse)}kg<br>已签收累计 ${kg(p.signed)}kg · 签收可用 ${kg(p.available)}kg</p></div><label class="field">本次领料量kg（自行输入）<input id="issue-grams" type="number" step="0.001" min="0.001" max="${p.warehouse/1000}" placeholder="先查看领料指示卡，再输入本次领取量"></label>${button(p.warehouseType==='wms'?'WMS模拟发货，生成签收单':'虚拟仓领料并自动签收','issue')}<h3>单据记录</h3>`;
    html+=state.issues.map(i=>`<article class="campaign-task">${esc(i.id)} · ${esc(i.pallet)} · ${kg(i.grams)}kg · ${i.status==='signed'?'✓ 已签收':`待签收 ${button('进入签收区自动签收本单','receive',`data-issue="${esc(i.id)}"`)}`}</article>`).join('');
    html+=button('处理当前已签收物料 → 备料区','go-prepare')+`<h3>余料退回</h3><label class="field">退料量kg<input id="return-grams" type="number" min="0.001" step="0.001" value="${p.available/1000}"></label>${button('退回未备料签收余量','return')}`;
  }else if(tab==='prepare'){
    if(!tasks.some(t=>t.id===taskId))taskId=tasks[0].id;
    const t=tasks.find(t=>t.id===taskId),stocks=state.pallets.filter(p=>[t.material,...(t.alternatives||[])].includes(p.material));
    if(!stocks.some(p=>p.id===palletId))palletId=stocks[0]?.id||'';
    html+=`<h2>${t.owner==='qa'?'品保 PAD':'生产 '+(t.route==='whole'?'PDA整包':'PAD散称')}</h2><label class="field">本单元任务${select('task',tasks.map(t=>[t.id,`${t.name} · ${kg(t.grams)}kg${t.tagId?' ✓':''}`]),taskId)}</label><label class="field">来源托盘${select('pallet',stocks.map(p=>[p.id,`${p.id} · 已签可用${kg(p.available)}kg`]),palletId)}</label><p>目标净重 <strong>${kg(t.grams)}kg</strong> · ${esc(t.device)}</p>`;
    if(t.tagId)html+=`<div class="learning-note">备料已完成：${esc(t.tagId)}。请到下方打印并核对贴标。</div>`;
    else if(t.route==='whole')html+=`<p>直接扫描已签收原料码；不脱包、不称量、不去皮。</p>${button('PDA确认整包备料并生成标签','prepare')}`;
    else{
      const scale=t.scale;
      html+=`<p>净重允许 ${kg(t.minGrams??t.grams-t.tolerance)}～${kg(t.maxGrams??t.grams+t.tolerance)}kg；变化后稳定1秒。${t.sourceCode?'重量与范围来自接口明细，稳定时长为教学设置。':t.tolerance===0?'本课按准确目标值演练，真实品保容差待核实。':''}</p>`;
      if(t.requiresUnpack)html+=button(scale?.unpackCode?`已脱包 ${scale.unpackCode}`:'按规则执行散称脱包','unpack');
      html+=`<label class="field">空容器皮重kg（本课示例0.10）<input id="tare-grams" type="number" step="0.001" value="0.1"></label>${button('放置空容器并去皮','tare')}<div class="scale-display"><span>PAD · 毛重 − 皮重 = 净重（kg）</span><div><strong>${kg((scale?.gross||0)-(scale?.tare||0))}</strong></div><p>${kg(scale?.gross||0)} − ${kg(scale?.tare||0)} · ${scale?.tare!=null?'已去皮':'未去皮'}</p></div><label class="field">模拟毛重kg<input id="gross-grams" type="number" step="0.001" value="${((scale?.tare||100)+t.grams)/1000}"></label>${button('加减料后更新毛重','gross')}${button('稳定后确认PAD称量并生成标签','prepare')}`;
    }
    html+=button('进入当前桶/釜复核投料','go-feed');
  }else{
    const missing=missingForUnit(state,unit),labels=state.tags.filter(t=>t.unit===unit),reviewed=state.reviews.includes(unit);
    html+=`<h2>按桶 / 釜齐套复核</h2><div class="learning-note">${missing.length?'缺项：'+missing.map(esc).join('<br>'):'✓ 当前单元生产与品保备料均齐套'}<br>其他桶可以继续备料，不要求全产程备完。</div>`;
    html+=labels.map(t=>`<label class="scan-row"><input type="checkbox" data-scan="${esc(t.id)}" ${scanIds.has(t.id)?'checked':''}> 模拟扫码 ${esc(t.id)} · ${kg(t.grams)}kg</label>`).join('');
    html+=reviewed?'<p>✓ 当前桶/釜领料复核已完成。</p>':button('确认已逐项扫码，完成领料复核','review');
    html+=`<label class="field">投料扫描标签${select('feed-tag',labels.map(t=>[t.id,`${t.id} · ${t.material}${t.fed?' · 已投':''}`]),'')}</label><label class="field">投料时核对的桶/釜号${select('feed-unit',state.config.units.map(u=>[u.id,u.name||u.id]),unit)}</label><label class="field">扫码设备${select('device',[['D-01','D-01 溶解'],['E-01','E-01 萃茶'],['M-01','M-01 调配']],state.config.units.find(u=>u.id===unit).kind==='kettle'?'E-01':'D-01')}</label>${button('扫码校验并投料','feed')}`;
    if(state.config.units.find(u=>u.id===unit).kind==='bucket')html+=`<label class="field">教学关联萃茶釜（实际分配协议待确认）${select('kettle',state.config.units.filter(u=>u.kind==='kettle').map(u=>[u.id,`${u.name}${state.processes.includes(u.id)?' ✓已完成':''}`]),state.links[unit]||'')}</label>${button('记录教学釜桶关联','link')}`;
    html+=button(state.processes.includes(unit)?'✓ 当前桶/釜工艺已完成':'完成当前桶/釜工艺演示','complete');
    if(state.processes.length===state.config.units.length)html+=`<div class="completion-icon">✓</div><p>本产程前处理演练全部完成。后段仅流程动画。</p>${button('播放杀菌→灌装→后包导览','downstream')}`;
  }
  $('#campaign-panel').innerHTML=html;
  $('#labels').innerHTML=state.tags.filter(t=>t.unit===unit).map(t=>`<article class="tag-card"><strong>${esc(t.id)} · ${esc(t.unit)}</strong><p>${esc(t.material)} · ${t.owner==='qa'?'品保':'生产'} · ${kg(t.grams)}kg<br>来源：${esc(t.pallet)} → ${esc(t.parent)}<br>批次 ${esc(t.batch)}<br>${t.fed?'已投料':t.attached?'已贴标':t.printed?'待贴标':'待打印'}</p>${button('打印 / 补打原标签','print',`data-tag="${esc(t.id)}"`)}${button('模拟缺纸','print-fail',`data-tag="${esc(t.id)}"`)}${button('核对贴到当前桶/釜','attach',`data-tag="${esc(t.id)}"`)}</article>`).join('')||'<p>尚无标签，业务完成后会生成标签。</p>';
  $('#events').innerHTML=state.events.slice().reverse().slice(0,80).map(e=>`<p class="campaign-event">${esc(e.at)} · ${esc(e.unit||'')} · ${esc(e.message)}</p>`).join('');
}
function focus(zone){if(zone==='overview'){scene?.focus(null);return;}scene?.select(zone);$('#view-title').textContent=ZONES[zone]?.name||'教学工厂';}
document.addEventListener('change',e=>{
  if(e.target.id==='task'){taskId=e.target.value;render();}
  if(e.target.id==='pallet'){palletId=e.target.value;render();}
  if(e.target.dataset.scan){e.target.checked?scanIds.add(e.target.dataset.scan):scanIds.delete(e.target.dataset.scan);}
});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.zone){focus(b.dataset.zone);return;}
  if(b.dataset.unit){unit=b.dataset.unit;taskId='';scanIds.clear();render();return;}
  if(b.dataset.tab){tab=b.dataset.tab;scanIds.clear();render();focus(tab==='warehouse'?'warehouse':tab==='feed'?'collect':tab==='prepare'?'package':'control');return;}
  if(!state)return;
  if(b.id==='open-issue-card'||b.dataset.do==='issue-card'){renderIssueCard();$('#issue-card').showModal();return;}
  if(b.id==='close-issue-card'){$('#issue-card').close();return;}
  if(b.id==='export'){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${state.config.campaign}-training.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(b.id==='reset'){if(confirm('清空本轮模拟记录并重新演练？')){state=createCampaign(state.config);scanIds.clear();render();scene?.update(sceneState());}return;}
  const action=b.dataset.do,p={task:taskId,pallet:palletId,campaign:state.config.campaign};
  const grams=id=>Math.round(Number($(id)?.value)*1000);
  if(action?.startsWith('go-')){tab=action.slice(3);render();focus(tab==='feed'?'collect':'package');return;}
  if(action==='issue')run('issue',{...p,grams:grams('#issue-grams')});
  if(action==='receive')run('receive',{issue:b.dataset.issue});
  if(action==='return')run('return',{...p,grams:grams('#return-grams')});
  if(action==='unpack'||action==='prepare')run(action,p);
  if(action==='tare'||action==='gross')run(action,{...p,grams:grams(action==='tare'?'#tare-grams':'#gross-grams')});
  if(action==='print'||action==='print-fail')run('print',{tag:b.dataset.tag,fail:action==='print-fail'});
  if(action==='attach')run('attach',{tag:b.dataset.tag,unit});
  if(action==='review')run('review',{unit,tags:[...scanIds]});
  if(action==='feed')run('feed',{tag:$('#feed-tag').value,unit:$('#feed-unit').value,device:$('#device').value,campaign:state.config.campaign});
  if(action==='link')run('link',{unit,kettle:$('#kettle').value});
  if(action==='complete')run('complete',{unit});
  if(action==='downstream'){focus('downstream');scene?.playFlow();}
});
async function load(config){state=createCampaign(config);unit=config.units[0].id;taskId='';scanIds.clear();render();scene?.dispose();$('#factory-scene').replaceChildren();$('#world-labels').replaceChildren();
  try{scene=await createFactoryScene({campaignName:config.campaign,onSelect:focus,onTag:id=>message('标签 '+id+'：在下方查看来源及打印状态'),onPallet:()=>{tab='warehouse';render();},onProgress:text=>{$('#scene-loading').textContent=text;}});scene.update(sceneState());$('#scene-loading').textContent='拖动旋转 · 滚轮缩放 · 点击区域进入';}
  catch(error){$('#scene-loading').textContent='三维场景不可用，右侧业务演练仍可继续：'+error.message;}
}
$('#config-file').addEventListener('change',async e=>{try{const file=e.target.files[0];if(file)await load(JSON.parse(await file.text()));}catch(error){message('场景未载入：'+error.message,true);}});
if(import.meta.env.DEV){try{const response=await fetch('./.local-training/current.json');if(!response.ok)throw new Error('尚无本机场景配置');await load(await response.json());}catch(error){$('#campaign-meta').textContent='请选择本机JSON场景文件。';message(error.message,true);}}
else $('#campaign-meta').textContent='请选择本机JSON场景文件；公开版不内置公司配方。';
