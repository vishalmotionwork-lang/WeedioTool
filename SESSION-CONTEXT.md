# WeedioTool — Session Context

## Project Overview
**Type**: Electron desktop app — universal media downloader
**Platforms**: Windows + macOS
**Stack**: Electron + Node.js + yt-dlp + ffmpeg-static + SQLite + Cheerio
**Location**: `~/WeedioTool/`
**Created**: 2026-03-14

## Current Status
- [x] Core download engine (yt-dlp + ffmpeg)
- [x] Quality/format picker with H.264 MP4 output
- [x] URL auto-detection (YouTube/Instagram/LinkedIn/Twitter badge)
- [x] Clipboard auto-paste on input focus
- [x] Batch download (multiple URLs)
- [x] Clip section (timestamp slider + manual input)
- [x] Image scraper for news/article sites
- [x] Download history (SQLite, merged into Downloads tab)
- [x] System tray (minimize to tray, downloads continue)
- [x] Auto-update yt-dlp on every launch
- [x] Smart error panel with per-site fix instructions
- [x] App icon (purple gradient)
- [ ] Build installers (.exe, .dmg)
- [ ] Testing on Windows

## Auth / Cookie Status
| Site | Needs Login? | Status |
|------|-------------|--------|
| YouTube | No | Works |
| LinkedIn | No (public) | Works |
| Instagram | No (public) | Works |
| Twitter/X | YES | Needs browser login — error panel guides user |
| TikTok | No | Works |
| Facebook | Varies | Public works |

## Dev Commands
- `npm start` — launch app
- `npm run build:mac` — build .dmg
- `npm run build:win` — build .exe
