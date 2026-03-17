// =========================================
// CONFIGURATION
// =========================================

/*
  Per-terminal baud rates — sourced from real hardware specs.
  Each character on a serial terminal takes exactly 10 bit-times at the
  configured baud rate (1 start + 7/8 data + 1/2 stop bits; 8N1 = 10 bits).
  ms per character = 10000 / baud.

  IBM 3279:     9600 baud — 3274 controller default (EBCDIC async mode)
  DEC VT220:    9600 baud — factory default; user-configurable up to 19200
  PET 2001:     300  baud — Commodore serial IEC bus, BASIC PRINT output
  Bitcoin orange: 9600 baud — same IBM 3279 chassis
  Wyse WY-50:   9600 baud — RS-232 default, common Wall Street config
  Zenith Z-19:  9600 baud — CP/M BIOS default
  ADM-3A:       9600 baud — RS-232, common Unix lab config
  Kaypro II:    9600 baud — CP/M BIOS default
  DEC VT05:     2400 baud — pre-RS-232 era; teletype-speed default
  DEC VT100:    9600 baud — factory default; famously slow at large redraws
  Apple II:     9600 baud — Super Serial Card default
  Commodore 64: 1200 baud — user-port modem, BASIC print loop timing
*/
const themeBaudRates = {
  'ibm3279-green':          9600,
  'teletype-blue-green':    9600,
  'pet2001-green':          300,
  'ibm3279-bitcoin-orange': 9600,
  'wyse50-amber':           9600,
  'zenith-green':           9600,
  'adm3a-green':            9600,
  'kaypro-green':           9600,
  'white':                  2400,
  'vt100-amber':            9600,
  'apple2-green':           9600,
  'commodore64':            1200,
};

/*
  Per-theme auto-advance pause — how long the cursor sits parked after a
  quote before the next one loads. Reflects the overall *feel* of each
  machine: a VT100 operator on a loaded VAX felt the system's latency
  everywhere; a C64 BASIC prompt held longer between outputs.

  These are not sourced from a single spec — they're editorial pacing
  decisions calibrated to the baud rate and character of each terminal.
*/
const themePauseDurations = {
  'ibm3279-green':          2800,
  'teletype-blue-green':    2500,
  'pet2001-green':          4000,  // 300 baud — everything is slow
  'ibm3279-bitcoin-orange': 2800,
  'wyse50-amber':           2500,
  'zenith-green':           2800,
  'adm3a-green':            2500,
  'kaypro-green':           2800,
  'white':                  3500,  // VT05 teletype era — deliberate pace
  'vt100-amber':            4200,  // VT100: languid blink, languid feel
  'apple2-green':           2800,
  'commodore64':            3800,  // 1200 baud — BASIC output is leisurely
};

function getThemeBaudRate() {
  for (const theme of Object.keys(themeBaudRates)) {
    if (document.body.classList.contains(`theme-${theme}`)) {
      return themeBaudRates[theme];
    }
  }
  return 9600;
}

function getThemePauseDuration() {
  for (const theme of Object.keys(themePauseDurations)) {
    if (document.body.classList.contains(`theme-${theme}`)) {
      return themePauseDurations[theme];
    }
  }
  return 3000;
}

const config = {
  cacheExpiry: 24 * 60 * 60 * 1000, // 24 hours in ms
  performanceMode: window.matchMedia('(prefers-reduced-motion: reduce)').matches
};

// =========================================
// STATE MANAGEMENT
// =========================================
const HISTORY_SIZE = 20; // How many recent quotes to avoid repeating

const state = {
  quotes: null, // All loaded quotes
  isPaused: false, // Typing pause state
  timeoutId: null, // Current timeout ID for typing ticks
  parkTimeoutId: null, // Pause-between-quotes timer — isolated from cancelAnimation
  currentQuote: null, // Currently displayed quote
  currentIndex: 0, // Current typing position
  isTyping: false, // Typing in progress
  isProcessing: false, // Prevent double-clicks
  isUppercase: false, // Text case mode
  preloadedQuote: null, // Next quote preloaded
  preloadedAuthorHTML: null, // Preformatted author HTML
  animationFrameId: null, // For requestAnimationFrame
  bookmarkedQuotes: JSON.parse(localStorage.getItem('bookmarked-quotes') || '[]'),
  currentBookmarkIndex: 0, // Position in bookmark list
  quoteHistory: [],    // Recently shown quotes for back-navigation
  historyPosition: -1, // Current position when navigating back
  booting: true, // Block input during boot sequence
};

// =========================================
// DOM ELEMENTS
// =========================================
const elements = {
  quoteContainer: document.getElementById('quote-container'),
  errorMessage: document.getElementById('error-message')
};

// =========================================
// DEVICE DETECTION
// =========================================

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || 'ontouchstart' in window
  || navigator.maxTouchPoints > 0;

// Wraps any action that should be debounced via state.isProcessing.
// Sets the flag before calling fn, clears it 100ms after — same timing
// as all the manual setTimeout calls it replaces.
function withProcessing(fn) {
  if (state.isProcessing) return;
  state.isProcessing = true;
  try { fn(); } finally {
    setTimeout(() => { state.isProcessing = false; }, 100);
  }
}

// =========================================
// QUOTE UTILITIES
// =========================================
const QuoteUtils = {
  // Format quote with quotation marks
  getQuoteText: quote => `"${quote?.text?.trim() || 'No quote available'}"`,
  
  // Format quote for Twitter/X sharing (strips markdown links)
  getTweetText: quote => `"${quote.text}" — ${quote.author.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1').trim()}`,
  
  // Announce action to screen readers
  announceAction: (message) => {
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('class', 'sr-only');
    liveRegion.textContent = message;
    document.body.appendChild(liveRegion);
    setTimeout(() => liveRegion.remove(), 1000);
  },
  
  // ms per character at the active theme's baud rate.
  // 8N1 serial framing = 10 bits per character; ms = 10000 / baud.
  // Clamped to a 300ms floor so even 300-baud PET output isn't unreadable.
  getMsPerChar: () => {
    if (config.performanceMode) return 0;
    return Math.min(300, Math.round(10000 / getThemeBaudRate()));
  },
  
  // Update bookmark counter badge in top-left corner
  updateBookmarkCounter: () => {
    let counter = document.querySelector('.bookmark-counter');
    const bookmarkCount = state.bookmarkedQuotes.length;
    
    if (bookmarkCount === 0) {
      if (counter) {
        counter.classList.add('hidden');
        setTimeout(() => counter.remove(), 300);
      }
      return;
    }
    
    if (!counter) {
      counter = document.createElement('div');
      counter.className = 'bookmark-counter';
      document.body.appendChild(counter);
    }
    
    // Show count with heart indicator if current quote is bookmarked
    const isCurrentBookmarked = state.currentQuote && isQuoteBookmarked(state.currentQuote);
    counter.innerHTML = isCurrentBookmarked 
      ? `<span class="count">${bookmarkCount}</span><span class="heart">*</span>` 
      : `<span class="count">${bookmarkCount}</span>`;
    counter.classList.remove('hidden');
  }
};

