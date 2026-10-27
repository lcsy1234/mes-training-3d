import {TRAINING_NOTICE} from './instruction-config.js';
// Public sample is deliberately independent of private MES response snapshots.
function publicSample(){
  return {
    campaign:'CUSTOM-TRAINING',instruction:'CUSTOM-PRODUCTION',qaInstruction:'CUSTOM-QA',product:'自定义教学产品',factory:'教学工厂',disclaimer:TRAINING_NOTICE,_comment:TRAINING_NOTICE,
    sourceLabel:'公开自定义教学样例（非接口配置）',
    notes:TRAINING_NOTICE+'。当前为可直接操作的公开教学样例，采用模拟物料和模拟用量；本机接口快照配置需在本机开发服务打开，或手动载入。',
    units:[1,2,3].map(i=>({id:`B${i}`,kind:'bucket',name:`第${i}桶`})).concat([1,2].map(i=>({id:`K${i}`,kind:'kettle',name:`萃取第${i}釜`}))),
    lines:[
      {id:'WHOLE',name:'教学主料A·整包',material:'DEMO-A',unitKind:'bucket',owner:'production',route:'whole',grams:25000,tolerance:0,device:'D-01'},
      {id:'LOOSE',name:'教学主料A·散称',material:'DEMO-A',unitKind:'bucket',owner:'production',route:'weigh',requiresUnpack:true,grams:5000,tolerance:20,device:'D-01'},
      {id:'MIX',name:'教学主料A·调配',material:'DEMO-A',unitKind:'bucket',owner:'production',route:'weigh',requiresUnpack:true,grams:2000,tolerance:5,device:'M-01',requiresDevices:['D-01']},
      {id:'QA',name:'品保教学料C',material:'DEMO-C',unitKind:'bucket',owner:'qa',route:'weigh',grams:500,tolerance:10,device:'D-01'},
      {id:'K-A',name:'萃取教学料B·明细1',material:'DEMO-B',alternatives:['DEMO-B-ALT'],unitKind:'kettle',owner:'production',route:'weigh',requiresUnpack:true,grams:4000,tolerance:10,device:'E-01'},
      {id:'K-B',name:'萃取教学料B·明细2',material:'DEMO-B',alternatives:['DEMO-B-ALT'],unitKind:'kettle',owner:'production',route:'weigh',requiresUnpack:true,grams:6000,tolerance:20,device:'E-01'},
    ],
    stock:[['DEMO-A','教学主料A','virtual'],['DEMO-B','萃取教学料B','wms'],['DEMO-C','品保教学料C','virtual'],['DEMO-B-ALT','萃取教学料B替代料','wms']].map(([material,name,warehouseType],i)=>({id:`SIM-P${i+1}`,material,name,warehouseType,batch:'SIM-BATCH',grams:9999000})),
  };
}
export async function bootCampaign({local,fetchConfig,load}){
  if(local){try{return await load({...await fetchConfig(),sourceLabel:'本机接口快照配置'});}catch(error){return load({...publicSample(),loadNote:'本机配置未载入，已切换至公开教学样例：'+error.message});}}
  return load(publicSample());
}
