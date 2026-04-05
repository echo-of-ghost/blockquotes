import {
  themes,
  themeBootLines,
  themeHelpHeaders,
  themeBaudRates,
  themePauseDurations,
  themePrompts,
  CACHE_EXPIRY_MS,
  DEBOUNCE_MS,
  HISTORY_SIZE,
  ANNOUNCE_REMOVE_MS,
  PRELOAD_DELAY_MS,
  MAX_BAUD_DELAY_MS,
  SENTENCE_PAUSE_MS,
  CLAUSE_PAUSE_MS,
  AUTHOR_SENTENCE_PAUSE_MS,
  AUTHOR_CLAUSE_PAUSE_MS,
  BOOT_LINE_PAUSE_MS,
  BOOT_FINAL_PAUSE_MS,
  HELP_HEADER_TYPE_SPEED_MS,
  HELP_LINE_TYPE_SPEED_MS,
  HELP_HEADER_PAUSE_MS,
  HELP_LINE_PAUSE_MS,
  TOAST_DURATION_MS,
  BOOKMARK_HIDE_MS,
  LONG_PRESS_MS,
  SWIPE_MIN_PX,
  WHEEL_THRESHOLD,
  WHEEL_COOLDOWN_MS,
  WHEEL_DEBOUNCE_MS,
  EXPORT_REVOKE_MS,
  URL_PRELOAD_DELAY_MS,
} from "./config.js";

// =========================================
// RUNTIME CONFIG
// =========================================

/**
 * Runtime config derived from browser state at startup.
 * Not theme data — these reflect user/device context.
 */
const config = {
  /** True when the user has requested reduced motion; skips animations. */
  performanceMode: window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches,
};

// =========================================
// STATE
// =========================================

/**
 * Central application state. All mutable runtime values live here so that
 * any module can observe and update them through a single reference.
 *
 * Timer IDs are stored in state (rather than module-level variables) so they
 * can be enumerated and cleared centrally — see PerformanceUtils.cancelAllTimers.
 */
const state = {
  /** Loaded quote array, null until first fetch completes */
  quotes: null,
  /** Whether typing is currently paused */
  isPaused: false,
  /** setTimeout ID for the current typing tick */
  timeoutId: null,
  /** setTimeout ID for the between-quotes park pause — cleared separately from timeoutId */
  parkTimeoutId: null,
  /** setTimeout ID for the toast hide timer (managed by showToast) */
  statusTimer: null,
  /** setTimeout ID for the debounced wheel handler */
  wheelTimeout: null,
  /** setTimeout ID for the long-press gesture */
  longPressTimer: null,
  /** Quote currently on screen */
  currentQuote: null,
  /** Character position within the current typing pass */
  currentIndex: 0,
  /** True while any phase of the typing animation is running */
  isTyping: false,
  /** Debounce flag — blocks re-entrant user actions for DEBOUNCE_MS */
  isProcessing: false,
  /** Whether text-transform: uppercase is active */
  isUppercase: false,
  /** Next quote, pre-fetched in the background for instant display */
  preloadedQuote: null,
  /** Pre-rendered author HTML for the preloaded quote */
  preloadedAuthorHTML: null,
  /** Pre-rendered source HTML for the preloaded quote, or null */
  preloadedSourceHTML: null,
  /** requestAnimationFrame handle from optimizedDelay */
  animationFrameId: null,
  /** Bookmarked quotes, hydrated from localStorage on load */
  bookmarkedQuotes: JSON.parse(
    localStorage.getItem("bookmarked-quotes") || "[]",
  ),
  /** Index into bookmarkedQuotes for the V-key cycling view */
  currentBookmarkIndex: 0,
  /** History of recently shown quotes for P-key back-navigation */
  quoteHistory: [],
  /** Current position within quoteHistory (-1 = at latest) */
  historyPosition: -1,
  /** True during the boot sequence — blocks all user input */
  booting: true,
  /** True while the help screen is displayed — any key/click exits */
  helpMode: false,
  /** True when vim-style / search mode is active */
  searchMode: false,
  /** Current search query string */
  searchQuery: "",
  /** True when clock display mode is active */
  clockMode: false,
  /** setInterval ID for the clock tick */
  clockIntervalId: null,
  /** True when the bookmark list view is active */
  bookmarkListMode: false,
  /** Currently highlighted bookmark index in list view */
  bookmarkListIndex: 0,
  /** True when an easter egg quote list view (C64 / Apple II) is active */
  quoteListMode: false,
  /** Style of the active quote list: 'c64' | 'appleii' */
  quoteListStyle: null,
  /** Currently highlighted quote index in the easter egg list view */
  quoteListIndex: 0,
  /** Index of the first visible row in the easter egg list viewport */
  quoteListOffset: 0,
  /** Accumulated wheel delta between debounce ticks */
  wheelDelta: 0,
  /** Timestamp of the last wheel-triggered navigation */
  lastWheelTime: 0,
  /** Touch X coordinate at touchstart */
  touchStartX: 0,
  /** Touch Y coordinate at touchstart */
  touchStartY: 0,
  /** Timestamp of touchstart */
  touchStartTime: 0,
};

// =========================================
// DOM ELEMENTS
// =========================================

/** Cached references to the two DOM nodes the app writes to. */
const elements = {
  quoteContainer: document.getElementById("quote-container"),
  errorMessage: document.getElementById("error-message"),
};

// =========================================
// DEVICE DETECTION
// =========================================

/**
 * True when running on a touch-primary device.
 * Used to decide between mobile Lightning/Bitcoin URI handling vs desktop clipboard copy.
 */
const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  ) ||
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0;

// =========================================
// DEBOUNCE HELPER
// =========================================

/**
 * Wraps an action with a debounce guard via state.isProcessing.
 * Prevents rapid repeated calls from double-firing (click, keyboard, swipe).
 * The guard is held for DEBOUNCE_MS after fn returns.
 *
 * @param {() => void} fn - The action to guard.
 */
function withProcessing(fn) {
  if (state.isProcessing) return;
  state.isProcessing = true;
  try {
    fn();
  } finally {
    setTimeout(() => {
      state.isProcessing = false;
    }, DEBOUNCE_MS);
  }
}

// =========================================
// THEME ACCESSORS
// (read body classes at call time — not frozen at import)
// =========================================

/**
 * Returns the baud rate (bits/sec) for the currently active theme.
 * Defaults to 9600 if no theme class is found.
 *
 * @returns {number} Baud rate in bits per second.
 */
function getThemeBaudRate() {
  for (const theme of Object.keys(themeBaudRates)) {
    if (document.body.classList.contains(`theme-${theme}`)) {
      return themeBaudRates[theme];
    }
  }
  return 9600;
}

/**
 * Returns the auto-advance pause duration (ms) for the currently active theme.
 * Defaults to 3000ms if no theme class is found.
 *
 * @returns {number} Pause duration in milliseconds.
 */
function getThemePauseDuration() {
  for (const theme of Object.keys(themePauseDurations)) {
    if (document.body.classList.contains(`theme-${theme}`)) {
      return themePauseDurations[theme];
    }
  }
  return 3000;
}

/**
 * Returns the prompt string for the currently active theme (e.g. "===>", "$", "]").
 * Returns ">" as a safe fallback if no theme class is found.
 *
 * @returns {string} The prompt prefix character(s).
 */
function getThemePrompt() {
  for (const theme of Object.keys(themePrompts)) {
    if (document.body.classList.contains(`theme-${theme}`)) {
      return themePrompts[theme];
    }
  }
  return ">";
}

// =========================================
// QUOTE VALIDATION & LOADING
// =========================================

/**
 * Returns true if a quote object has the minimum required fields.
 *
 * @param {unknown} quote - Candidate object to validate.
 * @returns {boolean} True when quote has non-empty text and author strings.
 */
function isValidQuote(quote) {
  return (
    quote != null &&
    typeof quote === "object" &&
    typeof quote.text === "string" &&
    quote.text.trim().length > 0 &&
    typeof quote.author === "string" &&
    quote.author.trim().length > 0
  );
}

/**
 * Loads quotes from the JSON file, using a 24-hour localStorage cache.
 * On failure, displays an error message in the DOM and returns an empty array.
 *
 * @returns {Promise<object[]>} Resolves to the array of quote objects.
 */
async function loadQuotes() {
  const cachedData = localStorage.getItem("bitcoin-quotes");
  const cachedTimestamp = localStorage.getItem("bitcoin-quotes-timestamp");

  if (
    cachedData &&
    cachedTimestamp &&
    Date.now() - Number(cachedTimestamp) < CACHE_EXPIRY_MS
  ) {
    state.quotes = JSON.parse(cachedData);
    return state.quotes;
  }

  try {
    const response = await fetch("data/bitcoin_quotes.json");
    if (!response.ok) throw new Error("Failed to fetch JSON");

    state.quotes = await response.json();

    if (!Array.isArray(state.quotes) || !state.quotes.every(isValidQuote)) {
      throw new Error("Invalid JSON format");
    }

    localStorage.setItem("bitcoin-quotes", JSON.stringify(state.quotes));
    localStorage.setItem("bitcoin-quotes-timestamp", Date.now().toString());

    return state.quotes;
  } catch (error) {
    console.error("Error loading quotes:", error);
    elements.errorMessage.textContent = "*** ERROR: HOUSTON WE HAVE A PROBLEM";
    elements.errorMessage.classList.add("error-active");
    return [];
  }
}

// =========================================
// QUOTE HISTORY & DEDUPLICATION
// =========================================

/**
 * Adds a quote to the navigation history.
 * If the user navigated back and then triggers a new quote, forward history
 * is truncated first (mirrors browser back/forward behaviour).
 *
 * @param {{ text: string, author: string }} quote - The quote to record.
 */
function pushToHistory(quote) {
  if (
    state.historyPosition >= 0 &&
    state.historyPosition < state.quoteHistory.length - 1
  ) {
    state.quoteHistory = state.quoteHistory.slice(0, state.historyPosition + 1);
  }
  state.quoteHistory.push(quote);
  if (state.quoteHistory.length > HISTORY_SIZE * 2) {
    state.quoteHistory = state.quoteHistory.slice(-(HISTORY_SIZE * 2));
  }
  state.historyPosition = state.quoteHistory.length - 1;
}

/**
 * Steps back one position in the quote history.
 *
 * @returns {{ text: string, author: string } | null} The previous quote, or null if at the start.
 */
function goBackInHistory() {
  if (state.historyPosition <= 0) return null;
  state.historyPosition--;
  return state.quoteHistory[state.historyPosition];
}

/**
 * Picks a random quote, preferring ones not recently shown.
 * Falls back to the full list if all quotes have been shown recently.
 *
 * @param {object[]} quotes - The full quote array.
 * @returns {object | null} A randomly selected quote object, or null if the array is empty.
 */
function getRandomQuote(quotes) {
  if (!quotes?.length) return null;

  const recentKeys = new Set(
    state.quoteHistory.slice(-HISTORY_SIZE).map((q) => q.text),
  );

  const pool = quotes.filter((q) => !recentKeys.has(q.text));
  const source = pool.length > 0 ? pool : quotes;
  return source[Math.floor(Math.random() * source.length)];
}

// =========================================
// QUOTE UTILITIES
// =========================================

