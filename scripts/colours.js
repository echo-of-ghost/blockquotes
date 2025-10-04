const themes = [
  'ibm3279-green',           // IBM 3279, 1979, green phosphor CRT, 80x24, mainframe terminal for TSO and CMS
  'teletype-blue-green',     // DEC VT220, 1983, white phosphor CRT, 80x24, used in Unix environments with ANSI support
  'pet2001-green',           // Commodore PET 2001, 1977, green phosphor CRT, early personal computer with built-in keyboard
  'ibm3279-bitcoin-orange',  // IBM 3279, 1979, modified orange Bitcoin theme, color display for mainframe interaction
  'hazeltine-teal',          // Hazeltine 1500, 1977, teal phosphor CRT, 80x24, popular for ergonomics
  'zenith-green',            // Zenith Z-19, 1979, green phosphor CRT, 80x24, compatible with Heathkit H-19, used in CP/M and Unix
  'white',                   // DEC VT05, 1972, greenish-white phosphor CRT, 72x20, early teletype-style terminal for DEC systems
  'vt100-amber',             // DEC VT100, 1978, amber P3 phosphor CRT, 80x24, the most influential terminal ever made
  'apple2-green',            // Apple II, 1977, bright green P1 phosphor CRT, 40x24, iconic home computer terminal
  'commodore64',            // Commodore 64, 1982, iconic blue screen, 40x25, best-selling home computer of all time
];

// Shake detection variables
let lastShakeTime = 0;
let lastAcceleration = { x: 0, y: 0, z: 0 };
let shakeCount = 0;
const SHAKE_THRESHOLD = 15; // Adjust sensitivity (higher = less sensitive)
const SHAKE_COOLDOWN = 1000; // Minimum time between shake detections (ms)
const SHAKES_REQUIRED = 2; // Number of shakes required to change theme
const SHAKE_WINDOW = 2000; // Time window to complete required shakes (ms)

/**
 * Changes to the next theme in the array
 */
function changeTheme() {
  const body = document.body;
  const currentTheme = themes.find(theme => body.classList.contains(`theme-${theme}`)) || 'ibm3279-green';
  const nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
  
  themes.forEach(theme => body.classList.remove(`theme-${theme}`));
  body.classList.add(`theme-${themes[nextIndex]}`);
  localStorage.setItem('theme', themes[nextIndex]);
  
  console.log(`Theme changed to: ${themes[nextIndex]}`);
}

/**
 * Handles device motion for shake detection
 * @param {DeviceMotionEvent} event - Device motion event
 */
function handleDeviceMotion(event) {
  const currentTime = Date.now();
  
  // Check cooldown to prevent multiple rapid triggers
  if (currentTime - lastShakeTime < SHAKE_COOLDOWN) {
    return;
  }
  
  const acceleration = event.accelerationIncludingGravity;
  if (!acceleration) return;
  
  const { x, y, z } = acceleration;
  
  // Calculate acceleration difference from last reading
  const deltaX = Math.abs(x - lastAcceleration.x);
  const deltaY = Math.abs(y - lastAcceleration.y);
  const deltaZ = Math.abs(z - lastAcceleration.z);
  
  // Check if the total acceleration change exceeds threshold
  const totalAcceleration = deltaX + deltaY + deltaZ;
  
  if (totalAcceleration > SHAKE_THRESHOLD) {
    lastShakeTime = currentTime;
    shakeCount++;
    
    console.log(`Shake detected: ${shakeCount}/${SHAKES_REQUIRED}`);
    
    // Check if we've reached the required number of shakes
    if (shakeCount >= SHAKES_REQUIRED) {
      changeTheme();
      shakeCount = 0; // Reset counter
    } else {
      // Start a timer to reset the shake count if not enough shakes in time window
      setTimeout(() => {
        if (shakeCount < SHAKES_REQUIRED) {
          shakeCount = 0;
          console.log('Shake count reset - not enough shakes in time window');
        }
      }, SHAKE_WINDOW);
    }
  }
  
  // Update last acceleration values
  lastAcceleration = { x, y, z };
}

// Keyboard theme switching (existing functionality)
document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 't') {
    changeTheme();
  }
});

// Shake detection for mobile devices
if (typeof DeviceMotionEvent !== 'undefined') {
  // Request permission for iOS 13+ devices
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    // Show a button or automatically request permission
    const requestPermission = () => {
      DeviceMotionEvent.requestPermission()
        .then(response => {
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
            console.log('Device motion permission granted - shake to change theme enabled');
          } else {
            console.log('Device motion permission denied');
          }
        })
        .catch(console.error);
    };
    
    // Auto-request permission on user interaction
    const enableShakeDetection = () => {
      requestPermission();
      // Remove the event listener after first interaction
      document.removeEventListener('click', enableShakeDetection);
      document.removeEventListener('touchstart', enableShakeDetection);
    };
    
    document.addEventListener('click', enableShakeDetection, { once: true });
    document.addEventListener('touchstart', enableShakeDetection, { once: true });
  } else {
    // For other browsers that don't require permission
    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
    console.log('Shake to change theme enabled');
  }
} else {
  console.log('Device motion not supported on this device');
}

// Apply saved theme on load
const savedTheme = localStorage.getItem('theme');
if (savedTheme && themes.includes(savedTheme)) {
  themes.forEach(theme => document.body.classList.remove(`theme-${theme}`));
  document.body.classList.add(`theme-${savedTheme}`);
} else {
  console.log('[colours.js] No valid saved theme, defaulting to ibm3279-green');
  themes.forEach(theme => document.body.classList.remove(`theme-${theme}`));
  document.body.classList.add('theme-ibm3279-green');
}