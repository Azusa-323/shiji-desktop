const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CATEGORIES = [
  ['study', '学习', '#4F7CAC', 0, 1],
  ['work', '工作', '#2A9D8F', 1, 1],
  ['games', '游戏', '#E76F51', 2, 1],
  ['entertainment', '娱乐', '#E9C46A', 3, 1],
  ['social', '社交', '#D66BA0', 4, 1],
  ['tools', '工具', '#7A7F87', 5, 1],
  ['uncategorized', '未分类', '#A0A4A8', 6, 1],
];

const DEFAULT_SETTINGS = {
  idleThresholdSeconds: 300,
  launchAtLogin: false,
  showTray: true,
  dailySummary: false,
  weekStartsOn: 'monday',
  timeFormat: '24h',
  theme: 'system',
  trackingPaused: false,
  onboardingCompleted: false,
};

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_system INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS apps (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        stable_key TEXT NOT NULL,
        name TEXT NOT NULL,
        executable_path TEXT,
        category_id TEXT NOT NULL DEFAULT 'uncategorized',
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        UNIQUE(platform, stable_key),
        FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET DEFAULT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_key TEXT NOT NULL,
        app_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL CHECK(duration_seconds >= 0),
        local_date TEXT NOT NULL,
        end_reason TEXT NOT NULL,
        UNIQUE(session_key, local_date),
        FOREIGN KEY(app_id) REFERENCES apps(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS daily_app_stats (
        local_date TEXT NOT NULL,
        app_id TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds >= 0),
        PRIMARY KEY(local_date, app_id),
        FOREIGN KEY(app_id) REFERENCES apps(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(local_date);
      CREATE INDEX IF NOT EXISTS idx_daily_app_stats_date ON daily_app_stats(local_date);
      CREATE INDEX IF NOT EXISTS idx_apps_category ON apps(category_id);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS hourly_app_stats (
        local_date TEXT NOT NULL,
        local_hour INTEGER NOT NULL CHECK(local_hour BETWEEN 0 AND 23),
        app_id TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds >= 0),
        PRIMARY KEY(local_date, local_hour, app_id),
        FOREIGN KEY(app_id) REFERENCES apps(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_hourly_app_stats_date ON hourly_app_stats(local_date);
    `,
  },
];

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) throw new Error(`无效日期: ${value}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addLocalDays(value, count) {
  const date = dateFromLocalDate(value);
  date.setDate(date.getDate() + count);
  return localDateString(date);
}

function stableId(platform, stableKey) {
  const input = `${platform}:${stableKey}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `app_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

class UsageDatabase {
  constructor(filename) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.filename = filename;
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.migrate();
    this.seedDefaults();
  }

  migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`);
    const applied = new Set(
      this.db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version),
    );
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(migration.sql);
        this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(migration.version, new Date().toISOString());
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }

  seedDefaults() {
    const insertCategory = this.db.prepare(`
      INSERT OR IGNORE INTO categories(id, name, color, sort_order, is_system)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const category of DEFAULT_CATEGORIES) insertCategory.run(...category);

    const insertSetting = this.db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insertSetting.run(key, JSON.stringify(value));
    }
  }

  close() {
    this.db.close();
  }

  getSettings() {
    const settings = { ...DEFAULT_SETTINGS };
    for (const row of this.db.prepare('SELECT key, value FROM settings').all()) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }
    return settings;
  }

  updateSettings(patch) {
    const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
    const upsert = this.db.prepare(`
      INSERT INTO settings(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [key, value] of Object.entries(patch || {})) {
        if (!allowed.has(key)) continue;
        if (key === 'idleThresholdSeconds') {
          const threshold = Number(value);
          if (!Number.isFinite(threshold) || threshold < 60 || threshold > 3600) {
            throw new Error('空闲阈值必须在 60 到 3600 秒之间');
          }
        }
        upsert.run(key, JSON.stringify(value));
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getSettings();
  }

  upsertApp(app) {
    const id = app.id || stableId(app.platform, app.stableKey);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO apps(id, platform, stable_key, name, executable_path, category_id, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, 'uncategorized', ?, ?)
      ON CONFLICT(platform, stable_key) DO UPDATE SET
        name = excluded.name,
        executable_path = COALESCE(excluded.executable_path, apps.executable_path),
        last_seen_at = excluded.last_seen_at
    `).run(id, app.platform, app.stableKey, app.name, app.executablePath || null, now, now);
    return this.db.prepare('SELECT id, name, stable_key AS stableKey FROM apps WHERE platform = ? AND stable_key = ?')
      .get(app.platform, app.stableKey);
  }

  recordSegments(app, sessionKey, segments, endReason = 'heartbeat') {
    if (!segments.length) return;
    const storedApp = this.upsertApp(app);
    const upsertSession = this.db.prepare(`
      INSERT INTO sessions(session_key, app_id, started_at, ended_at, duration_seconds, local_date, end_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key, local_date) DO UPDATE SET
        ended_at = excluded.ended_at,
        duration_seconds = sessions.duration_seconds + excluded.duration_seconds,
        end_reason = excluded.end_reason
    `);
    const upsertDaily = this.db.prepare(`
      INSERT INTO daily_app_stats(local_date, app_id, duration_seconds)
      VALUES (?, ?, ?)
      ON CONFLICT(local_date, app_id) DO UPDATE SET
        duration_seconds = daily_app_stats.duration_seconds + excluded.duration_seconds
    `);
    const upsertHourly = this.db.prepare(`
      INSERT INTO hourly_app_stats(local_date, local_hour, app_id, duration_seconds)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(local_date, local_hour, app_id) DO UPDATE SET
        duration_seconds = hourly_app_stats.duration_seconds + excluded.duration_seconds
    `);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const segment of segments) {
        if (segment.durationSeconds <= 0) continue;
        upsertSession.run(
          sessionKey,
          storedApp.id,
          new Date(segment.startMs).toISOString(),
          new Date(segment.endMs).toISOString(),
          segment.durationSeconds,
          segment.localDate,
          endReason,
        );
        upsertDaily.run(segment.localDate, storedApp.id, segment.durationSeconds);
        upsertHourly.run(segment.localDate, new Date(segment.startMs).getHours(), storedApp.id, segment.durationSeconds);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getCategories(date = null) {
    const rows = date
      ? this.db.prepare(`
          SELECT c.id, c.name, c.color, c.sort_order AS sortOrder, c.is_system AS isSystem,
                 COALESCE(SUM(d.duration_seconds), 0) AS durationSeconds
          FROM categories c
          LEFT JOIN apps a ON a.category_id = c.id
          LEFT JOIN daily_app_stats d ON d.app_id = a.id AND d.local_date = ?
          GROUP BY c.id ORDER BY c.sort_order, c.name
        `).all(date)
      : this.db.prepare(`
          SELECT id, name, color, sort_order AS sortOrder, is_system AS isSystem, 0 AS durationSeconds
          FROM categories ORDER BY sort_order, name
        `).all();
    return rows.map((row) => ({ ...row, isSystem: Boolean(row.isSystem) }));
  }

  saveCategory(input) {
    const name = String(input?.name || '').trim();
    if (!name) throw new Error('分类名称不能为空');
    const color = /^#[0-9a-f]{6}$/i.test(input?.color || '') ? input.color.toUpperCase() : '#7A7F87';
    if (input.id) {
      const current = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(input.id);
      if (!current) throw new Error('分类不存在');
      this.db.prepare(`UPDATE categories SET name = ?, color = ?, sort_order = ? WHERE id = ?`)
        .run(name, color, Number.isInteger(input.sortOrder) ? input.sortOrder : current.sort_order, input.id);
      return this.getCategories().find((category) => category.id === input.id);
    }
    const id = `category_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const maxOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS value FROM categories').get().value;
    this.db.prepare(`INSERT INTO categories(id, name, color, sort_order, is_system) VALUES (?, ?, ?, ?, 0)`)
      .run(id, name, color, Number.isInteger(input.sortOrder) ? input.sortOrder : maxOrder + 1);
    return this.getCategories().find((category) => category.id === id);
  }

  deleteCategory(id) {
    if (id === 'uncategorized') throw new Error('未分类是必要的系统分类，不能删除');
    const category = this.db.prepare('SELECT id, is_system AS isSystem FROM categories WHERE id = ?').get(id);
    if (!category) return false;
    if (category.isSystem) throw new Error('系统分类不能删除');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`UPDATE apps SET category_id = 'uncategorized' WHERE category_id = ?`).run(id);
      this.db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return true;
  }

  assignCategory(appIds, categoryId) {
    if (!this.db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) {
      throw new Error('分类不存在');
    }
    const update = this.db.prepare('UPDATE apps SET category_id = ? WHERE id = ?');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const appId of appIds || []) update.run(categoryId, appId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getApps();
  }

  getApps(date = null) {
    const rows = date
      ? this.db.prepare(`
          SELECT a.id, a.name, a.platform, a.stable_key AS stableKey,
                 a.executable_path AS executable, a.category_id AS categoryId,
                 c.name AS categoryName, c.color AS categoryColor,
                 COALESCE(d.duration_seconds, 0) AS durationSeconds,
                 a.last_seen_at AS lastSeenAt
          FROM apps a JOIN categories c ON c.id = a.category_id
          LEFT JOIN daily_app_stats d ON d.app_id = a.id AND d.local_date = ?
          ORDER BY durationSeconds DESC, a.name
        `).all(date)
      : this.db.prepare(`
          SELECT a.id, a.name, a.platform, a.stable_key AS stableKey,
                 a.executable_path AS executable, a.category_id AS categoryId,
                 c.name AS categoryName, c.color AS categoryColor,
                 COALESCE(SUM(d.duration_seconds), 0) AS durationSeconds,
                 a.last_seen_at AS lastSeenAt
          FROM apps a JOIN categories c ON c.id = a.category_id
          LEFT JOIN daily_app_stats d ON d.app_id = a.id
          GROUP BY a.id ORDER BY a.last_seen_at DESC, a.name
        `).all();
    return rows;
  }

  getDashboard(date = localDateString()) {
    const apps = this.getApps(date).filter((app) => app.durationSeconds > 0);
    const totalSeconds = apps.reduce((sum, app) => sum + app.durationSeconds, 0);
    const categories = this.getCategories(date).map((category) => ({
      ...category,
      percentage: totalSeconds > 0 ? category.durationSeconds / totalSeconds : 0,
    }));
    const hourlyRows = this.db.prepare(`
      SELECT h.local_hour AS hour, a.category_id AS categoryId, c.color,
             SUM(h.duration_seconds) AS durationSeconds
      FROM hourly_app_stats h
      JOIN apps a ON a.id = h.app_id JOIN categories c ON c.id = a.category_id
      WHERE h.local_date = ? GROUP BY h.local_hour, a.category_id ORDER BY h.local_hour
    `).all(date);
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      totalSeconds: 0,
      segments: [],
    }));
    for (const row of hourlyRows) {
      hourly[row.hour].segments.push({
        categoryId: row.categoryId,
        color: row.color,
        seconds: row.durationSeconds,
      });
      hourly[row.hour].totalSeconds += row.durationSeconds;
    }
    const yesterdayTotal = this.db.prepare(`
      SELECT COALESCE(SUM(duration_seconds), 0) AS value FROM daily_app_stats WHERE local_date = ?
    `).get(addLocalDays(date, -1)).value;
    return {
      date,
      totalSeconds,
      comparisonPct: yesterdayTotal > 0
        ? Math.round(((totalSeconds - yesterdayTotal) / yesterdayTotal) * 100)
        : null,
      comparisonLabel: '较昨日',
      categories,
      apps,
      hourly,
    };
  }

  getHistory(period = 'week', anchor = localDateString()) {
    const days = period === 'month' ? 30 : 7;
    const startDate = addLocalDays(anchor, -(days - 1));
    const rawDays = this.db.prepare(`
      SELECT local_date AS date, SUM(duration_seconds) AS totalSeconds
      FROM daily_app_stats WHERE local_date BETWEEN ? AND ? GROUP BY local_date ORDER BY local_date
    `).all(startDate, anchor);
    const totals = new Map(rawDays.map((row) => [row.date, row.totalSeconds]));
    const daySeries = Array.from({ length: days }, (_, index) => {
      const date = addLocalDays(startDate, index);
      return { date, totalSeconds: totals.get(date) || 0 };
    });
    const categories = this.db.prepare(`
      SELECT c.id, c.name, c.color, c.sort_order AS sortOrder, c.is_system AS isSystem,
             SUM(d.duration_seconds) AS durationSeconds
      FROM daily_app_stats d JOIN apps a ON a.id = d.app_id JOIN categories c ON c.id = a.category_id
      WHERE d.local_date BETWEEN ? AND ? GROUP BY c.id ORDER BY durationSeconds DESC
    `).all(startDate, anchor);
    const appRows = this.db.prepare(`
      SELECT a.id, a.name, a.stable_key AS stableKey, a.executable_path AS executable,
             a.category_id AS categoryId, c.name AS categoryName, c.color AS categoryColor,
             SUM(d.duration_seconds) AS durationSeconds, a.last_seen_at AS lastSeenAt
      FROM daily_app_stats d JOIN apps a ON a.id = d.app_id JOIN categories c ON c.id = a.category_id
      WHERE d.local_date BETWEEN ? AND ? GROUP BY a.id ORDER BY durationSeconds DESC
    `).all(startDate, anchor);
    const dailyCategoryRows = this.db.prepare(`
      SELECT d.local_date AS date, a.category_id AS categoryId, c.color,
             SUM(d.duration_seconds) AS seconds
      FROM daily_app_stats d JOIN apps a ON a.id = d.app_id JOIN categories c ON c.id = a.category_id
      WHERE d.local_date BETWEEN ? AND ? GROUP BY d.local_date, a.category_id
    `).all(startDate, anchor);
    const segmentsByDate = new Map();
    for (const row of dailyCategoryRows) {
      if (!segmentsByDate.has(row.date)) segmentsByDate.set(row.date, []);
      segmentsByDate.get(row.date).push({ categoryId: row.categoryId, color: row.color, seconds: row.seconds });
    }
    const totalSeconds = daySeries.reduce((sum, day) => sum + day.totalSeconds, 0);
    const previousEnd = addLocalDays(startDate, -1);
    const previousStart = addLocalDays(previousEnd, -(days - 1));
    const previousTotal = this.db.prepare(`
      SELECT COALESCE(SUM(duration_seconds), 0) AS value
      FROM daily_app_stats WHERE local_date BETWEEN ? AND ?
    `).get(previousStart, previousEnd).value;
    return {
      period,
      startDate,
      endDate: anchor,
      totalSeconds,
      dailyAverageSeconds: Math.round(totalSeconds / days),
      comparisonPct: previousTotal > 0
        ? Math.round(((totalSeconds - previousTotal) / previousTotal) * 100)
        : null,
      daily: daySeries.map((day) => ({
        ...day,
        label: `${Number(day.date.slice(5, 7))}/${Number(day.date.slice(8, 10))}`,
        segments: segmentsByDate.get(day.date) || [],
      })),
      categories: categories.map((category) => ({
        ...category,
        isSystem: Boolean(category.isSystem),
      })),
      apps: appRows,
    };
  }

  exportRows(options = {}) {
    const startDate = options.startDate || '0000-01-01';
    const endDate = options.endDate || '9999-12-31';
    return this.db.prepare(`
      SELECT d.local_date AS date, a.name AS appName, a.stable_key AS stableKey,
             c.name AS categoryName, d.duration_seconds AS durationSeconds
      FROM daily_app_stats d JOIN apps a ON a.id = d.app_id JOIN categories c ON c.id = a.category_id
      WHERE d.local_date BETWEEN ? AND ? ORDER BY d.local_date, d.duration_seconds DESC, a.name
    `).all(startDate, endDate);
  }

  clearData(scope) {
    let startDate;
    let endDate;
    if (scope === 'all' || scope?.all) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec('DELETE FROM hourly_app_stats; DELETE FROM daily_app_stats; DELETE FROM sessions;');
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
      return true;
    }
    if (scope === 'today') {
      startDate = localDateString();
      endDate = startDate;
    } else if (scope?.type === 'all') {
      return this.clearData('all');
    } else if (scope?.type === 'date') {
      startDate = scope.date;
      endDate = scope.date;
    } else if (typeof scope === 'string') {
      startDate = scope;
      endDate = scope;
    } else {
      startDate = scope?.startDate || scope?.date;
      endDate = scope?.endDate || startDate;
    }
    if (!startDate || !endDate) throw new Error('请选择要清除的日期范围');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM hourly_app_stats WHERE local_date BETWEEN ? AND ?').run(startDate, endDate);
      this.db.prepare('DELETE FROM daily_app_stats WHERE local_date BETWEEN ? AND ?').run(startDate, endDate);
      this.db.prepare('DELETE FROM sessions WHERE local_date BETWEEN ? AND ?').run(startDate, endDate);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return true;
  }
}

module.exports = {
  UsageDatabase,
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  addLocalDays,
  localDateString,
  stableId,
};
