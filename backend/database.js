/**
 * Database Module - SQLite3 Database Management
 * Handles tasks, calendar subscriptions and configuration storage
 */

const Database = require('better-sqlite3');
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, '../database/tasks.db');

// Initialize database connection
const db = new Database(DB_PATH);

// Enable foreign keys and WAL mode for better performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

/**
 * Initialize database schema
 */
function initDatabase() {
  // Create tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      led_color TEXT,
      active_days TEXT DEFAULT '0,1,2,3,4,5,6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrations for existing databases
  const migrate = (sql, label) => {
    try {
      db.exec(sql);
      console.log(`✓ Migration applied: ${label}`);
    } catch (err) {
      if (!err.message.includes('duplicate column name')) throw err;
    }
  };

  migrate(`ALTER TABLE tasks ADD COLUMN active_days TEXT DEFAULT '0,1,2,3,4,5,6'`, 'active_days column');
  migrate(`ALTER TABLE tasks ADD COLUMN done INTEGER DEFAULT 0`, 'done column');
  migrate(`ALTER TABLE tasks ADD COLUMN all_day INTEGER DEFAULT 0`, 'all_day column');

  // Create config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Calendar subscriptions (Google Calendar "secret iCal address" or any public .ics)
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      led_color TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_sync DATETIME,
      last_error TEXT,
      event_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Expanded event occurrences cached from the subscriptions
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calendar_id INTEGER NOT NULL,
      uid TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT,
      start_utc TEXT NOT NULL,
      end_utc TEXT NOT NULL,
      all_day INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
    )
  `);

  migrate(`ALTER TABLE calendar_events ADD COLUMN description TEXT`, 'calendar_events.description column');

  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_window ON calendar_events (start_utc, end_utc)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_calendar ON calendar_events (calendar_id)`);

  // Insert default config values if not exists
  const defaultConfig = [
    { key: 'brightness', value: '100' },
    { key: 'timezone', value: 'America/Los_Angeles' },
    { key: 'time_format', value: '24' },
    { key: 'language', value: 'es' },
    { key: 'calendar_sync_minutes', value: '15' }
  ];

  const insertConfig = db.prepare(`
    INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)
  `);

  const insertMany = db.transaction((configs) => {
    for (const config of configs) {
      insertConfig.run(config.key, config.value);
    }
  });

  insertMany(defaultConfig);

  // Initialize prepared statements
  initStatements();

  console.log('✓ Database initialized successfully');
}

/**
 * PREPARED STATEMENTS (lazy initialization)
 */

let getAllTasks, getSchedulableTasks, getTaskById, createTask, updateTask, deleteTask, toggleTaskDone;
let getAllConfig, getConfigByKey, updateConfig;
let getAllCalendars, getEnabledCalendars, getCalendarById, getCalendarByUrl;
let createCalendar, updateCalendar, deleteCalendar, setCalendarSyncResult;
let deleteEventsForCalendar, insertEvent, getEventsInRange, getEventById, deleteAllEvents;

