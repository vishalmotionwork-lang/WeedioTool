const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { getYtdlpPath } = require("./binary-manager");

/**
 * Fetch video list from a YouTube channel using yt-dlp flat-playlist.
 * Returns array of { id, title, url, viewCount, uploadDate, duration, thumbnail }
 */
function fetchChannelVideos(channelUrl, limit = 100) {
  const ytdlpPath = getYtdlpPath();

  // Clean trailing slashes/params but don't force /videos — some channels
  // only have Shorts or other tabs, and yt-dlp handles tab discovery itself
  let url = channelUrl.replace(/\?.*$/, "").replace(/\/$/, "");

  const args = [
    "--flat-playlist",
    "--dump-json",
    "--no-warnings",
    "--no-check-certificates",
    "--playlist-items",
    `1:${limit}`,
    url,
  ];

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(ytdlpPath, args, { timeout: 120000 });

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }

      try {
        const videos = stdout
          .trim()
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => {
            const data = JSON.parse(line);
            // Prefer webpage_url, fall back to url, then construct from ID
            const videoUrl =
              data.webpage_url ||
              data.url ||
              `https://www.youtube.com/watch?v=${data.id}`;
            return {
              id: data.id,
              title: data.title || "Untitled",
              url: videoUrl,
              viewCount: data.view_count || 0,
              uploadDate: data.upload_date || "",
              duration: data.duration || 0,
              thumbnail:
                (data.thumbnails &&
                  data.thumbnails[data.thumbnails.length - 1] &&
                  data.thumbnails[data.thumbnails.length - 1].url) ||
                `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,
            };
          });
        resolve(videos);
      } catch (err) {
        reject(new Error("Failed to parse channel video list"));
      }
    });

    proc.on("error", reject);
  });
}

/**
 * Download auto-generated subtitles for a video and convert VTT → plain text.
 * Saves a .txt file in outputDir.
 */
function transcribeVideo(videoUrl, outputDir, title) {
  const ytdlpPath = getYtdlpPath();
  const sanitizedTitle = sanitizeFilename(title);
  const basePath = path.join(outputDir, sanitizedTitle);
  const txtPath = basePath + ".txt";

  const args = [
    "--write-auto-sub",
    "--write-subs",
    "--sub-lang",
    "en",
    "--skip-download",
    "--sub-format",
    "vtt",
    "--no-warnings",
    "--no-check-certificates",
    "-o",
    basePath + ".%(ext)s",
    videoUrl,
  ];

  return new Promise((resolve, reject) => {
    let stderr = "";

    const proc = spawn(ytdlpPath, args, { timeout: 120000 });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", () => {
      // yt-dlp writes .vtt files — find whichever variant it created
      const vttFile = findVttFile(outputDir, sanitizedTitle);

      if (!vttFile) {
        return reject(
          new Error(
            stderr ||
              "No subtitle file generated — video may not have captions",
          ),
        );
      }

      try {
        const vttContent = fs.readFileSync(vttFile, "utf-8");
        const plainText = convertVttToText(vttContent);
        fs.writeFileSync(txtPath, plainText, "utf-8");
        // Clean up VTT file
        fs.unlinkSync(vttFile);
        resolve({ outputPath: txtPath, title: sanitizedTitle });
      } catch (err) {
        reject(new Error(`Failed to convert subtitle: ${err.message}`));
      }
    });

    proc.on("error", reject);
  });
}

/**
 * Find the VTT file yt-dlp created — handles various naming patterns.
 */
function findVttFile(dir, baseName) {
  const candidates = [
    `${baseName}.en.vtt`,
    `${baseName}.en.auto.vtt`,
    `${baseName}.vtt`,
  ];

  for (const name of candidates) {
    const fullPath = path.join(dir, name);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Fallback: scan for any .vtt containing the base name prefix
  try {
    const prefix = baseName.slice(0, 40).toLowerCase();
    const files = fs.readdirSync(dir).filter((f) => {
      return f.endsWith(".vtt") && f.toLowerCase().includes(prefix);
    });
    if (files.length > 0) {
      return path.join(dir, files[0]);
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Convert WebVTT content to clean plain text (no timestamps, no dupes).
 */
function convertVttToText(vttContent) {
  const lines = vttContent.split("\n");
  const textLines = [];
  const seen = new Set();

  for (const line of lines) {
    // Skip headers, timestamps, sequence numbers, blank lines
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("WEBVTT") ||
      trimmed.startsWith("Kind:") ||
      trimmed.startsWith("Language:") ||
      trimmed.startsWith("NOTE") ||
      trimmed.includes("-->") ||
      /^\d+$/.test(trimmed)
    ) {
      continue;
    }

    // Strip HTML tags (YouTube auto-captions use <c> tags)
    const cleanLine = trimmed.replace(/<[^>]+>/g, "").trim();
    if (cleanLine && !seen.has(cleanLine)) {
      seen.add(cleanLine);
      textLines.push(cleanLine);
    }
  }

  return textLines.join("\n");
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

module.exports = {
  fetchChannelVideos,
  transcribeVideo,
};
