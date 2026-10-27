import {TRAINING_NOTICE} from './instruction-config.js';

// 该配料方案为自定义，不可实际使用。按用户提供截图配置教学数据，不访问MES。
export function factoryRecipe(){
  const materials=[
    ['TC000571','赤藓糖醇'],['TJ000602','碳酸氢钠'],['TJ100027','碳酸氢钠-青岛碱业'],
    ['XJ100272','橘皮味食品用香精003-SC1059052'],['YL01RP2604001','哈的-1-XYJ的品牌1'],['YL02XJ2607006','香精类-橘皮味食品用香精-替3'],
  ];
  return {
    campaign:'CUSTOM-TRAINING',instruction:'自定义生产配料指示卡',qaInstruction:'自定义品保配料指示卡',product:'饮料配投料教学',factory:'教学工厂',
    disclaimer:TRAINING_NOTICE,_comment:TRAINING_NOTICE,sourceLabel:'截图材料自定义教学配置',
    notes:'实际仓（WMS）与虚拟仓（暂存仓）均备有下列6种材料，每种初始库存999kg，领用量自行输入。整包25kg、散称8kg和调配2kg按桶配置；萃取4kg＋6kg按釜配置；品保散称6.66kg按桶配置。替代料共用主料需求，不重复累计。YL01RP2604001原资料按件，本教学按要求另设999kg模拟库存，不表示实际件重换算。'+TRAINING_NOTICE+'。',
    units:[1,2,3].map(i=>({id:`B${i}`,kind:'bucket',name:`第${i}桶`})).concat([1,2].map(i=>({id:`K${i}`,kind:'kettle',name:`萃取第${i}釜`}))),
    lines:[
      {id:'WHOLE',name:'赤藓糖醇·整包',material:'TC000571',unitKind:'bucket',owner:'production',route:'whole',grams:25000,tolerance:0,device:'D-01'},
      {id:'LOOSE',name:'赤藓糖醇·散称',material:'TC000571',unitKind:'bucket',owner:'production',route:'weigh',requiresUnpack:true,grams:8000,tolerance:20,device:'D-01'},
      {id:'MIX',name:'赤藓糖醇·调配',material:'TC000571',unitKind:'bucket',owner:'production',route:'weigh',requiresUnpack:true,grams:2000,tolerance:5,device:'M-01',requiresDevices:['D-01']},
      {id:'QA',name:'橘皮香精·品保散称',material:'XJ100272',alternatives:['YL01RP2604001','YL02XJ2607006'],unitKind:'bucket',owner:'qa',route:'weigh',grams:6660,tolerance:20,minGrams:6640,maxGrams:6680,device:'D-01'},
      {id:'K-A',name:'碳酸氢钠·明细1',material:'TJ000602',alternatives:['TJ100027'],unitKind:'kettle',owner:'production',route:'weigh',requiresUnpack:true,grams:4000,tolerance:10,device:'E-01'},
      {id:'K-B',name:'碳酸氢钠·明细2',material:'TJ000602',alternatives:['TJ100027'],unitKind:'kettle',owner:'production',route:'weigh',requiresUnpack:true,grams:6000,tolerance:20,device:'E-01'},
      {id:'CONTROL-P',name:'赤藓糖醇·中控抽取',material:'TC000571',unitKind:'kettle',owner:'production',route:'control',grams:333000,tolerance:500,device:'E-01'},
      {id:'CONTROL-Q',name:'橘皮香精·中控抽取',material:'XJ100272',unitKind:'bucket',owner:'qa',route:'control',grams:600000,tolerance:20,device:'M-01'},
    ],
    stock:['wms','virtual'].flatMap(warehouseType=>materials.map(([material,name],i)=>({id:`${warehouseType==='wms'?'WMS':'TEMP'}-P${String(i+1).padStart(2,'0')}`,material,name,warehouseType,batch:'CUSTOM-BATCH',grams:999000}))),
  };
}
