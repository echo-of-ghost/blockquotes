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
  isUppercase: false // Tracks case mode (true = uppercase, false = lowercase)
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
 * Displays a quote with typing effect.
 * @param {Object} quote - Quote to display
 * @param {number} startIndex - Typing start index
 * @param {boolean} finishImmediately - Skip typing effect
 */
function displayQuote(quote, startIndex = 0, finishImmediately = false) {
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

  function formatAuthor(author) {
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
    span.innerHTML = finalHtml;
    return span.innerHTML;
  }

  function typeQuote() {
    const typingSpeed = config.performanceMode ? 0 : config.typingSpeed;
    finishImmediately = finishImmediately || typingSpeed === 0;

    if (finishImmediately || state.isPaused) {
      try {
        elements.quoteContainer.innerHTML = `${quoteText}<span class="author">> ${formatAuthor(quote.author)}</span>`;
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
      if (state.currentIndex === 0) elements.quoteContainer.textContent = '';
      elements.quoteContainer.textContent = quoteText.slice(0, state.currentIndex + 1);
      state.currentIndex++;
      state.timeoutId = optimizedSetTimeout(typeQuote, typingSpeed);
    } else {
      try {
        elements.quoteContainer.innerHTML = `${quoteText}<span class="author">> ${formatAuthor(quote.author)}</span>`;
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
      state.timeoutId = optimizedSetTimeout(() => {
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
 * Displays a random quote.
 */
async function setRandomQuote() {
  if (state.isPaused) return;
  const quotes = await loadQuotes();
  const validQuotes = quotes.filter(isValidQuote);
  if (validQuotes.length === 0) {
    console.warn('No valid quotes available');
    elements.quoteContainer.textContent = 'No quotes available';
    elements.errorMessage.textContent = 'No valid quotes available';
    elements.errorMessage.classList.add('error-active');
    return;
  }
  console.log('Loaded quotes:', validQuotes);
  const randomQuote = validQuotes[Math.floor(Math.random() * validQuotes.length)];
  console.log('Selected quote:', randomQuote);
  displayQuote(randomQuote);
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
    displayQuote(random, 0, true);
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
}

// Performance optimization: Use requestAnimationFrame for smooth animations
function optimizedSetTimeout(callback, delay) {
  if (config.performanceMode) {
    return setTimeout(callback, 0);
  }
  return setTimeout(callback, delay);
}

// Swipe gesture detection for mobile
let startX = 0;
let startY = 0;

function handleSwipeStart(event) {
  if (event.touches && event.touches.length === 1) {
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }
}

function handleSwipeEnd(event) {
  if (!event.changedTouches || event.changedTouches.length !== 1) return;
  
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
        displayQuote(random, 0, true);
        QuoteUtils.announceAction('Next quote displayed');
      }
    }
  }
  
  // Vertical swipe (up/down)
  if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > minSwipeDistance) {
    if (diffY > 0) {
      // Swipe up - toggle uppercase
      toggleTextCase();
    }
  }
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
  
  
  // Preload quotes immediately
  loadQuotes().then(() => {
    setRandomQuote();
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