// =========================================
// PERFORMANCE UTILITIES
// =========================================
const PerformanceUtils = {
  // Preload next quote in background for instant display
  preloadNextQuote: async () => {
    if (state.preloadedQuote) return;

    const quotes = await loadQuotes();
    if (!quotes.length) return;

    const randomQuote = getRandomQuote(quotes);
    if (!randomQuote) return;
    
    // Pre-format author HTML
    const preformattedAuthor = PerformanceUtils.formatAuthor(randomQuote.author);
    
    state.preloadedQuote = randomQuote;
    state.preloadedAuthorHTML = preformattedAuthor;
  },
  
  // Get next quote (preloaded if available, otherwise fetch)
  getNextQuote: async () => {
    if (state.preloadedQuote) {
      const quote = state.preloadedQuote;
      const authorHTML = state.preloadedAuthorHTML;
      
      state.preloadedQuote = null;
      state.preloadedAuthorHTML = null;
      
      // Start preloading next quote
      setTimeout(() => PerformanceUtils.preloadNextQuote(), 100);
      
      return { quote, authorHTML };
    }
    
    // Fallback if no preloaded quote
    const quotes = await loadQuotes();
    if (!quotes.length) return null;

    const randomQuote = getRandomQuote(quotes);
    if (!randomQuote) return null;
    
    const authorHTML = PerformanceUtils.formatAuthor(randomQuote.author);
    setTimeout(() => PerformanceUtils.preloadNextQuote(), 100);
    
    return { quote: randomQuote, authorHTML };
  },
  
  // Format author text with markdown links and @handles
  formatAuthor: (author) => {
    const cleanAuthor = String(author).replace(/^"|"$/g, '').trim();
    const span = document.createElement('span');
    let currentText = cleanAuthor;
    
    // Parse [text](url) markdown links
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    let lastIndex = 0;
    let match;
    
    while ((match = linkRegex.exec(cleanAuthor)) !== null) {
      span.appendChild(document.createTextNode(currentText.slice(lastIndex, match.index)));
      const a = document.createElement('a');
      a.href = match[2];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = match[1];
      a.setAttribute('aria-label', `Visit ${match[1]}'s website`);
      span.appendChild(a);
      lastIndex = linkRegex.lastIndex;
    }
    
    span.appendChild(document.createTextNode(currentText.slice(lastIndex)));
    
    // Convert @handles to Twitter/X links
    const finalHtml = span.innerHTML.replace(
      /@(\w+)/g,
      '<a href="https://x.com/$1" target="_blank" rel="noopener noreferrer" aria-label="Visit $1\'s Twitter profile">@$1</a>'
    );
    
    return finalHtml;
  },
  
  // Use requestAnimationFrame for short delays, setTimeout for longer
  optimizedDelay: (callback, delay) => {
    if (config.performanceMode) {
      return setTimeout(callback, 0);
    }
    
    if (delay < 16) {
      state.animationFrameId = requestAnimationFrame(callback);
      return state.animationFrameId;
    } else {
      return setTimeout(callback, delay);
    }
  },
  
  // Cancel any pending animations or timeouts
  cancelAnimation: () => {
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
  },
  
  // Auto-scroll quote container for long quotes.
  // Real terminals scrolled by shifting the screen buffer up one line
  // when output reached the bottom row. The shift was discrete — the
  // entire display jumped up by exactly one character row, not by
  // arbitrary pixel amounts. Snapping to line-height multiples
  // reproduces this: the view holds steady while text fills the
  // current line, then jumps up by one row when a new line starts.
  handleAutoScroll: () => {
    const container = elements.quoteContainer;
    const maxVisible = container.clientHeight;
    const contentHeight = container.scrollHeight;

    if (contentHeight > maxVisible) {
      const lineHeight = parseFloat(getComputedStyle(container).lineHeight);
      const targetScroll = contentHeight - maxVisible;
      // Snap to nearest whole-line boundary — discrete line scroll
      const lineSnapped = Math.ceil(targetScroll / lineHeight) * lineHeight;
      container.scrollTop = lineSnapped;
    }
  }
};

// =========================================
// QUOTE HISTORY & DEDUPLICATION
// =========================================

function pushToHistory(quote) {
  // If we navigated back and now go forward, truncate forward history
  if (state.historyPosition >= 0 && state.historyPosition < state.quoteHistory.length - 1) {
    state.quoteHistory = state.quoteHistory.slice(0, state.historyPosition + 1);
  }
  state.quoteHistory.push(quote);
  if (state.quoteHistory.length > HISTORY_SIZE * 2) {
    state.quoteHistory = state.quoteHistory.slice(-HISTORY_SIZE * 2);
  }
  state.historyPosition = state.quoteHistory.length - 1;
}

function goBackInHistory() {
  if (state.historyPosition <= 0) return null;
  state.historyPosition--;
  return state.quoteHistory[state.historyPosition];
}

function getRandomQuote(quotes) {
  if (!quotes?.length) return null;

  const recentKeys = new Set(
    state.quoteHistory.slice(-HISTORY_SIZE).map(q => q.text)
  );

  const pool = quotes.filter(q => !recentKeys.has(q.text));
  const source = pool.length > 0 ? pool : quotes;
  return source[Math.floor(Math.random() * source.length)];
}



