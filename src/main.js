import './style.css';
import { BATCH, STEPS, initialState, perform, quantities } from './training.js';
import { createScene, ENTITIES } from './scene.js';

let state = initialState(), selected = 'pallet', scene, busy = false, formError = '', toastTimer;
const $ = selector => document.querySelector(selector);
const info = '<dl class="info-box"><div><dt>生产产程</dt><dd>MO-DEMO-001</dd></div><div><dt>物料名称</dt><dd>茶饮料原料（教学）</dd></div><div><dt>任务批次</dt><dd>TEA-20261025-A</dd></div></dl>';
const batchSelect = (label = '到货标签批次') => `<label class="form-label" for="batch">${label}</label><select id="batch"><option value="${BATCH}">A 批次 · TEA-20261025-A</option><option value="TEA-20261025-B">B 批次 · 尝试不匹配标签</option></select>`;
const tips = [
  '到货、签收、投料是三个不同的业务动作。<b>签收成功，不代表已经投料。</b>',
  '本场景称量净重固定为 75kg。<b>75kg 装桶后，现场总量仍是 100kg。</b>',
  '本次只投 70kg。<b>桶内剩余 5kg，托盘上仍有 25kg。</b>标签余额和任务进度需要分别记录。',
  '退回包括两个来源：<b>托盘 25kg＋桶内 5kg。</b>本演练模拟实物与数量账，不模拟外部系统回传。',
];
function form(step) {
  if (step === 0) return `<div class="quantity-emphasis"><span>待签收数量</span><strong>100<small>kg</small></strong></div><div class="form-section">${batchSelect()}<p class="form-help">可以切换到 B 批次，体验批次不符时的拦截。</p></div>`;
  if (step === 1) return '<div class="quantity-emphasis"><span>任务目标净重</span><strong>75<small>kg</small></strong></div><div class="form-section"><label class="form-label" for="weight">电子秤净重（kg）</label><input class="weight-input" id="weight" type="number" min="0" max="100" step="0.1" value="74" inputmode="decimal"><p class="form-help">当前示数 74kg，请调整为任务要求的 75kg。教学示数可手动输入。</p></div>';
  if (step === 2) return `<div class="quantity-emphasis"><span>本次投料数量</span><strong>70<small>kg</small></strong></div><div class="form-section">${batchSelect('模拟扫码 · 标签批次')}</div><div class="form-section"><label class="form-label" for="tank">目标设备</label><select id="tank"><option value="T-01">T-01 · 本产程指定罐体</option><option value="T-02">T-02 · 其他产程罐体</option></select></div>`;
  return '<div class="quantity-emphasis"><span>待退回数量</span><strong>30<small>kg</small></strong></div><div class="form-section"><label class="form-label" for="amount">核对本次退料（kg）</label><input class="weight-input" id="amount" type="number" min="0" max="100" value="30" inputmode="decimal"><p class="form-help">托盘未称量 25kg ＋ 桶内剩余 5kg。</p></div>';
}
function renderTask() {
  if (state.step === 4) {
    $('#step-count').textContent = '04 / 04';
    $('#task-content').innerHTML = `<div class="completion-badge">✓</div><h2 id="lesson-title" tabindex="-1">这批原料，有了完整去向。</h2><p class="task-description">你已经走完签收、称量、投料和退料，完成一次物料流转演练。</p><div class="balance-summary"><span>签收原料</span><strong>100 <small>kg</small></strong></div><div class="balance-summary"><span>投入 T-01</span><strong>70 <small>kg</small></strong></div><div class="balance-summary"><span>余料退回</span><strong>30 <small>kg</small></strong></div><p class="completion-note">数量核对：100＝70＋30 ✓<br>已完成 ${state.events.length} 个环节，尝试并纠正 ${state.mistakes} 次无效操作。<br>记住：实物变化、任务状态和外部回传需要分别核对。</p><button id="again" class="primary">↻ 再练一次</button>`;
    $('#again').onclick = reset;
    return;
  }
  const step = STEPS[state.step];
  $('#step-count').textContent = `${String(state.step + 1).padStart(2, '0')} / 04`;
  $('#task-content').innerHTML = `<h2 id="lesson-title" tabindex="-1">${step.title}</h2><p class="task-description">${step.hint}</p>${info}${state.step >= 2 ? '<div class="material-tag"><span>▦ DEMO-001 · 模拟物料标签</span><strong>A 批次 · 净重 75kg</strong></div>' : ''}<form id="operation-form" novalidate>${form(state.step)}<div class="selected-info"><span id="selection-text">已选：${ENTITIES[selected].name}</span><button id="locate" type="button">选中本步实体 ↗</button></div><button id="perform" class="primary" ${busy || !scene ? 'disabled' : ''}><span>${step.verb}</span><span class="arrow">→</span></button><div id="form-error" role="alert" class="form-error" ${formError ? '' : 'hidden'}>${formError}</div></form><div class="tip">${tips[state.step]}</div>`;
  $('#operation-form').addEventListener('submit', submit);
  $('#locate').onclick = () => selectEntity(step.entity);
}
function render() {
  $('#steps').innerHTML = STEPS.map((step, i) => `<button class="step ${i < state.step ? 'done' : i === state.step ? 'active' : ''}" data-step="${i}" ${i === state.step ? 'aria-current="step"' : ''}><span class="step-number">${i < state.step ? '✓' : String(i + 1).padStart(2, '0')}</span>${step.short}</button>${i < 3 ? '<span class="step-connector" aria-hidden="true"></span>' : ''}`).join('');
  document.querySelectorAll('[data-step]').forEach(button => button.onclick = () => selectEntity(STEPS[Number(button.dataset.step)].entity));
  renderTask();
  const q = quantities(state);
  $('#physical-line').textContent = [
    '100kg 原料待签收，现场任务尚未开始。',
    '现场已签收 100kg，原料等待称量装桶。',
    `物料桶 ${q.bucket}kg，托盘剩余 ${q.stock}kg。`,
    `罐内 ${state.fed}kg，桶内 ${q.bucket}kg，托盘 ${q.stock}kg。`,
    '罐内 70kg，30kg 余料已移至退料区。',
  ][state.step];
  $('#task-line').textContent = state.step < 4 ? `已完成 ${state.step} / 4 个环节，当前等待${STEPS[state.step].title}。` : '4 / 4 环节完成，本次演练已结束。';
  $('#account-line').textContent = `签收 ${state.received} − 投料 ${state.fed} − 退回 ${state.returned} ＝ 现场 ${q.onsite}kg`;
  $('#record-count').textContent = state.events.length;
  $('#records').innerHTML = state.events.length ? state.events.map(event => `<div class="record-row"><time>${event.time}</time><strong>✓ ${event.title}</strong><p>${event.message}</p></div>`).join('') : '<p class="empty-record">还没有操作记录。先核对托盘标签，完成第一次签收吧。</p>';
}
function notify(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4800);
}
function selectEntity(id) {
  if (busy || !ENTITIES[id]) return;
  selected = id;
  if ($('#selection-text')) $('#selection-text').textContent = `已选：${ENTITIES[id].name}`;
  scene?.update(state, selected);
  if (state.step < 4 && id !== STEPS[state.step].entity) notify(`已选中${ENTITIES[id].name}。当前任务是${STEPS[state.step].title}，请按顺序操作。`);
}
async function submit(event) {
  event.preventDefault(); if (busy || !scene) return;
  const input = { entity: selected, batch: $('#batch')?.value, weight: $('#weight')?.value, tank: $('#tank')?.value, amount: $('#amount')?.value };
  const result = perform(state, STEPS[state.step].id, input);
  state = result.state;
  if (!result.ok) {
    formError = result.message;
    $('#form-error').textContent = formError; $('#form-error').hidden = false;
    return;
  }
  formError = ''; busy = true;
  $('#perform').disabled = true;
  $('#perform').textContent = '正在执行…';
  scene.update(state, selected);
  notify(result.message);
  await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 10 : 2100));
  busy = false;
  selected = state.step < 4 ? STEPS[state.step].entity : 'return';
  scene.update(state, selected);
  render(); $('#lesson-title').focus({ preventScroll: true });
}
function reset() {
  if (busy) return;
  state = initialState(); selected = 'pallet'; formError = ''; scene?.update(state, selected, false);
  scene?.resetView(); render(); notify('新一轮演练已开始，先核对 A 批次到货标签。');
}
$('#reset').onclick = reset;
$('#help').onclick = () => $('#help-dialog').showModal();
$('#close-help').onclick = $('#start-learning').onclick = () => $('#help-dialog').close();
$('#view-reset').onclick = () => scene?.resetView();
$('#view-top').onclick = () => scene?.resetView(true);
$('#export').onclick = () => {
  const report = { title: 'MES 新人培训演练记录', simulated: true, exported_at: new Date().toISOString(), scenario: '100kg签收→75kg称量→70kg投料→30kg退料', completed: state.step === 4, ...state, quantities: quantities(state) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'MES-培训演练记录.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
render();
try {
  scene = await createScene(selectEntity); scene.update(state, selected, false); render();
} catch (error) {
  console.error('Scene initialization failed:', error);
  $('#loading').innerHTML = '<strong>车间模型暂时未能载入</strong><span>请检查本地素材路径，或刷新后重试。</span><button class="primary" id="retry-scene">重新载入</button>';
  $('#retry-scene').onclick = () => location.reload();
}
