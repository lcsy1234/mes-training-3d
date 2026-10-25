export const BATCH = 'TEA-20261025-A';
export const STEPS = [
  { id: 'receive', title: '现场签收', short: '签收', entity: 'pallet', verb: '核对批次，确认签收', hint: '先核对托盘上的物料批次，再确认 100kg 原料已到场。' },
  { id: 'weigh', title: '备料称量', short: '称量', entity: 'scale', verb: '确认称量并打印标签', hint: '将物料桶放到电子秤，按本次任务称出 75kg 净重。' },
  { id: 'feed', title: '扫码投料', short: '投料', entity: 'tank', verb: '扫码校验并投料', hint: '核对标签批次与指定罐体，将其中 70kg 投入 T-01。' },
  { id: 'return', title: '余料退回', short: '退料', entity: 'return', verb: '确认退回 30kg 余料', hint: '汇总未称量的 25kg 和桶内剩余的 5kg，退回共 30kg。' },
];
export function initialState() {
  return { step: 0, received: 0, weighed: 0, fed: 0, returned: 0, mistakes: 0, events: [] };
}
export function quantities(s) {
  return { stock: s.received - s.weighed - (s.returned ? 25 : 0), bucket: s.weighed - s.fed - (s.returned ? 5 : 0), onsite: s.received - s.fed - s.returned };
}
export function perform(s, action, input = {}) {
  const fail = message => ({ ok: false, message, state: { ...s, mistakes: s.mistakes + 1 } });
  if (s.step >= STEPS.length) return { ok: false, message: '本次演练已完成，可重新开始。', state: s };
  if (action !== STEPS[s.step].id) return fail('请先完成前一个环节，业务动作需要按顺序执行。');
  const names = { pallet: '签收托盘', scale: '电子秤', tank: 'T-01 投料罐', return: '退料区' };
  if (input.entity !== STEPS[s.step].entity) return fail(`请先选中${names[STEPS[s.step].entity]}。`);
  let patch, message;
  if (action === 'receive') {
    if (input.batch !== BATCH) return fail('批次不一致：请核对到货标签，当前任务需要 A 批次。');
    patch = { received: 100 }; message = '签收成功：100kg 原料已进入现场，可开始称量。';
  }
  if (action === 'weigh') {
    const weight = Number(input.weight);
    if (!Number.isFinite(weight) || weight <= 0 || Math.abs(weight - 75) > 0.00001) return fail('本演练要求净重正好为 75kg，请调整称量值后再确认。');
    patch = { weighed: 75 }; message = '称量完成：75kg 装桶并生成模拟标签，托盘还剩 25kg。';
  }
  if (action === 'feed') {
    if (input.batch !== BATCH) return fail('标签批次不匹配，投料已拦截。请使用 A 批次标签。');
    if (input.tank !== 'T-01') return fail('设备不匹配，投料已拦截。请切换到任务指定的 T-01。');
    patch = { fed: 70 }; message = '投料成功：70kg 进入 T-01，桶内剩余 5kg。';
  }
  if (action === 'return') {
    if (Number(input.amount) !== quantities(s).onsite) return fail('退料数量不一致，应为托盘 25kg＋桶内 5kg，共 30kg。');
    patch = { returned: 30 }; message = '退料完成：100kg＝投料 70kg＋退回 30kg，数量已闭合。';
  }
  const event = { title: STEPS[s.step].title, message, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) };
  return { ok: true, message, state: { ...s, ...patch, step: s.step + 1, events: [...s.events, event] } };
}
