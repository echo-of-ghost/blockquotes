// Configuration
const config = {
  typingSpeed: 50, // ms per character
  pauseDuration: 3000, // ms before next quote
  cacheExpiry: 24 * 60 * 60 * 1000, // 24 hours
  performanceMode: window.matchMedia('(prefers-reduced-motion: reduce)').matches
};

// State variables
const state = {
  quotes: null,
  isPaused: false,
  timeoutId: null,
  currentQuote: null,
  currentIndex: 0,
  isTyping: false,
  isProcessing: false,
  isUppercase: false, // Tracks case mode (true = uppercase, false = lowercase)
  preloadedQuote: null, // Next quote preloaded and ready
  preloadedAuthorHTML: null, // Preformatted author HTML
  animationFrameId: null, // For requestAnimationFrame
  bookmarkedQuotes: JSON.parse(localStorage.getItem('bookmarked-quotes') || '[]'),
  soundEnabled: localStorage.getItem('sound-enabled') !== 'false',
  bitcoinPrice: null,
  lastPrice: null,
  currentBookmarkIndex: 0 // Track current position in bookmarked quotes
};

// DOM elements
const elements = {
  quoteContainer: document.getElementById('quote-container'),
  errorMessage: document.getElementById('error-message')
};

// Utilities for text formatting
const QuoteUtils = {
  getQuoteText: quote => `"${quote?.text?.trim() || 'No quote available'}"`,
  getTweetText: quote => `"${quote.text}" — ${quote.author.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1').trim()}`,
  announceAction: (message) => {
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('class', 'sr-only');
    liveRegion.textContent = message;
    document.body.appendChild(liveRegion);
    setTimeout(() => liveRegion.remove(), 1000);
  },
  
  // Calculate adaptive typing speed based on quote characteristics
  calculateTypingSpeed: (text, baseSpeed = 50) => {
    const length = text.length;
    const words = text.split(/\s+/).length;
    const avgWordLength = length / words;
    
    // Speed factors
    let speedMultiplier = 1;
    
    // Shorter quotes type faster for impact
    if (length < 100) speedMultiplier *= 0.7;
    else if (length < 200) speedMultiplier *= 0.85;
    else if (length > 400) speedMultiplier *= 1.3; // Longer quotes slower for readability
    
    // Complex words (longer average) type slower
    if (avgWordLength > 6) speedMultiplier *= 1.2;
    else if (avgWordLength < 4) speedMultiplier *= 0.8;
    
    // Punctuation creates natural pauses
    const punctuationCount = (text.match(/[.!?;:,]/g) || []).length;
    const punctuationRatio = punctuationCount / words;
    if (punctuationRatio > 0.1) speedMultiplier *= 1.1;
    
    return Math.max(20, Math.min(100, baseSpeed * speedMultiplier));
  },
  
  // Update bookmark counter display
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
    
    counter.textContent = bookmarkCount;
    counter.classList.remove('hidden');
  }
};

// WOW Factor Effects
const EffectsUtils = {
  // Sound effects using Web Audio API
  playSound: (frequency = 800, duration = 100, type = 'sine') => {
    if (!state.soundEnabled) return;
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (error) {
      console.log('Audio not supported:', error);
    }
  },
  
  // Typing sound effect
  playTypingSound: () => {
    const frequencies = [600, 650, 700, 750, 800];
    const freq = frequencies[Math.floor(Math.random() * frequencies.length)];
    EffectsUtils.playSound(freq, 50, 'square');
  },
  
  // Quote completion sound
  playCompletionSound: () => {
    setTimeout(() => EffectsUtils.playSound(800, 100), 0);
    setTimeout(() => EffectsUtils.playSound(1000, 100), 100);
    setTimeout(() => EffectsUtils.playSound(1200, 200), 200);
  },
  
  // Bookmark sound
  playBookmarkSound: () => {
    EffectsUtils.playSound(1000, 150, 'triangle');
    setTimeout(() => EffectsUtils.playSound(1200, 150, 'triangle'), 100);
  },
  
  // Create particle effect
  createParticles: (x, y, count = 10) => {
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = x + Math.random() * 20 - 10 + 'px';
      particle.style.top = y + Math.random() * 20 - 10 + 'px';
      document.body.appendChild(particle);
      
      setTimeout(() => particle.remove(), 2000);
    }
  },
  
  // Sound indicator
  showSoundIndicator: () => {
    let indicator = document.querySelector('.sound-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'sound-indicator';
      for (let i = 0; i < 4; i++) {
        const bar = document.createElement('div');
        bar.className = 'sound-bar';
        indicator.appendChild(bar);
      }
      document.body.appendChild(indicator);
    }
    
    indicator.classList.add('active');
    setTimeout(() => indicator.classList.remove('active'), 1000);
  },
  
  // Quote completion celebration
  celebrateQuoteCompletion: () => {
    const container = elements.quoteContainer;
    container.classList.add('quote-complete');
    
    // Create particles at quote container
    const rect = container.getBoundingClientRect();
    EffectsUtils.createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 15);
    
    // Play completion sound
    EffectsUtils.playCompletionSound();
    
    setTimeout(() => container.classList.remove('quote-complete'), 1000);
  }
};

