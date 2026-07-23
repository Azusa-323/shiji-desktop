import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  UsageTracker,
  computeBillableMs,
  splitIntervalByLocalDay,
} = require('../tracker.cjs');

test('active heartbeat bills the elapsed interval', () => {
  assert.equal(computeBillableMs({
    elapsedMs: 10_000,
    idleSeconds: 42,
    thresholdSeconds: 300,
  }), 10_000);
});

test('heartbeat clips the interval to the idle threshold', () => {
  assert.equal(computeBillableMs({
    elapsedMs: 10_000,
    idleSeconds: 305,
    thresholdSeconds: 300,
  }), 5_000);
  assert.equal(computeBillableMs({
    elapsedMs: 10_000,
    idleSeconds: 310,
    thresholdSeconds: 300,
  }), 0);
});

test('paused, locked, missing foreground, and long-gap intervals are excluded', () => {
  const base = { elapsedMs: 10_000, idleSeconds: 0, thresholdSeconds: 300 };
  assert.equal(computeBillableMs({ ...base, paused: true }), 0);
  assert.equal(computeBillableMs({ ...base, locked: true }), 0);
  assert.equal(computeBillableMs({ ...base, hasForeground: false }), 0);
  assert.equal(computeBillableMs({ ...base, elapsedMs: 60_000 }), 0);
});

test('an interval crossing midnight is split into two natural days', () => {
  const start = new Date(2026, 6, 22, 23, 59, 50).getTime();
  const end = new Date(2026, 6, 23, 0, 0, 10).getTime();
  assert.deepEqual(splitIntervalByLocalDay(start, end), [
    { startMs: start, endMs: new Date(2026, 6, 23, 0, 0, 0).getTime(), durationSeconds: 10, localDate: '2026-07-22' },
    { startMs: new Date(2026, 6, 23, 0, 0, 0).getTime(), endMs: end, durationSeconds: 10, localDate: '2026-07-23' },
  ]);
});

test('hour boundaries are split for accurate 24-hour aggregation', () => {
  const start = new Date(2026, 6, 23, 8, 59, 55).getTime();
  const end = new Date(2026, 6, 23, 9, 0, 5).getTime();
  assert.deepEqual(splitIntervalByLocalDay(start, end).map((part) => part.durationSeconds), [5, 5]);
});

test('pausing flushes only the active part of the pending interval', () => {
  const recorded = [];
  const database = {
    getSettings: () => ({ idleThresholdSeconds: 300, trackingPaused: false }),
    updateSettings: () => {},
    recordSegments: (_app, _key, segments, reason) => recorded.push({ segments, reason }),
  };
  const tracker = new UsageTracker({
    database,
    platform: { getIdleSeconds: () => 305 },
    now: () => new Date(2026, 6, 23, 10, 0, 0).getTime(),
    monotonicNow: () => 100_000,
  });
  tracker.lastMonotonicMs = 90_000;
  tracker.lastApp = { stableKey: 'editor', name: 'Editor' };
  tracker.sessionKey = 'session';

  tracker.setPaused(true);

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].reason, 'pause');
  assert.equal(recorded[0].segments[0].durationSeconds, 5);
  assert.equal(tracker.getStatus().currentApp, null);
});
