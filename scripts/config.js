// =========================================
// THEME REGISTRY
// =========================================

/**
 * Ordered list of all available terminal themes.
 * The T key cycles through this array in order.
 * @type {string[]}
 */
export const themes = [
  "ibm3279-green", // IBM 3279, 1979 — P1 green phosphor, 80×24, mainframe TSO/CMS
  "teletype-blue-green", // DEC VT220, 1983 — P4 white (blue-green aged), 80×24, Unix/ANSI
  "pet2001-green", // Commodore PET 2001-N, 1979 — P1 green phosphor, 40×25
  "ibm3279-bitcoin-orange", // IBM 3279, 1979 — custom bitcoin orange, cypherpunk homage
  "wyse50-amber", // Wyse WY-50, 1985 — P134 amber phosphor, 80×24, Wall Street
  "zenith-green", // Zenith Z-19, 1979 — P1 green phosphor, 80×24, CP/M and Unix
  "adm3a-green", // Lear Siegler ADM-3A, 1976 — P1 green (warm), the terminal vi was written on
  "kaypro-green", // Kaypro II, 1982 — Toshiba P31 green phosphor, 80×24, CP/M 2.2
  "vt05-white", // DEC VT05, 1970 — P4 white phosphor, 72×20, teletype-era DEC
  "vt100-amber", // DEC VT100, 1978 — P3 amber phosphor, 80×24, the canonical terminal
  "apple2-green", // Apple II, 1977 — P31 green phosphor (Sanyo monitor), 40×24
  "commodore64", // Commodore 64, 1982 — VIC-II NTSC composite, 40×25
];

/**
 * Human-readable display name for each theme, shown in the toast on switch.
 * @type {Record<string, string>}
 */
export const themeNames = {
  "ibm3279-green": "IBM 3279 — P1 green phosphor",
  "teletype-blue-green": "DEC VT220 — P4 blue-green",
  "pet2001-green": "Commodore PET 2001-N — P1 green",
  "ibm3279-bitcoin-orange": "IBM 3279 — bitcoin orange",
  "wyse50-amber": "Wyse WY-50 — P134 amber (Wall Street)",
  "zenith-green": "Zenith Z-19 — P1 green phosphor",
  "adm3a-green": "ADM-3A — P1 green phosphor (the vi terminal)",
  "kaypro-green": "Kaypro II — P31 green phosphor",
  "vt05-white": "DEC VT05 — P4 white phosphor",
  "vt100-amber": "DEC VT100 — P3 amber phosphor",
  "apple2-green": "Apple II — P31 green phosphor",
  commodore64: "Commodore 64 — VIC-II NTSC",
};

// =========================================
// PER-TERMINAL HARDWARE SPECS
// =========================================

/*
  Per-terminal baud rates — sourced from real hardware specs.
  Each character on a serial terminal takes exactly 10 bit-times at the
  configured baud rate (1 start + 7/8 data + 1/2 stop bits; 8N1 = 10 bits).
  ms per character = 10000 / baud.

  IBM 3279:       9600 baud — simulated; 3279 was synchronous block-mode (no serial baud)
  DEC VT220:      9600 baud — factory default; user-configurable up to 19200
  PET 2001:       1200 baud — IEEE-488 parallel, not serial; simulated for effect
  Bitcoin orange: 9600 baud — simulated; same IBM 3279 chassis
  Wyse WY-50:     9600 baud — RS-232 default, common Wall Street config
  Zenith Z-19:    9600 baud — RS-232, common Unix config
  ADM-3A:         9600 baud — RS-232, common Unix lab config
  Kaypro II:      9600 baud — serial port default
  DEC VT05:       110 baud  — teletype-speed ASR-33 compatibility; later models 300-1200
  DEC VT100:      9600 baud — factory default; famously slow at large redraws
  Apple II:       9600 baud — Super Serial Card default
  Commodore 64:   1200 baud — user-port modem, BASIC print loop timing
*/
/** @type {Record<string, number>} */
export const themeBaudRates = {
  "ibm3279-green": 9600,
  "teletype-blue-green": 9600,
  "pet2001-green": 1200,
  "ibm3279-bitcoin-orange": 9600,
  "wyse50-amber": 9600,
  "zenith-green": 9600,
  "adm3a-green": 9600,
  "kaypro-green": 9600,
  "vt05-white": 300,
  "vt100-amber": 9600,
  "apple2-green": 9600,
  commodore64: 1200,
};