// Bookmarking system
const BookmarkUtils = {
  isBookmarked: (quote) => {
    return state.bookmarkedQuotes.some(bookmarked => 
      bookmarked.text === quote.text && bookmarked.author === quote.author
    );
  },
  
  toggleBookmark: (quote) => {
    const isCurrentlyBookmarked = BookmarkUtils.isBookmarked(quote);
    
    if (isCurrentlyBookmarked) {
      // Remove bookmark
      state.bookmarkedQuotes = state.bookmarkedQuotes.filter(bookmarked => 
        !(bookmarked.text === quote.text && bookmarked.author === quote.author)
      );
      QuoteUtils.announceAction('Quote unbookmarked');
      elements.quoteContainer.classList.remove('bookmarked');
    } else {
      // Add bookmark
      state.bookmarkedQuotes.push({
        text: quote.text,
        author: quote.author,
        bookmarkedAt: Date.now()
      });
      QuoteUtils.announceAction('Quote bookmarked');
      elements.quoteContainer.classList.add('bookmarked');
      EffectsUtils.playBookmarkSound();
      
      // Create particles at bookmark location
      const rect = elements.quoteContainer.getBoundingClientRect();
      EffectsUtils.createParticles(rect.right - 20, rect.top, 8);
    }
    
    // Save to localStorage
    localStorage.setItem('bookmarked-quotes', JSON.stringify(state.bookmarkedQuotes));
    
    return !isCurrentlyBookmarked;
  }
};

// Bitcoin price integration
const BitcoinUtils = {
  fetchPrice: async () => {
    try {
      const response = await fetch('https://api.coindesk.com/v1/bpi/currentprice/USD.json');
      const data = await response.json();
      const price = parseFloat(data.bpi.USD.rate.replace(',', ''));
      
      state.lastPrice = state.bitcoinPrice;
      state.bitcoinPrice = price;
      
      BitcoinUtils.updatePriceDisplay();
      return price;
    } catch (error) {
      console.log('Bitcoin price fetch failed:', error);
      return null;
    }
  },
  
  updatePriceDisplay: () => {
    let indicator = document.querySelector('.price-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'price-indicator';
      document.body.appendChild(indicator);
    }
    
    if (state.bitcoinPrice) {
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(state.bitcoinPrice);
      
      indicator.textContent = `₿ ${formatted}`;
      
      // Add price direction class
      if (state.lastPrice) {
        indicator.classList.remove('price-up', 'price-down');
        if (state.bitcoinPrice > state.lastPrice) {
          indicator.classList.add('price-up');
        } else if (state.bitcoinPrice < state.lastPrice) {
          indicator.classList.add('price-down');
        }
      }
    }
  },
  
  // Change theme based on price movement
  updateThemeByPrice: () => {
    if (!state.lastPrice || !state.bitcoinPrice) return;
    
    const body = document.body;
    const priceChange = ((state.bitcoinPrice - state.lastPrice) / state.lastPrice) * 100;
    
    // Significant price movements change theme
    if (Math.abs(priceChange) > 2) {
      if (priceChange > 0) {
        // Price up - switch to green theme
        body.className = body.className.replace(/theme-[^\s]+/, 'theme-ibm3279-green');
      } else {
        // Price down - switch to orange theme  
        body.className = body.className.replace(/theme-[^\s]+/, 'theme-ibm3279-bitcoin-orange');
      }
    }
  }
};