// Load quotes from JSON with 24hr caching
async function loadQuotes() {
  const cachedData = localStorage.getItem('bitcoin-quotes');
  const cachedTimestamp = localStorage.getItem('bitcoin-quotes-timestamp');

  if (cachedData && cachedTimestamp && (Date.now() - Number(cachedTimestamp)) < config.cacheExpiry) {
    state.quotes = JSON.parse(cachedData);
    return state.quotes;
  }

  try {
    const response = await fetch('data/bitcoin_quotes.json');
    if (!response.ok) throw new Error('Failed to fetch JSON');
    
    state.quotes = await response.json();
    
    if (!Array.isArray(state.quotes) || !state.quotes.every(isValidQuote)) {
      throw new Error('Invalid JSON format');
    }

    localStorage.setItem('bitcoin-quotes', JSON.stringify(state.quotes));
    localStorage.setItem('bitcoin-quotes-timestamp', Date.now().toString());

    return state.quotes;
  } catch (error) {
    console.error('Error loading quotes:', error);
    elements.errorMessage.textContent = '*** ERROR: HOUSTON WE HAVE A PROBLEM';
    elements.errorMessage.classList.add('error-active');
    return [];
  }
}

// Validate quote has required text and author fields
function isValidQuote(quote) {
  return quote && typeof quote === 'object' && typeof quote.text === 'string' && quote.text.trim() && typeof quote.author === 'string' && quote.author.trim();
}

// =========================================
// USER ACTIONS
// =========================================

// Copy current quote to clipboard
function copyCurrentQuote() {
  if (!state.currentQuote) return;
  const text = QuoteUtils.getTweetText(state.currentQuote);
  navigator.clipboard.writeText(text).then(() => {
    QuoteUtils.announceAction('Quote copied to clipboard');
    showToast('quote copied');
  }).catch(err => {
    console.error('Failed to copy:', err);
    QuoteUtils.announceAction('Failed to copy quote');
  });
}

// =========================================
// URL SHARING
// =========================================

// Find the index of the current quote in the loaded quotes array
function getCurrentQuoteIndex() {
  if (!state.currentQuote || !state.quotes) return -1;
  return state.quotes.findIndex(
    q => q.text === state.currentQuote.text && q.author === state.currentQuote.author
  );
}

// Copy a shareable URL for the current quote to clipboard (?q=INDEX)
function copyShareableURL() {
  if (!state.currentQuote) return;
  const index = getCurrentQuoteIndex();
  if (index === -1) {
    QuoteUtils.announceAction('Failed to generate share link');
    return;
  }
  const url = `${location.origin}${location.pathname}?q=${index}`;
  navigator.clipboard.writeText(url).then(() => {
    QuoteUtils.announceAction('Share link copied to clipboard');
    showToast('link copied');
  }).catch(() => {
    QuoteUtils.announceAction('Failed to copy share link');
  });
}

// Check on load if a ?q= param is present and display that quote
function checkURLQuote() {
  const params = new URLSearchParams(location.search);
  const param = params.get('q');
  if (param === null) return false;

  const index = parseInt(param, 10);
  if (isNaN(index) || !state.quotes || index < 0 || index >= state.quotes.length) return false;

  const quote = state.quotes[index];
  if (!isValidQuote(quote)) return false;

  // Display immediately, fully rendered, paused
  state.isPaused = true;
  displayQuoteWithTransition(quote, 0, true);

  // Clean URL without reloading
  history.replaceState(null, '', location.pathname);
  return true;
}

// =========================================
// BOOKMARK EXPORT
// =========================================

