/**
 * Event bus
 *
 * In-process pub/sub that the web panel subscribes to over Server-Sent Events
 * (`GET /api/events`). Modules announce *what* changed; clients re-fetch the
 * matching resource, so no payloads travel through here.
 *
 * Topics:
 *   status    - the scheduler re-evaluated the agenda (every minute, and after mutations)
 *   tasks     - a task was created, edited, toggled or deleted
 *   calendars - a subscription changed or a sync finished
 *   config    - settings changed
 *   frame     - a new e-ink frame was rendered (the preview PNG changed)
 */

const { EventEmitter } = require('events');

const bus = new EventEmitter();
// Every open browser tab holds one listener
bus.setMaxListeners(100);

/**
 * @param {'status'|'tasks'|'calendars'|'config'|'frame'} topic
 * @param {Object} [data]
 */
function emit(topic, data = {}) {
  bus.emit('change', { topic, at: new Date().toISOString(), ...data });
}

function subscribe(listener) {
  bus.on('change', listener);
  return () => bus.off('change', listener);
}

module.exports = { emit, subscribe };
