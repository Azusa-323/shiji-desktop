const { randomUUID } = require('node:crypto');

const HEARTBEAT_MS = 10_000;
const MAX_BILLABLE_GAP_MS = 25_000;

function computeBillableMs({
  elapsedMs,
  idleSeconds,
  thresholdSeconds,
  paused = false,
  locked = false,
  hasForeground = true,
  maxGapMs = MAX_BILLABLE_GAP_MS,
}) {
  if (paused || locked || !hasForeground || elapsedMs <= 0 || elapsedMs > maxGapMs) return 0;
  const idleMs = Math.max(0, Number(idleSeconds) * 1000);
  const thresholdMs = Math.max(0, Number(thresholdSeconds) * 1000);
  if (idleMs < thresholdMs) return elapsedMs;
  return Math.max(0, Math.min(elapsedMs, elapsedMs + thresholdMs - idleMs));
}

function splitIntervalByLocalDay(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  let cursor = startMs;
  let remainingSeconds = Math.floor((endMs - startMs) / 1000);
  const segments = [];
  while (cursor < endMs && remainingSeconds > 0) {
    const at = new Date(cursor);
    const nextHour = new Date(
      at.getFullYear(),
      at.getMonth(),
      at.getDate(),
      at.getHours() + 1,
    ).getTime();
    const segmentEnd = Math.min(endMs, nextHour);
    const isLast = segmentEnd === endMs;
    const durationSeconds = isLast
      ? remainingSeconds
      : Math.min(remainingSeconds, Math.floor((segmentEnd - cursor) / 1000));
    if (durationSeconds > 0) {
      const localDate = [
        at.getFullYear(),
        String(at.getMonth() + 1).padStart(2, '0'),
        String(at.getDate()).padStart(2, '0'),
      ].join('-');
      segments.push({ startMs: cursor, endMs: segmentEnd, durationSeconds, localDate });
      remainingSeconds -= durationSeconds;
    }
    cursor = segmentEnd;
  }
  return segments;
}

class UsageTracker {
  constructor({ database, platform, heartbeatMs = HEARTBEAT_MS, now = () => Date.now(), monotonicNow }) {
    this.database = database;
    this.platform = platform;
    this.heartbeatMs = heartbeatMs;
    this.now = now;
    this.monotonicNow = monotonicNow || (() => Number(process.hrtime.bigint() / 1_000_000n));
    this.timer = null;
    this.ticking = false;
    this.lastMonotonicMs = null;
    this.lastApp = null;
    this.sessionKey = null;
    this.sessionSeconds = 0;
    this.sessionStartedAt = null;
    this.lastHeartbeatAt = null;
    this.locked = false;
    this.suspended = false;
    this.paused = Boolean(database.getSettings().trackingPaused);
    this.listeners = new Set();
  }

  start() {
    if (this.timer) return;
    this.lastMonotonicMs = this.monotonicNow();
    this.timer = setInterval(() => {
      if (this.ticking) return;
      this.ticking = true;
      this.tick()
        .catch((error) => this.emit({ type: 'error', message: error.message }))
        .finally(() => { this.ticking = false; });
    }, this.heartbeatMs);
    this.timer.unref?.();
    this.ticking = true;
    this.tick({ prime: true })
      .catch((error) => this.emit({ type: 'error', message: error.message }))
      .finally(() => { this.ticking = false; });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flushCurrent('exit');
    this.resetSession();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event = { type: 'status' }) {
    const payload = { ...event, status: this.getStatus() };
    for (const listener of this.listeners) listener(payload);
  }

  resetSession() {
    this.lastApp = null;
    this.sessionKey = null;
    this.sessionSeconds = 0;
    this.sessionStartedAt = null;
  }