export const QuoteUtils = {
  /**
   * Wraps a quote's text in typographic quotation marks.
   *
   * @param {{ text?: string }} quote
   * @returns {string} The quoted text, or a fallback string.
   */
  getQuoteText: (quote) => `"${quote?.text?.trim() || "No quote available"}"`,

  /**
   * Formats a quote for sharing on Twitter/X.
   * Strips markdown link syntax so only the visible label is included.
   *
   * @param {{ text: string, author: string, source?: string }} quote
   * @returns {string} Plain-text tweet string.
   */
  getTweetText: (quote) => {
    const author = quote.author.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1").trim();
    const source = quote.source
      ? ", " + quote.source.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1").trim()
      : "";
    return `"${quote.text}" — ${author}${source}`;
  },

  /**
   * Creates a temporary aria-live region to announce an action to screen readers,
   * then removes it after ANNOUNCE_REMOVE_MS.
   *
   * @param {string} message - The announcement text.
   */
  announceAction: (message) => {
    const liveRegion = document.createElement("div");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("class", "sr-only");
    liveRegion.textContent = message;
    document.body.appendChild(liveRegion);
    setTimeout(() => liveRegion.remove(), ANNOUNCE_REMOVE_MS);
  },

  /**
   * Returns the per-character delay (ms) at the active theme's baud rate.
   * Uses 8N1 serial framing: 10 bits per character → ms = 10000 / baud.
   * Clamped to MAX_BAUD_DELAY_MS so even 300-baud PET output stays readable.
   * Returns 0 in reduced-motion / performance mode.
   *
   * @returns {number} Milliseconds per character.
   */
  getMsPerChar: () => {
    if (config.performanceMode) return 0;
    return Math.min(MAX_BAUD_DELAY_MS, Math.max(1, Math.round(10000 / getThemeBaudRate())));
  },

  /**
   * Updates the bookmark counter badge in the top-left corner.
   * Creates the element if it doesn't exist; removes it when count reaches 0.
   */
  updateBookmarkCounter: () => {
    let counter = document.querySelector(".bookmark-counter");
    const bookmarkCount = state.bookmarkedQuotes.length;

    if (bookmarkCount === 0) {
      if (counter) {
        counter.classList.add("hidden");
        setTimeout(() => counter.remove(), BOOKMARK_HIDE_MS);
      }
      return;
    }

    if (!counter) {
      counter = document.createElement("div");
      counter.className = "bookmark-counter";
      const cornerUI = document.querySelector(".corner-ui");
      (cornerUI || document.body).appendChild(counter);
    }

    // Show count with heart indicator if the current quote is bookmarked
    const isCurrentBookmarked =
      state.currentQuote && isQuoteBookmarked(state.currentQuote);
    counter.innerHTML = isCurrentBookmarked
      ? `<span class="count">${bookmarkCount}</span><span class="heart">*</span>`
      : `<span class="count">${bookmarkCount}</span>`;
    counter.classList.remove("hidden");
  },
};

// =========================================
// PERFORMANCE UTILITIES
// =========================================

export const PerformanceUtils = {
  /**
   * Pre-fetches and pre-renders the next random quote in the background so
   * that navigating to it feels instant.
   */
  preloadNextQuote: async () => {
    if (state.preloadedQuote) return;

    const quotes = await loadQuotes();
    if (!quotes.length) return;

    const randomQuote = getRandomQuote(quotes);
    if (!randomQuote) return;

    state.preloadedQuote = randomQuote;
    state.preloadedAuthorHTML = PerformanceUtils.formatAuthor(
      randomQuote.author,
    );
    state.preloadedSourceHTML = randomQuote.source
      ? PerformanceUtils.formatSource(randomQuote.source)
      : null;
  },

  /**
   * Returns the next quote to display, using the preloaded one if available.
   * Triggers a background preload for the quote after that.
   *
   * @returns {Promise<{ quote: object, authorHTML: string, sourceHTML: string | null } | null>}
   */
  getNextQuote: async () => {
    if (state.preloadedQuote) {
      const quote = state.preloadedQuote;
      const authorHTML = state.preloadedAuthorHTML;
      const sourceHTML = state.preloadedSourceHTML ?? null;

      state.preloadedQuote = null;
      state.preloadedAuthorHTML = null;
      state.preloadedSourceHTML = null;

      setTimeout(() => PerformanceUtils.preloadNextQuote(), PRELOAD_DELAY_MS);
      return { quote, authorHTML, sourceHTML };
    }

    const quotes = await loadQuotes();
    if (!quotes.length) return null;

    const randomQuote = getRandomQuote(quotes);
    if (!randomQuote) return null;

    const authorHTML = PerformanceUtils.formatAuthor(randomQuote.author);
    const sourceHTML = randomQuote.source
      ? PerformanceUtils.formatSource(randomQuote.source)
      : null;

    setTimeout(() => PerformanceUtils.preloadNextQuote(), PRELOAD_DELAY_MS);
    return { quote: randomQuote, authorHTML, sourceHTML };
  },

  /**
   * Renders a text string as an HTML span, converting markdown links to <a> tags.
   * When linkHandles is true, also converts @username to x.com profile links.
   *
   * @param {string} text - Raw text that may contain [label](url) markdown.
   * @param {boolean} [linkHandles=false] - Whether to linkify @handles.
   * @returns {string} Inner HTML string with links rendered.
   */
  _formatLinkedText: (text, linkHandles = false) => {
    const span = document.createElement("span");
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      span.appendChild(
        document.createTextNode(text.slice(lastIndex, match.index)),
      );
      const a = document.createElement("a");
      a.href = match[2];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = match[1];
      a.setAttribute("aria-label", `Visit ${match[1]}`);
      span.appendChild(a);
      lastIndex = linkRegex.lastIndex;
    }
    span.appendChild(document.createTextNode(text.slice(lastIndex)));

    if (!linkHandles) return span.innerHTML;

    return span.innerHTML.replace(
      /@(\w+)/g,
      '<a href="https://x.com/$1" target="_blank" rel="noopener noreferrer" aria-label="Visit $1\'s Twitter profile">@$1</a>',
    );
  },

  /**
   * Formats the source field as HTML, converting any markdown links to <a> tags.
   *
   * @param {string | null | undefined} source - Raw source string.
   * @returns {string | null} HTML string, or null if source is falsy.
   */
  formatSource: (source) => {
    if (!source) return null;
    return PerformanceUtils._formatLinkedText(String(source).trim());
  },

  /**
   * Formats the author field as HTML.
   * Strips surrounding quotes, converts markdown links, and linkifies @handles.
   *
   * @param {string} author - Raw author string.
   * @returns {string} HTML string ready for innerHTML.
   */
  formatAuthor: (author) => {
    const cleanAuthor = String(author).replace(/^"|"$/g, "").trim();
    return PerformanceUtils._formatLinkedText(cleanAuthor, true);
  },

  /**
   * Schedules a callback using requestAnimationFrame for sub-16ms delays
   * or setTimeout for longer ones. Falls back to setTimeout(0) in performance mode.
   *
   * @param {FrameRequestCallback | (() => void)} callback
   * @param {number} delay - Desired delay in milliseconds.
   * @returns {number} The timer or rAF handle.
   */
  optimizedDelay: (callback, delay) => {
    if (config.performanceMode) {
      return setTimeout(callback, 0);
    }
    if (delay < 16) {
      state.animationFrameId = requestAnimationFrame(callback);
      return state.animationFrameId;
    }
    return setTimeout(callback, delay);
  },

  /**
   * Cancels all active timers and animation frames related to the typing engine
   * and quote navigation. Also begins fading out any active burn-in ghost.
   * Call this before starting any new display operation.
   *
   * Note: state.statusTimer (toast) and state.longPressTimer (touch) manage
   * their own lifecycle and are intentionally not cleared here.
   */
  cancelAllTimers: () => {
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }
    if (state.parkTimeoutId) {
      clearTimeout(state.parkTimeoutId);
      state.parkTimeoutId = null;
    }
    if (state.wheelTimeout) {
      clearTimeout(state.wheelTimeout);
      state.wheelTimeout = null;
    }
    if (state.clockIntervalId) {
      clearInterval(state.clockIntervalId);
      state.clockIntervalId = null;
      state.clockMode = false;
    }
  },

  /**
   * Scrolls the quote container to keep newly typed text visible.
   * Snaps to whole-line boundaries to mimic how real terminals scrolled —
   * the screen buffer shifted up by exactly one character row, not by pixels.
   */
  handleAutoScroll: () => {
    const container = elements.quoteContainer;
    const maxVisible = container.clientHeight;
    const contentHeight = container.scrollHeight;

    if (contentHeight > maxVisible) {
      const lineHeight = parseFloat(getComputedStyle(container).lineHeight);
      const targetScroll = contentHeight - maxVisible;
      const lineSnapped = Math.ceil(targetScroll / lineHeight) * lineHeight;
      container.scrollTop = lineSnapped;
    }
  },
};

// =========================================
// BOOKMARK CHECK
// =========================================

/**
 * Returns true if the given quote is in the user's saved bookmarks.
 *
 * @param {{ text: string, author: string }} quote
 * @returns {boolean}
 */
function isQuoteBookmarked(quote) {
  return state.bookmarkedQuotes.some(
    (b) => b.text === quote.text && b.author === quote.author,
  );
}

// =========================================
// TOAST (STATUS LINE)
// =========================================

/**
 * Displays a short message on the status line at the bottom of the screen.
 * Prepends the current theme's prompt character. Auto-hides after TOAST_DURATION_MS.
 * Resets the hide timer if called while a toast is already visible.
 *
 * @param {string} message - The message to display.
 */
export function showToast(message) {
  if (state.statusTimer) {
    clearTimeout(state.statusTimer);
    state.statusTimer = null;
  }

  let el = document.querySelector(".bq-status");
  if (!el) {
    el = document.createElement("div");
    el.className = "bq-status";
    document.body.appendChild(el);
  }

  const prompt = getThemePrompt() || ">";
  el.textContent = `${prompt} ${message}`;
  el.classList.remove("hidden");

  state.statusTimer = setTimeout(() => {
    el.classList.add("hidden");
    state.statusTimer = null;
  }, TOAST_DURATION_MS);
}

// =========================================
// TEXT CASE TOGGLE
// =========================================

/**
 * Toggles the quote text between uppercase and normal case.
 * Applies text-transform directly to the container and the author element.
 */
function toggleTextCase() {
  state.isUppercase = !state.isUppercase;
  const textTransform = state.isUppercase ? "uppercase" : "none";
  elements.quoteContainer.style.textTransform = textTransform;
  const authorElement = elements.quoteContainer.querySelector(".author");
  if (authorElement) {
    authorElement.style.textTransform = textTransform;
  }
  // Sync corner-ui caps badge
  const capsEl = document.querySelector(".caps-indicator");
  if (capsEl) capsEl.classList.toggle("hidden", !state.isUppercase);
  QuoteUtils.announceAction(
    `Text case set to ${state.isUppercase ? "uppercase" : "lowercase"}`,
  );
}

// =========================================
// LIVE PROMPT UPDATE
// =========================================

/**
 * Patches the prompt text node in the parked author line after a theme change,
 * without re-rendering the entire quote. Only runs if a quote is currently parked.
 *
 * The author element structure is:
 *   [textNode: "{prompt} "] [span.author-name] [span.source?] [span.cursor-block]
 * or when the theme has no prompt:
 *   [span.author-name] [span.source?] [span.cursor-block]
 */
export function updateLivePrompt() {
  const author = elements.quoteContainer.querySelector(".author");
  if (!author) return;

  const newPrompt = getThemePrompt();
  const firstNode = author.firstChild;
  const isLeadingTextNode = firstNode && firstNode.nodeType === Node.TEXT_NODE;

  if (isLeadingTextNode) {
    firstNode.textContent = newPrompt ? `${newPrompt} ` : "";
    if (!newPrompt) author.removeChild(firstNode);
  } else if (newPrompt) {
    const authorName = author.querySelector(".author-name");
    author.insertBefore(document.createTextNode(`${newPrompt} `), authorName);
  }
}

// =========================================
// QUOTE DISPLAY ENGINE
// =========================================

