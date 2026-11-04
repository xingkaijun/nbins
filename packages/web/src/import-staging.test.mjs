import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from './api/client.ts';
import { findImportColumns, removeRowsByUid, resolveShip, rowIssues, submitStaging } from './import-staging.ts';

const ships = [
  { id: 'a', projectId: 'p', hullNumber: 'H-01', shipName: 'Alpha' },
  { id: 'b', projectId: 'p', hullNumber: 'H-02', shipName: 'Beta' },
  { id: 'c', projectId: 'p', hullNumber: 'H-03', shipName: 'Gamma' },
  { id: 'x', projectId: 'other', hullNumber: 'X', shipName: 'Other' }
];
const row = (uid, shipId) => ({ uid, shipId, item: `Inspection ${uid}`, discipline: 'HULL', date: '2026-01-01', qc: '-', startAtRound: 1 });
const options = (rows, request, extra = {}) => ({ projectId: 'p', rows, ships, disciplines: ['HULL'], request, onSuccess: () => {}, shouldContinue: () => true, ...extra });

test('ship matching requires a unique explicit match and defaults only blank values', () => {
  assert.equal(resolveShip(' h 01 ', ships, 'b').shipId, 'a');
  assert.equal(resolveShip('alpha', ships, 'b').shipId, 'a');
  assert.deepEqual(resolveShip('unknown', ships, 'a'), { shipId: '', hullLabel: 'unknown', shipIssue: 'Unknown ship; confirmation required' });
  assert.match(resolveShip('H01', [...ships, { ...ships[1], hullNumber: 'H 01' }], 'a').shipIssue, /Ambiguous/);
  assert.equal(resolveShip('', ships, 'b').shipId, 'b');
  assert.equal(resolveShip('', ships, '').shipId, '');
});

test('header detection skips recognized headers and preserves headerless first row', () => {
  assert.equal(findImportColumns([['Description', 'QC'], ['Weld', 'Joe']]).start, 1);
  assert.equal(findImportColumns([['内容', '船号'], ['焊接', 'H01']]).start, 1);
  assert.equal(findImportColumns([['Weld', 'Joe'], ['Pipe', 'Sam']]).start, 0);
  for (const first of ['Inspection item 1', 'Hull inspection item', 'Check description of weld']) {
    assert.equal(findImportColumns([[first, 'Joe'], ['Pipe', 'Sam']]).start, 0);
  }
  for (const header of ['Item', 'Item Name', 'Inspection Item', ' Description ', '项目', '内容']) {
    assert.equal(findImportColumns([[header, 'QC'], ['Weld', 'Joe']]).start, 1);
  }
});

test('invalid queue, including cross-project ships, never starts a request', async () => {
  for (const bad of [row('x', 'x'), { ...row('a', 'a'), item: '  ' }, { ...row('a', 'a'), discipline: 'INVALID' }, { ...row('a', ''), shipIssue: 'Unknown ship' }]) {
    let calls = 0;
    assert.ok(rowIssues(bad, 'p', ships, ['HULL']).length);
    await assert.rejects(submitStaging(options([row('b', 'b'), bad], async () => { calls++; return { imported: 1 }; })));
    assert.equal(calls, 0);
  }
});

test('partial success stops at failure and retry only submits remaining ships', async () => {
  let pending = [row('1', 'a'), row('2', 'b'), row('3', 'c')];
  const calls = [];
  const first = await submitStaging(options(pending, async ({ shipId }) => {
    calls.push(shipId);
    if (shipId === 'b') throw new ApiError('Forbidden', 403);
    return { imported: 1 };
  }, { onSuccess: group => { pending = removeRowsByUid(pending, group); } }));
  assert.deepEqual(calls, ['a', 'b']);
  assert.deepEqual(pending.map(r => r.shipId), ['b', 'c']);
  assert.deepEqual(first, { succeeded: 1, remaining: 2, failedShip: 'H-02', error: 'Forbidden', unknown: false });
  calls.length = 0;
  const retry = await submitStaging(options(pending, async ({ shipId }) => { calls.push(shipId); return { imported: 1 }; }, { onSuccess: group => { pending = removeRowsByUid(pending, group); } }));
  assert.deepEqual(calls, ['b', 'c']);
  assert.deepEqual(retry, { succeeded: 2, remaining: 0 });
  assert.deepEqual(pending, []);
});

test('first failure stops without removing anything', async () => {
  const rows = [row('1', 'a'), row('2', 'b')];
  let calls = 0, removed = 0;
  const result = await submitStaging(options(rows, async () => { calls++; throw new ApiError('Bad request', 400); }, { onSuccess: () => removed++ }));
  assert.equal(calls, 1);
  assert.equal(removed, 0);
  assert.equal(result.remaining, 2);
  assert.equal(result.unknown, false);
});

test('all successful groups remove exact UIDs', async () => {
  let pending = [row('1', 'a'), row('2', 'a'), row('3', 'b'), row('new', 'a')];
  const rows = pending.slice(0, 3);
  const result = await submitStaging(options(rows, async ({ items }) => ({ imported: items.length }), { onSuccess: group => { pending = removeRowsByUid(pending, group); } }));
  assert.deepEqual(result, { succeeded: 3, remaining: 0 });
  assert.deepEqual(pending.map(r => r.uid), ['new']);
});

test('unexpected counts, network errors and server errors are unknown', async () => {
  for (const request of [async () => ({ imported: 0 }), async () => ({}), async () => { throw new TypeError('Network'); }, async () => { throw new ApiError('Server', 500); }]) {
    let removed = 0;
    const result = await submitStaging(options([row('1', 'a'), row('2', 'b')], request, { onSuccess: () => removed++ }));
    assert.equal(result.unknown, true);
    assert.equal(result.remaining, 2);
    assert.equal(removed, 0);
    assert.equal(result.failedShip, 'H-01');
  }
});

test('cancellation after an in-flight response prevents the next request', async () => {
  let active = true;
  const calls = [];
  const result = await submitStaging(options([row('1', 'a'), row('2', 'b')], async ({ shipId }) => { calls.push(shipId); active = false; return { imported: 1 }; }, { shouldContinue: () => active }));
  assert.deepEqual(calls, ['a']);
  assert.deepEqual(result, { succeeded: 1, remaining: 1, cancelled: true });
});