  flushCurrent(endReason) {
    const monotonicMs = this.monotonicNow();
    const elapsedMs = this.lastMonotonicMs == null ? 0 : monotonicMs - this.lastMonotonicMs;
    this.lastMonotonicMs = monotonicMs;
    if (
      this.paused
      || this.locked
      || this.suspended
      || !this.lastApp
      || !this.sessionKey
      || elapsedMs <= 0
      || elapsedMs > MAX_BILLABLE_GAP_MS
    ) return;
    const wallEndMs = this.now();
    const intervalStartMs = wallEndMs - elapsedMs;
    const idleSeconds = this.platform.getIdleSeconds?.() || 0;
    const billableMs = computeBillableMs({
      elapsedMs,
      idleSeconds,
      thresholdSeconds: this.database.getSettings().idleThresholdSeconds,
    });
    const segments = splitIntervalByLocalDay(intervalStartMs, intervalStartMs + billableMs);
    this.database.recordSegments(this.lastApp, this.sessionKey, segments, endReason);
    this.sessionSeconds += segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);
  }

  setLocked(value) {
    if (value && !this.locked) this.flushCurrent('lock');
    this.locked = Boolean(value);
    this.lastMonotonicMs = this.monotonicNow();
    if (this.locked) this.resetSession();
    this.emit({ type: 'system-state' });
  }

  setSuspended(value) {
    if (value && !this.suspended) this.flushCurrent('suspend');
    this.suspended = Boolean(value);
    this.lastMonotonicMs = this.monotonicNow();
    this.resetSession();
    this.emit({ type: 'system-state' });
  }

  setPaused(value) {
    if (value && !this.paused) this.flushCurrent('pause');
    this.paused = Boolean(value);
    this.database.updateSettings({ trackingPaused: this.paused });
    this.lastMonotonicMs = this.monotonicNow();
    if (this.paused) this.resetSession();
    this.emit({ type: 'pause-changed' });
    return this.getStatus();
  }

  togglePause() {
    return this.setPaused(!this.paused);
  }

  getStatus() {
    return {
      paused: this.paused,
      locked: this.locked,
      suspended: this.suspended,
      tracking: !this.paused && !this.locked && !this.suspended,
      currentApp: this.lastApp
        ? {
            ...this.lastApp,
            sessionSeconds: this.sessionSeconds,
            startedAt: this.sessionStartedAt,
          }
        : null,
      lastHeartbeatAt: this.lastHeartbeatAt,
    };
  }

  async tick(options = {}) {
    const monotonicMs = this.monotonicNow();
    const elapsedMs = this.lastMonotonicMs == null ? 0 : monotonicMs - this.lastMonotonicMs;
    this.lastMonotonicMs = monotonicMs;

    if (this.paused || this.locked || this.suspended) {
      this.resetSession();
      return this.getStatus();
    }

    const snapshot = await this.platform.snapshot();
    this.lastHeartbeatAt = new Date(this.now()).toISOString();
    if (this.paused || this.locked || this.suspended) {
      this.resetSession();
      return this.getStatus();
    }
    const app = snapshot.app;
    const thresholdSeconds = this.database.getSettings().idleThresholdSeconds;
    if (options.prime || !app) {
      const canStart = app && snapshot.idleSeconds < thresholdSeconds && !snapshot.locked;
      const stored = canStart ? this.database.upsertApp(app) : null;
      this.lastApp = canStart ? { ...app, id: stored.id } : null;
      this.sessionKey = canStart ? randomUUID() : null;
      this.sessionSeconds = 0;
      this.sessionStartedAt = canStart ? new Date(this.now()).toISOString() : null;
      this.emit({ type: 'heartbeat' });
      return this.getStatus();
    }

    const sameApp = this.lastApp && this.lastApp.stableKey === app.stableKey;
    if (!sameApp) {
      if (this.lastApp && elapsedMs > 0) {
        const previousBillableMs = computeBillableMs({
          elapsedMs,
          idleSeconds: snapshot.idleSeconds,
          thresholdSeconds,
          locked: snapshot.locked,
        });
        if (previousBillableMs > 0) {
          const wallEndMs = this.now();
          const intervalStartMs = wallEndMs - elapsedMs;
          const segments = splitIntervalByLocalDay(intervalStartMs, intervalStartMs + previousBillableMs);
          this.database.recordSegments(this.lastApp, this.sessionKey, segments, 'app-switch');
        }
      }
      if (snapshot.idleSeconds >= thresholdSeconds || snapshot.locked) {
        this.resetSession();
        this.emit({ type: 'heartbeat' });
        return this.getStatus();
      }
      const stored = this.database.upsertApp(app);
      this.lastApp = { ...app, id: stored.id };
      this.sessionKey = randomUUID();
      this.sessionSeconds = 0;
      this.sessionStartedAt = new Date(this.now()).toISOString();
      this.emit({ type: 'app-changed' });
      return this.getStatus();
    }

    const billableMs = computeBillableMs({
      elapsedMs,
      idleSeconds: snapshot.idleSeconds,
      thresholdSeconds,
      paused: this.paused,
      locked: this.locked || snapshot.locked,
      hasForeground: Boolean(app),
    });
    if (billableMs <= 0) {
      if (snapshot.idleSeconds >= thresholdSeconds || snapshot.locked || elapsedMs > MAX_BILLABLE_GAP_MS) {
        this.resetSession();
      }
      this.emit({ type: 'heartbeat' });
      return this.getStatus();
    }

    const wallEndMs = this.now();
    const intervalStartMs = wallEndMs - elapsedMs;
    const activeEndMs = intervalStartMs + billableMs;
    const segments = splitIntervalByLocalDay(intervalStartMs, activeEndMs);
    if (segments.length) {
      this.database.recordSegments(app, this.sessionKey, segments, 'heartbeat');
      this.sessionSeconds += segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);
    }
    if (snapshot.idleSeconds >= thresholdSeconds) this.resetSession();
    this.emit({ type: 'heartbeat' });
    return this.getStatus();
  }
}

module.exports = {
  UsageTracker,
  HEARTBEAT_MS,
  MAX_BILLABLE_GAP_MS,
  computeBillableMs,
  splitIntervalByLocalDay,
};