// Performance utilities
const PerformanceUtils = {
  // Preload next quote in background
  preloadNextQuote: async () => {
    if (state.preloadedQuote) return; // Already preloaded
    
    const quotes = await loadQuotes();
    const validQuotes = quotes.filter(isValidQuote);
    if (validQuotes.length === 0) return;
    
    // Get random quote different from current one
    let randomQuote;
    do {
      randomQuote = validQuotes[Math.floor(Math.random() * validQuotes.length)];
    } while (state.currentQuote && randomQuote.text === state.currentQuote.text && validQuotes.length > 1);
    
    // Preformat the author HTML
    const preformattedAuthor = PerformanceUtils.formatAuthor(randomQuote.author);
    
    state.preloadedQuote = randomQuote;
    state.preloadedAuthorHTML = preformattedAuthor;
    
    console.log('Preloaded next quote:', randomQuote.text.substring(0, 50) + '...');
  },
  
  // Get preloaded quote or fallback to random
  getNextQuote: async () => {
    if (state.preloadedQuote) {
      const quote = state.preloadedQuote;
      const authorHTML = state.preloadedAuthorHTML;
      
      // Clear preloaded data
      state.preloadedQuote = null;
      state.preloadedAuthorHTML = null;
      
      // Start preloading the next one
      setTimeout(() => PerformanceUtils.preloadNextQuote(), 100);
      
      return { quote, authorHTML };
    }
    
    // Fallback to regular random selection
    const quotes = await loadQuotes();
    const validQuotes = quotes.filter(isValidQuote);
    if (validQuotes.length === 0) return null;
    
    const randomQuote = validQuotes[Math.floor(Math.random() * validQuotes.length)];
    const authorHTML = PerformanceUtils.formatAuthor(randomQuote.author);
    
    // Start preloading next quote
    setTimeout(() => PerformanceUtils.preloadNextQuote(), 100);
    
    return { quote: randomQuote, authorHTML };
  },
  
  // Optimized author formatting (moved from displayQuote for reuse)
  formatAuthor: (author) => {
    const cleanAuthor = String(author).replace(/^"|"$/g, '').trim();
    const span = document.createElement('span');
    let currentText = cleanAuthor;
    
    // Handle [text](url)
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
    
    // Handle @handles
    const finalHtml = span.innerHTML.replace(
      /@(\w+)/g,
      '<a href="https://x.com/$1" target="_blank" rel="noopener noreferrer" aria-label="Visit $1\'s Twitter profile">@$1</a>'
    );
    
    return finalHtml;
  },
  
  // Optimized setTimeout using requestAnimationFrame for smooth animations
  optimizedDelay: (callback, delay) => {
    if (config.performanceMode) {
      return setTimeout(callback, 0);
    }
    
    if (delay < 16) {
      // For very short delays, use requestAnimationFrame
      state.animationFrameId = requestAnimationFrame(callback);
      return state.animationFrameId;
    } else {
      // For longer delays, use setTimeout
      return setTimeout(callback, delay);
    }
  },
  
  // Cancel any pending animation
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
  
  // Handle auto-scrolling for long quotes during typing
  handleAutoScroll: () => {
    const container = elements.quoteContainer;
    const containerHeight = container.clientHeight;
    const scrollHeight = container.scrollHeight;
    
    // If content is taller than container, scroll to keep typing visible
    if (scrollHeight > containerHeight) {
      const scrollTop = container.scrollTop;
      const maxScroll = scrollHeight - containerHeight;
      
      // Auto-scroll to bottom as text types
      if (scrollTop < maxScroll) {
        container.scrollTop = maxScroll;
      }
    }
  },
  
  // Check if quote needs virtual scrolling
  needsVirtualScrolling: (text) => {
    // Estimate if quote will be too long (rough calculation)
    const estimatedLines = Math.ceil(text.length / 80); // ~80 chars per line
    const estimatedHeight = estimatedLines * 2.5; // ~2.5rem per line
    const containerMaxHeight = window.innerHeight * 0.6; // Rough container height
    
    return estimatedHeight > containerMaxHeight;
  }
};

