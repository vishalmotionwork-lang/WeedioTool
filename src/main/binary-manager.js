const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile, spawn } = require("child_process");
const https = require("https");
const os = require("os");

const BINARIES_DIR = path.join(app.getPath("userData"), "bin");

function getPlatformInfo() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "darwin") {
    return {
      ytdlp: "yt-dlp_macos",
      ext: "",
      ffmpegZip: arch === "arm64" ? "ffmpeg-darwin-arm64" : "ffmpeg-darwin-x64",
    };
  }

  return {
    ytdlp: "yt-dlp.exe",
    ext: ".exe",
    ffmpegZip: "ffmpeg-win32-x64",
  };
}

function getYtdlpPath() {
  const info = getPlatformInfo();
  return path.join(BINARIES_DIR, `yt-dlp${info.ext}`);
}

function getLocalFfmpegPath() {
  const info = getPlatformInfo();
  return path.join(BINARIES_DIR, `ffmpeg${info.ext}`);
}

function getFfmpegPath() {
  // 1. Check bundled ffmpeg-static (handles asar unpacking for packaged apps)
  try {
    const bundledPath = require("ffmpeg-static").replace(
      "app.asar",
      "app.asar.unpacked",
    );
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
  } catch {
    // ffmpeg-static not available
  }

  // 2. Check locally downloaded ffmpeg in app's bin directory
  const localPath = getLocalFfmpegPath();
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // 3. Fallback to system ffmpeg (rarely available for end users)
  return "ffmpeg";
}

function ensureBinDir() {
  if (!fs.existsSync(BINARIES_DIR)) {
    fs.mkdirSync(BINARIES_DIR, { recursive: true });
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(
          new Error(`Download failed with status ${response.statusCode}`),
        );
      }

      const totalBytes = parseInt(response.headers["content-length"], 10);
      let downloadedBytes = 0;

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes) {
          const percent = Math.round((downloadedBytes / totalBytes) * 100);
          process.stdout.write(`\rDownloading: ${percent}%`);
        }
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        if (os.platform() !== "win32") {
          fs.chmodSync(destPath, 0o755);
        }
        resolve(destPath);
      });
    });

    request.on("error", (err) => {
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });
  });
}

async function downloadFfmpeg() {
  ensureBinDir();
  const info = getPlatformInfo();
  const ext = info.ext || "";
  const destPath = path.join(BINARIES_DIR, `ffmpeg${ext}`);

  // Use ffmpeg-static's GitHub releases (same source as the npm package)
  const version = "b6.0";
  const zipName = `${info.ffmpegZip}.gz`;
  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${version}/${zipName}`;

  console.log("Downloading ffmpeg...");
  const gzPath = path.join(BINARIES_DIR, zipName);
  await downloadFile(url, gzPath);

  // Decompress .gz to get the ffmpeg binary
  const zlib = require("zlib");
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(gzPath);
    const output = fs.createWriteStream(destPath);
    input
      .pipe(zlib.createGunzip())
      .pipe(output)
      .on("finish", resolve)
      .on("error", reject);
  });

  // Cleanup gz and set executable
  fs.unlinkSync(gzPath);
  if (os.platform() !== "win32") {
    fs.chmodSync(destPath, 0o755);
  }

  console.log("\nffmpeg downloaded successfully");
  return destPath;
}

async function downloadYtdlp() {
  ensureBinDir();
  const info = getPlatformInfo();
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${info.ytdlp}`;
  const destPath = getYtdlpPath();

  console.log("Downloading yt-dlp...");
  await downloadFile(url, destPath);
  console.log("\nyt-dlp downloaded successfully");
  return destPath;
}

async function updateYtdlp() {
  const ytdlpPath = getYtdlpPath();

  if (!fs.existsSync(ytdlpPath)) {
    return downloadYtdlp();
  }

  return new Promise((resolve, reject) => {
    execFile(ytdlpPath, ["--update"], (error, stdout) => {
      if (error) {
        console.log("yt-dlp update failed, re-downloading...");
        return downloadYtdlp().then(resolve).catch(reject);
      }
      console.log("yt-dlp update check:", stdout.trim());
      resolve(ytdlpPath);
    });
  });
}