// Export bookmarks as a downloaded JSON file
function exportBookmarksAsJSON() {
  if (state.bookmarkedQuotes.length === 0) {
    QuoteUtils.announceAction('No bookmarks to export');
    showToast('no bookmarks saved');
    return;
  }

  const data = {
    exported: new Date().toISOString(),
    source: 'blockquotes.sh',
    count: state.bookmarkedQuotes.length,
    quotes: state.bookmarkedQuotes.map(q => ({
      text: q.text,
      author: q.author,
      bookmarkedAt: q.bookmarkedAt ? new Date(q.bookmarkedAt).toISOString() : null
    }))
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blockquotes-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  QuoteUtils.announceAction(`Exported ${state.bookmarkedQuotes.length} bookmarks`);
  showToast(`exported ${state.bookmarkedQuotes.length} bookmarks`);
}

// =========================================
// STATUS LINE
// =========================================

let _statusTimer = null;

function showToast(message) {
  if (_statusTimer) {
    clearTimeout(_statusTimer);
    _statusTimer = null;
  }

  let el = document.querySelector('.bq-status');
  if (!el) {
    el = document.createElement('div');
    el.className = 'bq-status';
    document.body.appendChild(el);
  }

  const prompt = getThemePrompt() || '>';
  el.textContent = `${prompt} ${message}`;
  el.classList.remove('hidden');

  _statusTimer = setTimeout(() => {
    el.classList.add('hidden');
    _statusTimer = null;
  }, 2200);
}

// Toggle between uppercase and lowercase text
function toggleTextCase() {
  state.isUppercase = !state.isUppercase;
  const textTransform = state.isUppercase ? 'uppercase' : 'none';
  elements.quoteContainer.style.textTransform = textTransform;
  const authorElement = elements.quoteContainer.querySelector('.author');
  if (authorElement) {
    authorElement.style.textTransform = textTransform;
  }
  QuoteUtils.announceAction(`Text case set to ${state.isUppercase ? 'uppercase' : 'lowercase'}`);
}

// =========================================
// BOOKMARK SYSTEM
// =========================================

// Toggle bookmark for current quote
function toggleBookmark() {
  if (!state.currentQuote) return;
  
  const isCurrentlyBookmarked = isQuoteBookmarked(state.currentQuote);
  
  if (isCurrentlyBookmarked) {
    state.bookmarkedQuotes = state.bookmarkedQuotes.filter(bookmarked =>
      !(bookmarked.text === state.currentQuote.text && bookmarked.author === state.currentQuote.author)
    );
    QuoteUtils.announceAction('Quote unbookmarked');
    showToast('bookmark removed');
    elements.quoteContainer.classList.remove('bookmarked');
    
    // Reset bookmark index to prevent pointing to invalid position
    if (state.currentBookmarkIndex >= state.bookmarkedQuotes.length) {
      state.currentBookmarkIndex = Math.max(0, state.bookmarkedQuotes.length - 1);
    }
  } else {
    state.bookmarkedQuotes.push({
      text: state.currentQuote.text,
      author: state.currentQuote.author,
      bookmarkedAt: Date.now()
    });
    QuoteUtils.announceAction('Quote bookmarked');
    showToast('bookmarked *');
    elements.quoteContainer.classList.add('bookmarked');
  }
  
  localStorage.setItem('bookmarked-quotes', JSON.stringify(state.bookmarkedQuotes));
  QuoteUtils.updateBookmarkCounter();
}

// Check if quote is bookmarked
function isQuoteBookmarked(quote) {
  return state.bookmarkedQuotes.some(bookmarked =>
    bookmarked.text === quote.text && bookmarked.author === quote.author
  );
}

// Navigate to next bookmarked quote
function viewNextBookmarkedQuote() {
  if (state.bookmarkedQuotes.length === 0) {
    QuoteUtils.announceAction('No bookmarked quotes yet. Press B to bookmark the current quote.');
    return;
  }
  
  const bookmarkedQuote = state.bookmarkedQuotes[state.currentBookmarkIndex];
  
  state.currentBookmarkIndex = (state.currentBookmarkIndex + 1) % state.bookmarkedQuotes.length;
  
  displayQuoteWithTransition(bookmarkedQuote, 0, true);
  
  const totalBookmarks = state.bookmarkedQuotes.length;
  const currentPosition = state.currentBookmarkIndex === 0 ? totalBookmarks : state.currentBookmarkIndex;
  QuoteUtils.announceAction(`Viewing bookmark ${currentPosition} of ${totalBookmarks}`);
}

// =========================================
// QUOTE DISPLAY WITH TRANSITIONS
// =========================================

// Display a quote — clear immediately and let the typing engine serve as the transition.
// Real terminals don't fade or slide; the beam simply stops writing old content
// and starts writing new content. The character-by-character typing IS the transition.
function displayQuoteWithTransition(quote, startIndex = 0, finishImmediately = false, preformattedAuthor = null, skipHistory = false) {
  PerformanceUtils.cancelAnimation();
  elements.quoteContainer.innerHTML = '';
  displayQuote(quote, startIndex, finishImmediately, preformattedAuthor, skipHistory);
}

// Core typing effect display with character-by-character animation
function displayQuote(quote, startIndex = 0, finishImmediately = false, preformattedAuthor = null, skipHistory = false) {
  if (!isValidQuote(quote)) {
    console.warn('Tried to display invalid quote:', quote);
    setRandomQuote();
    return;
  }

  state.currentQuote = quote;
  if (!skipHistory) pushToHistory(quote); // #5 track history for back-navigation
  const quoteText = QuoteUtils.getQuoteText(quote);
  state.currentIndex = startIndex;
  state.isTyping = true;
  
  // Add bookmark indicator if quote is bookmarked
  if (isQuoteBookmarked(quote)) {
    elements.quoteContainer.classList.add('bookmarked');
  } else {
    elements.quoteContainer.classList.remove('bookmarked');
  }
  
  // Update bookmark counter to show/hide heart
  QuoteUtils.updateBookmarkCounter();
  
  const authorHTML = preformattedAuthor || PerformanceUtils.formatAuthor(quote.author);

  // Plain text for character-by-character author typing.
  // Strip markdown links [text](url) → text and surrounding quotes.
  const authorPlain = String(quote.author)
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/^"|"$/g, '')
    .trim();
  // NOTE: prompt is intentionally NOT frozen at displayQuote call time.
  // getAuthorTypingText() re-reads getThemePrompt() on every tick so a
  // mid-type theme change is reflected immediately — the new prompt character
  // appears on the very next typed character rather than waiting until
  // renderParked() fires at the end of Phase 2.
  function getAuthorTypingText() {
    const livePrompt = getThemePrompt();
    return livePrompt ? `${livePrompt} ${authorPlain}` : authorPlain;
  }

  // Render the final parked state: quote body + fully-linked author + blinking cursor.
  function renderParked() {
    try {
      elements.quoteContainer.innerHTML =
        `<span class="text-selected">${quoteText}</span>` +
        `<span class="author">${getThemePrompt() ? getThemePrompt() + ' ' : ''}<span class="author-name">${authorHTML}</span> ` +
        `<span class="cursor-block" aria-hidden="true"></span></span>`;
      elements.quoteContainer.style.textTransform = state.isUppercase ? 'uppercase' : 'none';
      const authorElement = elements.quoteContainer.querySelector('.author');
      if (authorElement) authorElement.style.textTransform = state.isUppercase ? 'uppercase' : 'none';
    } catch (e) {
      console.error('Error rendering quote:', e, { quoteText, quote });
      elements.quoteContainer.textContent = 'Error displaying quote';
      elements.errorMessage.classList.add('error-active');
    }
  }

  function typeQuote() {
    const msPerChar = QuoteUtils.getMsPerChar();
    const finishNow = finishImmediately || msPerChar === 0 || state.isPaused;

    // Show everything immediately if skip requested or reduced motion
    if (finishNow) {
      renderParked();
      state.currentIndex = quoteText.length;
      state.isTyping = false;
      state.isPaused = true;
      return;
    }

    // Phase 1 — type the quote body character by character
    if (state.currentIndex < quoteText.length) {
      if (state.currentIndex === 0) {
        elements.quoteContainer.innerHTML = '<span class="cursor-block" aria-hidden="true"></span>';
      }

      const typedText = quoteText.slice(0, state.currentIndex + 1);
      elements.quoteContainer.innerHTML =
        `<span class="text-selected">${typedText}</span>` +
        `<span class="cursor-block" aria-hidden="true"></span>`;

      PerformanceUtils.handleAutoScroll();

      state.currentIndex++;
      // Punctuation pauses — presentation layer only, not a hardware property.
      // A real terminal delivered every byte at the same interval; these pauses
      // exist purely to give the reader's eye a beat at sentence boundaries.
      const justTyped = quoteText[state.currentIndex - 1];
      const punctuationDelay = /[.!?]/.test(justTyped) ? 180 : /[,;:]/.test(justTyped) ? 60 : 0;
      state.timeoutId = PerformanceUtils.optimizedDelay(typeQuote, msPerChar + punctuationDelay);

    // Phase 2 — type the author line character by character (plain text)
    } else if (state.currentIndex < quoteText.length + getAuthorTypingText().length) {
      const authorIndex = state.currentIndex - quoteText.length;
      const authorTypingText = getAuthorTypingText();
      const typedAuthor = authorTypingText.slice(0, authorIndex + 1);

      elements.quoteContainer.innerHTML =
        `<span class="text-selected">${quoteText}</span>` +
        `<span class="author">${typedAuthor}<span class="cursor-block" aria-hidden="true"></span></span>`;

      elements.quoteContainer.style.textTransform = state.isUppercase ? 'uppercase' : 'none';
      PerformanceUtils.handleAutoScroll();

      state.currentIndex++;
      const justTyped = authorTypingText[authorIndex];
      const punctuationDelay = /[.!?]/.test(justTyped) ? 120 : /[,;:]/.test(justTyped) ? 40 : 0;
      state.timeoutId = PerformanceUtils.optimizedDelay(typeQuote, msPerChar + punctuationDelay);

    // Phase 3 — author done: swap plain text for linked HTML, park cursor
    } else {
      renderParked();
      state.isTyping = false;
      state.isPaused = true;

      state.parkTimeoutId = setTimeout(() => {
        state.parkTimeoutId = null;
        state.isPaused = false;
        elements.quoteContainer.innerHTML =
          `<span class="cursor-block" aria-hidden="true"></span>`;
        setRandomQuote();
      }, getThemePauseDuration());
    }
  }

  typeQuote();
}

