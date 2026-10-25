export const CHAPTERS = [
  { title: '认识任务与来源', short: '领料签收', zone: 'warehouse', hint: '核对教学产程与批次，完成仓储到生产的交接。' },
  { title: '整包备料', short: '整包备料', zone: 'package', hint: '三份生产任务，每份 25kg；先体验来源不足，再完成备料和贴标。' },
  { title: '脱包与小料称量', short: '脱包称量', zone: 'unpack', hint: '来源码继承到脱包码，再通过去皮和称量生成小料标签。' },
  { title: '整桶汇集与投料', short: '汇集投料', zone: 'collect', hint: '按任务桶号归集物料，分别送往溶解、萃取和调配工位。' },
];
export const MATERIALS = { BULK: '赤藓糖醇', SMALL: '小料 A（教学）', TEA: '茶叶（教学）', WRONG: '其他物料' };
export const kg = grams => (grams / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
const TAG_NAMES = { raw:'原料码', unpack:'脱包码', overall:'整包码', weigh:'称量码', tea:'茶叶备料码' };
export const tagName = kind => TAG_NAMES[kind] || kind;
export function createFactoryState(mode = 'bucket') {
  const bag = mode === 'bag';
  const seeds = bag ? [['RAW-150','BULK',150000]] : [['RAW-20','BULK',20000],['RAW-77','BULK',77000],['SMALL-RAW','SMALL',5000],['TEA-RAW','TEA',3000]];
  const tags = {};
  for (const [id,material,grams] of [...seeds,['WRONG','WRONG',1000],['UNSIGNED','BULK',50000]]) tags[id] = {
    id, kind:'raw', material, batch:id === 'UNSIGNED' ? 'DEMO-B' : 'DEMO-A', grams,
    remainingGrams:grams, received:false, printed:true, attached:true, bucket:0,
    parentIds:[], allocations:[], location:'warehouse', itemGrams:25000,
  };
  return {
    mode:bag ? 'bag' : 'bucket', chapter:0, finished:false, campaign:'DEMO-P01', roots:seeds.map(x=>x[0]), tags,
    selectedSources:[], packageTasks:[1,2,3].map(bucket=>({id:`P-${bucket}`,bucket,grams:bag?50000:25000,done:false,tagIds:[]})),
    smallTasks:bag ? [] : [1,2,3].map(bucket=>({id:`W-${bucket}`,bucket,done:false,tagIds:[]})),
    labelType:null, printJobs:[], unpackId:null, scale:{tareSet:false,tareGrams:0,grossGrams:100,changedAt:0},
    carts:{1:[],2:[],3:[]}, feeds:[], sequence:0, mistakes:0, events:[], teaPrepared:false,
  };
}
export function ledger(s) {
  const receivedGrams = s.roots.reduce((sum,id)=>sum+(s.tags[id].received?s.tags[id].grams:0),0);
  const remainingGrams = Object.values(s.tags).filter(t=>t.received).reduce((sum,t)=>sum+t.remainingGrams,0);
  const fedGrams = s.feeds.reduce((sum,f)=>sum+f.grams,0);
  return {receivedGrams,remainingGrams,fedGrams,differenceGrams:receivedGrams-remainingGrams-fedGrams};
}
export function scaleStatus(s, now) {
  const netGrams = s.scale.grossGrams - s.scale.tareGrams;
  if (!s.scale.tareSet) return {kind:'tare',text:'请先空容器去皮',netGrams};
  if (netGrams < 490) return {kind:'under',text:'欠量 · 请继续加料',netGrams};
  if (netGrams > 510) return {kind:'over',text:'超量 · 请减料',netGrams};
  if (now-s.scale.changedAt < 1000) return {kind:'settling',text:'范围合格 · 等待稳定 1 秒',netGrams};
  return {kind:'ready',text:'重量合格且已稳定',netGrams};
}
export function traceTag(s, id) {
  const result=[], seen=new Set();
  function visit(key) { if(seen.has(key)||!s.tags[key])return; seen.add(key); result.push(s.tags[key]);s.tags[key].parentIds.forEach(visit); }
  visit(id); return result;
}
const prepared = (s,kind) => Object.values(s.tags).filter(t=>t.kind===kind);
const verified = tags => tags.length>0 && tags.every(t=>t.printed&&t.attached);
export function cartReady(s,bucket) {
  const expected = Object.values(s.tags).filter(t=>t.bucket===Number(bucket)&&['overall','weigh','tea'].includes(t.kind));
  return expected.some(t=>t.kind==='overall') && expected.some(t=>t.kind==='weigh') && expected.some(t=>t.kind==='tea') && expected.every(t=>s.carts[bucket]?.includes(t.id));
}
export function chapterReady(s) {
  if(s.finished)return false;
  if(s.chapter===0)return s.roots.every(id=>s.tags[id].received);
  if(s.chapter===1)return s.packageTasks.every(t=>t.done)&&verified(prepared(s,'overall'));
  if(s.chapter===2)return s.smallTasks.every(t=>t.done)&&verified(prepared(s,'weigh'));
  const tags=Object.values(s.tags).filter(t=>['overall','weigh','tea'].includes(t.kind));
  return s.teaPrepared&&tags.length>0&&tags.every(t=>t.remainingGrams===0);
}
function requireCondition(test,message) { if(!test)throw new Error(message); }
function newId(s,prefix) { s.sequence++;return `${prefix}-${String(s.sequence).padStart(3,'0')}`; }
function childTag(s,kind,grams,parents,bucket,location) {
  const allocations=[];let rest=grams;
  for(const id of parents) {
    const source=s.tags[id];const used=Math.min(rest,source.remainingGrams);
    if(used>0){source.remainingGrams-=used;allocations.push({id,grams:used});rest-=used;}
    if(rest===0)break;
  }
  requireCondition(rest===0,'来源剩余重量不足，操作未执行。');
  const id=newId(s,kind.toUpperCase()), root=s.tags[allocations[0].id];
  s.tags[id]={id,kind,grams,remainingGrams:grams,material:root.material,batch:root.batch,bucket,
    parentIds:allocations.map(x=>x.id),allocations,location,received:true,printed:false,attached:false};
  return id;
}
function printJob(s,ids,title) {
  const id=newId(s,'PRINT');s.printJobs.push({id,title,tagIds:ids,status:'queued',attempts:0});
  ids.forEach(key=>{s.tags[key].jobId=id;});
}
function perform(s,type,p,now) {
  const needChapter=n=>requireCondition(s.chapter===n&&!s.finished,'请按当前章节顺序完成操作。');
  if(type==='receive') {
    needChapter(0);requireCondition(p.campaign===s.campaign,'产程不一致，请选择 DEMO-P01。');
    requireCondition(p.batch==='DEMO-A','批次不一致，请核对 DEMO-A 到货标签。');
    requireCondition(!s.roots.every(id=>s.tags[id].received),'本轮来源已签收，无需重复签收。');
    s.roots.forEach(id=>{s.tags[id].received=true;s.tags[id].location='warehouse';});
    return '已按物料、批次记录签收；签收成功不代表已经备料或投料。';
  }
  if(type==='advance') {
    requireCondition(chapterReady(s),'当前章节尚未完成：请核对任务、标签打印和实物贴标。');
    if(s.chapter===3||(s.mode==='bag'&&s.chapter===1)){s.finished=true;return '演练完成，任务、标签与数量账已核对。';}
    s.chapter++;return `进入${CHAPTERS[s.chapter].title}，前面的记录已保留。`;
  }
  if(type==='scan') {
    needChapter(1);const t=s.tags[p.sourceId];requireCondition(t,'来源码不存在。');
    requireCondition(t.material==='BULK','扫码物料与整包备料任务不一致。');
    requireCondition(t.kind==='raw'||t.kind==='unpack','整包备料只接受原料码或脱包码。');
    requireCondition(t.received,'该物料批次尚未签收，不能用于备料。');
    requireCondition(t.remainingGrams>0,'来源码没有可用余额。');
    requireCondition(!s.selectedSources.includes(t.id),'同一码已经选中，重复扫码不会增加可用重量。');
    s.selectedSources.push(t.id);return `已选择 ${t.id}，可用 ${kg(t.remainingGrams)}kg。`;
  }
  if(type==='remove-source') {needChapter(1);s.selectedSources=s.selectedSources.filter(id=>id!==p.sourceId);return '已移除来源选择，来源实际余额未改变。';}
  if(type==='package') {
    needChapter(1);const count=Number(p.count),pending=s.packageTasks.filter(t=>!t.done);
    requireCondition(Number.isSafeInteger(count)&&count>0&&count<=pending.length,`贴码桶数须为 1～${pending.length} 的整数；它代表任务份数。`);
    requireCondition(['bucket','bag'].includes(p.labelType),'请选择按桶或按包贴码。');
    requireCondition(!s.labelType||s.labelType===p.labelType,'本物料已有完成记录，请沿用已确定的贴码方式。');
    const ids=s.selectedSources;requireCondition(ids.length>0,'请先扫描合格来源码。');
    const tasks=pending.slice(0,count),need=tasks.reduce((sum,t)=>sum+t.grams,0);
    const available=ids.reduce((sum,id)=>sum+s.tags[id].remainingGrams,0);
    requireCondition(available>=need,`来源可用 ${kg(available)}kg，不足本次 ${kg(need)}kg；不会扣料或完成任务。`);
    s.labelType=p.labelType;const labels=[];
    for(const task of tasks) {
      const unit=p.labelType==='bag'?s.tags[ids[0]].itemGrams:task.grams;
      requireCondition(Number.isSafeInteger(unit)&&unit>0&&task.grams%unit===0,'当前包装重量无法整除任务需求，请核对包装规格。');
      requireCondition(p.labelType!=='bag'||ids.every(id=>s.tags[id].itemGrams===unit),'按包贴码请使用同一最小包装规格。');
      for(let i=0;i<task.grams/unit;i++) {
        const id=childTag(s,'overall',unit,ids,task.bucket,'package');task.tagIds.push(id);labels.push(id);
      }
      task.done=true;
    }
    printJob(s,labels,'整包备料标签');
    return `备料业务成功：完成 ${count} 份任务，生成 ${labels.length} 张标签；请另行打印、贴标。`;
  }
  if(type==='print') {
    requireCondition(!s.finished,'本轮演练已完成，请重新开始后操作。');
    const job=s.printJobs.find(j=>j.id===p.jobId);requireCondition(job,'打印作业不存在。');
    job.attempts++;job.status=p.fail?'failed':'printed';
    if(!p.fail)job.tagIds.forEach(id=>{s.tags[id].printed=true;});
    return p.fail?'模拟缺纸：业务记录已保存，纸张未输出。请查明细后补打，勿重复完成任务。':`已${job.attempts>1?'补打':'打印'}原标签；来源余额与任务份数保持不变。`;
  }
  if(type==='attach') {
    requireCondition(!s.finished,'本轮演练已完成。');const t=s.tags[p.tagId];requireCondition(t&&t.kind!=='raw','请选中已生成的业务标签。');
    requireCondition(t.printed,'纸张尚未打印成功，请先处理打印作业。');
    requireCondition(Number(p.bucket)===t.bucket,`标签属于第 ${t.bucket||'脱包'} 任务位，不能贴到其他桶号。`);
    requireCondition(!t.attached,'这张标签已经核对贴附，无需重复贴标。');
    t.attached=true;return `标签 ${t.id} 已与对应实物核对贴附。`;
  }
  if(type==='unpack') {
    needChapter(2);requireCondition(!s.unpackId,'本课脱包已完成，请使用现有脱包码。');
    const t=s.tags[p.sourceId];requireCondition(t?.kind==='raw'&&t.material==='SMALL'&&t.received,'请选择已签收的小料原料码。');
    s.unpackId=childTag(s,'unpack',t.remainingGrams,[t.id],0,'unpack');
    printJob(s,[s.unpackId],'脱包标签');return '脱包成功：物料与批次继承到脱包码，原料总量不增加。';
  }
  if(type==='gross') {
    needChapter(2);requireCondition(Number.isSafeInteger(p.grams)&&p.grams>=100&&p.grams<=1100,'毛重须为 0.10～1.10kg，请核对输入。');
    s.scale.grossGrams=p.grams;s.scale.changedAt=now;return '模拟秤示数已改变，稳定计时重新开始。';
  }
  if(type==='tare') {
    needChapter(2);requireCondition(s.scale.grossGrams===100,'请先清空物料，只保留 0.10kg 空容器再去皮。');
    s.scale.tareSet=true;s.scale.tareGrams=100;s.scale.changedAt=now;return '空容器去皮完成：皮重 0.10kg。';
  }
  if(type==='weigh') {
    needChapter(2);const unpack=s.tags[s.unpackId];requireCondition(unpack?.printed&&unpack.attached,'先完成脱包标签打印并核对贴标。');
    const status=scaleStatus(s,now);requireCondition(status.kind==='ready',status.text);
    const task=s.smallTasks.find(t=>t.bucket===Number(p.bucket));requireCondition(task&&!task.done,'请选择尚未完成的称量任务桶号。');
    const id=childTag(s,'weigh',status.netGrams,[s.unpackId],task.bucket,'weigh');
    task.done=true;task.tagIds=[id];printJob(s,[id],`第 ${task.bucket} 桶称量标签`);
    s.scale={tareSet:false,tareGrams:0,grossGrams:100,changedAt:now};
    return `第 ${task.bucket} 桶称量完成，净重 ${kg(status.netGrams)}kg；请打印并贴标。`;
  }
  if(type==='prepare-tea') {
    needChapter(3);requireCondition(!s.teaPrepared,'茶叶教学标签已经生成，请查看现有记录。');
    requireCondition(s.tags['TEA-RAW']?.received,'茶叶来源尚未签收。');
    const ids=[1,2,3].map(bucket=>childTag(s,'tea',1000,['TEA-RAW'],bucket,'package'));
    s.teaPrepared=true;printJob(s,ids,'茶叶教学备料标签');return '三份茶叶教学物料已准备，每份 1kg；此数量用于路线演示，不是产品配方。';
  }
  if(type==='collect') {
    needChapter(3);const t=s.tags[p.tagId],bucket=Number(p.bucket);
    requireCondition(t&&['overall','weigh','tea'].includes(t.kind),'请选中备料或称量标签。');
    requireCondition(t.printed&&t.attached,'请先完成标签打印及实物贴标。');
    requireCondition(t.bucket===bucket,'任务桶号不一致，禁止归入其他桶号的料车。');
    requireCondition(t.remainingGrams>0,'该物料已经投料，不能再次归集。');
    requireCondition(!s.carts[bucket].includes(t.id),'物料已经在对应料车中，重复放置不增加数量。');
    s.carts[bucket].push(t.id);t.location=`cart-${bucket}`;return `已归集第 ${bucket} 桶：${MATERIALS[t.material]} ${kg(t.grams)}kg。`;
  }
  if(type==='feed') {
    needChapter(3);const t=s.tags[p.tagId],bucket=Number(p.bucket);
    requireCondition(t&&['overall','weigh','tea'].includes(t.kind),'请选择本课待投料标签。');
    requireCondition(t.bucket===bucket,'标签任务桶号与当前投料任务不一致。');
    requireCondition(cartReady(s,bucket),'本桶物料尚未汇集齐全：需要整包料、称量料和茶叶教学物料。');
    const device={overall:'D-01',tea:'E-01',weigh:'M-01'}[t.kind];
    requireCondition(p.device===device,`设备不匹配：该物料应投到 ${device}。`);
    requireCondition(t.remainingGrams>0,'该标签已经投料，重复扫码不能再次扣料。');
    if(t.kind==='weigh')requireCondition(s.feeds.some(f=>f.bucket===bucket&&f.kind==='overall')&&s.feeds.some(f=>f.bucket===bucket&&f.kind==='tea'),'先完成本桶溶解与萃取教学路线，再向调配桶加入小料。');
    const grams=t.remainingGrams;t.remainingGrams=0;t.location=device;
    s.feeds.push({tagId:t.id,bucket,device,grams,kind:t.kind});
    return `${MATERIALS[t.material]} ${kg(grams)}kg 已投到 ${device}；${t.kind==='weigh'?'调配教学投料完成。':'中间料沿对应管路汇入调配桶（教学动画）。'}`;
  }
  throw new Error('未知操作，未修改演练数据。');
}
export function act(state,type,payload={},now=Date.now()) {
  const next=structuredClone(state);
  try {
    const message=perform(next,type,payload,now);
    if(ledger(next).differenceGrams!==0)throw new Error('数量账未闭合，本次操作已撤销。');
    next.events.push({id:next.events.length+1,type,message,time:new Date(now).toISOString(),success:true});
    return {ok:true,state:next,message};
  } catch(error) {
    const failed={...state,mistakes:state.mistakes+1,events:[...state.events,{id:state.events.length+1,type,message:error.message,time:new Date(now).toISOString(),success:false}]};
    return {ok:false,state:failed,message:error.message};
  }
}