function initStatements() {
  // Tasks queries
  getAllTasks = db.prepare('SELECT * FROM tasks ORDER BY done ASC, start_time ASC');
  // Only non-done tasks are eligible for the LED/display schedule
  getSchedulableTasks = db.prepare('SELECT * FROM tasks WHERE done = 0 ORDER BY start_time ASC');
  getTaskById = db.prepare('SELECT * FROM tasks WHERE id = ?');
  createTask = db.prepare(`
    INSERT INTO tasks (name, start_time, end_time, led_color, active_days, all_day)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  updateTask = db.prepare(`
    UPDATE tasks
    SET name = ?, start_time = ?, end_time = ?, led_color = ?, active_days = ?, all_day = ?
    WHERE id = ?
  `);
  deleteTask = db.prepare('DELETE FROM tasks WHERE id = ?');
  toggleTaskDone = db.prepare('UPDATE tasks SET done = CASE WHEN done = 0 THEN 1 ELSE 0 END WHERE id = ?');

  // Config queries
  getAllConfig = db.prepare('SELECT * FROM config');
  getConfigByKey = db.prepare('SELECT value FROM config WHERE key = ?');
  updateConfig = db.prepare(`
    INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)
  `);

  // Calendar queries
  getAllCalendars = db.prepare('SELECT * FROM calendars ORDER BY created_at ASC');
  getEnabledCalendars = db.prepare('SELECT * FROM calendars WHERE enabled = 1 ORDER BY created_at ASC');
  getCalendarById = db.prepare('SELECT * FROM calendars WHERE id = ?');
  getCalendarByUrl = db.prepare('SELECT * FROM calendars WHERE url = ?');
  createCalendar = db.prepare(`
    INSERT INTO calendars (name, url, led_color, enabled) VALUES (?, ?, ?, ?)
  `);
  updateCalendar = db.prepare(`
    UPDATE calendars SET name = ?, led_color = ?, enabled = ? WHERE id = ?
  `);
  deleteCalendar = db.prepare('DELETE FROM calendars WHERE id = ?');
  setCalendarSyncResult = db.prepare(`
    UPDATE calendars SET last_sync = ?, last_error = ?, event_count = ? WHERE id = ?
  `);

  // Calendar event queries
  deleteEventsForCalendar = db.prepare('DELETE FROM calendar_events WHERE calendar_id = ?');
  deleteAllEvents = db.prepare('DELETE FROM calendar_events');
  insertEvent = db.prepare(`
    INSERT INTO calendar_events (calendar_id, uid, title, location, description, start_utc, end_utc, all_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  getEventsInRange = db.prepare(`
    SELECT e.*, c.name AS calendar_name, c.led_color AS calendar_color
    FROM calendar_events e
    JOIN calendars c ON c.id = e.calendar_id
    WHERE c.enabled = 1 AND e.end_utc > ? AND e.start_utc < ?
    ORDER BY e.start_utc ASC
  `);
  getEventById = db.prepare(`
    SELECT e.*, c.name AS calendar_name, c.led_color AS calendar_color
    FROM calendar_events e
    JOIN calendars c ON c.id = e.calendar_id
    WHERE e.id = ?
  `);
}

/**
 * Exported functions
 */
module.exports = {
  // Initialize
  initDatabase,

  // Tasks operations
  getAllTasks: () => getAllTasks.all(),
  getSchedulableTasks: () => getSchedulableTasks.all(),
  getTaskById: (id) => getTaskById.get(id),
  toggleTaskDone: (id) => {
    const info = toggleTaskDone.run(id);
    return info.changes > 0 ? getTaskById.get(id) : null;
  },
  createTask: (task) => {
    const activeDays = task.active_days || '0,1,2,3,4,5,6';
    const allDay = task.all_day ? 1 : 0;
    const info = createTask.run(task.name, task.start_time, task.end_time, task.led_color, activeDays, allDay);
    return getTaskById.get(info.lastInsertRowid);
  },
  updateTask: (id, task) => {
    const activeDays = task.active_days || '0,1,2,3,4,5,6';
    const allDay = task.all_day ? 1 : 0;
    updateTask.run(task.name, task.start_time, task.end_time, task.led_color, activeDays, allDay, id);
    return getTaskById.get(id);
  },
  deleteTask: (id) => {
    const info = deleteTask.run(id);
    return info.changes > 0;
  },

  // Config operations
  getAllConfig: () => {
    const rows = getAllConfig.all();
    return rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  },
  getConfig: (key) => {
    const row = getConfigByKey.get(key);
    return row ? row.value : null;
  },
  updateConfig: (key, value) => {
    updateConfig.run(key, value);
    return { key, value };
  },

  // Calendar subscriptions
  getAllCalendars: () => getAllCalendars.all(),
  getEnabledCalendars: () => getEnabledCalendars.all(),
  getCalendarById: (id) => getCalendarById.get(id),
  getCalendarByUrl: (url) => getCalendarByUrl.get(url),
  createCalendar: (cal) => {
    const info = createCalendar.run(
      cal.name,
      cal.url,
      cal.led_color || null,
      cal.enabled === 0 ? 0 : 1
    );
    return getCalendarById.get(info.lastInsertRowid);
  },
  updateCalendar: (id, cal) => {
    updateCalendar.run(cal.name, cal.led_color || null, cal.enabled ? 1 : 0, id);
    return getCalendarById.get(id);
  },
  deleteCalendar: (id) => {
    deleteEventsForCalendar.run(id);
    const info = deleteCalendar.run(id);
    return info.changes > 0;
  },
  setCalendarSyncResult: (id, { lastSync, lastError, eventCount }) => {
    setCalendarSyncResult.run(lastSync || null, lastError || null, eventCount || 0, id);
    return getCalendarById.get(id);
  },

  // Calendar events cache
  replaceCalendarEvents: db.transaction((calendarId, events) => {
    deleteEventsForCalendar.run(calendarId);
    for (const e of events) {
      insertEvent.run(
        calendarId,
        e.uid,
        e.title,
        e.location || null,
        e.description || null,
        e.start_utc,
        e.end_utc,
        e.all_day ? 1 : 0
      );
    }
    return events.length;
  }),
  getEventsInRange: (fromIso, toIso) => getEventsInRange.all(fromIso, toIso),
  getEventById: (id) => getEventById.get(id),
  clearAllEvents: () => deleteAllEvents.run(),

  // Close database connection
  close: () => db.close()
};