// Load and display a random quote
async function setRandomQuote() {
  if (state.isPaused) return;
  
  try {
    const result = await PerformanceUtils.getNextQuote();
    
    if (!result) {
      elements.quoteContainer.textContent = 'No quotes available';
      elements.errorMessage.textContent = '*** ERROR: NO VALID QUOTES AVAILABLE';
      elements.errorMessage.classList.add('error-active');
      return;
    }
    
    const { quote, authorHTML } = result;
    displayQuote(quote, 0, false, authorHTML);
  } catch (error) {
    console.error('Error loading quote:', error);
    elements.errorMessage.textContent = '*** ERROR: FAILED TO LOAD QUOTES';
    elements.errorMessage.classList.add('error-active');
  }
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
  function getLNURL() {
    const bolt = document.querySelector('.bolt-link');
    if (!bolt) return null;
    // href is "lightning:LNURL1..." — strip the scheme, uppercase per convention
    return (bolt.getAttribute('href') || '').replace(/^lightning:/i, '').toUpperCase();
  }

  async function handleBoltClick(event) {
    const lnurl = getLNURL();
    if (!lnurl) return;

    // Tier 1 — WebLN
    if (window.webln) {
      event.preventDefault();
      try {
        await window.webln.enable();
        await window.webln.lnurl(lnurl);
        showToast('⚡ payment sent');
      } catch (e) {
        const cancelled = /reject|cancel/i.test(e?.message || '');
        showToast(cancelled ? '⚡ cancelled' : '⚡ webln error');
      }
      return;
    }

    // Tier 2 — Mobile: let the lightning: href fire natively
    if (isMobile) return;

    // Tier 3 — Desktop: copy LNURL, confirm via toast
    event.preventDefault();
    const short = lnurl.slice(0, 18) + '…';
    navigator.clipboard.writeText(lnurl)
      .then(() => showToast(`⚡ ${short} [copied]`))
      .catch(() => showToast('⚡ copy failed'));
  }

  return { handleBoltClick };
})();

// =========================================
// BITCOIN ON-CHAIN TIP
// =========================================

/*
  Two-tier Bitcoin on-chain experience — mirrors Lightning pattern.

  Tier 1 — Mobile: native wallet handoff via bitcoin: URI.
           The <a> href fires natively, opening the user's wallet app
           with the address pre-filled. No JS intervention needed.
  Tier 2 — Desktop: copy address to clipboard, confirm via status line.
           Desktop browsers don't have bitcoin: URI handlers by default,
           so copying the address is the most useful action.
*/
const BitcoinTip = (() => {
  function getAddress() {
    const btc = document.querySelector('.btc-link');
    if (!btc) return null;
    return (btc.getAttribute('href') || '').replace(/^bitcoin:/i, '').split('?')[0];
  }

  function handleBtcClick(event) {
    const address = getAddress();
    if (!address) return;

    // Tier 1 — Mobile: let the bitcoin: href fire natively
    if (isMobile) return;

    // Tier 2 — Desktop: copy address, confirm via status line
    event.preventDefault();
    const short = address.slice(0, 10) + '…' + address.slice(-4);
    navigator.clipboard.writeText(address)
      .then(() => showToast(`₿ ${short} [copied]`))
      .catch(() => showToast('₿ copy failed'));
  }

  return { handleBtcClick };
})();

// =========================================
// EVENT HANDLERS
// =========================================

// Shared next-quote action used by keyboard, swipe, and wheel handlers.
function advanceToNextQuote() {
  const quotes = state.quotes;
  if (!quotes?.length) {
    elements.errorMessage.textContent = '*** ERROR: NO QUOTES AVAILABLE';
    elements.errorMessage.classList.add('error-active');
    return;
  }
  const next = getRandomQuote(quotes);
  if (next) displayQuoteWithTransition(next, 0, true);
  QuoteUtils.announceAction('Next quote displayed');
}

// Handle click to pause/resume or finish typing
function handleClick(event) {
  if (state.booting) return;

  // Intercept bolt clicks before the generic pause handler
  if (event.target.closest('.bolt-link')) {
    LightningTip.handleBoltClick(event);
    document.activeElement?.blur();
    return;
  }

  // Intercept bitcoin icon clicks — same pattern as lightning
  if (event.target.closest('.btc-link')) {
    BitcoinTip.handleBtcClick(event);
    document.activeElement?.blur();
    return;
  }

  withProcessing(() => {
    if (state.isTyping && !state.isPaused) {
      clearTimeout(state.timeoutId);
      displayQuote(state.currentQuote, state.currentIndex, true);
      QuoteUtils.announceAction('Typing finished');
    } else if (state.parkTimeoutId) {
      clearTimeout(state.parkTimeoutId);
      state.parkTimeoutId = null;
      state.isPaused = false;
      elements.quoteContainer.innerHTML = `<span class="cursor-block" aria-hidden="true"></span>`;
      setRandomQuote();
      QuoteUtils.announceAction('Next quote');
    } else {
      state.isPaused = !state.isPaused;
      QuoteUtils.announceAction(state.isPaused ? 'Paused' : 'Resumed');
      if (!state.isPaused) {
        clearTimeout(state.timeoutId);
        elements.quoteContainer.innerHTML = `<span class="cursor-block" aria-hidden="true"></span>`;
        setRandomQuote();
      }
    }
  });
}

