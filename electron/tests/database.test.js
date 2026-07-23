import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { UsageDatabase } = require('../database.cjs');

function sampleApp() {
  return {
    platform: 'win32',
    stableKey: 'c:\\program files\\editor\\editor.exe',
    name: 'Editor',
    executablePath: 'C:\\Program Files\\Editor\\editor.exe',
  };
}

test('migration seeds default categories and settings', () => {
  const database = new UsageDatabase(':memory:');
  try {
    assert.equal(database.getCategories().length, 7);
    assert.equal(database.getCategories().at(-1).id, 'uncategorized');
    assert.equal(database.getSettings().idleThresholdSeconds, 300);
    assert.equal(database.getSettings().onboardingCompleted, false);
  } finally {
    database.close();
  }
});

test('recorded segments update daily, category, app, and hourly totals atomically', () => {
  const database = new UsageDatabase(':memory:');
  try {
    const start = new Date(2026, 6, 23, 9, 0, 0).getTime();
    database.recordSegments(sampleApp(), 'session-1', [{
      startMs: start,
      endMs: start + 10_000,
      durationSeconds: 10,
      localDate: '2026-07-23',
    }]);
    database.recordSegments(sampleApp(), 'session-1', [{
      startMs: start + 10_000,
      endMs: start + 20_000,
      durationSeconds: 10,
      localDate: '2026-07-23',
    }]);

    const dashboard = database.getDashboard('2026-07-23');
    assert.equal(dashboard.totalSeconds, 20);
    assert.equal(dashboard.apps[0].durationSeconds, 20);
    assert.equal(dashboard.categories.find((item) => item.id === 'uncategorized').durationSeconds, 20);
    assert.equal(dashboard.hourly[9].totalSeconds, 20);
    assert.deepEqual(dashboard.hourly[9].segments[0], {
      categoryId: 'uncategorized',
      color: '#A0A4A8',
      seconds: 20,
    });
    assert.equal(database.db.prepare('SELECT COUNT(*) AS value FROM sessions').get().value, 1);
  } finally {
    database.close();
  }
});

test('deleting a custom category reassigns apps without losing historical usage', () => {
  const database = new UsageDatabase(':memory:');
  try {
    const category = database.saveCategory({ name: 'Research', color: '#123456' });
    const app = database.upsertApp(sampleApp());
    database.assignCategory([app.id], category.id);
    const start = new Date(2026, 6, 23, 12, 0, 0).getTime();
    database.recordSegments(sampleApp(), 'session-2', [{
      startMs: start,
      endMs: start + 15_000,
      durationSeconds: 15,
      localDate: '2026-07-23',
    }]);

    database.deleteCategory(category.id);
    const dashboard = database.getDashboard('2026-07-23');
    assert.equal(dashboard.totalSeconds, 15);
    assert.equal(dashboard.apps[0].categoryId, 'uncategorized');
  } finally {
    database.close();
  }
});

test('clear date scope removes all aggregates for that date', () => {
  const database = new UsageDatabase(':memory:');
  try {
    const start = new Date(2026, 6, 23, 14, 0, 0).getTime();
    database.recordSegments(sampleApp(), 'session-3', [{
      startMs: start,
      endMs: start + 10_000,
      durationSeconds: 10,
      localDate: '2026-07-23',
    }]);
    database.clearData({ type: 'date', date: '2026-07-23' });
    assert.equal(database.getDashboard('2026-07-23').totalSeconds, 0);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS value FROM sessions').get().value, 0);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS value FROM hourly_app_stats').get().value, 0);
  } finally {
    database.close();
  }
});