/**
 * Clears the quote container and starts displaying a quote.
 * Real terminals didn't crossfade — the beam stopped writing old content and
 * started writing new content. The character-by-character typing IS the transition.
 *
 * @param {{ text: string, author: string, source?: string }} quote
 * @param {number} [startIndex=0] - Character position to start typing from.
 * @param {boolean} [finishImmediately=false] - Skip animation and render fully.
 * @param {string | null} [preformattedAuthor=null] - Pre-rendered author HTML.
 * @param {boolean} [skipHistory=false] - Don't add to navigation history.
 * @param {string | null} [preformattedSource=null] - Pre-rendered source HTML.
 */
function displayQuoteWithTransition(
  quote,
  startIndex = 0,
  finishImmediately = false,
  preformattedAuthor = null,
  skipHistory = false,
  preformattedSource = null,
) {
  PerformanceUtils.cancelAllTimers();
  hidePositionIndicator();

  elements.quoteContainer.innerHTML = "";

  displayQuote(
    quote,
    startIndex,
    finishImmediately,
    preformattedAuthor,
    skipHistory,
    preformattedSource,
  );
}

/**
 * Core typing engine. Renders a quote in three phases:
 *   Phase 1 — Types the quote body character by character.
 *   Phase 2 — Types the author line (plain text), with live prompt.
 *   Phase 3 — Swaps plain author for linked HTML, parks cursor, schedules auto-advance.
 *
 * @param {{ text: string, author: string, source?: string }} quote
 * @param {number} [startIndex=0]
 * @param {boolean} [finishImmediately=false]
 * @param {string | null} [preformattedAuthor=null]
 * @param {boolean} [skipHistory=false]
 * @param {string | null} [preformattedSource=null]
 */
function displayQuote(
  quote,
  startIndex = 0,
  finishImmediately = false,
  preformattedAuthor = null,
  skipHistory = false,
  preformattedSource = null,
) {
  if (!isValidQuote(quote)) {
    console.warn("Tried to display invalid quote:", quote);
    setRandomQuote();
    return;
  }

  state.currentQuote = quote;
  if (!skipHistory) pushToHistory(quote);

  // Update position indicator immediately so it reflects the new quote
  // from the first character, not only when typing finishes.
  updatePositionIndicator();

  const quoteText = QuoteUtils.getQuoteText(quote);
  state.currentIndex = startIndex;
  state.isTyping = true;

  if (isQuoteBookmarked(quote)) {
    elements.quoteContainer.classList.add("bookmarked");
  } else {
    elements.quoteContainer.classList.remove("bookmarked");
  }

  QuoteUtils.updateBookmarkCounter();

  const authorHTML =
    preformattedAuthor || PerformanceUtils.formatAuthor(quote.author);
  const sourceHTML =
    preformattedSource !== null
      ? preformattedSource
      : quote.source
        ? PerformanceUtils.formatSource(quote.source)
        : null;

  // Plain text for character-by-character author typing.
  // Strip markdown links [text](url) → text and surrounding quotes.
  const authorPlain = String(quote.author)
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/^"|"$/g, "")
    .trim();

  // Plain text for source typing — strip markdown links.
  const sourcePlain = quote.source
    ? String(quote.source)
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
        .trim()
    : null;

  // NOTE: prompt is intentionally NOT frozen here.
  // Re-reading getThemePrompt() on each tick means a mid-type theme change
  // is reflected on the very next character rather than waiting for renderParked().
  function getAuthorTypingText() {
    const livePrompt = getThemePrompt();
    const sourceStr = sourcePlain ? ` — ${sourcePlain}` : "";
    return livePrompt
      ? `${livePrompt} ${authorPlain}${sourceStr}`
      : `${authorPlain}${sourceStr}`;
  }

  /** Renders the fully-linked, parked state with blinking cursor. */
  function renderParked() {
    try {
      const prompt = getThemePrompt();
      const sourcePart = sourceHTML
        ? `<span class="source"> — <span class="source-text">${sourceHTML}</span></span>`
        : "";
      elements.quoteContainer.innerHTML =
        `<span class="text-selected">${quoteText}</span>` +
        `<span class="author">${prompt ? prompt + " " : ""}<span class="author-name">${authorHTML}</span>${sourcePart} ` +
        `<span class="cursor-block" aria-hidden="true"></span></span>`;
      elements.quoteContainer.style.textTransform = state.isUppercase
        ? "uppercase"
        : "none";
      const authorEl = elements.quoteContainer.querySelector(".author");
      if (authorEl) {
        authorEl.style.textTransform = state.isUppercase ? "uppercase" : "none";
      }
      updatePositionIndicator();
    } catch (e) {
      console.error("Error rendering quote:", e, { quoteText, quote });
      elements.quoteContainer.textContent = "Error displaying quote";
      elements.errorMessage.classList.add("error-active");
    }
  }

  function typeQuote() {
    const msPerChar = QuoteUtils.getMsPerChar();
    const finishNow = finishImmediately || msPerChar === 0 || state.isPaused;

    if (finishNow) {
      renderParked();
      state.currentIndex = quoteText.length;
      state.isTyping = false;
      state.isPaused = true;
      return;
    }

    // Phase 1 — type the quote body
    if (state.currentIndex < quoteText.length) {
      if (state.currentIndex === 0) {
        elements.quoteContainer.innerHTML =
          '<span class="cursor-block" aria-hidden="true"></span>';
      }

      const typedText = quoteText.slice(0, state.currentIndex + 1);
      elements.quoteContainer.innerHTML =
        `<span class="text-selected">${typedText}</span>` +
        `<span class="cursor-block" aria-hidden="true"></span>`;

      PerformanceUtils.handleAutoScroll();
      state.currentIndex++;

      const justTyped = quoteText[state.currentIndex - 1];
      const punctuationDelay = /[.!?]/.test(justTyped)
        ? SENTENCE_PAUSE_MS
        : /[,;:]/.test(justTyped)
          ? CLAUSE_PAUSE_MS
          : 0;
      state.timeoutId = PerformanceUtils.optimizedDelay(
        typeQuote,
        msPerChar + punctuationDelay,
      );

      // Phase 2 — type the author line
    } else if (
      state.currentIndex <
      quoteText.length + getAuthorTypingText().length
    ) {
      const authorIndex = state.currentIndex - quoteText.length;
      const authorTypingText = getAuthorTypingText();
      const typedAuthor = authorTypingText.slice(0, authorIndex + 1);

      elements.quoteContainer.innerHTML =
        `<span class="text-selected">${quoteText}</span>` +
        `<span class="author">${typedAuthor}<span class="cursor-block" aria-hidden="true"></span></span>`;

      elements.quoteContainer.style.textTransform = state.isUppercase
        ? "uppercase"
        : "none";
      PerformanceUtils.handleAutoScroll();
      state.currentIndex++;

      const justTyped = authorTypingText[authorIndex];
      const punctuationDelay = /[.!?]/.test(justTyped)
        ? AUTHOR_SENTENCE_PAUSE_MS
        : /[,;:]/.test(justTyped)
          ? AUTHOR_CLAUSE_PAUSE_MS
          : 0;
      state.timeoutId = PerformanceUtils.optimizedDelay(
        typeQuote,
        msPerChar + punctuationDelay,
      );

      // Phase 3 — park cursor, schedule auto-advance
    } else {
      renderParked();
      state.isTyping = false;
      state.isPaused = true;

      state.parkTimeoutId = setTimeout(() => {
        state.parkTimeoutId = null;
        state.isPaused = false;
        elements.quoteContainer.innerHTML = `<span class="cursor-block" aria-hidden="true"></span>`;
        setRandomQuote();
      }, getThemePauseDuration());
    }
  }

  typeQuote();
}

/**
 * Fetches the next quote (preloaded or random) and starts displaying it.
 * No-ops while paused to prevent double-advance.
 */
async function setRandomQuote() {
  if (state.isPaused) return;

  try {
    const result = await PerformanceUtils.getNextQuote();

    if (!result) {
      elements.quoteContainer.textContent = "No quotes available";
      elements.errorMessage.textContent =
        "*** ERROR: NO VALID QUOTES AVAILABLE";
      elements.errorMessage.classList.add("error-active");
      return;
    }

    const { quote, authorHTML, sourceHTML } = result;
    displayQuote(quote, 0, false, authorHTML, false, sourceHTML);
  } catch (error) {
    console.error("Error loading quote:", error);
    elements.errorMessage.textContent = "*** ERROR: FAILED TO LOAD QUOTES";
    elements.errorMessage.classList.add("error-active");
  }
}

// =========================================
// BOOT SEQUENCE
// =========================================

/**
 * Types a single line of text into the quote container, character by character.
 * Previously typed lines are shown above the current line as the line grows.
 *
 * @param {string} text - The line to type.
 * @param {number} speed - Base ms per character.
 * @param {() => void} done - Called when the line is fully typed.
 * @param {string[]} previousLines - Lines already typed, shown above.
 */
function typeBootLine(text, speed, done, previousLines) {
  let i = 0;
  const prev =
    previousLines && previousLines.length
      ? previousLines
          .map((l) => `<span class="text-selected">${l}</span>`)
          .join("\n") + "\n"
      : "";

  function tick() {
    elements.quoteContainer.innerHTML =
      prev +
      `<span class="text-selected">${text.slice(0, i + 1)}</span>` +
      `<span class="cursor-block" aria-hidden="true"></span>`;
    i++;
    if (i < text.length) {
      const justTyped = text[i - 1];
      const pd = /[.!?]/.test(justTyped)
        ? AUTHOR_SENTENCE_PAUSE_MS
        : /[,;:]/.test(justTyped)
          ? AUTHOR_CLAUSE_PAUSE_MS
          : 0;
      state.timeoutId = setTimeout(tick, speed + pd);
    } else {
      done();
    }
  }
  tick();
}

/**
 * Runs the per-terminal POST boot sequence, then calls onComplete.
 * Skipped entirely when config.performanceMode is true.
 * Boot messages are sourced from themeBootLines in config.js.
 *
 * @param {() => void} onComplete - Called after the last boot line finishes.
 */
function runBootSequence(onComplete) {
  if (config.performanceMode) {
    onComplete();
    return;
  }

  const prompt = getThemePrompt();
  const currentTheme = themes.find((t) =>
    document.body.classList.contains(`theme-${t}`),
  );

  const defaultLines = [
    { text: "BLOCKQUOTE.SH v1.0 — PHOSPHOR TERMINAL READY", speed: 28 },
    { text: "LOADING QUOTE DATABASE.................. OK", speed: 32 },
  ];

  let bootLines = themeBootLines[currentTheme] || defaultLines;

  // NeXT last-login timestamp — dynamic.
  // Jan 3 is Bitcoin genesis day: show the original timestamp as a nod.
  // Every other day: show today's date in authentic ctime(3) format.
  if (currentTheme === "nextstep") {
    const now = new Date();
    const isGenesisDay = now.getMonth() === 0 && now.getDate() === 3;
    const loginLine = isGenesisDay
      ? "Last login: Sat Jan  3 18:15:05 2009"
      : (() => {
          const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const d = days[now.getDay()];
          const m = months[now.getMonth()];
          const dd = String(now.getDate()).padStart(2, " ");
          const hh = String(now.getHours()).padStart(2, "0");
          const mm = String(now.getMinutes()).padStart(2, "0");
          const ss = String(now.getSeconds()).padStart(2, "0");
          const yyyy = now.getFullYear();
          return `Last login: ${d} ${m} ${dd} ${hh}:${mm}:${ss} ${yyyy}`;
        })();
    bootLines = bootLines.map((l) =>
      l.text.startsWith("Last login:") ? { ...l, text: loginLine } : l,
    );
  }

  const lines = [...bootLines, ...(prompt ? [{ text: prompt, speed: 0 }] : [])];

  let lineIndex = 0;
  const displayed = [];

  function nextLine() {
    if (lineIndex >= lines.length) {
      onComplete();
      return;
    }

    const { text, speed } = lines[lineIndex];
    lineIndex++;

    typeBootLine(
      text,
      speed,
      () => {
        displayed.push(text);
        elements.quoteContainer.innerHTML = displayed
          .map((l) => `<span class="text-selected">${l}</span>`)
          .join("\n");
        state.timeoutId = setTimeout(
          nextLine,
          lineIndex === lines.length ? BOOT_FINAL_PAUSE_MS : BOOT_LINE_PAUSE_MS,
        );
      },
      displayed,
    );
  }

  nextLine();
}