// Share current quote on Twitter/X
function shareQuoteOnTwitter() {
  if (!state.currentQuote) return;
  // Use web intent on all platforms — the twitter:// app URI trick is blocked
  // by iOS Safari (programmatic .click() on a created element is not a user gesture).
  // x.com/intent/tweet works on all devices and opens the app if installed on mobile.
  const tweetText = QuoteUtils.getTweetText(state.currentQuote);
  const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
  window.open(tweetUrl, '_blank', 'noopener,noreferrer');
  QuoteUtils.announceAction('Opened share window');
}

// Keyboard shortcuts handler
function handleKeyPress(event) {
  if (state.booting) return;

  const key = event.key.toLowerCase();

  // Space: finish typing or advance — mirrors click handler
  if (event.key === ' ') {
    event.preventDefault();
    handleClick(event);
    return;
  }

  // Dispatch table — actions that need the isProcessing guard
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
        QuoteUtils.announceAction('Previous quote');
      }
    },
    x: () => {
      shareQuoteOnTwitter();
    },
    u: () => {
      toggleTextCase();
    },
    b: () => {
      if (state.currentQuote) toggleBookmark();
    },
    v: () => {
      if (!state.isPaused || state.isTyping) return;
      viewNextBookmarkedQuote();
    },
    l: () => {
      if (state.currentQuote) copyShareableURL();
    },
    e: () => {
      exportBookmarksAsJSON();
    },
  };

  // Ungarded actions — no debounce needed
  if (key === 'c' && state.currentQuote) { copyCurrentQuote(); return; }
  if (event.key === '?') { showHelp(); return; }
  if (key === 'r') { location.reload(); return; }

  if (guardedActions[key]) {
    withProcessing(guardedActions[key]);
  }
}

// =========================================
// MOBILE GESTURE HANDLERS
// =========================================

// Gesture state
let startX = 0;
let startY = 0;
let touchStartTime = 0;
let longPressTimer = null;

// Start tracking touch gesture
function handleSwipeStart(event) {
  touchStartTime = Date.now();
  
  if (event.touches && event.touches.length === 1) {
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    
    // Long press (800ms) = share on Twitter/X
    longPressTimer = setTimeout(() => {
      if (state.currentQuote) {
        shareQuoteOnTwitter();
        QuoteUtils.announceAction('Sharing quote on X');
      }
    }, 800);
  }
}

// Detect swipe direction and trigger action
function handleSwipeEnd(event) {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  
  const touchDuration = Date.now() - touchStartTime;
  
  if (!event.changedTouches || event.changedTouches.length !== 1) {
    return;
  }
  
  // Skip if long press was triggered
  if (touchDuration >= 800) return;
  
  const endX = event.changedTouches[0].clientX;
  const endY = event.changedTouches[0].clientY;
  const diffX = startX - endX;
  const diffY = startY - endY;
  
  const minSwipeDistance = 50;
  
  // Horizontal swipe: Swipe left = next quote, Swipe right = previous quote
  if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
    if (diffX > 0) {
      // Swipe left = next
      if (state.isPaused && !state.isTyping) {
        advanceToNextQuote();
      }
    } else {
      // Swipe right = back in history
      if (state.isPaused && !state.isTyping) {
        const prev = goBackInHistory();
        if (prev) {
          displayQuoteWithTransition(prev, 0, true, null, true);
          QuoteUtils.announceAction('Previous quote');
        }
      }
    }
  }
  
  // Vertical swipe: Swipe up = toggle uppercase, Swipe down = bookmark
  if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > minSwipeDistance) {
    if (diffY > 0) {
      toggleTextCase();
    } else {
      if (state.currentQuote) copyShareableURL();
    }
  }
}

// =========================================
// MOUSE WHEEL NAVIGATION
// =========================================

// Wheel state
let wheelDelta = 0;
let wheelTimeout = null;
let lastWheelTime = 0;
const WHEEL_THRESHOLD = 50; // Minimum scroll for quote change
const WHEEL_COOLDOWN = 400; // Minimum time between changes

// Navigate quotes with mouse wheel (with momentum)
function handleWheelNavigation(event) {
  event.preventDefault();
  
  const currentTime = Date.now();
  
  // Prevent rapid scrolling
  if (currentTime - lastWheelTime < WHEEL_COOLDOWN) {
    return;
  }
  
  // Skip during typing
  if (state.isTyping || state.isProcessing) {
    return;
  }
  
  // Accumulate scroll delta for momentum
  wheelDelta += event.deltaY;
  
  if (wheelTimeout) {
    clearTimeout(wheelTimeout);
  }
  
  // Process accumulated scroll after short delay
  wheelTimeout = setTimeout(() => {
    if (Math.abs(wheelDelta) >= WHEEL_THRESHOLD) {
      lastWheelTime = Date.now(); // capture fresh timestamp at execution time, not at event time

      if (state.isPaused && !state.isTyping) {
        if (wheelDelta < 0) {
          // Scroll up = go back in history
          const prev = goBackInHistory();
          if (prev) {
            displayQuoteWithTransition(prev, 0, true, null, true);
            QuoteUtils.announceAction('Previous quote');
          }
        } else {
          // Scroll down = next random quote
          advanceToNextQuote();
        }
      }
    }

    wheelDelta = 0;
  }, 100);
}

// =========================================
// BOOT SEQUENCE & THEME PROMPT
// =========================================

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
    DEC VT100      — VAX/VMS csh: '%'
    Apple II       — Applesoft BASIC: ']' (the iconic right-bracket)
    Commodore 64   — BASIC V2: '' (blank — cursor after READY.)
*/
const themePrompts = {
  'ibm3279-green':          '===>',
  'teletype-blue-green':    '$',
  'pet2001-green':          '',
  'ibm3279-bitcoin-orange': '===>',
  'wyse50-amber':           '$',
  'zenith-green':           'A>',
  'adm3a-green':            '%',
  'kaypro-green':           'A>',
  'white':                  '$',
  'vt100-amber':            '%',
  'apple2-green':           ']',
  'commodore64':            '',
};

function getThemePrompt() {
  const body = document.body;
  for (const theme of Object.keys(themePrompts)) {
    if (body.classList.contains(`theme-${theme}`)) {
      return themePrompts[theme];
    }
  }
  return '>';
}