/**
 * Loads quotes from JSON or cache.
 * @returns {Promise<Array>} Quotes
 */
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

/**
 * Validates a quote object.
 * @param {Object} quote - Quote to validate
 * @returns {boolean} True if valid
 */
function isValidQuote(quote) {
  return quote && typeof quote === 'object' && typeof quote.text === 'string' && quote.text.trim() && typeof quote.author === 'string' && quote.author.trim();
}

/**
 * Copies current quote to clipboard.
 */
function copyCurrentQuote() {
  if (!state.currentQuote) return;
  const text = QuoteUtils.getTweetText(state.currentQuote);
  navigator.clipboard.writeText(text).then(() => {
    console.log('Quote copied to clipboard');
    QuoteUtils.announceAction('Quote copied to clipboard');
  }).catch(err => {
    console.error('Failed to copy:', err);
    QuoteUtils.announceAction('Failed to copy quote');
  });
}

/**
 * Toggles text case between uppercase and lowercase for quote and author.
 */
function toggleTextCase() {
  state.isUppercase = !state.isUppercase;
  const textTransform = state.isUppercase ? 'uppercase' : 'none';
  elements.quoteContainer.style.textTransform = textTransform;
  const authorElement = elements.quoteContainer.querySelector('.author');
  if (authorElement) {
    authorElement.style.textTransform = textTransform;
  }
  console.log(`Text case toggled to: ${textTransform}`);
  QuoteUtils.announceAction(`Text case set to ${state.isUppercase ? 'uppercase' : 'lowercase'}`);
}

/**
 * Toggles bookmark status for the current quote.
 */
function toggleBookmark() {
  if (!state.currentQuote) return;
  
  const isCurrentlyBookmarked = isQuoteBookmarked(state.currentQuote);
  
  if (isCurrentlyBookmarked) {
    // Remove bookmark
    state.bookmarkedQuotes = state.bookmarkedQuotes.filter(bookmarked =>
      !(bookmarked.text === state.currentQuote.text && bookmarked.author === state.currentQuote.author)
    );
    QuoteUtils.announceAction('Quote unbookmarked');
    elements.quoteContainer.classList.remove('bookmarked');
  } else {
    // Add bookmark
    state.bookmarkedQuotes.push({
      text: state.currentQuote.text,
      author: state.currentQuote.author,
      bookmarkedAt: Date.now()
    });
    QuoteUtils.announceAction('Quote bookmarked');
    elements.quoteContainer.classList.add('bookmarked');
  }
  
  // Save to localStorage
  localStorage.setItem('bookmarked-quotes', JSON.stringify(state.bookmarkedQuotes));
  
  // Update bookmark counter
  QuoteUtils.updateBookmarkCounter();
  
  console.log(`Quote ${isCurrentlyBookmarked ? 'removed from' : 'added to'} bookmarks`);
}

/**
 * Checks if a quote is bookmarked.
 * @param {Object} quote - Quote to check
 * @returns {boolean} True if bookmarked
 */
function isQuoteBookmarked(quote) {
  return state.bookmarkedQuotes.some(bookmarked =>
    bookmarked.text === quote.text && bookmarked.author === quote.author
  );
}

/**
 * Cycles through bookmarked quotes.
 */