// =========================================
// HELP SCREEN
// =========================================

/**
 * Types the keyboard shortcut reference into the quote container,
 * using the active theme's HELP idiom as the header.
 * Stays on screen until the user presses any key or clicks.
 */
/**
 * Returns theme-authentic help lines for the active terminal.
 * Each family formats the key list in the style of its native OS/ROM:
 *   IBM TSO/ISPF  — PF-key style, uppercase
 *   DEC VT/VMS    — HELP topic format
 *   Unix (ADM/Wyse/VT05) — terse man-page style, lowercase
 *   CP/M (Zenith/Kaypro) — uppercase columnar
 *   BASIC (C64/PET)      — numbered LIST lines
 *   Apple II Applesoft   — ]-prompt style
 *
 * @param {string} theme
 * @returns {string[]}
 */
function getThemeHelpLines(theme) {
  switch (theme) {
    case "ibm3279-green":
    case "ibm3279-bitcoin-orange":
      return [
        themeHelpHeaders[theme],
        " ",
        "SPACE  FINISH TYPING / NEXT QUOTE",
        "N      NEXT QUOTE",
        "P      PREVIOUS QUOTE",
        "C      COPY QUOTE",
        "X      SHARE ON X/TWITTER",
        "L      COPY SHAREABLE LINK",
        "B      BOOKMARK QUOTE",
        "V      VIEW BOOKMARKS (SHIFT+V)",
        "E      EXPORT BOOKMARKS",
        "U      TOGGLE UPPERCASE",
        "T      CYCLE THEME",
        "W      CLOCK MODE",
        "Q      QUOTE OF THE DAY",
        "/      SEARCH QUOTES",
        "?      THIS HELP",
      ];

    case "vt100-amber":
      return [
        themeHelpHeaders[theme],
        " ",
        "Topic: BLOCKQUOTE.SH key bindings",
        " ",
        "  SPACE/CLICK   finish typing or next quote",
        "  N / P         next / previous quote",
        "  C             copy quote to clipboard",
        "  X             share on X/Twitter",
        "  L             copy shareable URL",
        "  B             bookmark toggle",
        "  Shift+V       bookmark list",
        "  E             export bookmarks as JSON",
        "  U             toggle uppercase",
        "  T             cycle terminal theme",
        "  W             clock mode",
        "  Q             quote of the day",
        "  /             search quotes",
        "  ?             this help",
      ];

    case "teletype-blue-green":
    case "vt05-white":
    case "adm3a-green":
    case "wyse50-amber":
    case "nextstep":
      return [
        themeHelpHeaders[theme],
        " ",
        "  space/click   finish typing, next quote",
        "  n / p         next / previous quote",
        "  c             copy to clipboard",
        "  x             share on x/twitter",
        "  l             copy link",
        "  b             bookmark",
        "  shift+v       bookmark list",
        "  e             export bookmarks",
        "  u             uppercase toggle",
        "  t             next theme",
        "  w             clock",
        "  q             quote of the day",
        "  /             search",
        "  ?             help",
      ];

    case "zenith-green":
    case "kaypro-green":
      return [
        themeHelpHeaders[theme],
        " ",
        "KEY         ACTION",
        "---         ------",
        "SPACE       FINISH TYPING / NEXT QUOTE",
        "N           NEXT QUOTE",
        "P           PREVIOUS QUOTE",
        "C           COPY QUOTE",
        "X           SHARE ON X/TWITTER",
        "L           COPY LINK",
        "B           BOOKMARK",
        "SHIFT+V     VIEW BOOKMARKS",
        "E           EXPORT BOOKMARKS",
        "U           UPPERCASE",
        "T           CHANGE THEME",
        "W           CLOCK",
        "Q           QUOTE OF THE DAY",
        "/           SEARCH",
      ];

    case "pet2001-green":
    case "commodore64":
      return [
        themeHelpHeaders[theme],
        " ",
        "10 REM ** BLOCKQUOTE.SH KEYS **",
        "20 REM SPACE = NEXT QUOTE",
        "30 REM N = NEXT    P = PREV",
        "40 REM C = COPY    B = BOOKMARK",
        "50 REM X = SHARE X/TWITTER",
        "60 REM Q = QUOTE OF THE DAY",
        "70 REM L = COPY LINK",
        "80 REM SHIFT+V = BOOKMARKS",
        "90 REM E = EXPORT   U = UPPERCASE",
        "100 REM T = THEME   W = CLOCK",
        "110 REM / = SEARCH  ? = HELP",
        " ",
        "READY.",
      ];

    case "apple2-green":
      return [
        themeHelpHeaders[theme],
        " ",
        "]  SPACE/RET  NEXT QUOTE",
        "]  N          NEXT",
        "]  P          PREV",
        "]  C          COPY",
        "]  X          SHARE X/TWITTER",
        "]  Q          QUOTE OF THE DAY",
        "]  L          COPY LINK",
        "]  B          BOOKMARK",
        "]  CTRL+V     BOOKMARKS",
        "]  E          EXPORT",
        "]  U          UPPERCASE",
        "]  T          THEME",
        "]  W          CLOCK",
        "]  /          SEARCH",
      ];

    default:
      return [
        themeHelpHeaders[theme] || "HELP",
        " ",
        "SPACE/CLICK    finish typing / next quote",
        "N              next quote",
        "P              previous quote",
        "C              copy quote",
        "X              share on x/twitter",
        "L              copy share link",
        "B              bookmark quote",
        "SHIFT+V        view bookmark list",
        "E              export bookmarks",
        "U              toggle uppercase",
        "T              cycle theme",
        "W              clock mode",
        "Q              quote of the day",
        "/              search quotes",
        "?              show this help",
      ];
  }
}

function getMobileHelpLines(theme) {
  switch (theme) {
    case "ibm3279-green":
    case "ibm3279-bitcoin-orange":
      return [
        "HELP - BLOCKQUOTES MOBILE GESTURES",
        " ",
        "TAP        PAUSE / FINISH TYPING",
        "SWIPE L    NEXT QUOTE",
        "SWIPE R    PREVIOUS QUOTE",
        "SWIPE UP   THIS HELP",
        "SWIPE DN   COPY SHARE LINK",
        "L.PRESS    SHARE ON X/TWITTER",
        "SHAKE      CHANGE THEME",
      ];

    case "vt100-amber":
      return [
        "BLOCKQUOTES - MOBILE topic",
        " ",
        "Topic: Touch gesture bindings",
        " ",
        "  TAP           pause / finish typing",
        "  SWIPE LEFT    next quote",
        "  SWIPE RIGHT   previous quote",
        "  SWIPE UP      this help",
        "  SWIPE DOWN    copy share link",
        "  LONG PRESS    share on X/Twitter",
        "  SHAKE         change theme",
      ];

    case "teletype-blue-green":
    case "vt05-white":
    case "adm3a-green":
    case "wyse50-amber":
    case "nextstep":
      return [
        "usage: blockquotes [gesture]",
        " ",
        "  tap           pause / finish typing",
        "  swipe left    next quote",
        "  swipe right   previous quote",
        "  swipe up      this help",
        "  swipe down    copy share link",
        "  long press    share on x/twitter",
        "  shake         change theme",
      ];

    case "zenith-green":
    case "kaypro-green":
      return [
        "BLOCKQUOTES MOBILE GESTURES",
        " ",
        "GESTURE     ACTION",
        "---         ------",
        "TAP         PAUSE / FINISH TYPING",
        "SWIPE L     NEXT QUOTE",
        "SWIPE R     PREVIOUS QUOTE",
        "SWIPE UP    THIS HELP",
        "SWIPE DN    COPY SHARE LINK",
        "L.PRESS     SHARE X/TWITTER",
        "SHAKE       CHANGE THEME",
      ];

    case "pet2001-green":
    case "commodore64":
      return [
        themeHelpHeaders[theme],
        " ",
        "10 REM ** MOBILE GESTURES **",
        "20 REM TAP = PAUSE / NEXT",
        "30 REM SWIPE L = NEXT QUOTE",
        "40 REM SWIPE R = PREV QUOTE",
        "50 REM SWIPE UP = THIS HELP",
        "60 REM SWIPE DN = COPY LINK",
        "70 REM LONG PRESS = SHARE X",
        "80 REM SHAKE = CHANGE THEME",
        " ",
        "READY.",
      ];

    case "apple2-green":
      return [
        "]CATALOG - BLOCKQUOTE.SH GESTURES",
        " ",
        "]  TAP         PAUSE / FINISH TYPING",
        "]  SWIPE L     NEXT QUOTE",
        "]  SWIPE R     PREVIOUS QUOTE",
        "]  SWIPE UP    THIS HELP",
        "]  SWIPE DN    COPY SHARE LINK",
        "]  L.PRESS     SHARE X/TWITTER",
        "]  SHAKE       CHANGE THEME",
      ];

    default:
      return [
        "MOBILE GESTURES",
        " ",
        "TAP            pause / finish typing",
        "SWIPE LEFT     next quote",
        "SWIPE RIGHT    previous quote",
        "SWIPE UP       this help",
        "SWIPE DOWN     copy share link",
        "LONG PRESS     share on x/twitter",
        "SHAKE          change theme",
      ];
  }
}

function showMobileHelp() {
  if (state.booting) return;

  PerformanceUtils.cancelAllTimers();
  hidePositionIndicator();
  state.isTyping = false;
  state.isPaused = true;
  state.helpMode = true;

  const currentTheme =
    themes.find((t) => document.body.classList.contains(`theme-${t}`)) ||
    "ibm3279-green";

  const lines = getMobileHelpLines(currentTheme);

  function renderFull() {
    elements.quoteContainer.innerHTML =
      lines.map((l) => `<span class="text-selected">${l}</span>`).join("\n") +
      `\n<span class="cursor-block" aria-hidden="true"></span>`;
    showToast("tap to close");
  }

  let lineIndex = 0;
  const typed = [];

  function nextLine() {
    if (lineIndex >= lines.length) {
      renderFull();
      return;
    }
    const text = lines[lineIndex];
    lineIndex++;
    let i = 0;
    const typeSpeed =
      lineIndex === 1 ? HELP_HEADER_TYPE_SPEED_MS : HELP_LINE_TYPE_SPEED_MS;
    const linePause =
      lineIndex === 1 ? HELP_HEADER_PAUSE_MS : HELP_LINE_PAUSE_MS;

    function tick() {
      if (!state.helpMode) return;
      const current = text.slice(0, i + 1);
      elements.quoteContainer.innerHTML =
        typed.map((l) => `<span class="text-selected">${l}</span>`).join("\n") +
        (typed.length ? "\n" : "") +
        `<span class="text-selected">${current}</span>` +
        `<span class="cursor-block" aria-hidden="true"></span>`;
      i++;
      if (i < text.length) {
        state.timeoutId = setTimeout(tick, typeSpeed);
      } else {
        typed.push(text);
        state.timeoutId = setTimeout(nextLine, linePause);
      }
    }
    tick();
  }

  elements.quoteContainer.textContent = "";
  nextLine();
}

