// Pure training state. No MES requests and no production data embedded here.
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function validateConfig(c){
  check(c?.campaign&&Array.isArray(c.units)&&c.units.length&&Array.isArray(c.lines)&&c.lines.length&&Array.isArray(c.stock),'场景缺少产程、任务单元、配料明细或托盘。');
  check(new Set(c.units.map(u=>u.id)).size===c.units.length,'任务单元编号重复。');
  check(new Set(c.lines.map(l=>l.id)).size===c.lines.length,'配料明细编号重复。');
  check(new Set(c.stock.map(p=>p.id)).size===c.stock.length,'托盘编号重复。');
  for(const p of c.stock)check(p.material&&p.batch&&Number.isSafeInteger(p.grams)&&p.grams>0,'托盘物料、批次或数量无效。');
  for(const l of c.lines){
    check(['whole','weigh','control'].includes(l.route)&&['production','qa'].includes(l.owner),'明细分流无效。');
    check(Number.isSafeInteger(l.grams)&&l.grams>0&&Number.isSafeInteger(l.tolerance)&&l.tolerance>=0,'明细重量必须为整数克。');
    check(c.units.some(u=>u.kind===l.unitKind),'明细缺少对应任务单元。');
    check(l.owner!=='qa'||l.route==='weigh','品保配料必须走PAD称量。');
  }
  return c;
}
export function createCampaign(config){
  const c=structuredClone(validateConfig(config));
  const tasks=c.units.flatMap(u=>c.lines.filter(l=>l.unitKind===u.kind&&l.route!=='control').map(l=>({...l,id:`${u.id}:${l.id}`,lineId:l.id,unit:u.id,tagId:null,scale:null})));
  return {config:c,tasks,pallets:c.stock.map(p=>({...p,initial:p.grams,warehouse:p.grams,transit:0,signed:0,available:0,prepared:0,returned:0})),issues:[],tags:[],reviews:[],feeds:[],processes:[],links:{},events:[],sequence:0};
}
export function unitTasks(s,unit){return s.tasks.filter(t=>t.unit===unit);}
export function issuePlan(s){
  const groups=new Map();
  for(const task of s.tasks){
    if(!groups.has(task.material))groups.set(task.material,{material:task.material,materials:new Set([task.material]),grams:0,details:new Map()});
    const g=groups.get(task.material);g.grams+=task.grams;(task.alternatives||[]).forEach(m=>g.materials.add(m));
    const detail=g.details.get(task.lineId)||{name:task.name,unitKind:task.unitKind,grams:task.grams,count:0,owner:task.owner};detail.count++;g.details.set(task.lineId,detail);
  }
  return [...groups.values()].map(g=>{
    const stocks=s.pallets.filter(p=>g.materials.has(p.material)),warehouse=stocks.reduce((n,p)=>n+p.warehouse,0),pending=stocks.reduce((n,p)=>n+p.transit,0),signed=stocks.reduce((n,p)=>n+p.signed-p.returned,0),issued=pending+signed;
    return {material:g.material,materials:[...g.materials],name:stocks.find(p=>p.material===g.material)?.name||g.material,grams:g.grams,details:[...g.details.values()],warehouse,pending,signed,issued,remaining:Math.max(0,g.grams-issued),excess:Math.max(0,issued-g.grams)};
  });
}
export function unitReady(s,unit){const tasks=unitTasks(s,unit);return tasks.length>0&&tasks.every(t=>{const tag=s.tags.find(x=>x.id===t.tagId);return tag?.printed&&tag.attached;});}
export function missingForUnit(s,unit){return unitTasks(s,unit).filter(t=>{const tag=s.tags.find(x=>x.id===t.tagId);return !tag?.printed||!tag.attached;}).map(t=>`${t.owner==='qa'?'品保':'生产'} · ${t.name} ${t.grams/1000}kg`);}
export function campaignLedger(s){
  const initial=s.pallets.reduce((n,p)=>n+p.initial,0),warehouse=s.pallets.reduce((n,p)=>n+p.warehouse,0),transit=s.pallets.reduce((n,p)=>n+p.transit,0),available=s.pallets.reduce((n,p)=>n+p.available,0);
  const prepared=s.tags.filter(t=>!t.fed).reduce((n,t)=>n+t.grams,0),fed=s.feeds.reduce((n,f)=>n+f.grams,0);
  return {initial,warehouse,transit,available,prepared,fed,difference:initial-warehouse-transit-available-prepared-fed};
}
const nextId=(s,prefix)=>`${prefix}-${String(++s.sequence).padStart(4,'0')}`;
export function campaignAct(state,type,p={},now=Date.now()){
  const s=structuredClone(state);
  try{
    const task=s.tasks.find(t=>t.id===p.task),pallet=s.pallets.find(x=>x.id===p.pallet),tag=s.tags.find(t=>t.id===p.tag);
    let message='';
    if(type==='issue'){
      check(pallet,'请扫描有效托盘码。');check(p.campaign===s.config.campaign,'领料产程不符。');
      check(Number.isSafeInteger(p.grams)&&p.grams>0&&p.grams<=pallet.warehouse,'领料量超过托盘未领量或输入无效。');
      const issue={id:nextId(s,'ISSUE'),pallet:pallet.id,grams:p.grams,status:pallet.warehouseType==='wms'?'pending':'signed'};
      pallet.warehouse-=p.grams;s.issues.push(issue);
      if(issue.status==='pending')pallet.transit+=p.grams;else{pallet.signed+=p.grams;pallet.available+=p.grams;}
      message=issue.status==='pending'?'WMS模拟发货成功，生成待签收单。':'虚拟仓领料并自动签收，领料单已记录。';
    }else if(type==='receive'){
      const issue=s.issues.find(x=>x.id===p.issue);check(issue?.status==='pending','没有未处理的签收单；重复签收不入账。');
      const stock=s.pallets.find(x=>x.id===issue.pallet);stock.transit-=issue.grams;stock.signed+=issue.grams;stock.available+=issue.grams;issue.status='signed';message='签收完成，可直接开始对应物料备料。';
    }else if(type==='unpack'||type==='tare'||type==='gross'||type==='prepare'){
      check(task&&!task.tagId,'任务不存在或已备料；请查看原标签。');
      check(pallet&&[task.material,...(task.alternatives||[])].includes(pallet.material),'托盘物料与任务不符，且不在允许替代料内。');
      check(pallet.available>0,'该托盘尚无签收可用量。');
      if(type==='unpack'){
        check(task.route==='weigh'&&task.requiresUnpack,'该任务不需要脱包，整包不脱包。');
        task.scale={pallet:pallet.id,unpackCode:nextId(s,'UNPACK'),tare:null,gross:0,changedAt:now};message='散称脱包完成，记录来源继承，不扣减物料。';
      }else if(type==='tare'){
        check(task.route==='weigh','整包任务不上秤、不去皮。');check(!task.requiresUnpack||task.scale?.unpackCode,'请先完成此散称任务脱包。');
        check(Number.isSafeInteger(p.grams)&&p.grams>0,'请输入空容器实际皮重。');
        check(!task.scale||task.scale.pallet===pallet.id,'来源已改变，请重新处理散称任务。');
        task.scale={...task.scale,pallet:pallet.id,tare:p.grams,gross:p.grams,changedAt:now};message='空容器去皮完成。';
      }else if(type==='gross'){
        check(task.scale?.pallet===pallet.id&&task.scale.tare!==null,'请先对当前来源执行空容器去皮。');
        check(Number.isSafeInteger(p.grams)&&p.grams>=task.scale.tare,'毛重不得小于皮重。');task.scale.gross=p.grams;task.scale.changedAt=now;message='秤重已变化，重新等待稳定。';
      }else{
        let grams=task.grams;
        if(task.route==='weigh'){
          check(task.scale?.pallet===pallet.id&&task.scale.tare!==null,'散称任务尚未去皮。');
          grams=task.scale.gross-task.scale.tare;check(Math.abs(grams-task.grams)<=task.tolerance,'净重不在任务允许范围内。');check(now-task.scale.changedAt>=1000,'秤尚未稳定1秒。');
        }
        check(grams<=pallet.available,'备料不能超过当前托盘的已签收可用量。');
        pallet.available-=grams;pallet.prepared+=grams;
        const label={id:nextId(s,'LABEL'),task:task.id,unit:task.unit,owner:task.owner,material:pallet.material,batch:pallet.batch,pallet:pallet.id,campaign:s.config.campaign,grams,parent:task.scale?.unpackCode||pallet.id,printed:false,attached:false,attempts:0,fed:false};
        s.tags.push(label);task.tagId=label.id;message='备料业务已完成；请打印并核对贴标。';
      }
    }else if(type==='print'){
      check(tag,'标签不存在。');tag.attempts++;tag.printed=p.fail?tag.printed:true;message=p.fail?'模拟缺纸；业务已保留，可补打原标签。':'原标签打印成功，不重复扣量。';
    }else if(type==='attach'){
      check(tag?.printed,'请先打印标签。');check(tag.unit===p.unit,'贴标目标桶/釜号不一致。');tag.attached=true;message='实物标签核对完成。';
    }else if(type==='review'){
      check(unitReady(s,p.unit),`该桶/釜未齐套：${missingForUnit(s,p.unit).join('；')}`);
      const ids=unitTasks(s,p.unit).map(t=>t.tagId);check(Array.isArray(p.tags)&&p.tags.length===ids.length&&new Set(p.tags).size===ids.length&&ids.every(id=>p.tags.includes(id)),'复核须扫描该桶/釜全部标签，不能漏扫或重复扫码。');
      check(!s.reviews.includes(p.unit),'该桶/釜已复核。');s.reviews.push(p.unit);message='当前桶/釜领料复核完成，其他桶无需全部备完。';
    }else if(type==='feed'){
      check(tag&&!tag.fed,'标签不存在或已经投料。');check(tag.campaign===p.campaign&&tag.unit===p.unit,'标签产程或桶/釜号不符。');
      check(s.reviews.includes(tag.unit)&&unitReady(s,tag.unit),'投料前须完成当前桶/釜生产与品保齐套及领料复核。');
      const t=s.tasks.find(x=>x.id===tag.task);check(p.device===t.device,'设备与此任务工艺不一致。');
      for(const device of t.requiresDevices||[])check(unitTasks(s,tag.unit).filter(x=>x.device===device).every(x=>s.tags.find(y=>y.id===x.tagId)?.fed),'前序工艺物料尚未全部投入，不能直接进入调配。');
      tag.fed=true;s.feeds.push({tag:tag.id,unit:tag.unit,device:p.device,grams:tag.grams});message='扫码投料成功，标签实际净重记入耗用。';
    }else if(type==='link'){
      check(s.config.units.some(u=>u.id===p.unit&&u.kind==='bucket')&&s.config.units.some(u=>u.id===p.kettle&&u.kind==='kettle'),'请选择有效生产桶及萃茶釜。');
      check(!s.processes.includes(p.unit),'此桶已结束，不能更改釜关联。');s.links[p.unit]=p.kettle;message='教学釜桶关联已记录，不代表测试系统的实际分配协议。';
    }else if(type==='complete'){
      const unit=s.config.units.find(u=>u.id===p.unit);check(unit,'任务单元不存在。');check(!s.processes.includes(p.unit),'当前单元已经完成。');
      check(s.reviews.includes(p.unit)&&unitTasks(s,p.unit).every(t=>s.tags.find(x=>x.id===t.tagId)?.fed),'本桶/釜尚未全部复核投料。');
      if(unit.kind==='bucket')check(s.processes.includes(s.links[p.unit]),'请先关联并完成对应萃茶釜；关联是本课教学设置。');
      s.processes.push(p.unit);message='当前桶/釜工艺演示完成。';
    }else if(type==='return'){
      check(pallet&&Number.isSafeInteger(p.grams)&&p.grams>0&&p.grams<=pallet.available,'退料仅能退未备料的签收可用余量。');
      pallet.available-=p.grams;pallet.warehouse+=p.grams;pallet.returned+=p.grams;message='剩余原料模拟退回原托盘，已备料或已投料量不会退回。';
    }else throw new Error('未知操作。');
    check(campaignLedger(s).difference===0,'数量账不平，操作撤销。');
    s.events.push({at:new Date(now).toISOString(),type,unit:p.unit||task?.unit,message});return {ok:true,state:s,message};
  }catch(error){return {ok:false,state,message:error.message};}
}
