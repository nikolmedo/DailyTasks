/**
 * Task Scheduler
 *
 * Every minute it asks the agenda what is happening right now — local tasks and
 * subscribed calendar events alike — and drives the LED and the e-ink panel
 * accordingly.
 */

const cron = require('node-cron');
const db = require('./database');
const agenda = require('./agenda');
const ledController = require('./led-controller');
const displayController = require('./display-controller');

let schedulerJob = null;
let lastSnapshot = null;
let lastActiveKey = null;
let lastLedColor = null;
let lastBrightness = null;

/**
 * Evaluate the current moment and update the hardware.
 * @param {Object} [opts]
 * @param {boolean} [opts.force=false] - refresh the LED and panel even if nothing changed
 * @returns {Object} the snapshot that was applied
 */
function schedulerTick(opts = {}) {
  const { force = false } = opts;

  try {
    const config = db.getAllConfig();
    const timezone = config.timezone || 'America/Los_Angeles';
    const brightness = parseInt(config.brightness || '100', 10);

    const snapshot = agenda.snapshot(timezone);
    lastSnapshot = snapshot;

    const active = snapshot.active;
    const activeKey = active ? active.key : null;
    const ledColor = active ? active.led_color : null;

    // The LED only needs touching when the colour or the brightness moves
    if (force || ledColor !== lastLedColor || brightness !== lastBrightness) {
      if (ledColor) {
        ledController.setLED(ledColor, brightness);
      } else {
        ledController.turnOffLED();
      }
      lastLedColor = ledColor;
      lastBrightness = brightness;
    }

    if (activeKey !== lastActiveKey) {
      console.log(active
        ? `\n⏰ [${snapshot.currentTime}] Active: ${active.name} (${active.source})`
        : `\n⏰ [${snapshot.currentTime}] No active task — idle`);
      lastActiveKey = activeKey;
    }

    // The panel carries a live progress bar and clock, so it is re-rendered
    // every tick; display-controller skips the refresh when the frame is
    // pixel-identical to the last one it pushed.
    const task = active && active.source === 'task' ? db.getTaskById(active.id) : null;
    displayController.showSnapshot(snapshot, config, task, { force });

    return snapshot;
  } catch (error) {
    console.error('❌ Scheduler error:', error.message);
    return lastSnapshot;
  }
}

/**
 * Start the scheduler (runs every minute, on the minute).
 */
function startScheduler() {
  if (schedulerJob) {
    console.log('⚠️  Scheduler already running');
    return;
  }

  console.log('\n🚀 Starting task scheduler...');
  schedulerTick({ force: true });

  schedulerJob = cron.schedule('* * * * *', () => schedulerTick());
  console.log('✓ Scheduler started (runs every minute)');
}

function stopScheduler() {
  if (schedulerJob) {
    schedulerJob.stop();
    schedulerJob = null;
    console.log('⏹️  Scheduler stopped');
  }
}

/**
 * Re-evaluate immediately — used after any mutation and by /api/refresh.
 * @param {Object} [opts]
 */
function forceUpdate(opts = {}) {
  return schedulerTick({ force: Boolean(opts.force) });
}

/**
 * Current state for the REST API and the web panel.
 * @returns {Object}
 */
function getStatus() {
  const config = db.getAllConfig();
  const timezone = config.timezone || 'America/Los_Angeles';
  const snapshot = agenda.snapshot(timezone);
  lastSnapshot = snapshot;

  const serialiseSlot = (slot) => (slot ? { ...slot } : null);

  return {
    currentTime: snapshot.currentTime,
    date: snapshot.date,
    timezone,
    activeTask: serialiseSlot(snapshot.active),
    nextTask: serialiseSlot(snapshot.next),
    progress: snapshot.progress,
    remainingMinutes: snapshot.remaining,
    agenda: snapshot.slots.map(serialiseSlot),
    schedulerRunning: schedulerJob !== null,
    ledAvailable: ledController.isLEDAvailable()
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  forceUpdate,
  getStatus,
  schedulerTick
};