function showHelp() {
  if (state.booting) return;

  PerformanceUtils.cancelAllTimers();
  hidePositionIndicator();
  state.isTyping = false;
  state.isPaused = true;
  state.helpMode = true;

  const currentTheme =
    themes.find((t) => document.body.classList.contains(`theme-${t}`)) ||
    "ibm3279-green";

  const lines = getThemeHelpLines(currentTheme);

  /** Renders the full help list instantly — used when user presses ? again
   *  mid-type, or when typing completes. */
  function renderFull() {
    elements.quoteContainer.innerHTML =
      lines.map((l) => `<span class="text-selected">${l}</span>`).join("\n") +
      `\n<span class="cursor-block" aria-hidden="true"></span>`;
    showToast("any key to close");
  }

  let lineIndex = 0;
  const typed = [];

  function nextLine() {
    // All lines typed — park with blinking cursor and wait for dismissal.
    if (lineIndex >= lines.length) {
      renderFull();
      return;
    }

    const text = lines[lineIndex];
    lineIndex++;

    let i = 0;
    const typeSpeed =
      lineIndex === 1 ? HELP_HEADER_TYPE_SPEED_MS : HELP_LINE_TYPE_SPEED_MS;
    const linePause =
      lineIndex === 1 ? HELP_HEADER_PAUSE_MS : HELP_LINE_PAUSE_MS;

    function tick() {
      // If help was exited mid-type (e.g. ? pressed twice), stop quietly.
      if (!state.helpMode) return;
      const current = text.slice(0, i + 1);
      elements.quoteContainer.innerHTML =
        typed.map((l) => `<span class="text-selected">${l}</span>`).join("\n") +
        (typed.length ? "\n" : "") +
        `<span class="text-selected">${current}</span>` +
        `<span class="cursor-block" aria-hidden="true"></span>`;
      i++;
      if (i < text.length) {
        state.timeoutId = setTimeout(tick, typeSpeed);
      } else {
        typed.push(text);
        state.timeoutId = setTimeout(nextLine, linePause);
      }
    }
    tick();
  }

  elements.quoteContainer.textContent = "";
  nextLine();
}

/**
 * Exits the help screen and resumes the quote cycle.
 * Called by any key press or click while state.helpMode is true.
 */
function exitHelp() {
  PerformanceUtils.cancelAllTimers();
  state.helpMode = false;
  state.isPaused = false;
  elements.quoteContainer.innerHTML = `<span class="cursor-block" aria-hidden="true"></span>`;
  setRandomQuote();
}

// =========================================
// QUOTE POSITION INDICATOR
// =========================================

/**
 * Updates the [N / TOTAL] position badge in the bottom-right corner.
 * Called when a quote parks so users know corpus size and current position.
 */
function updatePositionIndicator() {
  if (!state.currentQuote || !state.quotes) return;
  const index = state.quotes.findIndex(
    (q) =>
      q.text === state.currentQuote.text &&
      q.author === state.currentQuote.author,
  );
  let el = document.querySelector(".bq-position");
  if (!el) {
    el = document.createElement("div");
    el.className = "bq-position";
    document.body.appendChild(el);
  }
  if (index === -1) {
    el.classList.add("hidden");
    return;
  }
  el.textContent = `[${index + 1} / ${state.quotes.length}]`;
  el.classList.remove("hidden");
}

/** Hides the position badge — called when entering non-quote modes. */
function hidePositionIndicator() {
  const el = document.querySelector(".bq-position");
  if (el) el.classList.add("hidden");
}

/**
 * Updates the terminal status bar (IBM OIA, DEC status line, Wyse, Zenith).
 * No-ops silently for themes without a status bar.
 * Called whenever quote, caps, or app mode changes.
 */
// =========================================
// CLOCK MODE
// =========================================

/**
 * Toggles a full-screen terminal clock. Press W again or any key to exit.
 * Displays HH:MM:SS with the current date on the author line, updating every second.
 */
function enterClockMode() {
  if (state.booting) return;
  if (state.clockMode) {
    exitClockMode();
    return;
  }
  PerformanceUtils.cancelAllTimers();
  hidePositionIndicator();
  state.clockMode = true;
  state.isPaused = true;
  state.isTyping = false;

  document.body.classList.add("clock-mode");

  function tick() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    elements.quoteContainer.innerHTML = `${hh}:${mm}:${ss}`;
  }

  tick();
  state.clockIntervalId = setInterval(tick, 1000);
  showToast("clock — any key to exit");
}

/** Exits clock mode and resumes the quote cycle. */
function exitClockMode() {
  if (state.clockIntervalId) {
    clearInterval(state.clockIntervalId);
    state.clockIntervalId = null;
  }
  state.clockMode = false;
  state.isPaused = false;
  document.body.classList.remove("clock-mode");
  elements.quoteContainer.innerHTML = `<span class="cursor-block" aria-hidden="true"></span>`;
  setRandomQuote();
}

// =========================================
// VIM-STYLE SEARCH  ( / )
// =========================================

/** Enters search mode — renders a live / prompt on the status line. */
function enterSearchMode() {
  if (state.booting || state.clockMode || state.bookmarkListMode || state.quoteListMode) return;
  // Cancel any pending toast hide timer — it shares the status element and
  // would blank the search prompt a few seconds after it appeared
  if (state.statusTimer) {
    clearTimeout(state.statusTimer);
    state.statusTimer = null;
  }
  state.searchMode = true;
  state.searchQuery = "";
  document.body.classList.add("search-mode");
  renderSearchPrompt();
}

/** Renders the live search prompt with a blinking cursor on the status line. */
function renderSearchPrompt() {
  let el = document.querySelector(".bq-status");
  if (!el) {
    el = document.createElement("div");
    el.className = "bq-status";
    document.body.appendChild(el);
  }
  const prompt = getThemePrompt() || ">";
  // Reuse cursor-block for the input caret — same phosphor blink, no extra CSS needed
  el.innerHTML = `${prompt} /${state.searchQuery}<span class="cursor-block" aria-hidden="true"></span>`;
  el.classList.remove("hidden");
}

/**
 * Handles keystrokes while search mode is active.
 * Printable characters append to the query; Backspace trims; Enter commits; Escape cancels.
 *
 * @param {KeyboardEvent} event
 */
function handleSearchKey(event) {
  const key = event.key;
  if (key === "Escape") {
    exitSearchMode(false);
  } else if (key === "Enter") {
    commitSearch();
  } else if (key === "Backspace") {
    state.searchQuery = state.searchQuery.slice(0, -1);
    renderSearchPrompt();
  } else if (key.length === 1) {
    state.searchQuery += key;
    renderSearchPrompt();
  }
}

/**
 * Executes the search against loaded quotes (text, author, source).
 * Picks a random result from all matches; shows a count toast when multiple match.
 */
function commitSearch() {
  const query = state.searchQuery.toLowerCase().trim();
  exitSearchMode(true);
  if (!query || !state.quotes) return;

  // Easter eggs — theme-locked
  const isC64Theme =
    document.body.classList.contains("theme-commodore64") ||
    document.body.classList.contains("theme-pet2001-green");
  const isApple2Theme = document.body.classList.contains("theme-apple2-green");

  if (query === 'load "$",8' && isC64Theme) {
    showDiskDirectory();
    return;
  }
  if (query === "catalog" && isApple2Theme) {
    showCatalog();
    return;
  }
  if (query === "satoshi") {
    showGenesisBlock();
    return;
  }
  if (query === "stats") {
    showStats();
    return;
  }

  const matches = state.quotes.filter(
    (q) =>
      q.text.toLowerCase().includes(query) ||
      q.author.toLowerCase().includes(query) ||
      (q.source && q.source.toLowerCase().includes(query)),
  );

  if (matches.length === 0) {
    showToast(`no match: ${query}`);
    return;
  }

  const hit = matches[Math.floor(Math.random() * matches.length)];
  state.isPaused = false;
  displayQuoteWithTransition(hit, 0, true);
  if (matches.length > 1) showToast(`${matches.length} matches`);
}

/**
 * Exits search mode.
 *
 * @param {boolean} keepToast - When true, leaves any active toast visible (e.g. match count).
 */
function exitSearchMode(keepToast = false) {
  state.searchMode = false;
  state.searchQuery = "";
  document.body.classList.remove("search-mode");
  if (!keepToast) {
    const el = document.querySelector(".bq-status");
    if (el) el.classList.add("hidden");
  }
}

// =========================================
// BOOKMARK LIST VIEW  ( Shift+V )
// =========================================

/**
 * Opens the scannable bookmark list view.
 * Shows all saved bookmarks as a numbered reverse-video list.
 * Arrow keys / N / P navigate; Enter or number key selects; Escape exits.
 */
function showBookmarkList() {
  if (state.booting) return;
  if (state.bookmarkedQuotes.length === 0) {
    showToast("no bookmarks — press B to save quotes");
    return;
  }
  PerformanceUtils.cancelAllTimers();
  hidePositionIndicator();
  state.bookmarkListMode = true;
  state.bookmarkListIndex = 0;
  state.isPaused = true;
  state.isTyping = false;
  renderBookmarkList();
  showToast("↑↓ navigate · enter select · esc close");
}

/** Renders the bookmark list, highlighting the currently selected row in reverse-video. */
function renderBookmarkList() {
  const total = state.bookmarkedQuotes.length;
  const selected = state.bookmarkListIndex;
  const header = `BOOKMARKS [${total} saved]`;

  const lines = state.bookmarkedQuotes.map((q, i) => {
    const num = String(i + 1).padStart(2, " ");
    const rawAuthor = q.author
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .replace(/^"|"$/g, "")
      .trim();
    const words = q.text.split(/\s+/);
    const rawText = words.length > 5 ? words.slice(0, 5).join(" ") + "…" : q.text;
    const line = `${num}  \u201c${rawText}\u201d \u2014 ${rawAuthor}`;
    return i === selected
      ? `<span class="text-selected">${line}</span>`
      : `<span>${line}</span>`;
  });

  elements.quoteContainer.innerHTML =
    `<span class="text-selected">${header}</span>\n\n` + lines.join("\n");
}

/**
 * Handles keystrokes while the bookmark list is active.
 *
 * @param {KeyboardEvent} event
 */
function handleBookmarkListKey(event) {
  const key = event.key;
  const total = state.bookmarkedQuotes.length;

  if (key === "Escape" || key.toLowerCase() === "q") {
    exitBookmarkList();
  } else if (key === "ArrowUp" || key.toLowerCase() === "p") {
    state.bookmarkListIndex = Math.max(0, state.bookmarkListIndex - 1);
    renderBookmarkList();
  } else if (key === "ArrowDown" || key.toLowerCase() === "n") {
    state.bookmarkListIndex = Math.min(total - 1, state.bookmarkListIndex + 1);
    renderBookmarkList();
  } else if (key.toLowerCase() === "e") {
    exportBookmarksAsJSON();
  } else if (key === " ") {
    event.preventDefault();
    exitBookmarkList();
  } else if (key === "Enter") {
    event.preventDefault();
    const selected = state.bookmarkedQuotes[state.bookmarkListIndex];
    if (selected) {
      state.bookmarkListMode = false;
      state.isPaused = false;
      displayQuoteWithTransition(selected, 0, true);
    }
  } else {
    // Number keys 1–9 jump directly to that row
    const num = parseInt(key, 10);
    if (!isNaN(num) && num >= 1 && num <= total) {
      state.bookmarkListIndex = num - 1;
      renderBookmarkList();
    }
  }
}

/** Exits the bookmark list and resumes the quote cycle. */
function exitBookmarkList() {
  state.bookmarkListMode = false;
  state.isPaused = false;
  elements.quoteContainer.innerHTML = `<span class="cursor-block" aria-hidden="true"></span>`;
  setRandomQuote();
}