/*
  Called by colours.js after every theme swap.
  If a quote is currently parked (cursor sitting in .author),
  patch the prompt text node in place without re-rendering the whole quote.
  The cursor keeps blinking — only the prompt character changes.
*/
function updateLivePrompt() {
  const author = elements.quoteContainer.querySelector('.author');
  if (!author) return;

  // Structure is always: [textNode: "{prompt} "] [span.author-name] [span.cursor-block]
  // OR when no prompt:   [span.author-name] [span.cursor-block]
  // Replace or insert/remove just the leading text node — never touch author-name or cursor.
  const newPrompt = getThemePrompt();
  const firstNode = author.firstChild;
  const isLeadingTextNode = firstNode && firstNode.nodeType === Node.TEXT_NODE;

  if (isLeadingTextNode) {
    // Update existing prompt text node (covers prompt→prompt and prompt→blank)
    firstNode.textContent = newPrompt ? `${newPrompt} ` : '';
    // If now blank, remove the empty text node to keep DOM clean
    if (!newPrompt) author.removeChild(firstNode);
  } else if (newPrompt) {
    // No leading text node yet (previous theme had blank prompt) — insert one
    const authorName = author.querySelector('.author-name');
    author.insertBefore(document.createTextNode(`${newPrompt} `), authorName);
  }
  // If no prompt before and no prompt now — nothing to do
}

// Type a single boot line into the container, then call done() when finished.
// previousLines: array of already-typed strings to show above the current line.
function typeBootLine(text, speed, done, previousLines) {
  let i = 0;
  const prev = (previousLines && previousLines.length)
    ? previousLines.map(l => `<span class="text-selected">${l}</span>`).join('\n') + '\n'
    : '';

  function tick() {
    elements.quoteContainer.innerHTML =
      prev +
      `<span class="text-selected">${text.slice(0, i + 1)}</span>` +
      `<span class="cursor-block" aria-hidden="true"></span>`;
    i++;
    if (i < text.length) {
      const justTyped = text[i - 1];
      const pd = /[.!?]/.test(justTyped) ? 120 : /[,;:]/.test(justTyped) ? 40 : 0;
      state.timeoutId = setTimeout(tick, speed + pd);
    } else {
      done();
    }
  }
  tick();
}

// Display keyboard shortcuts typed into the terminal, then resume.
// Reuses typeBootLine for visual consistency with the boot sequence.
// Header and command style are theme-aware — each OS had its own HELP idiom.
function showHelp() {
  if (state.booting) return;

  PerformanceUtils.cancelAnimation();
  state.isTyping = false;
  state.isPaused = true;

  /*
    HELP output style sourced from each OS/ROM:
      TSO/ISPF    — HELP command prints 'FUNCTION -' style headers, uppercase
      Unix sh     — 'usage:' lowercase, brief
      CP/M HELP   — uppercase, columnar
      BASIC ROM   — no HELP command; print a READY. prompt and list instead
      VAX/VMS     — HELP subsystem prints topic name then description
      Applesoft   — no HELP; we fake a catalog-style listing
  */
  const themeHelpHeaders = {
    'ibm3279-green':          'HELP - BLOCKQUOTES ISPF FUNCTION KEYS',
    'ibm3279-bitcoin-orange': 'HELP - BLOCKQUOTES ISPF FUNCTION KEYS',
    'teletype-blue-green':    'usage: blockquotes [key]',
    'wyse50-amber':           'usage: blockquotes [key]',
    'white':                  'usage: blockquotes [key]',
    'adm3a-green':            'usage: blockquotes [key]',
    'zenith-green':           'BLOCKQUOTES HELP',
    'kaypro-green':           'BLOCKQUOTES HELP',
    'vt100-amber':            'BLOCKQUOTES - HELP topic',
    'pet2001-green':          'READY.',
    'commodore64':            'READY.',
    'apple2-green':           ']CATALOG - BLOCKQUOTES.SH',
  };

  const currentTheme = themes.find(t => document.body.classList.contains(`theme-${t}`)) || 'ibm3279-green';
  const header = themeHelpHeaders[currentTheme] || 'HELP';

  const lines = [
    header,
    'SPACE/CLICK    finish typing / next quote',
    'N              next quote',
    'P              previous quote',
    'C              copy quote',
    'X              share on x/twitter',
    'L              copy share link',
    'B              bookmark quote',
    'V              view bookmarks',
    'E              export bookmarks',
    'U              toggle uppercase',
    'T              cycle theme',
    '?              show this help',
  ];

  let lineIndex = 0;
  // Build up displayed lines as we go
  const typed = [];

  function nextLine() {
    if (lineIndex >= lines.length) {
      // All lines typed — hold, then resume quote cycle
      state.timeoutId = setTimeout(() => {
        state.isPaused = false;
        elements.quoteContainer.innerHTML =
          `<span class="cursor-block" aria-hidden="true"></span>`;
        setRandomQuote();
      }, 2500);
      return;
    }

    const text = lines[lineIndex];
    lineIndex++;

    // Type the new line, appending to already-typed lines
    let i = 0;
    function tick() {
      const current = text.slice(0, i + 1);
      elements.quoteContainer.innerHTML =
        typed.map(l => `<span class="text-selected">${l}</span>`).join('\n') +
        (typed.length ? '\n' : '') +
        `<span class="text-selected">${current}</span>` +
        `<span class="cursor-block" aria-hidden="true"></span>`;
      i++;
      if (i < text.length) {
        state.timeoutId = setTimeout(tick, lineIndex === 1 ? 40 : 22);
      } else {
        typed.push(text);
        // Brief pause between lines, longer after the header
        state.timeoutId = setTimeout(nextLine, lineIndex === 1 ? 300 : 80);
      }
    }
    tick();
  }

  elements.quoteContainer.textContent = '';
  nextLine();
}

