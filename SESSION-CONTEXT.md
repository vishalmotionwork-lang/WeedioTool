# WeedioTool — Session Context

## Project Overview
**Type**: Electron desktop app — universal media downloader
**Platforms**: Windows + macOS
**Stack**: Electron + Node.js + yt-dlp + ffmpeg-static + SQLite + Cheerio
**Location**: `~/WeedioTool/`
**Created**: 2026-03-14
**Repo**: https://github.com/vishalmotionwork-lang/WeedioTool
**Release**: https://github.com/vishalmotionwork-lang/WeedioTool/releases/tag/v1.0.0

## Current Status (v1.0.0 — shipped)
- [x] Core download engine (yt-dlp + ffmpeg)
- [x] Quality/format picker with H.264 MP4 output
- [x] URL auto-detection badge (YouTube/Instagram/LinkedIn/Twitter etc.)
- [x] Clipboard auto-paste on input focus
- [x] Grab button always clickable (waits for init in background)
- [x] Batch download (multiple URLs via + button)
- [x] Clip section (YouTube only — timestamp slider + manual input)
- [x] Image scraper for news/article sites
- [x] Smart fallback: video fails → tries images → error panel with steps
- [x] Download history (SQLite, merged into Downloads tab as "Previous Downloads")
- [x] Clean completion state ("Downloaded" text, no progress bar)
- [x] System tray (minimize to tray, downloads continue)
- [x] Auto-update yt-dlp on every launch (future-proofing)
- [x] Smart error panel with per-site login instructions (Twitter/Instagram/LinkedIn)
- [x] App icon (custom rounded PNG — @anmoldeev photo)
- [x] Mac build (.dmg universal — Intel + Apple Silicon)
- [x] GitHub repo + Release with Mac DMG
- [ ] Windows .exe build (needs Windows machine — instructions in repo)
- [ ] Code signing (removes "unidentified developer" warning)

## Auth / Cookie Status
| Site | Needs Login? | Status |
|------|-------------|--------|
| YouTube | No | Works without cookies |
| LinkedIn | No (public) | Works without cookies — tested |
| Instagram | No (public) | Works without cookies |
| Twitter/X | YES | Requires browser login — error panel guides user |
| TikTok | No | Works without cookies |
| Facebook | Varies | Public works |

**Cookie approach**: No cookies by default (avoids macOS Keychain prompts). If needed, user logs in via Brave/Chrome and restarts app.

## Key Technical Decisions
1. **No cookies by default** — avoids Keychain password prompts on macOS
2. **yt-dlp auto-updates on launch** — sites change APIs, yt-dlp patches within hours
3. **H.264 + AAC forced** (`--merge-output-format mp4`, `-S vcodec:h264`, `--recode-video mp4`) — universal playback
4. **ffmpeg bundled via npm** (`ffmpeg-static`) — no external dependency
5. **Clip section YouTube-only** — other platforms don't support `--download-sections`
6. **Twitter syndication API removed** — unreliable, returns 404s
7. **Smart error handling** — per-site error panels with step-by-step fix instructions
8. **Image scraping skipped for social media** (Twitter/Instagram use client-side rendering, scraper gets garbage)

## Issues Encountered & Fixed
- ffmpeg download 404 → switched to `ffmpeg-static` npm package
- QuickTime "not compatible" → forced H.264 codec with `--recode-video mp4`
- Keychain password prompt spam → removed `--cookies-from-browser` from default flow
- Twitter syndication API 404 → removed, using default extractor
- Grab button disabled during init → made always clickable, waits for ready in background
- Progress bar/speed showing after completion → hidden, shows "Downloaded" text only
- Detect badge cluttering URL bar → moved inside input field, subtle styling
- LinkedIn detected as "Article" → fixed URL pattern ordering, LinkedIn matches first
- Image scraper returning garbage for Twitter → skip scraping for social media, show login guide

## File Structure
```
~/WeedioTool/
├── package.json              # Dependencies + build config
├── src/
│   ├── main/
│   │   ├── index.js          # Main process, IPC handlers, app lifecycle
│   │   ├── binary-manager.js # yt-dlp download/update, video info, startDownload
│   │   ├── download-manager.js # Queue (3 concurrent), cancel, history integration
│   │   ├── history.js        # SQLite DB for download history
│   │   ├── image-scraper.js  # Cheerio-based image extraction from web pages
│   │   ├── cookie-manager.js # Browser detection (Brave/Chrome/Firefox/Edge)
│   │   └── tray.js           # System tray icon + menu
│   ├── preload.js            # IPC bridge (contextIsolation safe)
│   └── renderer/
│       ├── index.html        # UI structure
│       ├── styles.css        # Dark theme CSS
│       └── app.js            # All UI logic, detection, format picker, clip slider
└── assets/
    ├── icon.png              # App icon (rounded)
    ├── icon.icns             # macOS icon
    └── tray-icon.png         # System tray icon
```

## Dev Commands
- `npm start` — launch app
- `npm run build:mac` — build .dmg (Mac)
- `npm run build:win` — build .exe (Windows — must run on Windows)

## Resume Instructions
- To continue development: `cd ~/WeedioTool && npm start`
- To rebuild Mac: `npm run build:mac` → output in `dist/`
- To push updates: `git add -A && git commit -m "msg" && git push`
- Windows build: must be done on a Windows machine or GitHub Actions CI
