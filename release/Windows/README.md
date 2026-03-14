# WeedioTool — Windows Installation

## Install (EXE Installer)

1. Double-click `WeedioTool-Setup-1.0.0.exe`
2. Follow the installer steps (choose install location if you want)
3. WeedioTool will appear on your Desktop and Start Menu
4. If Windows SmartScreen blocks it:
   - Click **"More info"**
   - Click **"Run anyway"**
   - This happens because the app isn't code-signed (safe to proceed)

## Portable Version (No Install Needed)

1. Double-click `WeedioTool-1.0.0-portable.exe`
2. It runs directly — no installation required
3. Good for USB drives or shared computers

---

## How It Works

- Paste any URL (YouTube, Instagram, LinkedIn, TikTok, etc.) and click **Grab**
- Choose quality/format and click **Download Selected**
- Files save wherever you choose (file picker opens each time)

## Auto-Updates

- **yt-dlp** (the download engine) updates automatically on every launch
- This means if YouTube/Instagram/etc. changes their site, WeedioTool fixes itself
- No manual updates needed for download compatibility

## Troubleshooting

| Problem | Solution |
|---------|----------|
| SmartScreen blocks app | Click "More info" > "Run anyway" |
| Slow first launch | yt-dlp + ffmpeg are downloading (~80MB one-time) |
| Twitter/X not working | Log in to X in Brave/Chrome first, restart WeedioTool |
| Video won't play | Already fixed — outputs H.264 MP4 (plays everywhere) |
| App disappeared | Check system tray (bottom-right) — click icon to reopen |

## Windows Build Note

The Windows installer needs to be built on a Windows machine or CI.
To build: `npm run build:win` from the WeedioTool project folder.