/*
  Per-theme auto-advance pause — how long the cursor sits parked after a
  quote before the next one loads. Reflects the overall feel of each
  machine: a VT100 operator on a loaded VAX felt the system's latency
  everywhere; a C64 BASIC prompt held longer between outputs.

  These are editorial pacing decisions calibrated to the baud rate and
  character of each terminal, not sourced from a single hardware spec.
*/
/** @type {Record<string, number>} */
export const themePauseDurations = {
  "ibm3279-green": 2800,
  "teletype-blue-green": 2500,
  "pet2001-green": 3500,
  "ibm3279-bitcoin-orange": 2800,
  "wyse50-amber": 2500,
  "zenith-green": 2800,
  "adm3a-green": 2500,
  "kaypro-green": 2800,
  "vt05-white": 4500, // VT05 teletype era — deliberate pace, 300 baud feel
  "vt100-amber": 4200, // VT100: languid blink, languid feel
  "apple2-green": 2800,
  commodore64: 3800, // 1200 baud — BASIC output is leisurely
};

/*
  Each terminal had its own prompt character, sourced from hardware/OS:
    IBM 3279       — TSO/ISPF: '===>' (the ISPF command line prefix)
    DEC VT220      — Unix sh/bash: '$'
    Commodore PET  — BASIC ROM: '' (blank — cursor appeared after READY.)
    Bitcoin Orange — IBM 3279 chassis: '===>'
    Wyse WY-50     — Unix sh/ksh (Wall Street): '$'
    Zenith Z-19    — CP/M: 'A>' (default drive prompt)
    ADM-3A         — Unix csh (BSD): '%' (Bill Joy's shell at UC Berkeley)
    Kaypro II      — CP/M 2.2: 'A>' (default drive prompt)
    DEC VT05       — early Unix: '$'
    DEC VT100      — VAX/VMS DCL: '$' (not csh %)
    Apple II       — Applesoft BASIC: ']' (the iconic right-bracket)
    Commodore 64   — BASIC V2: '' (blank — cursor after READY.)
*/
/** @type {Record<string, string>} */
export const themePrompts = {
  "ibm3279-green": "===>",
  "teletype-blue-green": "$",
  "pet2001-green": "",
  "ibm3279-bitcoin-orange": "===>",
  "wyse50-amber": "$",
  "zenith-green": "A>",
  "adm3a-green": "%",
  "kaypro-green": "A>",
  "vt05-white": "$",
  "vt100-amber": "$",
  "apple2-green": "]",
  commodore64: "",
};

/*
  Per-terminal screen clear timing — sourced from hardware.
  The blackout duration matches the real time each terminal took to
  clear its screen buffer and begin displaying new content.

  IBM 3279:      ~50ms  — 3270 protocol host-driven screen clear, ~3 frames
  DEC VT220:     ~18ms  — fast firmware, 1 frame + P4 ~1ms decay
  PET 2001:      ~18ms  — 6502 1MHz writes 1000 bytes + 1 frame sync
  Bitcoin orange: ~50ms — same IBM 3279 chassis
  Wyse WY-50:    ~25ms  — 8031 firmware screen clear, 14" tube
  Zenith Z-19:   ~25ms  — Z80 firmware, ~1.5 frames
  ADM-3A:        ~17ms  — hardware clear, 1 frame
  Kaypro II:     ~25ms  — Z80 firmware screen clear
  VT05:          ~120ms — teletype-era shift register, character-by-character
  VT100:         ~33ms  — firmware erase sequence + 2 frames
  Apple II:      ~18ms  — HOME (CALL -936), 960 bytes + 1 frame
  Commodore 64:  ~17ms  — KERNAL CHROUT 1000 spaces + 1 frame
*/
/** @type {Record<string, number>} */
export const themeBlackout = {
  "ibm3279-green": 50,
  "teletype-blue-green": 18,
  "pet2001-green": 18,
  "ibm3279-bitcoin-orange": 50,
  "wyse50-amber": 25,
  "zenith-green": 25,
  "adm3a-green": 17,
  "kaypro-green": 25,
  "vt05-white": 120,
  "vt100-amber": 33,
  "apple2-green": 18,
  commodore64: 17,
};

/**
 * Phosphor colour for each theme — used to paint the favicon square.
 * Matches --primary-color values in styles.css exactly.
 * @type {Record<string, string>}
 */
export const themePhosphorColors = {
  "ibm3279-green": "#57FF8C",
  "teletype-blue-green": "#A4C8B0",
  "pet2001-green": "#00FF44",
  "ibm3279-bitcoin-orange": "#FF9500",
  "wyse50-amber": "#FFBE00",
  "zenith-green": "#7FFF7F",
  "adm3a-green": "#A8FF60",
  "kaypro-green": "#76FF76",
  "vt05-white": "#D6D6C6",
  "vt100-amber": "#FFB000",
  "apple2-green": "#24FF52",
  commodore64: "#7469C8",
};

