const themes = [
  "ibm3279-green", // IBM 3279, 1979 — P1 green phosphor, 80×24, mainframe TSO/CMS terminal
  "teletype-blue-green", // DEC VT220, 1983 — P4 white (blue-green aged), 80×24, Unix/ANSI
  "pet2001-green", // Commodore PET 2001-N, 1979 — P31 green phosphor, 40×25
  "ibm3279-bitcoin-orange", // IBM 3279, 1979 — custom bitcoin orange, cypherpunk homage
  "wyse50-amber", // Wyse WY-50, 1983 — P134 amber phosphor, 80×24, Wall Street trading terminal
  "zenith-green", // Zenith Z-19, 1979 — P1 green phosphor, 80×24, CP/M and Unix
  "adm3a-green", // Lear Siegler ADM-3A, 1976 — P1 green phosphor (warm variant), 80×24, the terminal vi was written on
  "kaypro-green", // Kaypro II, 1982 — Toshiba P31 green phosphor, 80×24, CP/M 2.2
  "white", // DEC VT05, 1972 — P4 white phosphor, 72×20, teletype-era DEC
  "vt100-amber", // DEC VT100, 1978 — P3 amber phosphor, 80×24, the canonical terminal
  "apple2-green", // Apple II, 1977 — P1 green phosphor, 40×24, 6502 interrupt blink
  "commodore64", // Commodore 64, 1982 — VIC-II NTSC composite, 40×25
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
  "ibm3279-green": "IBM 3279 — P1 green phosphor",
  "teletype-blue-green": "DEC VT220 — P4 blue-green",
  "pet2001-green": "Commodore PET 2001-N — P31 green",
  "ibm3279-bitcoin-orange": "IBM 3279 — bitcoin orange",
  "wyse50-amber": "Wyse WY-50 — P134 amber (Wall Street)",
  "zenith-green": "Zenith Z-19 — P1 green phosphor",
  "adm3a-green": "ADM-3A — P1 green phosphor (the vi terminal)",
  "kaypro-green": "Kaypro II — P31 green phosphor",
  white: "DEC VT05 — P4 white phosphor",
  "vt100-amber": "DEC VT100 — P3 amber phosphor",
  "apple2-green": "Apple II — P1 green phosphor",
  commodore64: "Commodore 64 — VIC-II NTSC",
};

/**
 * Changes to the next theme in the array
 */
/*
  Per-terminal screen clear timing — sourced from hardware.
  The blackout duration matches the real time each terminal took to
  clear its screen buffer and begin displaying new content.

  IBM 3279:      ~50ms  — 3270 protocol host-driven screen clear, ~3 frames
  DEC VT220:     ~18ms  — fast firmware, 1 frame + P4 ~1ms decay
  PET 2001:      ~18ms  — 6502 1MHz writes 1000 bytes + 1 frame sync
  Bitcoin orange: ~50ms — same IBM 3279 chassis
  Wyse WY-50:    ~25ms  — 8031 firmware screen clear, 14" tube
  Zenith Z-19:   ~25ms  — CP/M BDOS CLS, firmware-dependent
  ADM-3A:        ~17ms  — TTL hardware counter reset, 1 frame
  Kaypro II:     ~25ms  — CP/M BDOS CLS
  VT05:          ~120ms — teletype-era shift register, character-by-character
  VT100:         ~47ms  — firmware nulls + P3 amber ~14ms persistence ghost
  Apple II:      ~18ms  — HOME (CALL -936), 960 bytes + 1 frame
  Commodore 64:  ~17ms  — KERNAL CHROUT 1000 spaces + 1 frame
*/
const themeBlackout = {
  "ibm3279-green": 50,
  "teletype-blue-green": 18,
  "pet2001-green": 18,
  "ibm3279-bitcoin-orange": 50,
  "wyse50-amber": 25,
  "zenith-green": 25,
  "adm3a-green": 17,
  "kaypro-green": 25,
  white: 120,
  "vt100-amber": 47,
  "apple2-green": 18,
  commodore64: 17,
};

