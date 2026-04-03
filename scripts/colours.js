import {
  themes,
  themeNames,
  themeBlackout,
  themePhosphorColors,
  SHAKE_THRESHOLD,
  SHAKE_COOLDOWN_MS,
  SHAKES_REQUIRED,
  SHAKE_WINDOW_MS,
} from "./config.js";

import { showToast, updateLivePrompt } from "./script.js";

// =========================================
// FAVICON
// =========================================

/**
 * Repaints the favicon to a solid 32×32 square in the active theme's phosphor colour.
 *
 * Two-tier favicon strategy:
 *   Cold load  — index.html inline script sets a pre-rendered 1×1 PNG data URL
 *                synchronously before first paint. No JS defer delay, no SVG flash.
 *   Live swap  — this function repaints a 32×32 canvas on every theme change and
 *                swaps the <link rel="icon"> href. Browsers re-read it immediately.
 *
 * @param {string} themeName - The theme identifier key.
 */
export function updateFavicon(themeName) {
  try {
    const color = themePhosphorColors[themeName];
    if (!color) return;

    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 32, 32);

    const dataURL = canvas.toDataURL("image/png");

    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = dataURL;
  } catch {
    // Canvas blocked or unavailable — silently skip
  }
}

// =========================================
// THEME SWITCHING
// =========================================

/**
 * Advances to the next theme in the themes array.
 *
 * CRT blackout — real terminals didn't crossfade between phosphor colours.
 * The screen went dark while the beam reset and the new content was written
 * to the display buffer. Duration varies by hardware (see themeBlackout in config.js).
 * We use the *incoming* theme's timing because the new terminal determines how fast
 * the new image appears — the old phosphor is already extinct.
 *
 * Respects prefers-reduced-motion: the blackout animation is skipped for
 * users who have requested reduced motion; the class swap happens instantly.
 */
export function changeTheme() {
  const body = document.body;
  const currentTheme =
    themes.find((theme) => body.classList.contains(`theme-${theme}`)) ||
    "ibm3279-green";
  const nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
  const nextTheme = themes[nextIndex];
  const blackoutMs = themeBlackout[nextTheme] || 50;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  /** Applies the next theme class and updates browser chrome colour. */
  function applyTheme() {
    themes.forEach((theme) => body.classList.remove(`theme-${theme}`));
    body.classList.add(`theme-${nextTheme}`);
    localStorage.setItem("theme", nextTheme);

    requestAnimationFrame(() => {
      const bg = getComputedStyle(body)
        .getPropertyValue("--theme-background")
        .trim();
      if (bg) {
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute("content", bg);
      }
    });

    // Chromatic aberration flash — beam settling as the new phosphor activates.
    // Skipped for reduced-motion (already checked by the caller).
    // void offsetWidth forces a reflow so the animation restarts cleanly if
    // the user switches themes rapidly before the previous animation ends.
    if (!reducedMotion) {
      const container = document.getElementById("quote-container");
      if (container) {
        container.classList.remove("crt-switch");
        void container.offsetWidth;
        container.classList.add("crt-switch");
        container.addEventListener(
          "animationend",
          () => container.classList.remove("crt-switch"),
          { once: true },
        );
      }
    }

    updateFavicon(nextTheme);
    showToast(themeNames[nextTheme] || nextTheme);
    updateLivePrompt();
  }

  if (reducedMotion) {
    applyTheme();
    return;
  }

  body.style.transition = "none";
  body.style.opacity = "0";

  setTimeout(() => {
    applyTheme();
    body.style.opacity = "1";
    requestAnimationFrame(() => {
      body.style.transition = "";
    });
  }, blackoutMs);
}

// =========================================
// INITIAL THEME APPLICATION
// =========================================

/**
 * Applies the saved theme from localStorage on load, or falls back to the default.
 * Wrapped in a readyState guard so document.body is guaranteed to exist
 * regardless of where this script is placed in the document.
 */
function applyInitialTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme && themes.includes(savedTheme)) {
    themes.forEach((theme) => document.body.classList.remove(`theme-${theme}`));
    document.body.classList.add(`theme-${savedTheme}`);
    updateFavicon(savedTheme);
  } else {
    themes.forEach((theme) => document.body.classList.remove(`theme-${theme}`));
    document.body.classList.add("theme-ibm3279-green");
    updateFavicon("ibm3279-green");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyInitialTheme);
} else {
  applyInitialTheme();
}

// =========================================
// KEYBOARD SHORTCUT — T to cycle theme
// =========================================

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "t") {
    changeTheme();
  }
});

// =========================================
// SHAKE DETECTION (mobile)
// =========================================

/** @type {number} */
let lastShakeTime = 0;
/** @type {{ x: number, y: number, z: number }} */
let lastAcceleration = { x: 0, y: 0, z: 0 };
/** @type {number} */
let shakeCount = 0;

/**
 * Processes a DeviceMotionEvent and triggers a theme change on two quick shakes.
 *
 * @param {DeviceMotionEvent} event
 */
function handleDeviceMotion(event) {
  const currentTime = Date.now();
  if (currentTime - lastShakeTime < SHAKE_COOLDOWN_MS) return;

  const acceleration = event.accelerationIncludingGravity;
  if (!acceleration) return;

  const { x, y, z } = acceleration;
  const totalAcceleration =
    Math.abs(x - lastAcceleration.x) +
    Math.abs(y - lastAcceleration.y) +
    Math.abs(z - lastAcceleration.z);

  if (totalAcceleration > SHAKE_THRESHOLD) {
    lastShakeTime = currentTime;
    shakeCount++;

    if (shakeCount >= SHAKES_REQUIRED) {
      changeTheme();
      shakeCount = 0;
    } else {
      setTimeout(() => {
        if (shakeCount < SHAKES_REQUIRED) shakeCount = 0;
      }, SHAKE_WINDOW_MS);
    }
  }

  lastAcceleration = { x, y, z };
}

if (typeof DeviceMotionEvent !== "undefined") {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    // iOS 13+ requires an explicit permission request triggered by a user gesture
    const requestPermission = () => {
      DeviceMotionEvent.requestPermission()
        .then((response) => {
          if (response === "granted") {
            window.addEventListener("devicemotion", handleDeviceMotion, {
              passive: true,
            });
          }
        })
        .catch(console.error);
    };

    const enableShakeDetection = () => {
      requestPermission();
      document.removeEventListener("click", enableShakeDetection);
      document.removeEventListener("touchstart", enableShakeDetection);
    };

    document.addEventListener("click", enableShakeDetection, { once: true });
    document.addEventListener("touchstart", enableShakeDetection, {
      once: true,
    });
  } else {
    window.addEventListener("devicemotion", handleDeviceMotion, {
      passive: true,
    });
  }
}
