import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, perform, quantities, BATCH } from './training.js';
const receive = s => perform(s, 'receive', { entity: 'pallet', batch: BATCH }).state;
const weigh = s => perform(s, 'weigh', { entity: 'scale', weight: 75 }).state;
const feed = s => perform(s, 'feed', { entity: 'tank', batch: BATCH, tank: 'T-01' }).state;
test('cannot skip stages or operate the wrong entity', () => {
  const s = initialState();
  assert.equal(perform(s, 'feed', { entity: 'tank' }).ok, false);
  assert.equal(perform(s, 'receive', { entity: 'scale', batch: BATCH }).state.received, 0);
});
test('wrong batch and invalid weights leave physical quantities unchanged', () => {
  assert.equal(perform(initialState(), 'receive', { entity: 'pallet', batch: 'B' }).ok, false);
  const s = receive(initialState());
  for (const weight of [NaN, Infinity, '', -1, 74, 76, 100]) {
    const r = perform(s, 'weigh', { entity: 'scale', weight });
    assert.equal(r.ok, false); assert.equal(r.state.weighed, 0);
  }
});
test('feeding requires both correct batch and designated tank', () => {
  const s = weigh(receive(initialState()));
  assert.equal(perform(s, 'feed', { entity: 'tank', batch: 'B', tank: 'T-01' }).ok, false);
  assert.equal(perform(s, 'feed', { entity: 'tank', batch: BATCH, tank: 'T-02' }).ok, false);
  assert.equal(s.fed, 0);
});
test('full exercise conserves quantity and rejects repeated completion', () => {
  let s = initialState(); s = receive(s);
  assert.deepEqual(quantities(s), { stock: 100, bucket: 0, onsite: 100 });
  s = weigh(s); assert.deepEqual(quantities(s), { stock: 25, bucket: 75, onsite: 100 });
  s = feed(s); assert.deepEqual(quantities(s), { stock: 25, bucket: 5, onsite: 30 });
  assert.equal(perform(s, 'return', { entity: 'return', amount: 5 }).ok, false);
  const r = perform(s, 'return', { entity: 'return', amount: 30 });
  assert.equal(r.ok, true); s = r.state;
  assert.equal(s.received, s.fed + s.returned);
  assert.deepEqual(quantities(s), { stock: 0, bucket: 0, onsite: 0 });
  assert.equal(s.events.length, 4);
  assert.equal(perform(s, 'return', { entity: 'return', amount: 30 }).ok, false);
});
