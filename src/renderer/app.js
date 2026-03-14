// ===== STATE =====
const state = {
  ready: false,
  currentTab: "downloads",
  videoInfo: null,
  selectedFormat: null,
  downloads: new Map(),
  fetchingInfo: false,
};

// ===== DOM REFS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const urlInput = $("#urlInput");
const fetchBtn = $("#fetchBtn");
const statusDot = $("#statusDot");
const statusText = $("#statusText");
const formatPicker = $("#formatPicker");
const formatList = $("#formatList");
const downloadList = $("#downloadList");
const imageGrid = $("#imageGrid");
const historyList = $("#historyList");

// ===== INIT =====
function init() {
  setupEventListeners();
  setupIpcListeners();
  loadHistory();
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // URL input
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && urlInput.value.trim()) {
      handleFetch();
    }
  });

  // Click input → auto-paste URL from clipboard
  // Click/focus input → auto-paste URL from clipboard and enable button immediately
  urlInput.addEventListener("focus", () => {
    if (urlInput.value.trim()) return;
    const clip = window.mediagrab.readClipboard();
    if (clip && (clip.startsWith("http://") || clip.startsWith("https://"))) {
      urlInput.value = clip;
      updateInputState();
    }
  });

  function updateInputState() {
    const url = urlInput.value.trim();
    const hasUrl = !!url;
    fetchBtn.disabled = !hasUrl;

    // Live detection badge
    const badge = $("#detectBadge");
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      const detected = detectUrlType(url);
      badge.textContent = `${detected.icon} ${detected.label}`;
      badge.className = `detect-badge ${detected.type}`;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  }

  urlInput.addEventListener("input", updateInputState);

  // Paste event — auto fetch
  urlInput.addEventListener("paste", () => {
    setTimeout(() => {
      if (urlInput.value.trim() && state.ready) {
        handleFetch();
      }
    }, 100);
  });

  fetchBtn.addEventListener("click", handleFetch);

  // Tabs
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // Batch mode toggle
  const batchToggle = $("#batchToggle");
  const batchWrapper = $("#batchWrapper");
  const batchInput = $("#batchInput");
  const batchCount = $("#batchCount");
  const batchGrabBtn = $("#batchGrabBtn");

  batchToggle.addEventListener("click", () => {
    const isOpen = batchWrapper.style.display !== "none";
    batchWrapper.style.display = isOpen ? "none" : "block";
    batchToggle.classList.toggle("active", !isOpen);
  });

  batchInput.addEventListener("input", () => {
    const urls = parseBatchUrls(batchInput.value);
    batchCount.textContent = `${urls.length} URL${urls.length !== 1 ? "s" : ""}`;
    batchGrabBtn.disabled = urls.length === 0 || !state.ready;
  });

  batchGrabBtn.addEventListener("click", handleBatchGrab);

  // Clip toggle
  $("#clipEnabled").addEventListener("change", (e) => {
    $("#clipInputs").style.display = e.target.checked ? "flex" : "none";
  });

  // Clip slider
  setupClipSlider();

  // Format picker
  $("#downloadBtn").addEventListener("click", handleDownload);
  $("#cancelFetchBtn").addEventListener("click", hideFormatPicker);

  // History clear button
  $("#clearHistoryBtn").addEventListener("click", async () => {
    await window.mediagrab.clearHistory();
    loadHistory();
    showToast("History cleared");
  });
}

