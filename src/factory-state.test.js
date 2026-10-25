import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryState, act, ledger, scaleStatus, traceTag, chapterReady } from './factory-state.js';
function ok(s, type, payload = {}, now = 0) {
  const r = act(s, type, payload, now);
  assert.equal(r.ok, true, `${type}: ${r.message}`); return r.state;
}
function received(mode = 'bucket') {
  let s = createFactoryState(mode);
  s = ok(s, 'receive', { campaign: 'DEMO-P01', batch: 'DEMO-A' });
  return ok(s, 'advance');
}
function printed(s) {
  for (const job of s.printJobs.filter(j => j.status !== 'printed')) s = ok(s, 'print', { jobId: job.id });
  for (const tag of Object.values(s.tags).filter(t => t.kind !== 'raw' && !t.attached)) s = ok(s, 'attach', { tagId: tag.id, bucket: tag.bucket });
  return s;
}
function packaged() {
  let s = received(); s = ok(s, 'scan', { sourceId: 'RAW-77' });
  s = ok(s, 'package', { count: 3, labelType: 'bucket' });
  return ok(printed(s), 'advance');
}
function weighed() {
  let s = packaged(); s = ok(s, 'unpack', { sourceId: 'SMALL-RAW' }); s = printed(s);
  for (const bucket of [1, 2, 3]) {
    s = ok(s, 'tare', {}, 10);
    s = ok(s, 'gross', { grams: 600 }, 100);
    s = ok(s, 'weigh', { bucket }, 1100);
    s = printed(s);
  }
  return ok(s, 'advance');
}
test('receiving and prerequisites are independent from creating labels', () => {
  const s = createFactoryState();
  assert.equal(act(s, 'advance').ok, false);
  assert.equal(act(s, 'receive', { campaign: 'DEMO-P02', batch: 'DEMO-A' }).ok, false);
  assert.equal(act(s, 'receive', { campaign: 'DEMO-P01', batch: 'DEMO-B' }).ok, false);
  assert.equal(ledger(s).receivedGrams, 0);
});
test('20kg cannot complete a 25kg task; duplicate scan cannot inflate balance', () => {
  let s = received(); s = ok(s, 'scan', { sourceId: 'RAW-20' });
  assert.equal(act(s, 'scan', { sourceId: 'RAW-20' }).ok, false);
  const r = act(s, 'package', { count: 1, labelType: 'bucket' });
  assert.equal(r.ok, false); assert.equal(r.state.tags['RAW-20'].remainingGrams, 20000);
  assert.equal(r.state.packageTasks.filter(t => t.done).length, 0);
  assert.equal(r.state.selectedSources.length, 1);
});
test('wrong material, unsigned source and excessive task count are rejected', () => {
  let s = received();
  assert.equal(act(s, 'scan', { sourceId: 'WRONG' }).ok, false);
  assert.equal(act(s, 'scan', { sourceId: 'UNSIGNED' }).ok, false);
  s = ok(s, 'scan', { sourceId: 'RAW-77' });
  for (const count of [4, 0, -1, 1.5, NaN]) assert.equal(act(s, 'package', { count, labelType: 'bucket' }).ok, false);
});
test('77kg creates three 25kg labels, preserving independent 20kg source', () => {
  let s = received(); s = ok(s, 'scan', { sourceId: 'RAW-20' });
  s = ok(s, 'remove-source', { sourceId: 'RAW-20' }); s = ok(s, 'scan', { sourceId: 'RAW-77' });
  const before = structuredClone(s); s = ok(s, 'package', { count: 3, labelType: 'bucket' });
  assert.equal(before.tags['RAW-77'].remainingGrams, 77000, 'input state must remain unchanged');
  assert.equal(s.tags['RAW-77'].remainingGrams, 2000); assert.equal(s.tags['RAW-20'].remainingGrams, 20000);
  const labels = Object.values(s.tags).filter(t => t.kind === 'overall');
  assert.equal(labels.length, 3); assert.deepEqual(labels.map(t => t.bucket), [1, 2, 3]);
  assert.ok(labels.every(t => t.grams === 25000 && t.parentIds.includes('RAW-77')));
  assert.equal(ledger(s).differenceGrams, 0); assert.equal(chapterReady(s), false);
});
test('printing failure and reprint never repeat task completion or material deductions', () => {
  let s = received(); s = ok(s, 'scan', { sourceId: 'RAW-77' }); s = ok(s, 'package', { count: 3, labelType: 'bucket' });
  const id = s.printJobs[0].id, ids = [...s.printJobs[0].tagIds], before = ledger(s);
  s = ok(s, 'print', { jobId: id, fail: true });
  assert.equal(s.printJobs[0].status, 'failed'); assert.equal(s.packageTasks.filter(t => t.done).length, 3);
  assert.equal(act(s, 'package', { count: 3, labelType: 'bucket' }).ok, false);
  assert.equal(act(s, 'attach', { tagId: ids[0], bucket: 1 }).ok, false);
  s = ok(s, 'print', { jobId: id }); s = ok(s, 'print', { jobId: id });
  assert.deepEqual(s.printJobs[0].tagIds, ids); assert.deepEqual(ledger(s), before);
  assert.equal(act(s, 'attach', { tagId: ids[0], bucket: 2 }).ok, false);
  s = printed(s); assert.equal(chapterReady(s), true);
});
test('bag practice creates six 25kg labels for three 50kg production tasks', () => {
  let s = received('bag'); s = ok(s, 'scan', { sourceId: 'RAW-150' });
  s = ok(s, 'package', { count: 3, labelType: 'bag' });
  const labels = Object.values(s.tags).filter(t => t.kind === 'overall');
  assert.equal(labels.length, 6); assert.equal(s.packageTasks.filter(t => t.done).length, 3);
  assert.ok(labels.every(t => t.grams === 25000));
  s = ok(printed(s), 'advance'); assert.equal(s.finished, true); assert.equal(ledger(s).fedGrams, 0);
});
test('weighing requires unpacking, empty tare, valid net weight and one second stability', () => {
  let s = packaged();
  assert.equal(act(s, 'weigh', { bucket: 1 }, 5000).ok, false);
  s = ok(s, 'unpack', { sourceId: 'SMALL-RAW' }); s = printed(s);
  s = ok(s, 'gross', { grams: 600 }, 10); assert.equal(act(s, 'tare', {}, 20).ok, false);
  s = ok(s, 'gross', { grams: 100 }, 30); s = ok(s, 'tare', {}, 40);
  s = ok(s, 'gross', { grams: 580 }, 100);
  assert.equal(scaleStatus(s, 2000).kind, 'under'); assert.equal(act(s, 'weigh', { bucket: 1 }, 2000).ok, false);
  s = ok(s, 'gross', { grams: 620 }, 100); assert.equal(scaleStatus(s, 2000).kind, 'over');
  s = ok(s, 'gross', { grams: 600 }, 200);
  assert.equal(act(s, 'weigh', { bucket: 1 }, 1199).ok, false);
  s = ok(s, 'weigh', { bucket: 1 }, 1200);
  const tag = Object.values(s.tags).find(t => t.kind === 'weigh');
  assert.equal(tag.grams, 500); assert.equal(s.tags['SMALL-RAW'].remainingGrams, 0);
  assert.equal(s.tags[s.unpackId].remainingGrams, 4500);
  assert.deepEqual(traceTag(s, tag.id).map(t => t.kind), ['weigh', 'unpack', 'raw']);
  assert.equal(ledger(s).differenceGrams, 0);
});
test('scale boundaries are inclusive; changing gross weight restarts stability', () => {
  let s = packaged(); s = printed(ok(s, 'unpack', { sourceId: 'SMALL-RAW' })); s = ok(s, 'tare', {}, 0);
  for (const grams of [590, 610]) {
    const changed = ok(s, 'gross', { grams }, 100);
    assert.equal(scaleStatus(changed, 1100).kind, 'ready');
  }
  s = ok(s, 'gross', { grams: 600 }, 100); s = ok(s, 'gross', { grams: 601 }, 900);
  assert.equal(scaleStatus(s, 1100).kind, 'settling');
  assert.equal(act(s, 'gross', { grams: Infinity }).ok, false);
});
test('collection rejects wrong buckets; incomplete cart and wrong device block feeding', () => {
  let s = weighed(); const big = Object.values(s.tags).find(t => t.kind === 'overall');
  assert.equal(act(s, 'collect', { tagId: big.id, bucket: 2 }).ok, false);
  assert.equal(act(s, 'feed', { tagId: big.id, bucket: 1, device: 'D-01' }).ok, false);
  s = printed(ok(s, 'prepare-tea'));
  for (const tag of Object.values(s.tags).filter(t => ['overall','weigh','tea'].includes(t.kind))) s = ok(s, 'collect', { tagId: tag.id, bucket: tag.bucket });
  assert.equal(act(s, 'feed', { tagId: big.id, bucket: 1, device: 'E-01' }).ok, false);
  const small = Object.values(s.tags).find(t => t.kind === 'weigh');
  assert.equal(act(s, 'feed', { tagId: small.id, bucket: 1, device: 'M-01' }).ok, false);
});
test('complete training conserves mass through label transformations and feeding', () => {
  let s = weighed(); s = printed(ok(s, 'prepare-tea'));
  const tags = Object.values(s.tags).filter(t => ['overall','weigh','tea'].includes(t.kind));
  for (const tag of tags) s = ok(s, 'collect', { tagId: tag.id, bucket: tag.bucket });
  for (const kind of ['overall','tea','weigh']) {
    for (const tag of tags.filter(t => t.kind === kind)) s = ok(s, 'feed', { tagId: tag.id, bucket: tag.bucket, device: {overall:'D-01',tea:'E-01',weigh:'M-01'}[kind] });
  }
  assert.equal(act(s, 'feed', { tagId: tags[0].id, bucket: tags[0].bucket, device: 'D-01' }).ok, false);
  assert.deepEqual(ledger(s), {receivedGrams:105000, remainingGrams:25500, fedGrams:79500, differenceGrams:0});
  assert.equal(s.tags['RAW-20'].remainingGrams, 20000);
  assert.equal(chapterReady(s), true); s = ok(s, 'advance'); assert.equal(s.finished, true);
});