// Run the POST boot sequence, then resolve when complete.
// Per-terminal boot messages sourced from real firmware/ROM output.
function runBootSequence(onComplete) {
  if (config.performanceMode) {
    onComplete();
    return;
  }

  const prompt = getThemePrompt();

  const themeBootLines = {
    'ibm3279-green': [
      { text: 'IKJ56700A ENTER USERID -',                           speed: 22 },
      { text: 'BLOCKQUOTES  TSO/ISPF v1.0',                         speed: 26 },
      { text: 'LOADING QUOTE DATABASE.................. OK',         speed: 30 },
    ],
    'ibm3279-bitcoin-orange': [
      { text: 'IKJ56700A ENTER USERID -',                           speed: 22 },
      { text: 'BLOCKQUOTES  TSO/ISPF v1.0',                         speed: 26 },
      { text: 'LOADING QUOTE DATABASE.................. OK',         speed: 30 },
    ],
    'teletype-blue-green': [
      { text: 'VT220 OK',                                           speed: 18 },
      { text: 'blockquotes.sh v1.0 — phosphor terminal ready',      speed: 26 },
      { text: 'loading quote database.................. ok',         speed: 30 },
    ],
    'vt100-amber': [
      { text: 'VT100 SELF TEST OK',                                 speed: 20 },
      { text: 'blockquotes.sh v1.0 — phosphor terminal ready',      speed: 26 },
      { text: 'loading quote database.................. ok',         speed: 30 },
    ],
    'white': [
      { text: 'RT-11SJ  V04.00',                                    speed: 20 },
      { text: '.RUN BLOCKQUOTES',                                    speed: 26 },
      { text: 'BLOCKQUOTES.SH v1.0 — PHOSPHOR TERMINAL READY',      speed: 28 },
      { text: 'LOADING QUOTE DATABASE.................. OK',         speed: 30 },
    ],
    'adm3a-green': [
      { text: '4.2 BSD UNIX (ucbvax)',                               speed: 20 },
      { text: 'login: blockquotes',                                  speed: 26 },
      { text: 'Last login: Sat Mar 15 03:42 on ttya',               speed: 22 },
      { text: 'blockquotes.sh v1.0 — phosphor terminal ready',      speed: 26 },
      { text: 'loading quote database.................. ok',         speed: 30 },
    ],
    'zenith-green': [
      { text: 'Z-19 TERMINAL  64K CP/M VERS. 2.2',                  speed: 22 },
      { text: 'BLOCKQUOTES.COM v1.0 — PHOSPHOR TERMINAL READY',     speed: 26 },
      { text: 'LOADING QUOTE DATABASE.................. OK',         speed: 30 },
    ],
    'kaypro-green': [
      { text: 'KAYPRO II  64K CP/M VERS. 2.2',                      speed: 22 },
      { text: 'BLOCKQUOTES.COM v1.0 — PHOSPHOR TERMINAL READY',     speed: 26 },
      { text: 'LOADING QUOTE DATABASE.................. OK',         speed: 30 },
    ],
    'pet2001-green': [
      { text: '*** COMMODORE BASIC ***',                             speed: 20 },
      { text: ' 31743 BYTES FREE',                                   speed: 24 },
      { text: 'LOAD "BLOCKQUOTES",8',                               speed: 28 },
      { text: 'SEARCHING FOR BLOCKQUOTES',                          speed: 22 },
      { text: 'LOADING',                                             speed: 18 },
      { text: 'READY.',                                              speed: 14 },
      { text: 'RUN',                                                 speed: 14 },
    ],
    'apple2-green': [
      { text: 'APPLE ][',                                            speed: 20 },
      { text: ']BRUN BLOCKQUOTES',                                   speed: 26 },
      { text: 'BLOCKQUOTES.SH v1.0 — PHOSPHOR TERMINAL READY',      speed: 28 },
      { text: 'LOADING QUOTE DATABASE.................. OK',         speed: 30 },
    ],
    'commodore64': [
      { text: '    **** COMMODORE 64 BASIC V2 ****',                 speed: 18 },
      { text: ' 64K RAM SYSTEM  38911 BASIC BYTES FREE',             speed: 22 },
      { text: 'READY.',                                              speed: 14 },
      { text: 'LOAD "BLOCKQUOTES",8,1',                             speed: 26 },
      { text: 'SEARCHING FOR BLOCKQUOTES',                          speed: 22 },
      { text: 'LOADING',                                             speed: 18 },
      { text: 'READY.',                                              speed: 14 },
      { text: 'RUN',                                                 speed: 14 },
    ],
    'wyse50-amber': [
      { text: 'WYSE 50  SELF TEST OK',                              speed: 20 },
      { text: 'blockquotes.sh v1.0 — phosphor terminal ready',      speed: 26 },
      { text: 'loading quote database.................. ok',         speed: 30 },
    ],
  };

  const defaultLines = [
    { text: 'BLOCKQUOTES.SH v1.0 — PHOSPHOR TERMINAL READY',       speed: 28 },
    { text: 'LOADING QUOTE DATABASE.................. OK',           speed: 32 },
  ];

  const currentTheme = themes.find(t => document.body.classList.contains(`theme-${t}`));
  const bootLines = themeBootLines[currentTheme] || defaultLines;

  const lines = [
    ...bootLines,
    ...(prompt ? [{ text: prompt, speed: 0 }] : []),
  ];

  let lineIndex = 0;
  const displayed = [];

  function nextLine() {
    if (lineIndex >= lines.length) {
      onComplete();
      return;
    }

    const { text, speed } = lines[lineIndex];
    lineIndex++;

    typeBootLine(text, speed, () => {
      displayed.push(text);
      elements.quoteContainer.innerHTML =
        displayed.map(l => `<span class="text-selected">${l}</span>`).join('\n');
      state.timeoutId = setTimeout(nextLine, lineIndex === lines.length ? 120 : 200);
    }, displayed);
  }

  nextLine();
}

// =========================================
// INITIALIZATION
// =========================================

document.addEventListener('DOMContentLoaded', () => {
  // Pause all CSS animations when tab is hidden — saves CPU when user is elsewhere
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.body.classList.add('tab-hidden');
    } else {
      document.body.classList.remove('tab-hidden');
    }
  });

  // Attach event listeners
  document.body.addEventListener('click', handleClick, { passive: false });
  document.body.addEventListener('keydown', handleKeyPress, { passive: false });
  document.body.addEventListener('touchstart', handleSwipeStart, { passive: true });
  document.body.addEventListener('touchend', handleSwipeEnd, { passive: true });
  document.addEventListener('wheel', handleWheelNavigation, { passive: false });

  // Load quotes, run boot sequence, then start app
  loadQuotes().then(() => {
    const loadedFromURL = checkURLQuote();
    if (loadedFromURL) {
      // URL quote takes priority — skip boot sequence entirely
      state.booting = false;
      setTimeout(() => PerformanceUtils.preloadNextQuote(), 1000);
      QuoteUtils.updateBookmarkCounter();
      return;
    }

    runBootSequence(() => {
      state.booting = false;
      setRandomQuote();
      setTimeout(() => PerformanceUtils.preloadNextQuote(), 1000);
      QuoteUtils.updateBookmarkCounter();
    });
  });
});