/*
  Boot sequence messages per terminal, sourced from real firmware/ROM output.
  Typing speeds (ms/char) vary: slow for dramatic effect, fast for snappy lines.
*/
/**
 * @typedef {{ text: string, speed: number }} BootLine
 * @type {Record<string, BootLine[]>}
 */
export const themeBootLines = {
  "ibm3279-green": [
    { text: "IKJ56700A ENTER USERID -", speed: 22 },
    { text: "BLOCKQUOTES  TSO/ISPF v1.0", speed: 26 },
    { text: "LOADING QUOTE DATABASE.................. OK", speed: 30 },
  ],
  "ibm3279-bitcoin-orange": [
    { text: "IKJ56700A ENTER USERID -", speed: 22 },
    { text: "BLOCKQUOTES  TSO/ISPF v1.0", speed: 26 },
    { text: "LOADING QUOTE DATABASE.................. OK", speed: 30 },
  ],
  "teletype-blue-green": [
    { text: "VT220 OK", speed: 18 },
    { text: "blockquote.sh v1.0 — phosphor terminal ready", speed: 26 },
    { text: "loading quote database.................. ok", speed: 30 },
  ],
  "vt100-amber": [
    { text: "VT100 SELF TEST OK", speed: 20 },
    { text: "blockquote.sh v1.0 — phosphor terminal ready", speed: 26 },
    { text: "loading quote database.................. ok", speed: 30 },
  ],
  "vt05-white": [
    { text: "VT05", speed: 20 },
    { text: "BLOCKQUOTE.SH v1.0 — PHOSPHOR TERMINAL READY", speed: 28 },
    { text: "LOADING QUOTE DATABASE.................. OK", speed: 30 },
  ],
  "adm3a-green": [
    { text: "login: blockquotes", speed: 26 },
    { text: "Last login: Sat Mar 15 03:42 on tty0", speed: 22 },
    { text: "blockquote.sh v1.0 — phosphor terminal ready", speed: 26 },
    { text: "loading quote database.................. ok", speed: 30 },
  ],
  "zenith-green": [
    { text: "Z-19 TERMINAL  64K CP/M VERS. 2.2", speed: 22 },
    { text: "BLOCKQUOTES.COM v1.0 — PHOSPHOR TERMINAL READY", speed: 26 },
    { text: "LOADING QUOTE DATABASE.................. OK", speed: 30 },
  ],
  "kaypro-green": [
    { text: "KAYPRO II  64K CP/M VERS. 2.2", speed: 22 },
    { text: "BLOCKQUOTES.COM v1.0 — PHOSPHOR TERMINAL READY", speed: 26 },
    { text: "LOADING QUOTE DATABASE.................. OK", speed: 30 },
  ],
  "pet2001-green": [
    { text: "*** COMMODORE BASIC ***", speed: 20 },
    { text: " 31743 BYTES FREE", speed: 24 },
    { text: 'LOAD "BLOCKQUOTES",8', speed: 28 },
    { text: "SEARCHING FOR BLOCKQUOTES", speed: 22 },
    { text: "LOADING", speed: 18 },
    { text: "READY.", speed: 14 },
    { text: "RUN", speed: 14 },
  ],
  "apple2-green": [
    { text: "APPLE ][", speed: 20 },
    { text: "]BRUN BLOCKQUOTES", speed: 26 },
    { text: "BLOCKQUOTE.SH v1.0 — PHOSPHOR TERMINAL READY", speed: 28 },
    { text: "LOADING QUOTE DATABASE.................. OK", speed: 30 },
  ],
  commodore64: [
    { text: "    **** COMMODORE 64 BASIC V2 ****", speed: 18 },
    { text: " 64K RAM SYSTEM  38911 BASIC BYTES FREE", speed: 22 },
    { text: "READY.", speed: 14 },
    { text: 'LOAD "BLOCKQUOTES",8,1', speed: 26 },
    { text: "SEARCHING FOR BLOCKQUOTES", speed: 22 },
    { text: "LOADING", speed: 18 },
    { text: "READY.", speed: 14 },
    { text: "RUN", speed: 14 },
  ],
  "wyse50-amber": [
    { text: "WYSE 50  SELF TEST OK", speed: 20 },
    { text: "blockquote.sh v1.0 — phosphor terminal ready", speed: 26 },
    { text: "loading quote database.................. ok", speed: 30 },
  ],
};