// Phosphor colour for each theme — used to paint the favicon square.
// Matches --primary-color values in styles.css exactly.
const themePhosphorColors = {
  "ibm3279-green": "#57FF8C",
  "teletype-blue-green": "#A4C8B0",
  "pet2001-green": "#00FF44",
  "ibm3279-bitcoin-orange": "#FF9500",
  "wyse50-amber": "#FFBE00",
  "zenith-green": "#7FFF7F",
  "adm3a-green": "#A8FF60",
  "kaypro-green": "#76FF76",
  white: "#D6D6C6",
  "vt100-amber": "#FFB000",
  "apple2-green": "#24FF52",
  commodore64: "#7469C8",
};

/**
 * Updates the favicon and manifest theme_color to match the active theme.
 *
 * Two-tier favicon strategy:
 *   Cold load  — index.html inline script sets a pre-rendered 1×1 PNG data URL
 *                synchronously before first paint. No JS defer delay, no SVG flash.
 *   Live swap  — this function repaints a 32×32 canvas on every theme change and
 *                swaps the <link rel="icon"> href. Browsers re-read it immediately.
 *
 * manifest.json theme_color is a static fallback for the PWA install prompt.
 * The live <meta name="theme-color"> (updated in changeTheme) is what browsers
 * actually use for the chrome tint at runtime — no manifest round-trip needed.
 */
function updateFavicon(themeName) {
  try {
    const color = themePhosphorColors[themeName];
    if (!color) return;

    // --- favicon ---
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
  } catch (e) {
    // Canvas blocked or unavailable — silently skip
  }
}

function changeTheme() {
  const body = document.body;
  const currentTheme =
    themes.find((theme) => body.classList.contains(`theme-${theme}`)) ||
    "ibm3279-green";
  const nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
  const nextTheme = themes[nextIndex];

  /*
    CRT blackout — real terminals didn't crossfade between phosphor colours.
    The screen went dark while the beam reset and the new content was written
    to the display buffer. Duration varies by hardware: a fast TTL terminal
    like the ADM-3A blanked for ~17ms (one frame), while the teletype-era
    VT05 took ~120ms to repaint its shift-register display.

    We use the *incoming* theme's timing because the new terminal determines
    how fast the new image appears — the old phosphor is already extinct.
  */
  const blackoutMs = themeBlackout[nextTheme] || 50;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // Skip blackout for reduced-motion users — instant swap
  if (reducedMotion) {
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

    updateFavicon(nextTheme);

    if (typeof showToast === "function") {
      showToast(themeNames[nextTheme] || nextTheme);
    }

    if (typeof updateLivePrompt === "function") {
      updateLivePrompt();
    }
    return;
  }

  body.style.transition = "none";
  body.style.opacity = "0";

  setTimeout(() => {
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

    body.style.opacity = "1";

    requestAnimationFrame(() => {
      body.style.transition = "";
    });

    updateFavicon(nextTheme);

    if (typeof showToast === "function") {
      showToast(themeNames[nextTheme] || nextTheme);
    }

    if (typeof updateLivePrompt === "function") {
      updateLivePrompt();
    }
  }, blackoutMs);
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

    if (shakeCount >= SHAKES_REQUIRED) {
      changeTheme();
      shakeCount = 0;
    } else {
      setTimeout(() => {
        if (shakeCount < SHAKES_REQUIRED) {
          shakeCount = 0;
        }
      }, SHAKE_WINDOW);
    }
  }

  lastAcceleration = { x, y, z };
}

// Keyboard theme switching
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "t") {
    changeTheme();
  }
});

// Shake detection for mobile
if (typeof DeviceMotionEvent !== "undefined") {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
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

// Apply saved theme on load.
// Wrapped in a readyState guard so document.body is guaranteed to exist
// regardless of where this script is placed in the document.
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
  // Already parsed (e.g. script is defer-loaded and DOM is ready)
  applyInitialTheme();
}
