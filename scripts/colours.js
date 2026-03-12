const themes = [
  'ibm3279-green',           // IBM 3279, 1979 — P1 green phosphor, 80×24, mainframe TSO/CMS terminal
  'teletype-blue-green',     // DEC VT220, 1983 — P4 white (blue-green aged), 80×24, Unix/ANSI
  'pet2001-green',           // Commodore PET 2001-N, 1979 — P31 green phosphor, 40×25
  'ibm3279-bitcoin-orange',  // IBM 3279, 1979 — custom bitcoin orange, cypherpunk homage
  'hazeltine-teal',          // Hazeltine 1500, 1977 — proprietary teal phosphor, 80×24
  'zenith-green',            // Zenith Z-19, 1979 — P1 green phosphor, 80×24, CP/M and Unix
  'white',                   // DEC VT05, 1972 — P4 white phosphor, 72×20, teletype-era DEC
  'vt100-amber',             // DEC VT100, 1978 — P3 amber phosphor, 80×24, the canonical terminal
  'apple2-green',            // Apple II, 1977 — P1 green phosphor, 40×24, 6502 interrupt blink
  'commodore64',             // Commodore 64, 1982 — VIC-II NTSC composite, 40×25
];

// Shake detection variables
let lastShakeTime = 0;
let lastAcceleration = { x: 0, y: 0, z: 0 };
let shakeCount = 0;
const SHAKE_THRESHOLD = 15;
const SHAKE_COOLDOWN = 1000;
const SHAKES_REQUIRED = 2;
const SHAKE_WINDOW = 2000;

// Theme display names for toast
const themeNames = {
  'ibm3279-green':           'IBM 3279 — P1 green phosphor',
  'teletype-blue-green':     'DEC VT220 — P4 blue-green',
  'pet2001-green':           'Commodore PET 2001-N — P31 green',
  'ibm3279-bitcoin-orange':  'IBM 3279 — bitcoin orange',
  'hazeltine-teal':          'Hazeltine 1500 — teal phosphor',
  'zenith-green':            'Zenith Z-19 — P1 green phosphor',
  'white':                   'DEC VT05 — P4 white phosphor',
  'vt100-amber':             'DEC VT100 — P3 amber phosphor',
  'apple2-green':            'Apple II — P1 green phosphor',
  'commodore64':             'Commodore 64 — VIC-II NTSC',
};

/**
 * Changes to the next theme in the array
 */
function changeTheme() {
  const body = document.body;
  const currentTheme = themes.find(theme => body.classList.contains(`theme-${theme}`)) || 'ibm3279-green';
  const nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
  const nextTheme = themes[nextIndex];

  // Fire the phosphor resync animation before the class swap.
  // The CSS reads --primary-color from the NEW theme after the swap,
  // so the flash colour is already correct on the next frame.
  body.classList.add('theme-switching');

  themes.forEach(theme => body.classList.remove(`theme-${theme}`));
  body.classList.add(`theme-${nextTheme}`);
  localStorage.setItem('theme', nextTheme);

  // Remove the trigger class after the animation completes (420ms)
  setTimeout(() => body.classList.remove('theme-switching'), 420);

  // Keep the browser chrome in sync on mobile — read the new background
  // from computed styles so we never hardcode a colour here
  requestAnimationFrame(() => {
    const bg = getComputedStyle(body).getPropertyValue('--theme-background').trim();
    if (bg) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
    }
  });

  if (typeof showToast === 'function') {
    showToast(themeNames[nextTheme] || nextTheme);
  }

  if (typeof updateLivePrompt === 'function') {
    updateLivePrompt();
  }

  console.log(`Theme changed to: ${nextTheme}`);
}

/**
 * Handles device motion for shake detection
 * @param {DeviceMotionEvent} event
 */
function handleDeviceMotion(event) {
  const currentTime = Date.now();

  if (currentTime - lastShakeTime < SHAKE_COOLDOWN) return;

  const acceleration = event.accelerationIncludingGravity;
  if (!acceleration) return;

  const { x, y, z } = acceleration;
  const deltaX = Math.abs(x - lastAcceleration.x);
  const deltaY = Math.abs(y - lastAcceleration.y);
  const deltaZ = Math.abs(z - lastAcceleration.z);
  const totalAcceleration = deltaX + deltaY + deltaZ;

  if (totalAcceleration > SHAKE_THRESHOLD) {
    lastShakeTime = currentTime;
    shakeCount++;

    console.log(`Shake detected: ${shakeCount}/${SHAKES_REQUIRED}`);

    if (shakeCount >= SHAKES_REQUIRED) {
      changeTheme();
      shakeCount = 0;
    } else {
      setTimeout(() => {
        if (shakeCount < SHAKES_REQUIRED) {
          shakeCount = 0;
          console.log('Shake count reset - not enough shakes in time window');
        }
      }, SHAKE_WINDOW);
    }
  }

  lastAcceleration = { x, y, z };
}

// Keyboard theme switching
document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 't') {
    changeTheme();
  }
});

// Shake detection for mobile
if (typeof DeviceMotionEvent !== 'undefined') {
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const requestPermission = () => {
      DeviceMotionEvent.requestPermission()
        .then(response => {
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
            console.log('Device motion permission granted');
          } else {
            console.log('Device motion permission denied');
          }
        })
        .catch(console.error);
    };

    const enableShakeDetection = () => {
      requestPermission();
      document.removeEventListener('click', enableShakeDetection);
      document.removeEventListener('touchstart', enableShakeDetection);
    };

    document.addEventListener('click', enableShakeDetection, { once: true });
    document.addEventListener('touchstart', enableShakeDetection, { once: true });
  } else {
    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
    console.log('Shake to change theme enabled');
  }
} else {
  console.log('Device motion not supported');
}

// Apply saved theme on load.
// Wrapped in a readyState guard so document.body is guaranteed to exist
// regardless of where this script is placed in the document.
function applyInitialTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme && themes.includes(savedTheme)) {
    themes.forEach(theme => document.body.classList.remove(`theme-${theme}`));
    document.body.classList.add(`theme-${savedTheme}`);
  } else {
    console.log('[colours.js] No valid saved theme, defaulting to ibm3279-green');
    themes.forEach(theme => document.body.classList.remove(`theme-${theme}`));
    document.body.classList.add('theme-ibm3279-green');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyInitialTheme);
} else {
  // Already parsed (e.g. script is defer-loaded and DOM is ready)
  applyInitialTheme();
}