// =========================================
// EASTER EGG QUOTE LIST VIEWS
// =========================================

/** Enters the C64 disk directory view triggered by: LOAD "$",8 */
function showDiskDirectory() {
  if (!state.quotes || state.booting) return;
  PerformanceUtils.cancelAllTimers();
  hidePositionIndicator();
  state.quoteListMode = true;
  state.quoteListStyle = "c64";
  state.quoteListIndex = 0;
  state.quoteListOffset = 0;
  state.isPaused = true;
  state.isTyping = false;
  document.body.classList.add("quote-list-mode");
  renderQuoteList();
  showToast("↑↓ navigate · enter select · esc close");
}

/** Enters the Apple II CATALOG view triggered by: CATALOG */
function showCatalog() {
  if (!state.quotes || state.booting) return;
  PerformanceUtils.cancelAllTimers();
  hidePositionIndicator();
  state.quoteListMode = true;
  state.quoteListStyle = "appleii";
  state.quoteListIndex = 0;
  state.quoteListOffset = 0;
  state.isPaused = true;
  state.isTyping = false;
  document.body.classList.add("quote-list-mode");
  renderQuoteList();
  showToast("↑↓ navigate · enter select · esc close");
}

/** Renders the active easter egg quote list. */
function renderQuoteList() {
  if (state.quoteListStyle === "c64") {
    renderC64Directory();
  } else {
    renderAppleIICatalog();
  }
}

/**
 * Calculates how many quote rows fit in the visible area.
 * Uses the container's computed font size and line-height to stay accurate
 * across all themes and zoom levels.
 */
function getQuoteListWindowSize() {
  const fontSize = parseFloat(
    getComputedStyle(elements.quoteContainer).fontSize,
  );
  const lineHeightPx = fontSize * 1.6;
  // Reserve ~30% of viewport for padding, status bar, header, and indicators
  const available = window.innerHeight * 0.7;
  return Math.max(6, Math.floor(available / lineHeightPx) - 3);
}

/** Renders a Commodore 64–style disk directory listing. */
function renderC64Directory() {
  const quotes = state.quotes;
  const selected = state.quoteListIndex;
  const offset = state.quoteListOffset;
  const winEnd = Math.min(offset + getQuoteListWindowSize(), quotes.length);
  const totalBlocks = quotes.reduce(
    (sum, q) => sum + Math.max(1, Math.ceil(q.text.length / 254)),
    0,
  );
  const freeBlocks = Math.max(0, 664 - (totalBlocks % 664));
  const header = `0 "BITCOIN QUOTES    " BQ 00 2A`;

  const lines = quotes.slice(offset, winEnd).map((q, ii) => {
    const i = ii + offset;
    const blocks = String(Math.max(1, Math.ceil(q.text.length / 254))).padStart(
      3,
      " ",
    );
    const rawAuthor = q.author
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .replace(/^"|"$/g, "")
      .trim()
      .toUpperCase()
      .slice(0, 16);
    const name = `"${rawAuthor}"`.padEnd(20);
    const line = `${blocks} ${name}   PRG`;
    return i === selected
      ? `<span class="text-selected">${line}</span>`
      : `<span>${line}</span>`;
  });

  const aboveCount = offset;
  const belowCount = quotes.length - winEnd;
  let content = `<span class="text-selected">${header}</span>\n\n`;
  if (aboveCount > 0)
    content += `<span>      ... ${aboveCount} MORE ABOVE ...</span>\n`;
  content += lines.join("\n");
  if (belowCount > 0)
    content += `\n<span>      ... ${belowCount} MORE BELOW ...</span>`;
  content += `\n\n${freeBlocks} BLOCKS FREE.`;
  elements.quoteContainer.innerHTML = content;
}

/** Renders an Apple II–style CATALOG listing. */
function renderAppleIICatalog() {
  const quotes = state.quotes;
  const selected = state.quoteListIndex;
  const offset = state.quoteListOffset;
  const winEnd = Math.min(offset + getQuoteListWindowSize(), quotes.length);
  const header = `CATALOG\n\nDISK VOLUME 254`;

  const lines = quotes.slice(offset, winEnd).map((q, ii) => {
    const i = ii + offset;
    const sectors = String(
      Math.max(1, Math.ceil(q.text.length / 256)),
    ).padStart(3, " ");
    const rawAuthor = q.author
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .replace(/^"|"$/g, "")
      .trim();
    const truncAuthor =
      rawAuthor.length > 22 ? rawAuthor.slice(0, 22) + "\u2026" : rawAuthor;
    const line = ` T ${sectors} ${truncAuthor}`;
    return i === selected
      ? `<span class="text-selected">${line}</span>`
      : `<span>${line}</span>`;
  });

  const aboveCount = offset;
  const belowCount = quotes.length - winEnd;
  let content = `<span class="text-selected">${header}</span>\n\n`;
  if (aboveCount > 0)
    content += `<span> ... ${aboveCount} more above ...</span>\n`;
  content += lines.join("\n");
  if (belowCount > 0)
    content += `\n<span> ... ${belowCount} more below ...</span>`;
  elements.quoteContainer.innerHTML = content;
}

/**
 * Handles keystrokes while an easter egg quote list is active.
 *
 * @param {KeyboardEvent} event
 */
function handleQuoteListKey(event) {
  const key = event.key;
  const total = state.quotes ? state.quotes.length : 0;

  if (key === "Escape" || key.toLowerCase() === "q") {
    exitQuoteList();
  } else if (key === " ") {
    event.preventDefault();
    exitQuoteList();
  } else if (key === "ArrowUp" || key.toLowerCase() === "p") {
    state.quoteListIndex = Math.max(0, state.quoteListIndex - 1);
    if (state.quoteListIndex < state.quoteListOffset) {
      state.quoteListOffset = state.quoteListIndex;
    }
    renderQuoteList();
    const upQ = state.quotes[state.quoteListIndex];
    if (upQ)
      QuoteUtils.announceAction(
        `${state.quoteListIndex + 1} of ${total}: ${upQ.author}`,
      );
  } else if (key === "ArrowDown" || key.toLowerCase() === "n") {
    state.quoteListIndex = Math.min(total - 1, state.quoteListIndex + 1);
    if (state.quoteListIndex >= state.quoteListOffset + getQuoteListWindowSize()) {
      state.quoteListOffset = state.quoteListIndex - getQuoteListWindowSize() + 1;
    }
    renderQuoteList();
    const downQ = state.quotes[state.quoteListIndex];
    if (downQ)
      QuoteUtils.announceAction(
        `${state.quoteListIndex + 1} of ${total}: ${downQ.author}`,
      );
  } else if (key === "Enter") {
    event.preventDefault();
    const selected = state.quotes[state.quoteListIndex];
    if (selected) {
      state.quoteListMode = false;
      state.quoteListStyle = null;
      state.isPaused = false;
      document.body.classList.remove("quote-list-mode");
      displayQuoteWithTransition(selected, 0, true);
    }
  }
}

/** Exits the easter egg quote list and resumes the quote cycle. */
function exitQuoteList() {
  state.quoteListMode = false;
  state.quoteListStyle = null;
  state.isPaused = false;
  document.body.classList.remove("quote-list-mode");
  elements.quoteContainer.innerHTML = `<span class="cursor-block" aria-hidden="true"></span>`;
  setRandomQuote();
}

/**
 * Shows the Bitcoin genesis block as a typed terminal sequence.
 * Triggered by searching "satoshi" on any theme.
 * Displays block header, the embedded coinbase message, and the block hash —
 * all publicly verifiable data from block #0, committed 03 Jan 2009 18:15:05 UTC.
 * Any key dismisses and resumes normal quote cycle.
 */
function showGenesisBlock() {
  if (state.booting) return;
  PerformanceUtils.cancelAllTimers();
  hidePositionIndicator();
  state.isPaused = true;
  state.isTyping = false;
  state.helpMode = true; // reuse help-mode dismissal logic

  const lines = [
    "GENESIS BLOCK #0",
    "",
    "TIMESTAMP  2009-01-03 18:15:05 UTC",
    "BITS       0x1d00ffff",
    "NONCE      2083236893",
    "",
    "COINBASE MESSAGE:",
    '"The Times 03/Jan/2009',
    ' Chancellor on brink of second',
    ' bailout for banks"',
    "",
    "HASH",
    "000000000019d6689c085ae165831e93",
    "4ff763ae46a2a6c172b3f1b60a8ce26f",
  ];

  function renderFull() {
    elements.quoteContainer.innerHTML =
      lines
        .map((l) =>
          l === ""
            ? `<span>&nbsp;</span>`
            : `<span class="text-selected">${l}</span>`,
        )
        .join("\n") +
      `\n<span class="cursor-block" aria-hidden="true"></span>`;
    showToast("any key to close");
  }

  let lineIndex = 0;
  const typed = [];

  function nextLine() {
    if (lineIndex >= lines.length) {
      renderFull();
      return;
    }
    const text = lines[lineIndex];
    lineIndex++;

    if (text === "") {
      typed.push(`<span>&nbsp;</span>`);
      elements.quoteContainer.innerHTML =
        typed.join("\n") +
        `\n<span class="cursor-block" aria-hidden="true"></span>`;
      state.timeoutId = setTimeout(nextLine, 80);
      return;
    }

    let i = 0;
    const speed = lineIndex === 1 ? HELP_HEADER_TYPE_SPEED_MS : HELP_LINE_TYPE_SPEED_MS;
    const pause = lineIndex === 1 ? HELP_HEADER_PAUSE_MS : HELP_LINE_PAUSE_MS;

    function tick() {
      if (!state.helpMode) return;
      const current = text.slice(0, i + 1);
      elements.quoteContainer.innerHTML =
        typed.join("\n") +
        (typed.length ? "\n" : "") +
        `<span class="text-selected">${current}</span>` +
        `\n<span class="cursor-block" aria-hidden="true"></span>`;
      i++;
      if (i < text.length) {
        state.timeoutId = setTimeout(tick, speed);
      } else {
        typed.push(`<span class="text-selected">${text}</span>`);
        state.timeoutId = setTimeout(nextLine, pause);
      }
    }
    tick();
  }

  nextLine();
}


// =========================================
// STATS
// =========================================

/**
 * Shows a terminal-style statistics readout.
 * Triggered by searching "stats" on any theme. Any key dismisses.
 */
function showStats() {
  if (state.booting) return;
  PerformanceUtils.cancelAllTimers();
  hidePositionIndicator();
  state.isPaused = true;
  state.isTyping = false;
  state.helpMode = true;

  const total = state.quotes ? state.quotes.length : 0;
  const bookmarks = state.bookmarkedQuotes ? state.bookmarkedQuotes.length : 0;
  const currentTheme =
    themes.find((t) => document.body.classList.contains(`theme-${t}`)) ||
    "ibm3279-green";

  const lines = [
    "BLOCKQUOTE.SH — SYSTEM STATS",
    "",
    `QUOTES         ${total}`,
    `TERMINALS      13`,
    `BOOKMARKS      ${bookmarks}`,
    "",
    `ACTIVE THEME   ${currentTheme}`,
  ];

  function renderFull() {
    elements.quoteContainer.innerHTML =
      lines
        .map((l) =>
          l === ""
            ? `<span>&nbsp;</span>`
            : `<span class="text-selected">${l}</span>`,
        )
        .join("\n") +
      `\n<span class="cursor-block" aria-hidden="true"></span>`;
    showToast("any key to close");
  }

  let lineIndex = 0;
  const typed = [];

  function nextLine() {
    if (lineIndex >= lines.length) {
      renderFull();
      return;
    }
    const text = lines[lineIndex];
    lineIndex++;

    if (text === "") {
      typed.push(`<span>&nbsp;</span>`);
      elements.quoteContainer.innerHTML =
        typed.join("\n") +
        `\n<span class="cursor-block" aria-hidden="true"></span>`;
      state.timeoutId = setTimeout(nextLine, 80);
      return;
    }

    let i = 0;
    const speed = lineIndex === 1 ? HELP_HEADER_TYPE_SPEED_MS : HELP_LINE_TYPE_SPEED_MS;
    const pause = lineIndex === 1 ? HELP_HEADER_PAUSE_MS : HELP_LINE_PAUSE_MS;

    function tick() {
      if (!state.helpMode) return;
      const current = text.slice(0, i + 1);
      elements.quoteContainer.innerHTML =
        typed.join("\n") +
        (typed.length ? "\n" : "") +
        `<span class="text-selected">${current}</span>` +
        `\n<span class="cursor-block" aria-hidden="true"></span>`;
      i++;
      if (i < text.length) {
        state.timeoutId = setTimeout(tick, speed);
      } else {
        typed.push(`<span class="text-selected">${text}</span>`);
        state.timeoutId = setTimeout(nextLine, pause);
      }
    }
    tick();
  }

  nextLine();
}

