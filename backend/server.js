/**
 * Daily Tasks API Server
 * Express server with REST API for tasks, calendar subscriptions and device state
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const scheduler = require('./scheduler');
const agenda = require('./agenda');
const calendarSync = require('./calendar-sync');
const displayController = require('./display-controller');
const i18n = require('./i18n');
const events = require('./events');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '128kb' }));
app.use('/locales', express.static(path.join(__dirname, '../locales')));
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize database
db.initDatabase();

const TIME_REGEX = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
const COLOR_REGEX = /^\d{1,3},\d{1,3},\d{1,3}$/;

/**
 * Validate the shared task payload.
 * @param {Object} body
 * @returns {string|null} error message, or null when valid
 */
function validateTask(body) {
  const { name, start_time, end_time, led_color, active_days } = body;

  if (!name || !String(name).trim()) return 'Missing required field: name';
  if (String(name).length > 120) return 'Name is too long (max 120 characters)';
  if (!start_time || !end_time) return 'Missing required fields: start_time, end_time';
  if (!TIME_REGEX.test(start_time) || !TIME_REGEX.test(end_time)) {
    return 'Invalid time format. Use HH:MM (24-hour format)';
  }
  if (led_color && led_color !== 'null' && !COLOR_REGEX.test(led_color)) {
    return 'Invalid LED color format. Use "r,g,b" or null';
  }
  if (active_days !== undefined && active_days !== null && active_days !== '') {
    const days = String(active_days).split(',').map(d => parseInt(d.trim(), 10));
    if (days.some(d => Number.isNaN(d) || d < 0 || d > 6)) {
      return 'Invalid active_days. Use comma-separated indices 0-6';
    }
  }
  return null;
}

/**
 * TASKS ENDPOINTS
 */

