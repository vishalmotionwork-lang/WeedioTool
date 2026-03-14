# WeedioTool

Download videos, audio & images from YouTube, Instagram, LinkedIn, TikTok, and 1800+ sites.

---

## Install on Windows (Easy — 3 steps)

### Step 1: Install Node.js
- Go to https://nodejs.org
- Click the big green **"Download Node.js"** button
- Run the installer, click Next through everything, done

### Step 2: Download WeedioTool
- Click the green **"Code"** button on this page → **"Download ZIP"**
- Unzip the downloaded folder
- Open the unzipped folder

### Step 3: Run WeedioTool
- Double-click on the folder path bar at the top (in File Explorer) and type `cmd` then press Enter
- This opens a black command window. Type these two commands:

```
npm install
npm start
```

That's it! WeedioTool will open.

> **First launch takes ~1 minute** (it downloads the video engine). After that, it opens instantly.

### (Optional) Build a Windows Installer

If you want a proper `.exe` installer to share with others:

```
npm run build:win
```

The installer will be in the `dist/` folder.

---

## Install on Mac (Easy — 3 steps)

### Step 1: Install Node.js
- Go to https://nodejs.org and download + install

### Step 2: Download WeedioTool
- Click **"Code"** → **"Download ZIP"** on this page
- Unzip and open the folder

### Step 3: Run WeedioTool
- Open **Terminal** (search for it in Spotlight)
- Drag the WeedioTool folder into Terminal, then type:

```
npm install
npm start
```

### (Optional) Build a Mac Installer

```
npm run build:mac
```

The `.dmg` file will be in the `dist/` folder.

---

## How to Use

1. **Paste any URL** in the input bar (YouTube, Instagram, LinkedIn, etc.)
2. Click **Grab** — it detects the content type automatically
3. **Pick quality** (4K, 1080p, 720p, audio only)
4. Click **Download Selected** — choose where to save
5. Done! File saves as MP4 (plays on any device)

## Features

- Downloads from **1800+ websites**
- **Auto-updates** the download engine on every launch (never breaks)
- **H.264 MP4** output (plays everywhere — QuickTime, VLC, phones)
- **Batch download** — paste multiple URLs at once
- **Clip YouTube videos** — download only a specific timestamp range
- **Image scraping** — extract images from news articles
- **Download history** — see all past downloads, re-download with one click
- **System tray** — minimize and downloads continue in background

## Supported Sites

YouTube, Instagram Reels, LinkedIn Posts, TikTok, Facebook, Vimeo, Dailymotion, Reddit, Twitter/X (requires login), and 1800+ more.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm` not found | Install Node.js from https://nodejs.org |
| Slow first launch | Normal — downloading video engine (~37MB one-time) |
| Twitter/X error | Log in to X in your browser first, restart WeedioTool |
| Mac: "unidentified developer" | System Settings > Privacy & Security > Open Anyway |
| Windows: SmartScreen warning | Click "More info" > "Run anyway" |
| Video won't play | Already handled — outputs H.264 MP4 |
