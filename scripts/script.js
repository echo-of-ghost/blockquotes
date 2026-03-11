// =========================================
// CONFIGURATION
// =========================================
const config = {
  typingSpeed: 50, // Base typing speed in ms per character
  pauseDuration: 3000, // Pause before next quote in ms
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
  timeoutId: null, // Current timeout ID
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
  quoteHistory: [], // Recently shown quotes for back-navigation (#5)
  historyPosition: -1 // Current position when navigating back
};

// =========================================
// DOM ELEMENTS
// =========================================
const elements = {
  quoteContainer: document.getElementById('quote-container'),
  errorMessage: document.getElementById('error-message')
};

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
  
  // Calculate adaptive typing speed based on quote characteristics
  // Short quotes type faster, long quotes type slower for readability
  calculateTypingSpeed: (text, baseSpeed = 50) => {
    const length = text.length;
    const words = text.split(/\s+/).length;
    const avgWordLength = length / words;
    
    let speedMultiplier = 1;
    
    // Adjust speed based on length
    if (length < 100) speedMultiplier *= 0.7; // Short = fast
    else if (length < 200) speedMultiplier *= 0.85;
    else if (length > 400) speedMultiplier *= 1.3; // Long = slower
    
    // Adjust for word complexity
    if (avgWordLength > 6) speedMultiplier *= 1.2; // Complex words
    else if (avgWordLength < 4) speedMultiplier *= 0.8; // Simple words
    
    // Add pauses for punctuation-heavy quotes
    const punctuationCount = (text.match(/[.!?;:,]/g) || []).length;
    const punctuationRatio = punctuationCount / words;
    if (punctuationRatio > 0.1) speedMultiplier *= 1.1;
    
    return Math.max(20, Math.min(100, baseSpeed * speedMultiplier));
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
      ? `<span class="count">${bookmarkCount}</span><span class="heart">♥</span>` 
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
    const validQuotes = quotes.filter(isValidQuote);
    if (validQuotes.length === 0) return;
    
    // Get random quote avoiding recent history
    const randomQuote = getRandomQuote(validQuotes);
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
    const validQuotes = quotes.filter(isValidQuote);
    if (validQuotes.length === 0) return null;
    
    const randomQuote = getRandomQuote(validQuotes);
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
  },
  
  // Auto-scroll quote container for long quotes
  handleAutoScroll: () => {
    const container = elements.quoteContainer;
    const containerHeight = container.clientHeight;
    const scrollHeight = container.scrollHeight;
    
    if (scrollHeight > containerHeight) {
      const scrollTop = container.scrollTop;
      const maxScroll = scrollHeight - containerHeight;
      
      if (scrollTop < maxScroll) {
        container.scrollTop = maxScroll;
      }
    }
  }
};

// =========================================
// QUOTE HISTORY & DEDUPLICATION
// =========================================

// Push a quote onto the navigation history stack
function pushToHistory(quote) {
  if (!Array.isArray(state.quoteHistory)) state.quoteHistory = [];
  if (typeof state.historyPosition !== 'number') state.historyPosition = -1;

  // If we navigated back and now go forward, truncate forward history
  if (state.historyPosition >= 0 && state.historyPosition < state.quoteHistory.length - 1) {
    state.quoteHistory = state.quoteHistory.slice(0, state.historyPosition + 1);
  }
  state.quoteHistory.push(quote);
  // Keep stack bounded
  if (state.quoteHistory.length > HISTORY_SIZE * 2) {
    state.quoteHistory = state.quoteHistory.slice(-HISTORY_SIZE * 2);
  }
  state.historyPosition = state.quoteHistory.length - 1;
}

// Go back one quote in history; returns the quote or null if at start
function goBackInHistory() {
  if (!Array.isArray(state.quoteHistory) || state.historyPosition <= 0) return null;
  state.historyPosition--;
  return state.quoteHistory[state.historyPosition];
}

// Pick a random quote avoiding recently seen ones (#7)
function getRandomQuote(quotes) {
  const valid = quotes.filter(isValidQuote);
  if (valid.length === 0) return null;

  // Build a set of recent text keys to avoid
  const history = Array.isArray(state.quoteHistory) ? state.quoteHistory : [];
  const recentKeys = new Set(
    history.slice(-HISTORY_SIZE).map(q => q.text)
  );

  // Filter out recent quotes; fall back to full list if everything was seen
  const pool = valid.filter(q => !recentKeys.has(q.text));
  const source = pool.length > 0 ? pool : valid;
  return source[Math.floor(Math.random() * source.length)];
}