function viewNextBookmarkedQuote() {
  if (state.bookmarkedQuotes.length === 0) {
    QuoteUtils.announceAction('No bookmarked quotes yet. Press B to bookmark the current quote.');
    return;
  }
  
  // Get the next bookmarked quote
  const bookmarkedQuote = state.bookmarkedQuotes[state.currentBookmarkIndex];
  
  // Move to next bookmark for next time
  state.currentBookmarkIndex = (state.currentBookmarkIndex + 1) % state.bookmarkedQuotes.length;
  
  // Display the bookmarked quote
  displayQuoteWithTransition(bookmarkedQuote, 0, true);
  
  const totalBookmarks = state.bookmarkedQuotes.length;
  const currentPosition = state.currentBookmarkIndex === 0 ? totalBookmarks : state.currentBookmarkIndex;
  QuoteUtils.announceAction(`Viewing bookmark ${currentPosition} of ${totalBookmarks}`);
}

/**
 * Cycles backwards through bookmarked quotes.
 */
function viewPreviousBookmarkedQuote() {
  if (state.bookmarkedQuotes.length === 0) {
    QuoteUtils.announceAction('No bookmarked quotes yet. Swipe down to bookmark quotes.');
    return;
  }
  
  // Move to previous bookmark
  state.currentBookmarkIndex = (state.currentBookmarkIndex - 1 + state.bookmarkedQuotes.length) % state.bookmarkedQuotes.length;
  
  // Get the previous bookmarked quote
  const bookmarkedQuote = state.bookmarkedQuotes[state.currentBookmarkIndex];
  
  // Display the bookmarked quote
  displayQuoteWithTransition(bookmarkedQuote, 0, true);
  
  const totalBookmarks = state.bookmarkedQuotes.length;
  const currentPosition = state.currentBookmarkIndex + 1;
  QuoteUtils.announceAction(`Viewing bookmark ${currentPosition} of ${totalBookmarks}`);
}

/**
 * Displays a quote with smooth transition animation.
 * @param {Object} quote - Quote to display
 * @param {number} startIndex - Typing start index
 * @param {boolean} finishImmediately - Skip typing effect
 * @param {string} preformattedAuthor - Optional preformatted author HTML
 * @param {boolean} useTransition - Whether to use smooth transition
 */
function displayQuoteWithTransition(quote, startIndex = 0, finishImmediately = false, preformattedAuthor = null, useTransition = true) {
  if (!useTransition) {
    displayQuote(quote, startIndex, finishImmediately, preformattedAuthor);
    return;
  }
  
  // Add transition out class
  elements.quoteContainer.classList.add('quote-transition-out');
  
  // Wait for transition, then display new quote
  setTimeout(() => {
    displayQuote(quote, startIndex, finishImmediately, preformattedAuthor);
    
    // Remove transition out and add transition in
    elements.quoteContainer.classList.remove('quote-transition-out');
    elements.quoteContainer.classList.add('quote-transition-in');
    
    // Clean up transition class after animation
    setTimeout(() => {
      elements.quoteContainer.classList.remove('quote-transition-in');
    }, 400);
  }, 200); // Half of the transition duration
}

/**
 * Displays a quote with typing effect.
 * @param {Object} quote - Quote to display
 * @param {number} startIndex - Typing start index
 * @param {boolean} finishImmediately - Skip typing effect
 * @param {string} preformattedAuthor - Optional preformatted author HTML
 */
