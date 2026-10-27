// 该配料方案为自定义，不可实际使用。
// Converts already-authorized response snapshots only; never stores authentication.
export const TRAINING_NOTICE='该配料方案为自定义，不可实际使用';
const check=(ok,text)=>{if(!ok)throw new Error(text);};
function grams(value,label){const n=Number(value),g=Math.round(n*1000);check(value!==null&&value!==undefined&&value!==''&&Number.isFinite(n)&&n>=0&&Number.isSafeInteger(g)&&Math.abs(n*1000-g)<0.00001,`${label}不是有效的kg数值。`);return g;}
export function configureInstructions(base,responses,processes){
  const config=structuredClone(base),lines=[],materials=new Map(),unsupported=[],sources=[];
  for(const [owner,expectedType] of [['production',1],['qa',2]]){
    const response=responses[owner];check(response?.code===0&&response.data,`${owner}接口返回失败。`);
    const card=response.data;check(card.type===expectedType&&Array.isArray(card.cardMtls),`${owner}指示书类型或明细不符。`);
    check(!config.formula||config.formula===card.recipeCode,'指示书配方版本与产程不一致。');
    config.formula=card.recipeCode;sources.push({owner,code:card.code,name:card.name,recipeCode:card.recipeCode});
    for(const row of card.cardMtls){
      check(row.parentId===0,'顶层配料行不能是替代料。');
      const process=processes[row.craftsmanshipCode];check(process,`缺少工艺${row.craftsmanshipCode}的教学设备与桶/釜映射。`);
      check(row.unitCode==='kg',`主料${row.materialCode}的单位不支持kg称量。`);
      check([1,2].includes(row.type)&&row.details?.length,'配料方式无效或缺少称量明细。');
      materials.set(row.materialCode,{name:row.materialName,material:row.materialCode});
      if(row.type===1)check(row.details.reduce((sum,d)=>sum+grams(d.weight,'称量重量'),0)===grams(row.produceDosage,'生产用量'),'称量明细合计与生产用量不一致。');
      for(const [index,detail] of row.details.entries()){
        const route=row.type===2?'control':owner==='qa'?'weigh':detail.type===1?'whole':'weigh';
        check(route==='control'||[1,2].includes(detail.type),'手工备料行的称量类型不明确。');
        const target=grams(detail.weight,'称量重量'),tolerance=grams(detail.allowWeight,'允许偏差'),min=grams(detail.weightMin,'重量下限'),max=grams(detail.weightMax,'重量上限');
        check(target>0&&min<=target&&target<=max,'接口重量范围无效。');
        const alternatives=[],excludedAlternatives=[];
        for(const alt of row.cardMtls||[]){
          const a=alt.details?.[index];
          if(alt.unitCode!=='kg'){
            const note={material:alt.materialCode,name:alt.materialName,unit:alt.unitCode,quantity:9999,reason:'接口单位不是kg，未提供重量换算，不允许直接用于kg称量。'};
            excludedAlternatives.push(note);if(!unsupported.some(x=>x.material===note.material))unsupported.push(note);continue;
          }
          const compatible=alt.type===row.type&&a&&a.weight===detail.weight&&a.allowWeight===detail.allowWeight&&a.weightMin===detail.weightMin&&a.weightMax===detail.weightMax&&a.type===detail.type;
          check(compatible,`替代料${alt.materialCode}称量规则不同，需要独立配置，不能沿用主料规则。`);
          alternatives.push(alt.materialCode);materials.set(alt.materialCode,{name:alt.materialName,material:alt.materialCode});
        }
        lines.push({id:`API-${row.id}-${detail.id}`,name:`${row.materialName}·${row.craftsmanshipName}${row.details.length>1?'·明细'+(index+1):''}`,material:row.materialCode,owner,unitKind:process.unitKind,route,grams:target,tolerance,minGrams:min,maxGrams:max,device:process.device,position:detail.positionCode,requiresUnpack:route==='weigh'&&owner==='production',alternatives,excludedAlternatives,sourceCode:card.code,sourceRowId:row.id,sourceDetailId:detail.id,produceDosage:row.produceDosage,recipeDosage:row.recipeDosage,sourcePreparationType:row.type,sourceWeighingType:detail.type,sourceSpec:row.spec,sourcePackageKg:row.weight,teachingSettings:'脱包要求、容器皮重、稳定时间及设备映射为教学配置。',...(process.requiresDevices&&route!=='control'?{requiresDevices:process.requiresDevices}:{})});
      }
    }
  }
  config.lines=lines;config.instruction=sources.find(s=>s.owner==='production').code;config.qaInstruction=sources.find(s=>s.owner==='qa').code;
  config.instructionSources=sources;config.disclaimer=TRAINING_NOTICE;config._comment=TRAINING_NOTICE;
  config.unsupportedStock=unsupported;
  config.stock=[...materials.values()].map((m,i)=>{const existing=base.stock.find(p=>p.material===m.material);return {...m,id:existing?.id||`SIM-API-P${String(i+1).padStart(2,'0')}`,batch:existing?.batch||'SIM-API-TRAINING',warehouseType:existing?.warehouseType||'virtual',grams:9999000};});
  return config;
}
