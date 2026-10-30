import test from 'node:test';
import assert from 'node:assert/strict';
import { commandStats, defaultFilters, eventStats, selectEvents } from '../src/model.ts';
import { advanceReplay, createFixture, resetSnapshot } from '../src/mock.ts';

test('one command can generate several events without inflating command counts', () => {
  const snapshot = createFixture();
  assert.deepEqual(commandStats(snapshot, defaultFilters), { total: 120, processed: 100, pending: 20, detected: 9, undetected: 91 });
  assert.deepEqual(eventStats(selectEvents(snapshot, defaultFilters)), { total: 14, commands: 9, severity: { CRITICAL: 3, HIGH: 7, MEDIUM: 4 } });
  assert.equal(snapshot.events.filter(e => e.commandLogId === 1042).length, 2);
});

test('combined event filters apply to events and their original command', () => {
  const events = selectEvents(createFixture(), { ...defaultFilters, severity: 'HIGH', rule: 'R2', client: 'mon-01', device: 'ESS-01' });
  assert.deepEqual(events.map(e => e.id), [8021, 8012]);
  assert.equal(selectEvents(createFixture(), { ...defaultFilters, client: 'missing' }).length, 0);
});

test('event date is independent of the original command date', () => {
  const snapshot = createFixture();
  snapshot.commands.find(c => c.id === 1042)!.issuedAt = '2026-10-30T23:59:00+09:00';
  assert.equal(selectEvents(snapshot, defaultFilters).filter(e => e.commandLogId === 1042).length, 2);
  assert.equal(commandStats(snapshot, defaultFilters).total, 119);
});

test('an event without its original command remains inspectable without command filters', () => {
  const snapshot = createFixture();
  snapshot.commands = snapshot.commands.filter(c => c.id !== 1042);
  assert.equal(selectEvents(snapshot, defaultFilters).length, 14);
  assert.equal(selectEvents(snapshot, { ...defaultFilters, device: 'ESS-01' }).length, 12);
});

test('reset preserves original rows and labels, clears events, and does not classify pending as normal', () => {
  const original = createFixture();
  const reset = resetSnapshot(original);
  assert.equal(reset.commands.length, 120);
  assert.equal(reset.events.length, 0);
  assert.equal(commandStats(reset, defaultFilters).undetected, 0);
  assert.deepEqual(reset.commands.map(c => c.labeledAnomaly), original.commands.map(c => c.labeledAnomaly));
  assert.equal(original.events.length, 14);
});

test('replay counts non-detections, processes ID order, and stops without duplicate events', () => {
  let snapshot = resetSnapshot(createFixture());
  snapshot.commands.reverse();
  snapshot = advanceReplay(snapshot, '2026-10-31T14:33:00+09:00');
  assert.equal(snapshot.commands.find(c => c.processed)?.id, 944);
  assert.equal(snapshot.events.length, 0);
  for (let i = 1; i < 120; i++) snapshot = advanceReplay(snapshot, '2026-10-31T14:33:00+09:00');
  assert.equal(snapshot.commands.filter(c => c.processed).length, 120);
  assert.equal(snapshot.events.length, 14);
  const completed = advanceReplay(snapshot, '2026-10-31T14:34:00+09:00');
  assert.equal(completed.events.length, 14);
  assert.equal(new Set(completed.events.map(e => e.id)).size, 14);
});

