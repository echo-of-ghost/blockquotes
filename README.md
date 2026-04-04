# Blockquote.sh

![blockquote.sh screenshot](assets/screenshot.png)

Welcome to blockquote.sh, a growing collection of Bitcoin and Bitcoin-related quotes rendered through historically accurate CRT terminal themes. Share your favourite quotes and contribute your own.

## 🎮 Controls

### Desktop (Keyboard Shortcuts)

- **`Space`** — Pause/resume quote display (or finish typing immediately)
- **`N`** — Next quote (when paused)
- **`P`** — Previous quote / back in history (when paused)
- **`T`** — Cycle terminal theme
- **`U`** — Toggle uppercase/lowercase
- **`C`** — Copy current quote to clipboard
- **`X`** — Share quote to X/Twitter
- **`L`** — Copy shareable link for current quote
- **`B`** — Bookmark/unbookmark current quote
- **`Shift+V`** — View bookmark list
- **`E`** — Export bookmarks as JSON download
- **`/`** — Search quotes
- **`W`** — Clock mode (full-screen HH:MM:SS)
- **`?`** — Show keyboard shortcut help
- **`R`** — Reload page
- **`Mouse Wheel Down`** — Next quote (when paused)
- **`Mouse Wheel Up`** — Previous quote / back in history (when paused)

### Mobile (Touch Gestures)

- **Tap** — Pause/resume quote display (or finish typing immediately)
- **Swipe Left** — Next quote (when paused)
- **Swipe Right** — Previous quote / back in history (when paused)
- **Swipe Up** — Toggle uppercase/lowercase
- **Swipe Down** — Copy shareable link for current quote
- **Long Press** — Share current quote to X/Twitter
- **Device Shake** — Change terminal theme

## 📖 Features

### Quote Display

- **Typewriter Effect** — Quotes appear character by character at historically accurate baud rates per terminal
- **12 Retro Terminal Themes** — IBM 3279 Green, DEC VT220 Blue-Green, Commodore PET 2001 Green, IBM 3279 Bitcoin Orange, Wyse WY-50 Amber, Zenith Z-19 Green, ADM-3A Green, Kaypro II Green, DEC VT05 White, DEC VT100 Amber, Apple II Green, Commodore 64
- **Per-theme CRT Simulation** — Phosphor glow, scanlines, vignette, cursor blink rate, and warm-up animation all calibrated to real hardware specs
- **CRT Phosphor Resync** — Chromatic aberration flash on theme change simulates deflection coil settling

### Bookmarking System

- **Save Favourites** — Bookmark quotes with `B`
- **Browse List** — Full scrollable bookmark list via `Shift+V`; navigate with arrow keys, `Enter` to jump to a quote
- **Export** — Download all bookmarks as a JSON file with `E`
- **Bookmark Counter** — Live count badge in the top-left corner
- **Multi-tab Sync** — Bookmark counter stays in sync across open tabs

### Navigation

- **Quote History** — Navigate back through previously seen quotes via swipe right, scroll up, or `P`
- **Search** — Press `/` and type to jump to a matching quote; multiple matches pick randomly
- **Shareable Links** — Copy a direct URL to any quote with `L`
- **URL Quote Loading** — Shared links open directly to the correct quote
- **Clock Mode** — Full-screen phosphor clock via `W`; any key exits

### Easter Eggs

- **`LOAD "$",8`** — On Commodore 64 or PET 2001 theme, shows a C64-style disk directory listing of all quotes
- **`CATALOG`** — On Apple II theme, shows an Apple DOS CATALOG listing of all quotes
- **`satoshi`** — On any theme, types out the Bitcoin genesis block coinbase message
- **`stats`** — On any theme, shows quote database statistics

## 🛠️ Getting Started

Clone the repo:

```
git clone https://github.com/echo-of-ghost/blockquotes.git
```

Open `index.html` in a browser — no build step required.

## 📝 Submit a Quote

Open an issue or submit a pull request with your quote and optional attribution. Example format:

```yaml
- text: "Quote text here"
  author: "Name"
```

Fork the repo, steal the quotes, make it better.

## 📚 Tech Stack

- **Frontend:** HTML, CSS, JavaScript (ES modules, no build step)
- **Quote Database:** JSON
- **Deployment:** GitHub Pages
