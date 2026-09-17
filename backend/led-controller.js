/**
 * LED Controller Module
 * Manages RGB LED hardware control with brightness support
 */

const { execSync, execFile } = require('child_process');

// Hardware capability detection
let ledHardwareAvailable = null;

/**
 * Check if RGB LED hardware is available
 * @returns {boolean}
 */
function checkLEDHardware() {
  if (ledHardwareAvailable !== null) {
    return ledHardwareAvailable;
  }

  try {
    execSync(`bash -c "source /opt/distiller-sdk/activate.sh && python3 -c 'from distiller_sdk.hardware.sam import create_led_with_sudo; led = create_led_with_sudo()'"`, {
      cwd: '/opt/distiller-sdk',
      stdio: 'pipe'
    });
    ledHardwareAvailable = true;
    console.log('✓ RGB LED hardware detected');
    return true;
  } catch (error) {
    ledHardwareAvailable = false;
    console.log('⚠️  RGB LED hardware not available on this device');
    console.error('LED detection error:', error.stderr ? error.stderr.toString() : error.message);
    return false;
  }
}

/**
 * Parse LED color string to RGB object
 * @param {string|null} colorString - Format "r,g,b" or null for off
 * @returns {Object|null} - {r, g, b} or null
 */
function parseColor(colorString) {
  if (!colorString || colorString === 'null') {
    return null;
  }

  const parts = colorString.split(',').map(v => parseInt(v.trim(), 10));
  if (parts.length !== 3 || parts.some(v => isNaN(v) || v < 0 || v > 255)) {
    console.error(`Invalid LED color format: ${colorString}`);
    return null;
  }

  return { r: parts[0], g: parts[1], b: parts[2] };
}

/**
 * Apply brightness to RGB values
 * @param {Object} rgb - {r, g, b}
 * @param {number} brightness - 0-100
 * @returns {Object} - Adjusted {r, g, b}
 */
function applyBrightness(rgb, brightness) {
  const factor = brightness / 100;
  return {
    r: Math.round(rgb.r * factor),
    g: Math.round(rgb.g * factor),
    b: Math.round(rgb.b * factor)
  };
}

// Driving the LED spawns a Python process, so it is done off the request path.
// Only one runs at a time and a newer colour replaces a queued one — the last
// value is the only one that matters.
let applying = false;
let pendingCommand = null;

/**
 * Run a one-line snippet against the SDK without blocking the event loop.
 * @param {string} snippet - Python to execute after the LED handle is created
 */
function runLedCommand(snippet) {
  pendingCommand = snippet;
  pumpLed();
}

function pumpLed() {
  if (applying || pendingCommand === null) return;

  const snippet = pendingCommand;
  pendingCommand = null;
  applying = true;

  const script = `from distiller_sdk.hardware.sam import create_led_with_sudo; led = create_led_with_sudo(); ${snippet}`;

  execFile('bash', ['-c', `source /opt/distiller-sdk/activate.sh && python3 -c ${JSON.stringify(script)}`], {
    cwd: '/opt/distiller-sdk',
    timeout: 20000
  }, (error) => {
    applying = false;
    if (error) {
      console.error('❌ Error controlling LED:', error.message);
      // Stop retrying against hardware that is not answering
      ledHardwareAvailable = false;
      pendingCommand = null;
      return;
    }
    pumpLed();
  });
}

/**
 * Set LED color with brightness
 * @param {string|null} colorString - Format "r,g,b" or null to turn off
 * @param {number} brightness - Global brightness 0-100
 */
function setLED(colorString, brightness = 100) {
  // Check hardware availability
  if (!checkLEDHardware()) {
    console.log('ℹ️  LED control skipped (no RGB LED hardware)');
    return;
  }

  const color = parseColor(colorString);

  if (!color) {
    console.log('📴 Turning off LED');
    runLedCommand('led.turn_off_all()');
    return;
  }

  const adjusted = applyBrightness(color, brightness);
  console.log(`💡 Setting LED to RGB(${adjusted.r}, ${adjusted.g}, ${adjusted.b}) [Brightness: ${brightness}%]`);
  runLedCommand(`led.set_color_all(${adjusted.r}, ${adjusted.g}, ${adjusted.b})`);
}

/**
 * Turn off LED
 */
function turnOffLED() {
  setLED(null, 0);
}

/**
 * Check if LED hardware is available
 * @returns {boolean}
 */
function isLEDAvailable() {
  return checkLEDHardware();
}

module.exports = {
  setLED,
  turnOffLED,
  parseColor,
  applyBrightness,
  isLEDAvailable
};