// Load quotes from JSON with 24hr caching
async function loadQuotes() {
  const cachedData = localStorage.getItem('bitcoin-quotes');
  const cachedTimestamp = localStorage.getItem('bitcoin-quotes-timestamp');

  if (cachedData && cachedTimestamp && (Date.now() - cachedTimestamp) < config.cacheExpiry) {
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
    elements.errorMessage.textContent = 'Houston, we have a problem!';
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

// Export bookmarks as plain text copied to clipboard
function copyBookmarksAsText() {
  if (state.bookmarkedQuotes.length === 0) {
    QuoteUtils.announceAction('No bookmarks to copy');
    showToast('no bookmarks saved');
    return;
  }

  const lines = state.bookmarkedQuotes.map(q => `"${q.text}"\n— ${q.author}`);
  const text = lines.join('\n\n---\n\n');

  navigator.clipboard.writeText(text).then(() => {
    QuoteUtils.announceAction(`Copied ${state.bookmarkedQuotes.length} bookmarks to clipboard`);
    showToast(`${state.bookmarkedQuotes.length} bookmarks copied`);
  }).catch(() => {
    QuoteUtils.announceAction('Failed to copy bookmarks');
  });
}

// =========================================
// TOAST NOTIFICATION
// =========================================

function showToast(message) {
  const existing = document.querySelector('.bq-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'bq-toast';
  toast.textContent = `> ${message}`;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('bq-toast--visible'));
  });

  setTimeout(() => {
    toast.classList.remove('bq-toast--visible');
    setTimeout(() => toast.remove(), 400);
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
    showToast('bookmarked ♥');
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

// Display quote with smooth fade/slide animation
function displayQuoteWithTransition(quote, startIndex = 0, finishImmediately = false, preformattedAuthor = null, useTransition = true) {
  if (!useTransition) {
    displayQuote(quote, startIndex, finishImmediately, preformattedAuthor);
    return;
  }
  
  // Fade out current quote
  elements.quoteContainer.classList.add('quote-transition-out');
  
  setTimeout(() => {
    displayQuote(quote, startIndex, finishImmediately, preformattedAuthor);
    
    // Fade in new quote
    elements.quoteContainer.classList.remove('quote-transition-out');
    elements.quoteContainer.classList.add('quote-transition-in');
    
    setTimeout(() => {
      elements.quoteContainer.classList.remove('quote-transition-in');
    }, 400);
  }, 200);
}

// Core typing effect display with character-by-character animation
function displayQuote(quote, startIndex = 0, finishImmediately = false, preformattedAuthor = null) {
  if (!isValidQuote(quote)) {
    console.warn('Tried to display invalid quote:', quote);
    setRandomQuote();
    return;
  }

  state.currentQuote = quote;
  pushToHistory(quote); // #5 track history for back-navigation
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

  function typeQuote() {
    const adaptiveSpeed = QuoteUtils.calculateTypingSpeed(quoteText, config.typingSpeed);
    const typingSpeed = config.performanceMode ? 0 : adaptiveSpeed;
    finishImmediately = finishImmediately || typingSpeed === 0;

    // Show complete quote immediately if requested or paused
    if (finishImmediately || state.isPaused) {
      try {
        elements.quoteContainer.innerHTML = `<span class="text-selected">${quoteText}</span><span class="author">> ${authorHTML}</span>`;
        elements.quoteContainer.style.textTransform = state.isUppercase ? 'uppercase' : 'none';
        const authorElement = elements.quoteContainer.querySelector('.author');
        if (authorElement) {
          authorElement.style.textTransform = state.isUppercase ? 'uppercase' : 'none';
        }
      } catch (e) {
        console.error('Error rendering quote:', e, { quoteText, quote });
        elements.quoteContainer.textContent = 'Error displaying quote';
        elements.errorMessage.classList.add('error-active');
      }
      state.currentIndex = quoteText.length;
      state.isTyping = false;
      state.isPaused = true;
      
      return;
    }

    // Type character by character with highlighting effect
    if (state.currentIndex < quoteText.length) {
      if (state.currentIndex === 0) elements.quoteContainer.innerHTML = '';
      
      const typedText = quoteText.slice(0, state.currentIndex + 1);
      elements.quoteContainer.innerHTML = `<span class="text-selected">${typedText}</span>`;
      
      PerformanceUtils.handleAutoScroll();
      
      state.currentIndex++;
      state.timeoutId = PerformanceUtils.optimizedDelay(typeQuote, typingSpeed);
    } else {
      // Typing complete, add author
      try {
        elements.quoteContainer.innerHTML = `<span class="text-selected">${quoteText}</span><span class="author">> ${authorHTML}</span>`;
        elements.quoteContainer.style.textTransform = state.isUppercase ? 'uppercase' : 'none';
        const authorElement = elements.quoteContainer.querySelector('.author');
        if (authorElement) {
          authorElement.style.textTransform = state.isUppercase ? 'uppercase' : 'none';
        }
      } catch (e) {
        console.error('Error rendering quote:', e, { quoteText, quote });
        elements.quoteContainer.textContent = 'Error displaying quote';
        elements.errorMessage.classList.add('error-active');
      }
      state.isTyping = false;
      
      // Wait before showing next quote
      state.timeoutId = PerformanceUtils.optimizedDelay(() => {
        if (!state.isPaused) {
          elements.quoteContainer.textContent = '';
          setRandomQuote();
        }
      }, config.pauseDuration);
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
      elements.errorMessage.textContent = 'No valid quotes available';
      elements.errorMessage.classList.add('error-active');
      return;
    }
    
    const { quote, authorHTML } = result;
    displayQuote(quote, 0, false, authorHTML);
  } catch (error) {
    console.error('Error loading quote:', error);
    elements.errorMessage.textContent = 'Error loading quotes';
    elements.errorMessage.classList.add('error-active');
  }
}

// =========================================
// EVENT HANDLERS
// =========================================

// Handle click to pause/resume or finish typing
function handleClick(event) {
  if (state.isProcessing) return;

  state.isProcessing = true;
  if (state.isTyping && !state.isPaused) {
    // Finish typing immediately
    clearTimeout(state.timeoutId);
    displayQuote(state.currentQuote, state.currentIndex, true);
    QuoteUtils.announceAction('Typing paused');
  } else {
    // Toggle pause state
    state.isPaused = !state.isPaused;
    QuoteUtils.announceAction(state.isPaused ? 'Paused' : 'Resumed');
    if (!state.isPaused) {
      clearTimeout(state.timeoutId);
      elements.quoteContainer.textContent = '';
      setRandomQuote();
    }
  }
  setTimeout(() => (state.isProcessing = false), 100);
}

// Share current quote on Twitter/X
function shareQuoteOnTwitter() {
  if (!state.currentQuote) return;
  
  const tweetText = QuoteUtils.getTweetText(state.currentQuote);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                   ('ontouchstart' in window) || 
                   (navigator.maxTouchPoints > 0);
  
  if (isMobile) {
    // Try to open mobile X app
    const appUrl = `twitter://post?message=${encodeURIComponent(tweetText)}`;
    const link = document.createElement('a');
    link.href = appUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    
    try {
      link.click();
      setTimeout(() => document.body.removeChild(link), 100);
    } catch (error) {
      document.body.removeChild(link);
      QuoteUtils.announceAction('X app not found - please install the X app to share quotes');
    }
  } else {
    // Desktop: open web version
    const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
  }
  
  QuoteUtils.announceAction('Opened share window');
}

// Keyboard shortcuts handler
// Space = pause/resume, N = next quote, C = copy, X = share, U = uppercase, B = bookmark, V = view bookmarks
function handleKeyPress(event) {
  if (state.isProcessing) return;

  // Space: Pause/resume or finish typing
  if (event.key === ' ') {
    handleClick(event);
  }

  // N: Next quote
  if (event.key.toLowerCase() === 'n' && state.isPaused && !state.isTyping) {
    state.isProcessing = true;
    const quotes = state.quotes;
    if (!quotes?.length) {
      elements.quoteContainer.textContent = 'No quotes available';
      elements.errorMessage.textContent = 'No quotes available';
      elements.errorMessage.classList.add('error-active');
      state.isProcessing = false;
      return;
    }
    const next = getRandomQuote(quotes);
    if (next) displayQuoteWithTransition(next, 0, true);
    QuoteUtils.announceAction('Next quote displayed');
    setTimeout(() => (state.isProcessing = false), 100);
  }

  // C: Copy to clipboard
  if (event.key.toLowerCase() === 'c' && state.currentQuote) {
    copyCurrentQuote();
  }

  // X: Share on Twitter/X
  if (event.key.toLowerCase() === 'x' && state.currentQuote) {
    state.isProcessing = true;
    shareQuoteOnTwitter();
    setTimeout(() => (state.isProcessing = false), 100);
  }

  // U: Toggle uppercase
  if (event.key.toLowerCase() === 'u') {
    state.isProcessing = true;
    toggleTextCase();
    setTimeout(() => (state.isProcessing = false), 100);
  }

  // B: Toggle bookmark
  if (event.key.toLowerCase() === 'b' && state.currentQuote) {
    state.isProcessing = true;
    toggleBookmark();
    setTimeout(() => (state.isProcessing = false), 100);
  }

  // V: View next bookmarked quote
  if (event.key.toLowerCase() === 'v' && state.isPaused && !state.isTyping) {
    state.isProcessing = true;
    viewNextBookmarkedQuote();
    setTimeout(() => (state.isProcessing = false), 100);
  }

  // L: Copy shareable link for current quote
  if (event.key.toLowerCase() === 'l' && state.currentQuote) {
    state.isProcessing = true;
    copyShareableURL();
    setTimeout(() => (state.isProcessing = false), 100);
  }

  // E: Export bookmarks as JSON download
  if (event.key.toLowerCase() === 'e') {
    state.isProcessing = true;
    exportBookmarksAsJSON();
    setTimeout(() => (state.isProcessing = false), 100);
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
        const quotes = state.quotes;
        if (!quotes?.length) {
          elements.quoteContainer.textContent = 'No quotes available';
          elements.errorMessage.textContent = 'No quotes available';
          elements.errorMessage.classList.add('error-active');
          return;
        }
        const next = getRandomQuote(quotes);
        if (next) displayQuoteWithTransition(next, 0, true);
        QuoteUtils.announceAction('Next quote displayed');
      }
    } else {
      // Swipe right = back in history
      if (state.isPaused && !state.isTyping) {
        const prev = goBackInHistory();
        if (prev) {
          displayQuoteWithTransition(prev, 0, true);
          QuoteUtils.announceAction('Previous quote');
        }
      }
    }
  }
  
  // Vertical swipe: Swipe up = toggle uppercase
  if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > minSwipeDistance) {
    if (diffY > 0) {
      toggleTextCase();
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
      lastWheelTime = currentTime;

      if (state.isPaused && !state.isTyping) {
        const quotes = state.quotes;
        if (!quotes?.length) {
          elements.quoteContainer.textContent = 'No quotes available';
          elements.errorMessage.textContent = 'No quotes available';
          elements.errorMessage.classList.add('error-active');
          return;
        }

        if (wheelDelta < 0) {
          // Scroll up = go back in history
          const prev = goBackInHistory();
          if (prev) {
            // Temporarily step back past the current entry we just added
            displayQuoteWithTransition(prev, 0, true);
            QuoteUtils.announceAction('Previous quote');
          }
        } else {
          // Scroll down = next random quote
          const next = getRandomQuote(quotes);
          if (next) displayQuoteWithTransition(next, 0, true);
          QuoteUtils.announceAction('Next quote');
        }
      }
    }

    wheelDelta = 0;
  }, 100);
}

// =========================================
// INITIALIZATION
// =========================================

document.addEventListener('DOMContentLoaded', () => {
  // Attach event listeners
  document.body.addEventListener('click', handleClick, { passive: false });
  document.body.addEventListener('keydown', handleKeyPress, { passive: false });
  document.body.addEventListener('touchstart', handleSwipeStart, { passive: true });
  document.body.addEventListener('touchend', handleSwipeEnd, { passive: true });
  document.addEventListener('wheel', handleWheelNavigation, { passive: false });
  
  // Load quotes and start app (URL quote takes priority)
  loadQuotes().then(() => {
    const loadedFromURL = checkURLQuote();
    if (!loadedFromURL) {
      setRandomQuote();
    }
    setTimeout(() => PerformanceUtils.preloadNextQuote(), 1000);
    QuoteUtils.updateBookmarkCounter();
  });
});