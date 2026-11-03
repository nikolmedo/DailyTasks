// Point the database module at a throwaway file before anything requires it.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-tasks-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');

const db = require('../database');
db.initDatabase();

process.on('exit', () => {
  try { db.close(); } catch { /* already closed */ }
  fs.rmSync(dir, { recursive: true, force: true });
});

module.exports = { db };