// =========================================
// SHARING
// =========================================

/**
 * Copies the current quote to the clipboard in tweet-ready format.
 * Format: "text" — Author, Source
 */
function copyCurrentQuote() {
  if (!state.currentQuote) return;
  const text = QuoteUtils.getTweetText(state.currentQuote);
  navigator.clipboard
    .writeText(text)
    .then(() => {
      QuoteUtils.announceAction("Quote copied to clipboard");
      showToast("quote copied");
    })
    .catch((err) => {
      console.error("Failed to copy:", err);
      QuoteUtils.announceAction("Failed to copy quote");
    });
}

/**
 * Returns the array index of the current quote in state.quotes.
 *
 * @returns {number} Index, or -1 if not found.
 */
function getCurrentQuoteIndex() {
  if (!state.currentQuote || !state.quotes) return -1;
  return state.quotes.findIndex(
    (q) =>
      q.text === state.currentQuote.text &&
      q.author === state.currentQuote.author,
  );
}

/**
 * Copies a shareable URL for the current quote to the clipboard.
 * Format: https://blockquote.sh?q=INDEX
 */
function copyShareableURL() {
  if (!state.currentQuote) return;
  const index = getCurrentQuoteIndex();
  if (index === -1) {
    QuoteUtils.announceAction("Failed to generate share link");
    return;
  }
  const url = `${location.origin}${location.pathname}?q=${index}`;
  navigator.clipboard
    .writeText(url)
    .then(() => {
      QuoteUtils.announceAction("Share link copied to clipboard");
      showToast("link copied");
    })
    .catch(() => {
      QuoteUtils.announceAction("Failed to copy share link");
    });
}

/**
 * Opens the Twitter/X share intent for the current quote.
 * Uses the web intent URL on all platforms — the twitter:// app URI is blocked
 * by iOS Safari for programmatic clicks that are not direct user gestures.
 */
function shareQuoteOnTwitter() {
  if (!state.currentQuote) return;
  const tweetText = QuoteUtils.getTweetText(state.currentQuote);
  const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
  window.open(tweetUrl, "_blank", "noopener,noreferrer");
  QuoteUtils.announceAction("Opened share window");
}


/**
 * Checks the URL for a ?q=INDEX parameter on load and displays that quote.
 * Cleans the URL via history.replaceState so the param doesn't persist on refresh.
 *
 * @returns {boolean} True if a quote was loaded from the URL.
 */
function checkURLQuote() {
  const params = new URLSearchParams(location.search);
  const param = params.get("q");
  if (param === null) return false;

  const index = parseInt(param, 10);
  if (
    isNaN(index) ||
    !state.quotes ||
    index < 0 ||
    index >= state.quotes.length
  )
    return false;

  const quote = state.quotes[index];
  if (!isValidQuote(quote)) return false;

  state.isPaused = true;
  displayQuoteWithTransition(quote, 0, true);
  history.replaceState(null, "", location.pathname);
  return true;
}

// =========================================
// BOOKMARK SYSTEM
// =========================================

/**
 * Toggles the bookmark state of the current quote.
 * Persists to localStorage and updates the counter badge.
 */
function toggleBookmark() {
  if (!state.currentQuote) return;

  const isCurrentlyBookmarked = isQuoteBookmarked(state.currentQuote);

  if (isCurrentlyBookmarked) {
    state.bookmarkedQuotes = state.bookmarkedQuotes.filter(
      (b) =>
        !(
          b.text === state.currentQuote.text &&
          b.author === state.currentQuote.author
        ),
    );
    QuoteUtils.announceAction("Quote unbookmarked");
    showToast("bookmark removed");
    elements.quoteContainer.classList.remove("bookmarked");

    if (state.currentBookmarkIndex >= state.bookmarkedQuotes.length) {
      state.currentBookmarkIndex = Math.max(
        0,
        state.bookmarkedQuotes.length - 1,
      );
    }
  } else {
    state.bookmarkedQuotes.push({
      text: state.currentQuote.text,
      author: state.currentQuote.author,
      ...(state.currentQuote.source
        ? { source: state.currentQuote.source }
        : {}),
      bookmarkedAt: Date.now(),
    });
    QuoteUtils.announceAction("Quote bookmarked");
    showToast("bookmarked *");
    elements.quoteContainer.classList.add("bookmarked");
  }

  try {
    localStorage.setItem(
      "bookmarked-quotes",
      JSON.stringify(state.bookmarkedQuotes),
    );
  } catch (e) {
    showToast("storage full — bookmark not saved");
  }
  QuoteUtils.updateBookmarkCounter();
}

/**
 * Exports all bookmarked quotes as a dated JSON file download.
 * No-ops with a toast if there are no bookmarks.
 */