// ===== IPC LISTENERS =====
function setupIpcListeners() {
  window.mediagrab.onStatusUpdate((data) => {
    statusText.textContent = data.message;
    if (data.ready) {
      statusDot.className = "status-dot ready";
      state.ready = true;
      const hasUrl = !!urlInput.value.trim();
      fetchBtn.disabled = !hasUrl;
    } else if (data.error) {
      statusDot.className = "status-dot error";
    }
  });

  window.mediagrab.onDownloadStarted((data) => {
    const item = state.downloads.get(data.id);
    if (item) {
      item.status = "downloading";
      renderDownloadItem(item);
    }
  });

  window.mediagrab.onDownloadProgress((data) => {
    const item = state.downloads.get(data.id);
    if (item) {
      item.percent = data.percent;
      item.speed = data.speed;
      item.eta = data.eta;
      updateDownloadProgress(item);
    }
  });

  window.mediagrab.onDownloadComplete((data) => {
    const item = state.downloads.get(data.id);
    if (item) {
      item.status = "complete";
      item.outputPath = data.outputPath;
      item.percent = 100;
      renderDownloadItem(item);
      showToast("Download complete!", "success");
      loadHistory();
    }
  });

  window.mediagrab.onDownloadError((data) => {
    const item = state.downloads.get(data.id);
    if (item) {
      item.status = "error";
      item.error = data.error;
      renderDownloadItem(item);
      showToast(`Download failed: ${data.error}`, "error");
    }
  });

  window.mediagrab.onDownloadCancelled((data) => {
    const item = state.downloads.get(data.id);
    if (item) {
      item.status = "cancelled";
      renderDownloadItem(item);
    }
  });

  window.mediagrab.onDownloadQueued((data) => {
    const item = state.downloads.get(data.id);
    if (item) {
      item.status = "queued";
      item.position = data.position;
      renderDownloadItem(item);
    }
  });
}

// ===== URL DETECTION =====
function detectUrlType(url) {
  // Order matters — specific platforms first, generic patterns last
  const patterns = [
    // Video platforms (always video)
    {
      match: /youtube\.com\/watch/i,
      type: "video",
      label: "YouTube Video",
      icon: "▶",
    },
    {
      match: /youtube\.com\/shorts/i,
      type: "video",
      label: "YouTube Short",
      icon: "▶",
    },
    { match: /youtu\.be\//i, type: "video", label: "YouTube Video", icon: "▶" },
    {
      match: /instagram\.com\/(reel|reels)\//i,
      type: "video",
      label: "Instagram Reel",
      icon: "▶",
    },
    {
      match: /instagram\.com\/stories\//i,
      type: "video",
      label: "Instagram Story",
      icon: "▶",
    },
    {
      match: /instagram\.com\/p\//i,
      type: "mixed",
      label: "Instagram Post",
      icon: "📷",
    },
    { match: /instagram\.com/i, type: "mixed", label: "Instagram", icon: "📷" },
    {
      match: /(twitter|x)\.com\/.*\/status/i,
      type: "mixed",
      label: "Twitter/X Post",
      icon: "🐦",
    },
    { match: /tiktok\.com/i, type: "video", label: "TikTok Video", icon: "▶" },
    {
      match: /facebook\.com.*\/videos?\//i,
      type: "video",
      label: "Facebook Video",
      icon: "▶",
    },
    { match: /fb\.watch/i, type: "video", label: "Facebook Video", icon: "▶" },
    {
      match: /facebook\.com/i,
      type: "mixed",
      label: "Facebook Post",
      icon: "📘",
    },
    // LinkedIn — posts can contain video, always try video first
    {
      match: /linkedin\.com\/posts\//i,
      type: "mixed",
      label: "LinkedIn Post",
      icon: "💼",
    },
    {
      match: /linkedin\.com\/.*\/video/i,
      type: "video",
      label: "LinkedIn Video",
      icon: "💼",
    },
    { match: /linkedin\.com/i, type: "mixed", label: "LinkedIn", icon: "💼" },
    // Other video platforms
    { match: /vimeo\.com/i, type: "video", label: "Vimeo Video", icon: "▶" },
    {
      match: /dailymotion\.com/i,
      type: "video",
      label: "Dailymotion",
      icon: "▶",
    },
    { match: /twitch\.tv/i, type: "video", label: "Twitch", icon: "▶" },
    {
      match: /reddit\.com\/.*\/comments/i,
      type: "mixed",
      label: "Reddit Post",
      icon: "💬",
    },
    // Image-only sites
    { match: /pinterest\.com/i, type: "image", label: "Pinterest", icon: "📌" },
    { match: /flickr\.com/i, type: "image", label: "Flickr", icon: "📷" },
  ];

  for (const pattern of patterns) {
    if (pattern.match.test(url)) {
      return pattern;
    }
  }

  return { type: "unknown", label: "Website", icon: "🌐" };
}

// ===== FETCH URL INFO =====
async function handleFetch() {
  const url = urlInput.value.trim();
  if (!url || state.fetchingInfo) return;

  state.fetchingInfo = true;
  setFetchLoading(true);

  // Wait for yt-dlp to be ready if still initializing
  if (!state.ready) {
    showToast("Initializing... please wait", "");
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (state.ready) {
          clearInterval(check);
          resolve();
        }
      }, 200);
      // Timeout after 15s
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 15000);
    });
  }

  const detected = detectUrlType(url);
  showToast(`${detected.icon} Detected: ${detected.label}`, "");

  if (detected.type === "video") {
    // Pure video — fetch info and show format picker
    await fetchVideoInfo(url);
  } else if (detected.type === "image") {
    // Pure image site — scrape images
    await handleImageScrape(url);
  } else if (detected.type === "mixed") {
    // Could be video or image — always try video first
    try {
      const videoResult = await window.mediagrab.fetchInfo(url);
      if (videoResult.success) {
        state.videoInfo = videoResult.data;
        showFormatPicker(videoResult.data);
        switchTab("downloads");
      } else {
        handleFetchError(url, videoResult.error, detected);
      }
    } catch (err) {
      handleFetchError(url, err.message, detected);
    }
  } else {
    // Unknown — try video first, fall back to images
    await fetchVideoInfo(url, true);
  }

  state.fetchingInfo = false;
  setFetchLoading(false);
}