function displayQuote(quote, startIndex = 0, finishImmediately = false, preformattedAuthor = null) {
  if (!isValidQuote(quote)) {
    console.warn('Tried to display invalid quote:', quote);
    setRandomQuote();
    return;
  }

  console.log('Displaying quote:', quote);
  state.currentQuote = quote;
  const quoteText = QuoteUtils.getQuoteText(quote);
  state.currentIndex = startIndex;
  state.isTyping = true;
  
  // Check if quote is bookmarked and add visual indicator
  if (isQuoteBookmarked(quote)) {
    elements.quoteContainer.classList.add('bookmarked');
  } else {
    elements.quoteContainer.classList.remove('bookmarked');
  }
  
  // Use preformatted author HTML if available, otherwise format it
  const authorHTML = preformattedAuthor || PerformanceUtils.formatAuthor(quote.author);

  function typeQuote() {
    const adaptiveSpeed = QuoteUtils.calculateTypingSpeed(quoteText, config.typingSpeed);
    const typingSpeed = config.performanceMode ? 0 : adaptiveSpeed;
    finishImmediately = finishImmediately || typingSpeed === 0;

    if (finishImmediately || state.isPaused) {
      try {
        // Keep the quote highlighted even when finishing immediately
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

    if (state.currentIndex < quoteText.length) {
      if (state.currentIndex === 0) elements.quoteContainer.innerHTML = '';
      
      // Create the text with selection highlighting
      const typedText = quoteText.slice(0, state.currentIndex + 1);
      elements.quoteContainer.innerHTML = `<span class="text-selected">${typedText}</span>`;
      
      // Handle auto-scrolling for long quotes
      PerformanceUtils.handleAutoScroll();
      
      state.currentIndex++;
      state.timeoutId = PerformanceUtils.optimizedDelay(typeQuote, typingSpeed);
    } else {
      try {
        // Keep the quote highlighted and add the author
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

/**
 * Displays a random quote using preloading for better performance.
 */
async function setRandomQuote() {
  if (state.isPaused) return;
  
  try {
    const result = await PerformanceUtils.getNextQuote();
    
    if (!result) {
      console.warn('No valid quotes available');
      elements.quoteContainer.textContent = 'No quotes available';
      elements.errorMessage.textContent = 'No valid quotes available';
      elements.errorMessage.classList.add('error-active');
      return;
    }
    
    const { quote, authorHTML } = result;
    console.log('Selected quote:', quote);
    displayQuote(quote, 0, false, authorHTML);
  } catch (error) {
    console.error('Error loading quote:', error);
    elements.errorMessage.textContent = 'Error loading quotes';
    elements.errorMessage.classList.add('error-active');
  }
}

/**
 * Toggles pause or finishes typing on click.
 * @param {Event} event - Click event
 */
function handleClick(event) {
  if (state.isProcessing) return;

  state.isProcessing = true;
  if (state.isTyping && !state.isPaused) {
    clearTimeout(state.timeoutId);
    displayQuote(state.currentQuote, state.currentIndex, true);
    QuoteUtils.announceAction('Typing paused');
  } else {
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

/**
 * Shares quote on Twitter/X.
 */
function shareQuoteOnTwitter() {
  if (!state.currentQuote) {
    console.warn('No quote available to share');
    return;
  }
  const tweetText = QuoteUtils.getTweetText(state.currentQuote);
  
  // Detect if it's a mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                   ('ontouchstart' in window) || 
                   (navigator.maxTouchPoints > 0);
  
  let tweetUrl;
  
  if (isMobile) {
    // Try to open the mobile app using the most reliable method
    const appUrl = `twitter://post?message=${encodeURIComponent(tweetText)}`;
    
    // Create a temporary link element to trigger the app
    const link = document.createElement('a');
    link.href = appUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    
    // Try to click the link to open the app
    try {
      link.click();
      console.log('Attempting to open X/Twitter mobile app:', tweetText);
      
      // Clean up the link
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
    } catch (error) {
      console.log('Failed to open mobile app:', error);
      document.body.removeChild(link);
      QuoteUtils.announceAction('X app not found - please install the X app to share quotes');
    }
  } else {
    // Desktop - use web version
    tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
    console.log('Opened tweet window with:', tweetText);
  }
  
  try {
    QuoteUtils.announceAction('Opened share window');
  } catch (error) {
    console.error('Failed to share quote:', error);
    QuoteUtils.announceAction('Failed to share quote');
  }
}

/**
 * Handles keyboard controls.
 * @param {Event} event - Keydown event
 */
function handleKeyPress(event) {
  if (state.isProcessing) return;

  if (event.key === ' ') {
    handleClick(event);
  }

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
    const random = quotes[Math.floor(Math.random() * quotes.length)];
    displayQuoteWithTransition(random, 0, true);
    QuoteUtils.announceAction('Next quote displayed');
    setTimeout(() => (state.isProcessing = false), 100);
  }

  if (event.key.toLowerCase() === 'c' && state.currentQuote) {
    copyCurrentQuote();
  }

  if (event.key.toLowerCase() === 'x' && state.currentQuote) {
    state.isProcessing = true;
    shareQuoteOnTwitter();
    setTimeout(() => (state.isProcessing = false), 100);
  }

  if (event.key.toLowerCase() === 'u') {
    state.isProcessing = true;
    toggleTextCase();
    setTimeout(() => (state.isProcessing = false), 100);
  }

  // Bookmark current quote with B key
  if (event.key.toLowerCase() === 'b' && state.currentQuote) {
    state.isProcessing = true;
    toggleBookmark();
    setTimeout(() => (state.isProcessing = false), 100);
  }

  // View bookmarked quotes with V key
  if (event.key.toLowerCase() === 'v' && state.isPaused && !state.isTyping) {
    state.isProcessing = true;
    viewNextBookmarkedQuote();
    setTimeout(() => (state.isProcessing = false), 100);
  }
}

// Legacy function - now handled by PerformanceUtils.optimizedDelay
function optimizedSetTimeout(callback, delay) {
  return PerformanceUtils.optimizedDelay(callback, delay);
}

// Enhanced swipe gesture detection for mobile
let startX = 0;
let startY = 0;
let touchStartTime = 0;
let longPressTimer = null;
let twoFingerStartX = 0;
let twoFingerStartY = 0;

function handleSwipeStart(event) {
  touchStartTime = Date.now();
  
  if (event.touches && event.touches.length === 1) {
    // Single finger touch
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    
    // Start long press timer for Twitter share
    longPressTimer = setTimeout(() => {
      if (state.currentQuote) {
        // Haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
        shareQuoteOnTwitter();
        QuoteUtils.announceAction('Sharing quote on X');
      }
    }, 800); // 800ms for long press
    
  } else if (event.touches && event.touches.length === 2) {
    // Two finger touch for bookmark navigation
    twoFingerStartX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    twoFingerStartY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
  }
}

function handleSwipeEnd(event) {
  // Clear long press timer
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  
  const touchDuration = Date.now() - touchStartTime;
  
  // Handle single finger swipes
  if (!event.changedTouches || event.changedTouches.length !== 1) {
    // Handle two-finger swipes
    if (event.changedTouches && event.changedTouches.length === 2) {
      handleTwoFingerSwipe(event);
    }
    return;
  }
  
  // Skip if this was a long press (already handled)
  if (touchDuration >= 800) return;
  
  const endX = event.changedTouches[0].clientX;
  const endY = event.changedTouches[0].clientY;
  const diffX = startX - endX;
  const diffY = startY - endY;
  
  // Minimum swipe distance
  const minSwipeDistance = 50;
  
  // Horizontal swipe (left/right)
  if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
    if (diffX > 0) {
      // Swipe left - next quote
      if (state.isPaused && !state.isTyping) {
        const quotes = state.quotes;
        if (!quotes?.length) {
          elements.quoteContainer.textContent = 'No quotes available';
          elements.errorMessage.textContent = 'No quotes available';
          elements.errorMessage.classList.add('error-active');
          return;
        }
        const random = quotes[Math.floor(Math.random() * quotes.length)];
        displayQuoteWithTransition(random, 0, true);
        QuoteUtils.announceAction('Next quote displayed');
      }
    }
  }
  
  // Vertical swipe (up/down)
  if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > minSwipeDistance) {
    if (diffY > 0) {
      // Swipe up - toggle uppercase
      toggleTextCase();
    } else {
      // Swipe down - toggle bookmark
      if (state.currentQuote) {
        toggleBookmark();
      }
    }
  }
}

// Handle two-finger swipes for bookmark navigation
function handleTwoFingerSwipe(event) {
  const endX = (event.changedTouches[0].clientX + event.changedTouches[1].clientX) / 2;
  const endY = (event.changedTouches[0].clientY + event.changedTouches[1].clientY) / 2;
  const diffX = twoFingerStartX - endX;
  const diffY = twoFingerStartY - endY;
  
  const minSwipeDistance = 50;
  
  // Only handle horizontal two-finger swipes
  if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
    if (state.bookmarkedQuotes.length === 0) {
      QuoteUtils.announceAction('No bookmarked quotes yet. Swipe down to bookmark quotes.');
      return;
    }
    
    if (diffX > 0) {
      // Two-finger swipe left - next bookmark
      viewNextBookmarkedQuote();
    } else {
      // Two-finger swipe right - previous bookmark
      viewPreviousBookmarkedQuote();
    }
  }
}

// Mouse wheel navigation with momentum
let wheelDelta = 0;
let wheelTimeout = null;
let lastWheelTime = 0;
const WHEEL_THRESHOLD = 50; // Minimum delta to trigger quote change (more responsive)
const WHEEL_COOLDOWN = 400; // Minimum time between wheel-triggered quote changes (more responsive)

function handleWheelNavigation(event) {
  // Prevent default scrolling behavior
  event.preventDefault();
  
  const currentTime = Date.now();
  
  // Skip if we're in cooldown period
  if (currentTime - lastWheelTime < WHEEL_COOLDOWN) {
    return;
  }
  
  // Skip if typing is active or processing
  if (state.isTyping || state.isProcessing) {
    return;
  }
  
  // Accumulate wheel delta for momentum
  wheelDelta += event.deltaY;
  
  // Clear existing timeout
  if (wheelTimeout) {
    clearTimeout(wheelTimeout);
  }
  
  // Set timeout to process accumulated delta
  wheelTimeout = setTimeout(() => {
    if (Math.abs(wheelDelta) >= WHEEL_THRESHOLD) {
      lastWheelTime = currentTime;
      
      if (wheelDelta > 0) {
        // Scroll down - next quote
        if (state.isPaused && !state.isTyping) {
          const quotes = state.quotes;
          if (!quotes?.length) {
            elements.quoteContainer.textContent = 'No quotes available';
            elements.errorMessage.textContent = 'No quotes available';
            elements.errorMessage.classList.add('error-active');
            return;
          }
          const random = quotes[Math.floor(Math.random() * quotes.length)];
          displayQuoteWithTransition(random, 0, true);
          QuoteUtils.announceAction('Next quote displayed');
        }
      } else {
        // Scroll up - previous quote (if we had history, for now just random)
        if (state.isPaused && !state.isTyping) {
          const quotes = state.quotes;
          if (!quotes?.length) {
            elements.quoteContainer.textContent = 'No quotes available';
            elements.errorMessage.textContent = 'No quotes available';
            elements.errorMessage.classList.add('error-active');
            return;
          }
          const random = quotes[Math.floor(Math.random() * quotes.length)];
          displayQuoteWithTransition(random, 0, true);
          QuoteUtils.announceAction('Previous quote displayed');
        }
      }
    }
    
    // Reset delta
    wheelDelta = 0;
  }, 100); // Faster response time
}


// Initialize with performance optimizations
document.addEventListener('DOMContentLoaded', () => {
  console.log('[init] DOM fully loaded, starting app...');
  
  // Use passive event listeners for better performance
  document.body.addEventListener('click', handleClick, { passive: false });
  document.body.addEventListener('keydown', handleKeyPress, { passive: false });
  
  // Add swipe gesture event listeners for mobile (anywhere on page)
  document.body.addEventListener('touchstart', handleSwipeStart, { passive: true });
  document.body.addEventListener('touchend', handleSwipeEnd, { passive: true });
  
  // Add mouse wheel navigation
  document.addEventListener('wheel', handleWheelNavigation, { passive: false });
  
  
  // Preload quotes immediately and start preloading system
  loadQuotes().then(() => {
    setRandomQuote();
    // Start preloading the next quote after a short delay
    setTimeout(() => PerformanceUtils.preloadNextQuote(), 1000);
    
    // Initialize bookmark counter
    QuoteUtils.updateBookmarkCounter();
  });
  
  // Monitor performance
  if ('performance' in window) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const perfData = performance.getEntriesByType('navigation')[0];
        console.log('Performance metrics:', {
          loadTime: perfData.loadEventEnd - perfData.loadEventStart,
          domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
          firstPaint: performance.getEntriesByType('paint').find(entry => entry.name === 'first-paint')?.startTime,
          firstContentfulPaint: performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint')?.startTime
        });
      }, 0);
    });
  }
});