function exportBookmarksAsJSON() {
  if (state.bookmarkedQuotes.length === 0) {
    QuoteUtils.announceAction("No bookmarks to export");
    showToast("no bookmarks saved");
    return;
  }

  const data = {
    exported: new Date().toISOString(),
    source: "blockquote.sh",
    count: state.bookmarkedQuotes.length,
    quotes: state.bookmarkedQuotes.map((q) => ({
      text: q.text,
      author: q.author,
      ...(q.source ? { source: q.source } : {}),
      bookmarkedAt: q.bookmarkedAt
        ? new Date(q.bookmarkedAt).toISOString()
        : null,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `blockquotes-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.addEventListener("click", (e) => e.stopPropagation(), { once: true });
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, EXPORT_REVOKE_MS);

  QuoteUtils.announceAction(
    `Exported ${state.bookmarkedQuotes.length} bookmarks`,
  );
  showToast(`exported ${state.bookmarkedQuotes.length} bookmarks`);
}

// =========================================
// LIGHTNING TIP
// =========================================

/*
  Three-tier Lightning experience — no UI chrome, no modal.

  Tier 1 — WebLN (Alby, Zeus, etc.): silent payment via browser extension.
  Tier 2 — Mobile, no WebLN: native wallet handoff via lightning: URI.
  Tier 3 — Desktop, no WebLN: copy LNURL to clipboard, confirm via toast.

  The toast is the entire UI. People who know Lightning know what to do
  with an LNURL. People who don't aren't the audience for this button.
*/
const LightningTip = (() => {
  /** @returns {string | null} The LNURL from the bolt link's href, uppercased. */
  function getLNURL() {
    const bolt = document.querySelector(".bolt-link");
    if (!bolt) return null;
    return (bolt.getAttribute("href") || "")
      .replace(/^lightning:/i, "")
      .toUpperCase();
  }

  /**
   * Handles a click on the Lightning bolt icon.
   * Attempts WebLN first, falls back by tier.
   *
   * @param {MouseEvent} event
   */
  async function handleBoltClick(event) {
    const lnurl = getLNURL();
    if (!lnurl) return;

    if (window.webln) {
      event.preventDefault();
      try {
        await window.webln.enable();
        await window.webln.lnurl(lnurl);
        showToast("⚡ payment sent");
      } catch (e) {
        const msg = (e?.message || "").toLowerCase();
        if (/reject|cancel|user/i.test(msg)) {
          showToast("⚡ cancelled");
        } else if (/enable|permission|denied|locked|not.*allow/i.test(msg)) {
          showToast("⚡ wallet locked");
        } else {
          showToast("⚡ payment failed");
        }
      }
      return;
    }

    if (isMobile) return; // Let the lightning: href fire natively

    event.preventDefault();
    const short = lnurl.slice(0, 18) + "…";
    navigator.clipboard
      .writeText(lnurl)
      .then(() => showToast(`⚡ ${short} [copied]`))
      .catch(() => showToast("⚡ copy failed"));
  }

  return { handleBoltClick };
})();

// =========================================
// BITCOIN ON-CHAIN TIP
// =========================================

/*
  Two-tier Bitcoin on-chain experience — mirrors Lightning pattern.

  Tier 1 — Mobile: native wallet handoff via bitcoin: URI.
  Tier 2 — Desktop: copy address to clipboard, confirm via status line.
*/
const BitcoinTip = (() => {
  /** @returns {string | null} The Bitcoin address from the btc link's href. */
  function getAddress() {
    const btc = document.querySelector(".btc-link");
    if (!btc) return null;
    return (btc.getAttribute("href") || "")
      .replace(/^bitcoin:/i, "")
      .split("?")[0];
  }

  /**
   * Handles a click on the Bitcoin icon.
   *
   * @param {MouseEvent} event
   */
  function handleBtcClick(event) {
    const address = getAddress();
    if (!address) return;

    if (isMobile) return; // Let the bitcoin: href fire natively

    event.preventDefault();
    const short = address.slice(0, 10) + "…" + address.slice(-4);
    navigator.clipboard
      .writeText(address)
      .then(() => showToast(`₿ ${short} [copied]`))
      .catch(() => showToast("₿ copy failed"));
  }

  return { handleBtcClick };
})();

// =========================================
// QUOTE OF THE DAY
// =========================================

/**
 * Returns today's quote — deterministic for the UTC calendar day.
 * Uses the day-number as a seed so every visitor sees the same quote
 * on the same day, worldwide. No server needed.
 *
 * Algorithm: integer day index (days since Unix epoch) modulo corpus length.
 * Simple, stable, and produces a different quote every day for ~1.84 years
 * before the 672-quote cycle repeats — well within the window before new
 * quotes are added.
 *
 * @returns {object|null} The quote for today, or null if quotes not loaded.
 */
function getQuoteOfTheDay() {
  if (!state.quotes?.length) return null;
  const dayIndex = Math.floor(Date.now() / 86400000);
  return state.quotes[dayIndex % state.quotes.length];
}

/**
 * Jumps to today's quote of the day, triggered by Q key.
 * Shows a toast with today's UTC date. Pauses auto-advance.
 */
function showQuoteOfTheDay() {
  const quote = getQuoteOfTheDay();
  if (!quote) return;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD UTC
  state.isPaused = false;
  displayQuoteWithTransition(quote, 0, true);
  showToast(`quote of the day — ${dateStr}`);
  QuoteUtils.announceAction("Quote of the day");
}

// =========================================
// CRT EFFECTS — power-off/on, interference
// =========================================

/**
 * Schedules the next random interference flash.
 * Fires every 3–7 minutes (randomised to feel organic, not mechanical).
 */
function scheduleInterference() {
  const minMs = 3 * 60 * 1000;
  const maxMs = 7 * 60 * 1000;
  const delay = minMs + Math.random() * (maxMs - minMs);
  setTimeout(() => {
    if (!document.hidden) {
      document.body.classList.add("crt-interference");
      document.body.addEventListener(
        "animationend",
        () => {
          document.body.classList.remove("crt-interference");
          scheduleInterference();
        },
        { once: true },
      );
    } else {
      scheduleInterference();
    }
  }, delay);
}

// =========================================
// SHARED NAVIGATION ACTION
// =========================================

/**
 * Advances to a new random quote. Used by keyboard (N), swipe-left, and wheel-down.
 * Shows an error toast if the quote list is unavailable.
 */
function advanceToNextQuote() {
  const quotes = state.quotes;
  if (!quotes?.length) {
    elements.errorMessage.textContent = "*** ERROR: NO QUOTES AVAILABLE";
    elements.errorMessage.classList.add("error-active");
    return;
  }
  const next = getRandomQuote(quotes);
  if (next) displayQuoteWithTransition(next, 0, true);
  QuoteUtils.announceAction("Next quote displayed");
}

// =========================================
// EVENT HANDLERS
// =========================================

/**
 * Handles click and touch-tap on the document body.
 * - Lightning/Bitcoin icon clicks are intercepted and routed to their handlers.
 * - While typing: finishes typing immediately.
 * - While park-paused: advances to next quote.
 * - Otherwise: toggles pause/resume.
 *
 * @param {MouseEvent} event
 */
function handleClick(event) {
  if (state.booting) return;

  if (state.helpMode) {
    exitHelp();
    return;
  }
  if (state.clockMode) {
    exitClockMode();
    return;
  }
  if (state.bookmarkListMode) {
    exitBookmarkList();
    return;
  }
  if (state.quoteListMode) {
    exitQuoteList();
    return;
  }
  if (state.searchMode) {
    exitSearchMode(false);
    return;
  }

  if (event.target.closest(".bolt-link")) {
    LightningTip.handleBoltClick(event);
    document.activeElement?.blur();
    return;
  }

  if (event.target.closest(".btc-link")) {
    BitcoinTip.handleBtcClick(event);
    document.activeElement?.blur();
    return;
  }

  if (event.target.closest(".help-trigger")) {
    event.preventDefault();
    document.activeElement?.blur();
    isMobile ? showMobileHelp() : showHelp();
    return;
  }

  withProcessing(() => {
    if (state.isTyping && !state.isPaused) {
      clearTimeout(state.timeoutId);
      displayQuote(state.currentQuote, state.currentIndex, true);
      QuoteUtils.announceAction("Typing finished");
    } else if (state.parkTimeoutId) {
      clearTimeout(state.parkTimeoutId);
      state.parkTimeoutId = null;
      state.isPaused = false;
      elements.quoteContainer.innerHTML = `<span class="cursor-block" aria-hidden="true"></span>`;
      setRandomQuote();
      QuoteUtils.announceAction("Next quote");
    } else {
      state.isPaused = !state.isPaused;
      QuoteUtils.announceAction(state.isPaused ? "Paused" : "Resumed");
      if (!state.isPaused) {
        clearTimeout(state.timeoutId);
        elements.quoteContainer.innerHTML = `<span class="cursor-block" aria-hidden="true"></span>`;
        setRandomQuote();
      }
    }
  });
}

/**
 * Handles keydown events for all keyboard shortcuts.
 * Guarded actions (N, P, B, V, X, U, L, E) go through withProcessing.
 * Unguarded actions (C, ?, R) fire immediately without debounce.
 *
 * @param {KeyboardEvent} event
 */
function handleKeyPress(event) {
  if (state.booting) return;

  // Mode intercepts — capture all input before normal routing
  if (state.helpMode) {
    exitHelp();
    return;
  }
  if (state.searchMode) {
    event.preventDefault();
    handleSearchKey(event);
    return;
  }
  if (state.bookmarkListMode) {
    event.preventDefault();
    handleBookmarkListKey(event);
    return;
  }
  if (state.quoteListMode) {
    event.preventDefault();
    handleQuoteListKey(event);
    return;
  }
  if (state.clockMode) {
    exitClockMode();
    return;
  }

  const key = event.key.toLowerCase();

  if (event.key === " ") {
    event.preventDefault();
    handleClick(event);
    return;
  }

  // Shift+V — bookmark list view (checked before plain v in guardedActions)
  if (event.shiftKey && key === "v") {
    showBookmarkList();
    return;
  }

  const guardedActions = {
    n: () => {
      if (!state.isPaused || state.isTyping) return;
      advanceToNextQuote();
    },
    p: () => {
      if (!state.isPaused || state.isTyping) return;
      const prev = goBackInHistory();
      if (prev) {
        displayQuoteWithTransition(prev, 0, true, null, true);
        QuoteUtils.announceAction("Previous quote");
      }
    },
    x: () => shareQuoteOnTwitter(),
    u: () => toggleTextCase(),
    b: () => {
      if (state.currentQuote) toggleBookmark();
    },
    w: () => enterClockMode(),
    q: () => showQuoteOfTheDay(),
    l: () => {
      if (state.currentQuote) copyShareableURL();
    },
    e: () => exportBookmarksAsJSON(),
  };

  // Unguarded — no debounce needed
  if (key === "c" && state.currentQuote) {
    copyCurrentQuote();
    return;
  }
  if (event.key === "?") {
    showHelp();
    return;
  }
  if (event.key === "/") {
    enterSearchMode();
    return;
  }
  if (key === "r") {
    location.reload();
    return;
  }

  if (guardedActions[key]) {
    withProcessing(guardedActions[key]);
  }
}

// =========================================
// MOBILE GESTURE HANDLERS
// =========================================

/**
 * Records the start position and time of a touch, and arms the long-press timer.
 * Long press (LONG_PRESS_MS) triggers share on Twitter/X.
 *
 * @param {TouchEvent} event
 */
function handleSwipeStart(event) {
  state.touchStartTime = Date.now();

  if (event.touches && event.touches.length === 1) {
    state.touchStartX = event.touches[0].clientX;
    state.touchStartY = event.touches[0].clientY;

    state.longPressTimer = setTimeout(() => {
      if (state.currentQuote) {
        shareQuoteOnTwitter();
        QuoteUtils.announceAction("Sharing quote on X");
      }
    }, LONG_PRESS_MS);
  }
}

/**
 * Resolves the swipe direction on touchend and dispatches the appropriate action.
 * Swipe left → next quote, swipe right → previous quote (when paused).
 * Swipe up → mobile gesture help, swipe down → copy share link.
 * No-ops if the touch duration exceeded the long-press threshold.
 *
 * @param {TouchEvent} event
 */
function handleSwipeEnd(event) {
  if (state.longPressTimer) {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
  }

  const touchDuration = Date.now() - state.touchStartTime;
  if (!event.changedTouches || event.changedTouches.length !== 1) return;
  if (touchDuration >= LONG_PRESS_MS) return;

  const endX = event.changedTouches[0].clientX;
  const endY = event.changedTouches[0].clientY;
  const diffX = state.touchStartX - endX;
  const diffY = state.touchStartY - endY;

  if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_MIN_PX) {
    if (diffX > 0) {
      if (state.isPaused && !state.isTyping) advanceToNextQuote();
    } else {
      if (state.isPaused && !state.isTyping) {
        const prev = goBackInHistory();
        if (prev) {
          displayQuoteWithTransition(prev, 0, true, null, true);
          QuoteUtils.announceAction("Previous quote");
        }
      }
    }
  }

  if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > SWIPE_MIN_PX) {
    if (diffY > 0) {
      showMobileHelp();
    } else {
      if (state.currentQuote) copyShareableURL();
    }
  }
}

// =========================================
// MOUSE WHEEL NAVIGATION
// =========================================

/**
 * Navigates quotes on mouse wheel scroll with momentum accumulation.
 * Scroll down → next quote, scroll up → back in history.
 * Only acts when the quote is parked. Respects WHEEL_COOLDOWN_MS between changes.
 *
 * Passive listener (no preventDefault) — body overflow:clip already prevents
 * page scrolling, so we don't need to block the compositor thread.
 *
 * @param {WheelEvent} event
 */
function handleWheelNavigation(event) {
  const currentTime = Date.now();
  if (currentTime - state.lastWheelTime < WHEEL_COOLDOWN_MS) return;
  if (state.isTyping || state.isProcessing) return;

  state.wheelDelta += event.deltaY;

  if (state.wheelTimeout) clearTimeout(state.wheelTimeout);

  state.wheelTimeout = setTimeout(() => {
    state.wheelTimeout = null;
    if (Math.abs(state.wheelDelta) >= WHEEL_THRESHOLD) {
      state.lastWheelTime = Date.now();

      if (state.isPaused && !state.isTyping) {
        if (state.wheelDelta < 0) {
          const prev = goBackInHistory();
          if (prev) {
            displayQuoteWithTransition(prev, 0, true, null, true);
            QuoteUtils.announceAction("Previous quote");
          }
        } else {
          advanceToNextQuote();
        }
      }
    }
    state.wheelDelta = 0;
  }, WHEEL_DEBOUNCE_MS);
}

// =========================================
// INITIALIZATION
// =========================================

document.addEventListener("DOMContentLoaded", () => {
  // Pause all CSS animations when the tab is hidden — saves CPU
  document.addEventListener("visibilitychange", () => {
    document.body.classList.toggle("tab-hidden", document.hidden);
  });

  // Sync bookmark counter when another tab adds/removes bookmarks
  window.addEventListener("storage", (e) => {
    if (e.key === "bookmarked-quotes") {
      try {
        state.bookmarkedQuotes = JSON.parse(e.newValue || "[]");
      } catch (_) {
        state.bookmarkedQuotes = [];
      }
      QuoteUtils.updateBookmarkCounter();
    }
  });

  document.body.addEventListener("click", handleClick, { passive: false });
  document.body.addEventListener("keydown", handleKeyPress, { passive: false });
  document.body.addEventListener("touchstart", handleSwipeStart, {
    passive: true,
  });
  document.body.addEventListener("touchend", handleSwipeEnd, { passive: true });

  // passive: true — body overflow:clip blocks page scroll so we don't need
  // event.preventDefault(). Passive listeners unblock the compositor thread.
  document.addEventListener("wheel", handleWheelNavigation, { passive: true });

  loadQuotes().then(() => {
    const loadedFromURL = checkURLQuote();
    if (loadedFromURL) {
      state.booting = false;
      setTimeout(
        () => PerformanceUtils.preloadNextQuote(),
        URL_PRELOAD_DELAY_MS,
      );
      QuoteUtils.updateBookmarkCounter();
      return;
    }

    runBootSequence(() => {
      state.booting = false;
      setRandomQuote();
      setTimeout(
        () => PerformanceUtils.preloadNextQuote(),
        URL_PRELOAD_DELAY_MS,
      );
      QuoteUtils.updateBookmarkCounter();

      // Chromatic aberration flash — fires once after boot, same mechanism
      // as the theme-switch flash in colours.js. Simulates the deflection
      // coil settling after the tube warms up and starts driving the beam.
      if (!config.performanceMode) {
        const container = elements.quoteContainer;
        container.classList.remove("crt-switch");
        void container.offsetWidth;
        container.classList.add("crt-switch");
        container.addEventListener(
          "animationend",
          () => container.classList.remove("crt-switch"),
          { once: true },
        );
      }

      // Random interference — a subtle brightness spike every 3–7 minutes.
      // Simulates EMI, deflection circuit hiccup, or mains noise.
      if (!config.performanceMode) {
        scheduleInterference();
      }


      // Help icon hint — single phosphor swell after boot to surface discoverability.
      // Fires once, removes itself on completion, never repeats.
      if (!config.performanceMode) {
        const helpTrigger = document.querySelector(".help-trigger");
        if (helpTrigger) {
          helpTrigger.classList.add("help-hint");
          helpTrigger.addEventListener(
            "animationend",
            () => helpTrigger.classList.remove("help-hint"),
            { once: true },
          );
        }
      }
    });
  });
});