async function fetchVideoInfo(url, fallbackToImages = false) {
  try {
    const result = await window.mediagrab.fetchInfo(url);
    if (result.success) {
      state.videoInfo = result.data;
      showFormatPicker(result.data);
      switchTab("downloads");
    } else if (fallbackToImages) {
      await handleImageScrape(url);
    } else {
      handleFetchError(url, result.error, detectUrlType(url));
    }
  } catch (err) {
    if (fallbackToImages) {
      await handleImageScrape(url);
    } else {
      handleFetchError(url, err.message, detectUrlType(url));
    }
  }
}

async function handleImageScrape(url) {
  try {
    const result = await window.mediagrab.scrapeImages(url);
    if (result.success && result.data.length > 0) {
      renderImageGrid(result.data);
      switchTab("images");
      showToast(`Found ${result.data.length} images`);
    } else {
      showToast("No downloadable content found", "error");
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

// ===== SMART ERROR HANDLING =====
async function handleFetchError(url, errorMsg, detected) {
  // Twitter/X and Instagram use client-side rendering — scraping won't get real images
  // Show specific login/solution guide instead
  const isTwitter = /(twitter|x)\.com/i.test(url);
  const isInstagram = /instagram\.com/i.test(url);
  const isLinkedIn = /linkedin\.com/i.test(url);

  if (isTwitter) {
    showErrorPanel(
      "X/Twitter requires login to access content",
      [
        "X/Twitter blocks all downloads without a logged-in session",
        "Open Brave or Chrome → go to x.com → log in to your account",
        "Once logged in, WeedioTool can access your session automatically",
        "After logging in, restart WeedioTool and try again",
        "Note: This is a Twitter restriction, not a WeedioTool limitation",
      ],
      errorMsg,
    );
    return;
  }

  if (isInstagram) {
    showErrorPanel(
      "Instagram — this content may be private",
      [
        "Public reels and posts usually work without login",
        "If this is a private account, open Brave/Chrome → log in to Instagram",
        "After logging in, restart WeedioTool and try again",
        "Make sure the URL points to a specific post (not a profile page)",
      ],
      errorMsg,
    );
    return;
  }

  if (isLinkedIn) {
    showErrorPanel(
      "LinkedIn — could not access this post",
      [
        "Most public LinkedIn posts with video work without login",
        "If this post is private or restricted, open Brave/Chrome → log in to LinkedIn",
        "Make sure the post URL is complete (not shortened)",
        "After logging in, restart WeedioTool and try again",
      ],
      errorMsg,
    );
    return;
  }

  // For non-social sites, try image scraping
  try {
    const result = await window.mediagrab.scrapeImages(url);
    if (result.success && result.data.length > 0) {
      renderImageGrid(result.data);
      switchTab("images");
      showToast(
        `No video found — showing ${result.data.length} images instead`,
      );
      return;
    }
  } catch {
    /* ignore */
  }

  // Nothing worked
  showErrorPanel(
    "No downloadable content found",
    [
      "This URL may not contain any downloadable media",
      "Check that the URL is correct and the content is publicly accessible",
      "Try copying the direct link to the video or image instead",
      "If the site requires login, open it in your browser first and log in",
    ],
    errorMsg,
  );
}

function showErrorPanel(title, steps, rawError) {
  // Remove any existing error panel
  const existing = document.getElementById("errorPanel");
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = "errorPanel";
  panel.className = "error-panel";
  panel.innerHTML = `
    <div class="error-panel-header">
      <span class="error-panel-icon">!</span>
      <h4>${escapeHtml(title)}</h4>
      <button class="error-panel-close" data-action="close-error">x</button>
    </div>
    <div class="error-panel-steps">
      <p>How to fix:</p>
      <ol>
        ${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
      </ol>
    </div>
    ${rawError ? `<details class="error-panel-details"><summary>Technical details</summary><code>${escapeHtml(rawError).slice(0, 200)}</code></details>` : ""}
  `;

  panel
    .querySelector('[data-action="close-error"]')
    .addEventListener("click", () => panel.remove());

  // Insert after format picker
  const formatPicker = $("#formatPicker");
  formatPicker.parentNode.insertBefore(panel, formatPicker.nextSibling);
  switchTab("downloads");
}

// ===== FORMAT PICKER =====
function showFormatPicker(info) {
  formatPicker.style.display = "block";

  const thumb = $("#videoThumb");
  const title = $("#videoTitle");
  const duration = $("#videoDuration");
  const site = $("#videoSite");

  thumb.src = info.thumbnail || "";
  thumb.style.display = info.thumbnail ? "block" : "none";
  title.textContent = info.title || "Unknown Title";
  duration.textContent = info.duration ? formatDuration(info.duration) : "";
  site.textContent = info.extractor || "";

  // Clip section — only show for YouTube (other platforms don't support timestamp downloads)
  const isYouTube = /youtube|youtu\.be/i.test(
    info.extractor || info.webpage_url || "",
  );
  const clipSection = $(".clip-section");
  if (isYouTube && info.duration) {
    clipSection.style.display = "block";
    if (window._resetClipSlider) {
      window._resetClipSlider(info.duration);
    }
  } else {
    clipSection.style.display = "none";
  }
  $("#clipEnabled").checked = false;
  $("#clipInputs").style.display = "none";

  // Build format list
  const formats = buildFormatOptions(info);
  formatList.innerHTML = "";
  state.selectedFormat = null;

  formats.forEach((fmt, index) => {
    const div = document.createElement("div");
    div.className = `format-option${index === 0 ? " selected" : ""}`;
    div.innerHTML = `
      <input type="radio" name="format" value="${fmt.id}" ${index === 0 ? "checked" : ""}>
      <span class="format-label">
        <span class="format-quality">${fmt.label}</span>
      </span>
      <span class="format-ext">${fmt.ext}</span>
      <span class="format-size">${fmt.size || ""}</span>
    `;

    div.addEventListener("click", () => {
      $$(".format-option").forEach((el) => el.classList.remove("selected"));
      div.classList.add("selected");
      div.querySelector("input").checked = true;
      state.selectedFormat = fmt.id;
    });

    if (index === 0) state.selectedFormat = fmt.id;
    formatList.appendChild(div);
  });
}

function hideFormatPicker() {
  formatPicker.style.display = "none";
  state.videoInfo = null;
  state.selectedFormat = null;
}

function buildFormatOptions(info) {
  const options = [];

  if (!info.formats || info.formats.length === 0) {
    options.push({ id: "best", label: "Best Quality", ext: "mp4", size: "" });
    options.push({
      id: "bestaudio",
      label: "Audio Only",
      ext: "mp3",
      size: "",
    });
    return options;
  }

  // Group by resolution
  const resolutions = new Map();
  const audioFormats = [];

  for (const fmt of info.formats) {
    if (fmt.acodec !== "none" && (fmt.vcodec === "none" || !fmt.vcodec)) {
      audioFormats.push(fmt);
      continue;
    }

    if (fmt.height && fmt.vcodec !== "none") {
      const key = fmt.height;
      if (
        !resolutions.has(key) ||
        (fmt.filesize &&
          (!resolutions.get(key).filesize ||
            fmt.filesize > resolutions.get(key).filesize))
      ) {
        resolutions.set(key, fmt);
      }
    }
  }

  // Sort by resolution descending
  const sortedRes = Array.from(resolutions.entries())
    .sort((a, b) => b[0] - a[0])
    .slice(0, 6);

  for (const [height, fmt] of sortedRes) {
    const label =
      height >= 2160 ? "4K" : height >= 1440 ? "1440p" : `${height}p`;
    options.push({
      id: `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`,
      label,
      ext: "mp4",
      size: fmt.filesize ? formatBytes(fmt.filesize) : "",
    });
  }

  // If no video formats found, add best
  if (options.length === 0) {
    options.push({ id: "best", label: "Best Quality", ext: "mp4", size: "" });
  }

  // Audio options
  options.push({
    id: "bestaudio[ext=m4a]/bestaudio",
    label: "Audio Only (M4A)",
    ext: "m4a",
    size: "",
  });
  options.push({
    id: "bestaudio",
    label: "Audio Only (Best)",
    ext: "opus",
    size: "",
  });

  return options;
}

// ===== QUICK DOWNLOAD (skip format picker) =====
async function handleQuickDownload() {
  const url = urlInput.value.trim();
  if (!url || !state.ready) return;

  const result = await window.mediagrab.startDownload({
    url,
    title: url.split("/").pop() || "Download",
    formatId: "bestvideo+bestaudio/best",
    thumbnail: null,
    duration: null,
    site: null,
  });

  if (result.success) {
    const downloadItem = {
      id: result.id,
      title: url,
      thumbnail: null,
      status: "starting",
      percent: 0,
      speed: "",
      eta: "",
      duplicate: result.duplicate,
    };

    state.downloads.set(result.id, downloadItem);
    renderDownloadItem(downloadItem);
    switchTab("downloads");
    hideEmptyState("downloads");
    urlInput.value = "";
    fetchBtn.disabled = true;
    showToast("Downloading best quality MP4...", "success");
  } else if (!result.cancelled) {
    showToast("Failed to start download", "error");
  }
}

// ===== DOWNLOAD =====
async function handleDownload() {
  if (!state.videoInfo) return;

  const info = state.videoInfo;
  const formatId = state.selectedFormat || "best";

  // Get clip timestamps if enabled
  const clipEnabled = $("#clipEnabled").checked;
  let clipStart = null;
  let clipEnd = null;
  if (clipEnabled) {
    clipStart = $("#clipStart").value.trim() || null;
    clipEnd = $("#clipEnd").value.trim() || null;
  }

  const result = await window.mediagrab.startDownload({
    url: info.webpage_url || info.url || urlInput.value.trim(),
    title: info.title || "Download",
    formatId,
    thumbnail: info.thumbnail,
    duration: info.duration,
    site: info.extractor,
    clipStart,
    clipEnd,
  });

  if (result.success) {
    const downloadItem = {
      id: result.id,
      title: info.title || "Download",
      thumbnail: info.thumbnail,
      status: "starting",
      percent: 0,
      speed: "",
      eta: "",
      duplicate: result.duplicate,
    };

    state.downloads.set(result.id, downloadItem);
    renderDownloadItem(downloadItem);
    hideFormatPicker();
    hideEmptyState("downloads");
    urlInput.value = "";
    fetchBtn.disabled = true;
  } else if (result.cancelled) {
    // User cancelled save dialog, do nothing
  } else {
    showToast("Failed to start download", "error");
  }
}

// ===== BATCH DOWNLOAD =====
function parseBatchUrls(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line && (line.startsWith("http://") || line.startsWith("https://")),
    );
}

async function handleBatchGrab() {
  const urls = parseBatchUrls($("#batchInput").value);
  if (urls.length === 0) return;

  switchTab("downloads");
  hideEmptyState("downloads");
  showToast(`Processing ${urls.length} URLs...`);

  for (const url of urls) {
    try {
      const result = await window.mediagrab.fetchInfo(url);
      if (result.success) {
        const info = result.data;
        const dlResult = await window.mediagrab.startDownload({
          url: info.webpage_url || info.url || url,
          title: info.title || url,
          formatId: "best",
          thumbnail: info.thumbnail,
          duration: info.duration,
          site: info.extractor,
        });

        if (dlResult.success) {
          const downloadItem = {
            id: dlResult.id,
            title: info.title || url,
            thumbnail: info.thumbnail,
            status: "starting",
            percent: 0,
            speed: "",
            eta: "",
            duplicate: dlResult.duplicate,
          };
          state.downloads.set(dlResult.id, downloadItem);
          renderDownloadItem(downloadItem);
        }
      } else {
        showToast(`Failed: ${url}`, "error");
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
    }
  }

  $("#batchInput").value = "";
  $("#batchCount").textContent = "0 URLs";
  $("#batchGrabBtn").disabled = true;
}

// ===== RENDER DOWNLOADS =====
function renderDownloadItem(item) {
  let el = document.getElementById(`dl-${item.id}`);

  if (!el) {
    el = document.createElement("div");
    el.id = `dl-${item.id}`;
    el.className = "download-item";
    downloadList.prepend(el);
  }

  const progressClass =
    item.status === "complete"
      ? "complete"
      : item.status === "error"
        ? "error"
        : "";

  const isActive =
    item.status === "downloading" ||
    item.status === "queued" ||
    item.status === "starting";

  el.innerHTML = `
    <div class="download-item-info">
      <div class="download-item-title">${escapeHtml(item.title)}</div>
      ${
        isActive
          ? `
        <div class="download-progress-bar">
          <div class="download-progress-fill ${progressClass}" style="width: ${item.percent || 0}%"></div>
        </div>
        <div class="download-meta">
          <span>${getStatusLabel(item)}</span>
          ${item.speed && item.speed !== "N/A" ? `<span>${item.speed}</span>` : ""}
          ${item.eta && item.eta !== "N/A" ? `<span>ETA: ${item.eta}</span>` : ""}
        </div>
      `
          : `
        <div class="download-meta">
          ${item.status === "complete" ? `<span class="status-complete">Downloaded</span>` : ""}
          ${item.status === "error" ? `<span class="status-error">${item.error || "Failed"}</span>` : ""}
          ${item.status === "cancelled" ? `<span>Cancelled</span>` : ""}
        </div>
      `
      }
    </div>
    <div class="download-actions">
      ${
        item.status === "complete"
          ? `
        <button class="download-action-btn" data-action="play" title="Open file">▶</button>
        <button class="download-action-btn" data-action="folder" title="Show in folder">📁</button>
      `
          : ""
      }
      ${
        isActive
          ? `
        <button class="download-action-btn cancel" data-action="cancel" title="Cancel">✕</button>
      `
          : ""
      }
    </div>
  `;

  // Attach event listeners (avoids inline onclick path escaping issues)
  if (item.status === "complete" && item.outputPath) {
    const playBtn = el.querySelector('[data-action="play"]');
    const folderBtn = el.querySelector('[data-action="folder"]');
    if (playBtn)
      playBtn.addEventListener("click", () =>
        window.mediagrab.openFile(item.outputPath),
      );
    if (folderBtn)
      folderBtn.addEventListener("click", () =>
        window.mediagrab.openFolder(item.outputPath),
      );
  }
  if (isActive) {
    const cancelBtn = el.querySelector('[data-action="cancel"]');
    if (cancelBtn)
      cancelBtn.addEventListener("click", () =>
        window.mediagrab.cancelDownload(item.id),
      );
  }
}

function updateDownloadProgress(item) {
  const el = document.getElementById(`dl-${item.id}`);
  if (!el) return;

  const fill = el.querySelector(".download-progress-fill");
  if (fill) fill.style.width = `${item.percent}%`;

  const meta = el.querySelector(".download-meta");
  if (meta) {
    meta.innerHTML = `
      <span>${item.percent.toFixed(1)}%</span>
      ${item.speed ? `<span>${item.speed}</span>` : ""}
      ${item.eta ? `<span>ETA: ${item.eta}</span>` : ""}
    `;
  }
}

function getStatusLabel(item) {
  switch (item.status) {
    case "starting":
      return "Starting...";
    case "downloading":
      return `${(item.percent || 0).toFixed(1)}%`;
    case "complete":
      return "Complete";
    case "error":
      return `Error: ${item.error || "Unknown"}`;
    case "cancelled":
      return "Cancelled";
    case "queued":
      return `Queued (#${item.position || "?"})`;
    default:
      return item.status;
  }
}

// ===== IMAGE GRID =====
function renderImageGrid(images) {
  imageGrid.innerHTML = "";
  $("#emptyImages").style.display = "none";

  for (const img of images) {
    const card = document.createElement("div");
    card.className = "image-card";
    card.innerHTML = `
      <img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.alt)}" loading="lazy" onerror="this.parentElement.remove()">
      <div class="image-overlay">
        <button class="image-download-btn">Save</button>
      </div>
    `;

    card
      .querySelector(".image-download-btn")
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        const result = await window.mediagrab.downloadImage(img.url);
        if (result.success) {
          showToast("Image saved!", "success");
        } else if (!result.cancelled) {
          showToast(`Failed: ${result.error}`, "error");
        }
      });

    imageGrid.appendChild(card);
  }
}

// ===== HISTORY (merged into downloads tab) =====
async function loadHistory() {
  const history = await window.mediagrab.getHistory(50, 0);
  renderHistory(history);
}

function renderHistory(items) {
  historyList.innerHTML = "";
  const section = $("#historySection");

  if (items.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  for (const item of items) {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <div class="history-item-info">
        <div class="history-item-title">${escapeHtml(item.title || item.url)}</div>
        <div class="history-item-meta">
          ${item.site || ""} · ${formatDate(item.downloaded_at)}
        </div>
      </div>
      <div class="history-item-actions">
        <button class="download-action-btn" data-action="redownload" title="Re-download">↻</button>
        <button class="download-action-btn" data-action="showfolder" title="Show in folder">📁</button>
        <button class="download-action-btn cancel" data-action="deletehistory" title="Delete">✕</button>
      </div>
    `;

    div
      .querySelector('[data-action="redownload"]')
      .addEventListener("click", (e) => {
        e.stopPropagation();
        urlInput.value = item.url;
        handleFetch();
      });

    div
      .querySelector('[data-action="showfolder"]')
      .addEventListener("click", (e) => {
        e.stopPropagation();
        if (item.output_path) window.mediagrab.openFolder(item.output_path);
      });

    div
      .querySelector('[data-action="deletehistory"]')
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        await window.mediagrab.deleteHistoryItem(item.id);
        div.remove();
        showToast("Removed from history");
        // Hide section if empty
        if (historyList.children.length === 0) {
          section.style.display = "none";
        }
      });

    historyList.appendChild(div);
  }
}

// ===== TABS =====
function switchTab(tabName) {
  state.currentTab = tabName;
  $$(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === tabName),
  );
  $$(".tab-content").forEach((tc) => tc.classList.remove("active"));
  $(`#${tabName}Tab`).classList.add("active");
}

// ===== CLIP SLIDER (Instagram-style drag) =====
function setupClipSlider() {
  const track = $("#clipTrack");
  const range = $("#clipRange");
  const handleStart = $("#clipHandleStart");
  const handleEnd = $("#clipHandleEnd");
  const startLabel = $("#clipSliderStart");
  const endLabel = $("#clipSliderEnd");
  const durationLabel = $("#clipSliderDuration");
  const startInput = $("#clipStart");
  const endInput = $("#clipEnd");

  let videoDuration = 0;
  let startPercent = 0;
  let endPercent = 100;
  let dragging = null;

  function updateSliderUI() {
    const left = startPercent;
    const right = 100 - endPercent;
    range.style.left = `${left}%`;
    range.style.right = `${right}%`;
    handleStart.style.left = `calc(${left}% - 7px)`;
    handleEnd.style.left = `calc(${endPercent}% - 7px)`;

    const startTime = (startPercent / 100) * videoDuration;
    const endTime = (endPercent / 100) * videoDuration;
    const clipDur = endTime - startTime;

    startLabel.textContent = formatDuration(startTime);
    endLabel.textContent = formatDuration(endTime);
    durationLabel.textContent = `${formatDuration(clipDur)} selected`;

    startInput.value = formatDuration(startTime);
    endInput.value = formatDuration(endTime);
  }

  function getPercent(e) {
    const rect = track.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    return Math.max(0, Math.min(100, (x / rect.width) * 100));
  }

  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const pct = getPercent(e);

    if (dragging === "start") {
      startPercent = Math.min(pct, endPercent - 2);
    } else {
      endPercent = Math.max(pct, startPercent + 2);
    }
    updateSliderUI();
  }

  function onEnd() {
    if (dragging) {
      const el = dragging === "start" ? handleStart : handleEnd;
      el.classList.remove("dragging");
    }
    dragging = null;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onEnd);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);
  }

  handleStart.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = "start";
    handleStart.classList.add("dragging");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
  });

  handleEnd.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = "end";
    handleEnd.classList.add("dragging");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
  });

  // Touch support
  handleStart.addEventListener("touchstart", (e) => {
    e.preventDefault();
    dragging = "start";
    handleStart.classList.add("dragging");
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  });

  handleEnd.addEventListener("touchstart", (e) => {
    e.preventDefault();
    dragging = "end";
    handleEnd.classList.add("dragging");
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  });

  // Click on track to jump
  track.addEventListener("click", (e) => {
    if (e.target === handleStart || e.target === handleEnd) return;
    const pct = getPercent(e);
    const distToStart = Math.abs(pct - startPercent);
    const distToEnd = Math.abs(pct - endPercent);
    if (distToStart < distToEnd) {
      startPercent = Math.min(pct, endPercent - 2);
    } else {
      endPercent = Math.max(pct, startPercent + 2);
    }
    updateSliderUI();
  });

  // Manual input sync
  startInput.addEventListener("change", () => {
    const secs = parseTimestamp(startInput.value);
    if (secs !== null && videoDuration > 0) {
      startPercent = Math.max(
        0,
        Math.min((secs / videoDuration) * 100, endPercent - 2),
      );
      updateSliderUI();
    }
  });

  endInput.addEventListener("change", () => {
    const secs = parseTimestamp(endInput.value);
    if (secs !== null && videoDuration > 0) {
      endPercent = Math.min(
        100,
        Math.max((secs / videoDuration) * 100, startPercent + 2),
      );
      updateSliderUI();
    }
  });

  // Expose reset function for when new video loads
  window._resetClipSlider = function (duration) {
    videoDuration = duration || 300; // Default to 5 min if unknown
    startPercent = 0;
    endPercent = 100;
    updateSliderUI();
  };
}

function parseTimestamp(str) {
  if (!str) return null;
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

// ===== HELPERS =====
function setFetchLoading(loading) {
  const btnText = fetchBtn.querySelector(".btn-text");
  const btnLoader = fetchBtn.querySelector(".btn-loader");
  fetchBtn.disabled = loading;
  btnText.style.display = loading ? "none" : "inline";
  btnLoader.style.display = loading ? "inline-block" : "none";
}

function hideEmptyState(tab) {
  const el = $(`#empty${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  if (el) el.style.display = "none";
}

function showToast(message, type = "") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ===== GLOBAL FUNCTIONS (called from onclick in HTML) =====
window.openFile = (filePath) => window.mediagrab.openFile(filePath);
window.openFolder = (filePath) => window.mediagrab.openFolder(filePath);
window.cancelDownload = (id) => window.mediagrab.cancelDownload(id);

// ===== START =====
init();