function isFfmpegAvailable() {
  const ffmpegPath = getFfmpegPath();
  // "ffmpeg" means no bundled or local binary was found
  if (ffmpegPath === "ffmpeg") return false;
  return fs.existsSync(ffmpegPath);
}

async function ensureBinaries(onProgress) {
  ensureBinDir();
  const ytdlpPath = getYtdlpPath();

  if (!fs.existsSync(ytdlpPath)) {
    if (onProgress) onProgress("Downloading yt-dlp (first launch)...");
    await downloadYtdlp();
  } else {
    if (onProgress) onProgress("Checking for updates...");
    await updateYtdlp();
  }

  // Ensure ffmpeg is available (bundled, local, or download it)
  if (!isFfmpegAvailable()) {
    if (onProgress) onProgress("Downloading ffmpeg (first launch)...");
    await downloadFfmpeg();
  }

  if (onProgress) onProgress("Ready");
}

function getVideoInfo(url) {
  const ytdlpPath = getYtdlpPath();

  const args = [
    "--dump-json",
    "--no-download",
    "--no-warnings",
    "--no-playlist",
    "--no-check-certificates",
    "--no-check-formats",
    "--socket-timeout",
    "10",
    "--extractor-args",
    "youtube:skip=dash,translated_subs",
  ];

  // Add platform cookies if available (saved from embedded browser login)
  const { getCookieArgsForUrl } = require("./platform-auth");
  const cookieArgs = getCookieArgsForUrl(url);
  args.push(...cookieArgs);

  args.push(url);

  return new Promise((resolve, reject) => {
    execFile(
      ytdlpPath,
      args,
      { maxBuffer: 10 * 1024 * 1024, timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr || error.message));
        }

        try {
          const lines = stdout.trim().split("\n");
          const results = lines.map((line) => JSON.parse(line));
          resolve(results.length === 1 ? results[0] : results);
        } catch (parseError) {
          reject(new Error("Failed to parse video info"));
        }
      },
    );
  });
}

function startDownload(
  url,
  outputPath,
  formatId,
  onProgress,
  clipStart,
  clipEnd,
) {
  const ytdlpPath = getYtdlpPath();
  const ffmpegPath = getFfmpegPath();
  const args = [
    "--ffmpeg-location",
    ffmpegPath,
    "-o",
    outputPath,
    "--newline",
    "--no-warnings",
    "--progress-template",
    "%(progress._percent_str)s|||%(progress._speed_str)s|||%(progress._eta_str)s",
  ];

  // Force MP4 output with H.264 codec (universal playback)
  const isAudioOnly = formatId && formatId.startsWith("bestaudio");
  if (!isAudioOnly) {
    args.push("--merge-output-format", "mp4");
    args.push("-S", "vcodec:h264,acodec:m4a");
    args.push("--recode-video", "mp4");
  }

  if (formatId) {
    args.push("-f", formatId);
  } else {
    args.push(
      "-f",
      "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best",
    );
  }

  // Timestamp clipping
  if (clipStart || clipEnd) {
    const start = clipStart || "0:00";
    const end = clipEnd || "inf";
    args.push("--download-sections", `*${start}-${end}`);
    args.push("--force-keyframes-at-cuts");
  }

  // Add platform cookies if available
  const { getCookieArgsForUrl } = require("./platform-auth");
  const dlCookieArgs = getCookieArgsForUrl(url);
  args.push(...dlCookieArgs);

  args.push(url);

  const proc = spawn(ytdlpPath, args);
  let lastError = "";

  proc.stdout.on("data", (data) => {
    const line = data.toString().trim();
    if (line.includes("|||")) {
      const [percent, speed, eta] = line.split("|||");
      if (onProgress) {
        onProgress({
          percent: parseFloat(percent) || 0,
          speed: speed || "N/A",
          eta: eta || "N/A",
        });
      }
    }
  });

  proc.stderr.on("data", (data) => {
    lastError = data.toString().trim();
  });

  return {
    process: proc,
    promise: new Promise((resolve, reject) => {
      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(lastError || `yt-dlp exited with code ${code}`));
        }
      });
      proc.on("error", reject);
    }),
  };
}

module.exports = {
  ensureBinaries,
  getYtdlpPath,
  getFfmpegPath,
  getVideoInfo,
  startDownload,
  updateYtdlp,
};