/*
  HELP output style sourced from each OS/ROM:
    TSO/ISPF    — HELP command prints 'FUNCTION -' style headers, uppercase
    Unix sh     — 'usage:' lowercase, brief
    CP/M HELP   — uppercase, columnar
    BASIC ROM   — no HELP command; print a READY. prompt and list instead
    VAX/VMS     — HELP subsystem prints topic name then description
    Applesoft   — no HELP; we fake a catalog-style listing
*/
/** @type {Record<string, string>} */
export const themeHelpHeaders = {
  "ibm3279-green": "HELP - BLOCKQUOTES ISPF FUNCTION KEYS",
  "ibm3279-bitcoin-orange": "HELP - BLOCKQUOTES ISPF FUNCTION KEYS",
  "teletype-blue-green": "usage: blockquotes [key]",
  "wyse50-amber": "usage: blockquotes [key]",
  "vt05-white": "usage: blockquotes [key]",
  "adm3a-green": "usage: blockquotes [key]",
  "zenith-green": "BLOCKQUOTES HELP",
  "kaypro-green": "BLOCKQUOTES HELP",
  "vt100-amber": "HELP BLOCKQUOTES",
  "pet2001-green": "READY.",
  commodore64: "READY.",
  "apple2-green": "]CATALOG - BLOCKQUOTE.SH",
};

// =========================================
// TIMING CONSTANTS
// =========================================

/** How many recent quotes to track to avoid immediate repeats */
export const HISTORY_SIZE = 20;

/** Quote data cache lifetime in ms (24 hours) */
export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Debounce guard on user actions (click, keyboard, swipe) */
export const DEBOUNCE_MS = 100;

/** How long an aria-live announcement region persists before removal */
export const ANNOUNCE_REMOVE_MS = 1000;

/** Delay before preloading the next quote after displaying the current one */
export const PRELOAD_DELAY_MS = 100;

/**
 * Maximum ms-per-character delay, regardless of baud rate.
 * Ensures 300-baud PET output stays readable rather than painfully slow.
 */
export const MAX_BAUD_DELAY_MS = 300;

/** Pause after sentence-ending punctuation (.!?) during quote typing */
export const SENTENCE_PAUSE_MS = 180;

/** Pause after clause punctuation (,;:) during quote typing */
export const CLAUSE_PAUSE_MS = 60;

/** Pause after sentence-ending punctuation during author/boot line typing */
export const AUTHOR_SENTENCE_PAUSE_MS = 120;

/** Pause after clause punctuation during author/boot line typing */
export const AUTHOR_CLAUSE_PAUSE_MS = 40;

/** How long a touch must be held to trigger the long-press share action */
export const LONG_PRESS_MS = 800;

/** Minimum pixel distance for a swipe gesture to register */
export const SWIPE_MIN_PX = 50;

/** Minimum accumulated scroll delta before the wheel triggers navigation */
export const WHEEL_THRESHOLD = 50;

/** Minimum ms between wheel-triggered quote changes */
export const WHEEL_COOLDOWN_MS = 400;

/** Debounce window for accumulating wheel delta before acting */
export const WHEEL_DEBOUNCE_MS = 100;

/** How long the toast status line remains visible */
export const TOAST_DURATION_MS = 2200;

/** Typing speed for the first (header) line of the help screen */
export const HELP_HEADER_TYPE_SPEED_MS = 40;

/** Typing speed for subsequent help lines */
export const HELP_LINE_TYPE_SPEED_MS = 22;

/** Pause after the header line before the first shortcut line types */
export const HELP_HEADER_PAUSE_MS = 300;

/** Pause between subsequent help lines */
export const HELP_LINE_PAUSE_MS = 80;

/** Pause between boot lines during the startup sequence */
export const BOOT_LINE_PAUSE_MS = 200;

/** Final pause after the last boot line before the quote cycle starts */
export const BOOT_FINAL_PAUSE_MS = 120;

/** Delay before preloading starts when a quote is loaded directly via URL */
export const URL_PRELOAD_DELAY_MS = 1000;

/** Delay before revoking an object URL after triggering a bookmark export download */
export const EXPORT_REVOKE_MS = 100;

/** How long the bookmark counter takes to fade out before being removed from DOM */
export const BOOKMARK_HIDE_MS = 300;

// =========================================
// SHAKE DETECTION CONSTANTS (mobile)
// =========================================

/** Acceleration delta (m/s²) required to register a single shake */
export const SHAKE_THRESHOLD = 15;

/** Minimum ms between shake detections to prevent rattling */
export const SHAKE_COOLDOWN_MS = 1000;

/** Number of shakes required within SHAKE_WINDOW_MS to trigger a theme change */
export const SHAKES_REQUIRED = 2;

/** Time window (ms) in which SHAKES_REQUIRED shakes must occur */
export const SHAKE_WINDOW_MS = 2000;