// GET /api/tasks - Get all tasks
app.get('/api/tasks', (req, res) => {
  try {
    res.json({ success: true, data: db.getAllTasks() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/tasks/:id - Get task by ID
app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = db.getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tasks - Create new task
app.post('/api/tasks', (req, res) => {
  try {
    const error = validateTask(req.body);
    if (error) return res.status(400).json({ success: false, error });

    const { name, start_time, end_time, led_color, active_days, all_day } = req.body;
    const task = db.createTask({
      name: String(name).trim(),
      start_time,
      end_time,
      led_color,
      active_days,
      all_day: all_day ? 1 : 0
    });

    events.emit('tasks');
    scheduler.forceUpdate();
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/tasks/:id - Update task
app.put('/api/tasks/:id', (req, res) => {
  try {
    if (!db.getTaskById(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const error = validateTask(req.body);
    if (error) return res.status(400).json({ success: false, error });

    const { name, start_time, end_time, led_color, active_days, all_day } = req.body;
    const task = db.updateTask(req.params.id, {
      name: String(name).trim(),
      start_time,
      end_time,
      led_color,
      active_days,
      all_day: all_day ? 1 : 0
    });

    events.emit('tasks');
    scheduler.forceUpdate();
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/tasks/:id/done - Toggle done state
app.patch('/api/tasks/:id/done', (req, res) => {
  try {
    if (!db.getTaskById(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    const updated = db.toggleTaskDone(req.params.id);
    events.emit('tasks');
    scheduler.forceUpdate();
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/tasks/:id - Delete task
app.delete('/api/tasks/:id', (req, res) => {
  try {
    const task = db.getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    db.deleteTask(req.params.id);
    events.emit('tasks');
    scheduler.forceUpdate();
    // Echoed back so the client can offer an undo without a second round trip
    res.json({ success: true, data: task, message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * CALENDAR ENDPOINTS
 *
 * Subscriptions are read-only iCalendar feeds — typically the "Secret address
 * in iCal format" of a Google Calendar, which also covers shared calendars.
 */

// GET /api/calendars - List subscriptions
app.get('/api/calendars', (req, res) => {
  try {
    res.json({
      success: true,
      data: db.getAllCalendars(),
      sync: calendarSync.getSyncState()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/calendars - Subscribe to a feed (validated before it is stored)
app.post('/api/calendars', async (req, res) => {
  try {
    const { url, name, led_color } = req.body;

    let normalized;
    try {
      normalized = calendarSync.normalizeUrl(url);
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (led_color && led_color !== 'null' && !COLOR_REGEX.test(led_color)) {
      return res.status(400).json({ success: false, error: 'Invalid LED color format. Use "r,g,b" or null' });
    }

    if (db.getCalendarByUrl(normalized)) {
      return res.status(409).json({ success: false, error: 'This calendar is already subscribed' });
    }

    let probed;
    try {
      probed = await calendarSync.probe(normalized);
    } catch (error) {
      return res.status(400).json({ success: false, error: `Could not read the calendar: ${error.message}` });
    }

    const calendar = db.createCalendar({
      name: (name && String(name).trim()) || probed.name || 'Google Calendar',
      url: normalized,
      led_color: led_color === 'null' ? null : led_color,
      enabled: 1
    });

    await calendarSync.syncCalendar(calendar);
    events.emit('calendars');
    scheduler.forceUpdate();

    res.status(201).json({ success: true, data: db.getCalendarById(calendar.id) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/calendars/:id - Rename, recolour or pause a subscription
app.put('/api/calendars/:id', (req, res) => {
  try {
    const existing = db.getCalendarById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Calendar not found' });
    }

    const { name, led_color, enabled } = req.body;
    if (led_color && led_color !== 'null' && !COLOR_REGEX.test(led_color)) {
      return res.status(400).json({ success: false, error: 'Invalid LED color format. Use "r,g,b" or null' });
    }

    const calendar = db.updateCalendar(req.params.id, {
      name: (name && String(name).trim()) || existing.name,
      led_color: led_color === 'null' ? null : (led_color !== undefined ? led_color : existing.led_color),
      enabled: enabled === undefined ? existing.enabled : (enabled ? 1 : 0)
    });

    events.emit('calendars');
    scheduler.forceUpdate();
    res.json({ success: true, data: calendar });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/calendars/:id - Unsubscribe and drop its cached events
app.delete('/api/calendars/:id', (req, res) => {
  try {
    if (!db.getCalendarById(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Calendar not found' });
    }
    db.deleteCalendar(req.params.id);
    events.emit('calendars');
    scheduler.forceUpdate();
    res.json({ success: true, message: 'Calendar removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/calendars/sync - Force a sync of every enabled subscription
app.post('/api/calendars/sync', async (req, res) => {
  try {
    const results = await calendarSync.syncAll();
    scheduler.forceUpdate();
    res.json({ success: true, data: results, calendars: db.getAllCalendars() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * AGENDA ENDPOINT
 */

// GET /api/agenda?date=YYYY-MM-DD - Merged tasks + calendar events for one day
app.get('/api/agenda', (req, res) => {
  try {
    const { DateTime } = require('luxon');
    const timezone = db.getConfig('timezone') || 'America/Los_Angeles';

    const requested = req.query.date;
    const day = requested
      ? DateTime.fromISO(String(requested), { zone: timezone })
      : DateTime.now().setZone(timezone);

    if (!day.isValid) {
      return res.status(400).json({ success: false, error: 'Invalid date. Use YYYY-MM-DD' });
    }

    res.json({
      success: true,
      data: {
        date: day.toISODate(),
        timezone,
        slots: agenda.buildAgenda(day, { includeDone: true })
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * CONFIG ENDPOINTS
 */

// GET /api/config - Get all configuration
app.get('/api/config', (req, res) => {
  try {
    res.json({ success: true, data: db.getAllConfig() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/config - Update configuration
app.put('/api/config', (req, res) => {
  try {
    const updates = req.body;

    if (updates.brightness !== undefined) {
      const brightness = parseInt(updates.brightness, 10);
      if (Number.isNaN(brightness) || brightness < 0 || brightness > 100) {
        return res.status(400).json({ success: false, error: 'Brightness must be between 0 and 100' });
      }
    }

    if (updates.time_format && !['12', '24'].includes(String(updates.time_format))) {
      return res.status(400).json({ success: false, error: 'Time format must be "12" or "24"' });
    }

    if (updates.language !== undefined && !i18n.SUPPORTED.includes(updates.language)) {
      return res.status(400).json({
        success: false,
        error: `Language must be one of: ${i18n.SUPPORTED.join(', ')}`
      });
    }

    if (updates.timezone !== undefined) {
      const { DateTime } = require('luxon');
      const zone = String(updates.timezone).trim();
      if (!zone || !DateTime.now().setZone(zone).isValid) {
        return res.status(400).json({ success: false, error: 'Unknown timezone' });
      }
    }

    if (updates.calendar_sync_minutes !== undefined) {
      const minutes = parseInt(updates.calendar_sync_minutes, 10);
      if (Number.isNaN(minutes) || minutes < 5 || minutes > 180) {
        return res.status(400).json({ success: false, error: 'Sync interval must be between 5 and 180 minutes' });
      }
    }

    Object.keys(updates).forEach(key => {
      db.updateConfig(key, String(updates[key]));
    });

    // Not forced: the e-ink panel only redraws when the frame actually changes,
    // so dragging the brightness slider drives the LED without flashing the panel.
    events.emit('config');
    scheduler.forceUpdate();
    res.json({ success: true, data: db.getAllConfig() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DEVICE STATE
 */

// GET /api/status - Current system status
app.get('/api/status', (req, res) => {
  try {
    res.json({ success: true, data: scheduler.getStatus() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/display/preview.png - Exactly what the e-ink panel is showing
app.get('/api/display/preview.png', (req, res) => {
  try {
    const image = displayController.getRenderedImagePath();
    if (!image) {
      return res.status(404).json({ success: false, error: 'No frame has been rendered yet' });
    }
    res.set('Cache-Control', 'no-store');
    res.sendFile(image);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/refresh - Force a full refresh of the display and LED
app.post('/api/refresh', (req, res) => {
  try {
    scheduler.forceUpdate({ force: true });
    res.json({ success: true, message: 'Display and LED refreshed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * LIVE UPDATES
 */

// GET /api/events - Server-Sent Events stream of change notifications (see events.js)
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
    // Stop reverse proxies from buffering the stream
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 5000\n\n');

  const unsubscribe = events.subscribe((event) => {
    res.write(`event: ${event.topic}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  // Comment lines keep idle connections from being dropped by proxies
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

/**
 * HEALTH CHECK
 */
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// Unknown API routes should not fall through to the SPA
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Unknown endpoint' });
});

/**
 * Serve frontend
 */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

/**
 * Start server
 */
const server = app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Daily Tasks Server Running`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📡 API Server: http://localhost:${PORT}`);
  console.log(`🌐 Web Panel: http://localhost:${PORT}`);
  console.log(`${'='.repeat(60)}\n`);

  scheduler.startScheduler();
  calendarSync.startSync();
});

/**
 * Graceful shutdown
 */
function shutdown() {
  console.log('\n\n🛑 Shutting down gracefully...');
  scheduler.stopScheduler();
  calendarSync.stopSync();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
