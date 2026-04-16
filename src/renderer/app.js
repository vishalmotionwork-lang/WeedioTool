// ===== STATE =====
const state = {
  ready: false,
  currentTab: "downloads",
  videoInfo: null,
  selectedFormat: null,
  downloads: new Map(),
  fetchingInfo: false,
  // Transcript state
  channelVideos: [], // all fetched videos
  displayedVideos: [], // currently shown (sorted + paginated)
  selectedVideos: new Set(), // selected video IDs
  transcriptSort: "date", // 'date' or 'views'
  transcriptPage: 0, // pagination offset
  transcriptPageSize: 10,
  transcribing: false,
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
  loadAccountsTab();
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

  // --- Transcript Tab ---
  const channelInput = $("#channelUrlInput");
  const fetchChannelBtn = $("#fetchChannelBtn");

  channelInput.addEventListener("input", () => {
    fetchChannelBtn.disabled = !channelInput.value.trim();
  });

  channelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && channelInput.value.trim()) {
      handleFetchChannel();
    }
  });

  fetchChannelBtn.addEventListener("click", handleFetchChannel);

  // Filter buttons
  $$("#transcriptToolbar .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#transcriptToolbar .filter-btn").forEach((b) =>
        b.classList.remove("active"),
      );
      btn.classList.add("active");
      state.transcriptSort = btn.dataset.sort;
      state.transcriptPage = 0;
      state.selectedVideos.clear();
      renderTranscriptVideos();
    });
  });

  // Select all
  $("#selectAllVideos").addEventListener("change", (e) => {
    const visible = getVisibleVideos();
    if (e.target.checked) {
      visible.forEach((v) => state.selectedVideos.add(v.id));
    } else {
      state.selectedVideos.clear();
    }
    renderTranscriptVideos();
  });

  // Transcribe button
  $("#transcribeBtn").addEventListener("click", handleTranscribe);

  // Load more
  $("#loadMoreBtn").addEventListener("click", () => {
    state.transcriptPage++;
    renderTranscriptVideos();
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

  // Transcript progress
  window.mediagrab.onTranscriptProgress((data) => {
    updateTranscriptProgress(data);
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
    // YouTube channel → route to Transcripts tab
    {
      match: /youtube\.com\/@[^/]+\/?$/i,
      type: "channel",
      label: "YouTube Channel",
      icon: "📝",
    },
    {
      match: /youtube\.com\/(channel|c)\//i,
      type: "channel",
      label: "YouTube Channel",
      icon: "📝",
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

  // Channel URL → route to Transcripts tab
  if (detected.type === "channel") {
    $("#channelUrlInput").value = url;
    urlInput.value = "";
    fetchBtn.disabled = true;
    switchTab("transcripts");
    state.fetchingInfo = false;
    setFetchLoading(false);
    handleFetchChannel();
    return;
  }

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
      "X/Twitter — could not fetch this video",
      [
        "Direct API methods didn't find a video in this tweet",
        "Go to the <strong>Accounts</strong> tab and connect your X account for full access",
        "After connecting, try this URL again — no restart needed",
        "Make sure the tweet actually contains a video (not just images or text)",
      ],
      errorMsg,
      { platform: "twitter", label: "Connect X / Twitter" },
    );
    return;
  }

  if (isInstagram) {
    showErrorPanel(
      "Instagram — login required",
      [
        "Instagram blocks most downloads without an active session",
        "Go to the <strong>Accounts</strong> tab and log in to Instagram",
        "After connecting, try this URL again — no restart needed",
        "Make sure the URL points to a specific post or reel (not a profile page)",
      ],
      errorMsg,
      { platform: "instagram", label: "Connect Instagram" },
    );
    return;
  }

  if (isLinkedIn) {
    showErrorPanel(
      "LinkedIn — could not access this post",
      [
        "Most public LinkedIn posts with video work without login",
        "If restricted, go to the <strong>Accounts</strong> tab and connect LinkedIn",
        "Make sure the post URL is complete (not shortened)",
        "After connecting, try this URL again — no restart needed",
      ],
      errorMsg,
      { platform: "linkedin", label: "Connect LinkedIn" },
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

function showErrorPanel(title, steps, rawError, loginAction) {
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
        ${steps.map((s) => `<li>${s}</li>`).join("")}
      </ol>
    </div>
    ${
      loginAction
        ? `<div class="error-panel-login">
        <button class="btn-primary btn-sm" data-action="quick-login" data-platform="${loginAction.platform}">${escapeHtml(loginAction.label)}</button>
        <button class="btn-secondary btn-sm" data-action="go-accounts">Go to Accounts</button>
      </div>`
        : ""
    }
    ${rawError ? `<details class="error-panel-details"><summary>Technical details</summary><code>${escapeHtml(rawError).slice(0, 200)}</code></details>` : ""}
  `;

  panel
    .querySelector('[data-action="close-error"]')
    .addEventListener("click", () => panel.remove());

  // Quick login button
  const quickLoginBtn = panel.querySelector('[data-action="quick-login"]');
  if (quickLoginBtn) {
    quickLoginBtn.addEventListener("click", async () => {
      const platform = quickLoginBtn.dataset.platform;
      quickLoginBtn.disabled = true;
      quickLoginBtn.textContent = "Opening...";
      const result = await window.mediagrab.platformLogin(platform);
      if (result.success) {
        showToast("Connected! Try your URL again.", "success");
        panel.remove();
        loadAccountsTab();
      } else if (result.error !== "Login window closed") {
        showToast(`Login failed: ${result.error}`, "error");
        quickLoginBtn.disabled = false;
        quickLoginBtn.textContent = loginAction.label;
      } else {
        quickLoginBtn.disabled = false;
        quickLoginBtn.textContent = loginAction.label;
      }
    });
  }

  // Go to accounts button
  const goAccountsBtn = panel.querySelector('[data-action="go-accounts"]');
  if (goAccountsBtn) {
    goAccountsBtn.addEventListener("click", () => {
      panel.remove();
      switchTab("accounts");
      loadAccountsTab();
    });
  }

  // Insert after format picker
  const fpEl = $("#formatPicker");
  fpEl.parentNode.insertBefore(panel, fpEl.nextSibling);
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
    directUrl: info._directUrl || null,
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

// ===== TRANSCRIPT FUNCTIONS =====

async function handleFetchChannel() {
  const url = $("#channelUrlInput").value.trim();
  if (!url || state.transcribing) return;

  // Validate it looks like a YouTube channel
  if (!/youtube\.com\/@|youtube\.com\/channel\/|youtube\.com\/c\//i.test(url)) {
    showToast("Please enter a valid YouTube channel URL", "error");
    return;
  }

  const btn = $("#fetchChannelBtn");
  const btnText = btn.querySelector(".btn-text");
  const btnLoader = btn.querySelector(".btn-loader");
  btn.disabled = true;
  btnText.style.display = "none";
  btnLoader.style.display = "inline-block";

  try {
    const result = await window.mediagrab.fetchChannelVideos(url, 100);
    if (result.success && result.data.length > 0) {
      state.channelVideos = result.data;
      state.transcriptPage = 0;
      state.selectedVideos.clear();
      state.transcriptSort = "date";

      // Reset filter buttons
      $$("#transcriptToolbar .filter-btn").forEach((b) =>
        b.classList.remove("active"),
      );
      $$("#transcriptToolbar .filter-btn")[0].classList.add("active");
      $("#selectAllVideos").checked = false;

      $("#transcriptToolbar").style.display = "flex";
      $("#emptyTranscripts").style.display = "none";
      $("#transcriptProgress").style.display = "none";

      renderTranscriptVideos();
      showToast(`Loaded ${result.data.length} videos`);
    } else {
      showToast(result.error || "No videos found on this channel", "error");
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }

  btn.disabled = false;
  btnText.style.display = "inline";
  btnLoader.style.display = "none";
}

function getSortedVideos() {
  const videos = [...state.channelVideos];
  if (state.transcriptSort === "views") {
    videos.sort((a, b) => b.viewCount - a.viewCount);
  }
  // 'date' keeps original order (yt-dlp returns newest first by default)
  return videos;
}

function getVisibleVideos() {
  const sorted = getSortedVideos();
  const end = (state.transcriptPage + 1) * state.transcriptPageSize;
  return sorted.slice(0, end);
}

function renderTranscriptVideos() {
  const list = $("#transcriptVideoList");
  const sorted = getSortedVideos();
  const visible = getVisibleVideos();

  list.innerHTML = "";

  for (const video of visible) {
    const isSelected = state.selectedVideos.has(video.id);
    const card = document.createElement("div");
    card.className = `transcript-video-card${isSelected ? " selected" : ""}`;
    card.dataset.videoId = video.id;

    card.innerHTML = `
      <input type="checkbox" ${isSelected ? "checked" : ""}>
      <img class="transcript-video-thumb" src="${escapeAttr(video.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">
      <div class="transcript-video-info">
        <div class="transcript-video-title">${escapeHtml(video.title)}</div>
        <div class="transcript-video-meta">
          ${video.viewCount ? `<span class="views">${formatViewCount(video.viewCount)} views</span>` : ""}
          ${video.duration ? `<span>${formatDuration(video.duration)}</span>` : ""}
          ${video.uploadDate ? `<span>${formatUploadDate(video.uploadDate)}</span>` : ""}
        </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return;
      toggleVideoSelection(video.id);
    });

    card.querySelector("input").addEventListener("change", () => {
      toggleVideoSelection(video.id);
    });

    list.appendChild(card);
  }

  // Load more button
  const hasMore = visible.length < sorted.length;
  const loadMoreEl = $("#transcriptLoadMore");
  loadMoreEl.style.display = hasMore ? "flex" : "none";
  if (hasMore) {
    const remaining = sorted.length - visible.length;
    $("#loadMoreBtn").textContent = `Load More (${remaining} remaining)`;
  }

  updateSelectionCount();
}

function toggleVideoSelection(videoId) {
  if (state.selectedVideos.has(videoId)) {
    state.selectedVideos.delete(videoId);
  } else {
    state.selectedVideos.add(videoId);
  }

  // Update card UI without full re-render
  const card = $(`.transcript-video-card[data-video-id="${videoId}"]`);
  if (card) {
    const isSelected = state.selectedVideos.has(videoId);
    card.classList.toggle("selected", isSelected);
    card.querySelector("input").checked = isSelected;
  }

  updateSelectionCount();
}

function updateSelectionCount() {
  const count = state.selectedVideos.size;
  $("#selectedCount").textContent = `${count} selected`;
  $("#transcribeBtn").disabled = count === 0 || state.transcribing;

  // Update select-all checkbox state
  const visible = getVisibleVideos();
  const allSelected =
    visible.length > 0 && visible.every((v) => state.selectedVideos.has(v.id));
  $("#selectAllVideos").checked = allSelected;
}

async function handleTranscribe() {
  if (state.selectedVideos.size === 0 || state.transcribing) return;

  // Ask user for output folder
  const outputDir = await window.mediagrab.selectFolder();
  if (!outputDir) return; // cancelled

  state.transcribing = true;
  $("#transcribeBtn").disabled = true;
  $("#transcribeBtn").textContent = "Transcribing...";

  // Build the list of videos to transcribe
  const videosToTranscribe = state.channelVideos
    .filter((v) => state.selectedVideos.has(v.id))
    .map((v) => ({
      url: v.url.startsWith("http")
        ? v.url
        : `https://www.youtube.com/watch?v=${v.id}`,
      title: v.title,
      id: v.id,
    }));

  // Show progress section
  const progressEl = $("#transcriptProgress");
  const progressList = $("#transcriptProgressList");
  progressEl.style.display = "block";
  $("#transcriptProgressText").textContent =
    `Transcribing 0/${videosToTranscribe.length}...`;
  progressList.innerHTML = "";

  for (const video of videosToTranscribe) {
    const item = document.createElement("div");
    item.className = "transcript-progress-item";
    item.id = `tp-${video.id}`;
    item.innerHTML = `
      <span class="title">${escapeHtml(video.title)}</span>
      <span class="status">Waiting...</span>
    `;
    progressList.appendChild(item);
  }

  try {
    const result = await window.mediagrab.transcribeVideos(
      videosToTranscribe,
      outputDir,
    );
    if (result.success) {
      const succeeded = result.data.filter((r) => r.success).length;
      const failed = result.data.filter((r) => !r.success).length;
      let msg = `Done! ${succeeded} transcript${succeeded !== 1 ? "s" : ""} saved`;
      if (failed > 0) msg += `, ${failed} failed`;
      showToast(msg, failed > 0 ? "" : "success");
    }
  } catch (err) {
    showToast(`Transcription error: ${err.message}`, "error");
  }

  state.transcribing = false;
  $("#transcribeBtn").disabled = false;
  $("#transcribeBtn").textContent = "Transcribe Selected";
}

function updateTranscriptProgress(data) {
  const { index, total, title, status, error } = data;
  $("#transcriptProgressText").textContent =
    `Transcribing ${index + 1}/${total}...`;

  // Find the progress item by scanning (more reliable than ID matching)
  const items = $$("#transcriptProgressList .transcript-progress-item");
  const item = items[index];
  if (!item) return;

  const statusEl = item.querySelector(".status");
  statusEl.className = `status ${status}`;

  if (status === "processing") {
    statusEl.textContent = "Processing...";
  } else if (status === "complete") {
    statusEl.textContent = "Done";
  } else if (status === "error") {
    statusEl.textContent = error || "Failed";
  }

  if (index === total - 1 && (status === "complete" || status === "error")) {
    $("#transcriptProgressText").textContent = "Transcription complete";
  }
}

function formatViewCount(count) {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

function formatUploadDate(dateStr) {
  // yt-dlp returns YYYYMMDD format
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  try {
    const date = new Date(`${year}-${month}-${day}`);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ===== ACCOUNTS TAB =====

const PLATFORM_META = {
  instagram: { icon: "IG", label: "Instagram", iconClass: "instagram" },
  twitter: { icon: "X", label: "X / Twitter", iconClass: "twitter" },
  linkedin: { icon: "in", label: "LinkedIn", iconClass: "linkedin" },
};

async function loadAccountsTab() {
  const status = await window.mediagrab.platformLoginStatus();
  const list = $("#accountsList");
  list.innerHTML = "";

  for (const [platformId, meta] of Object.entries(PLATFORM_META)) {
    const info = status[platformId] || { loggedIn: false };
    const card = document.createElement("div");
    card.className = `account-card${info.loggedIn ? " connected" : ""}`;
    card.id = `account-${platformId}`;

    const statusText = info.loggedIn
      ? `Connected${info.lastLogin ? ` \u00b7 ${formatDate(info.lastLogin)}` : ""}`
      : "Not connected";

    card.innerHTML = `
      <div class="account-icon ${meta.iconClass}">${meta.icon}</div>
      <div class="account-info">
        <div class="account-name">${meta.label}</div>
        <div class="account-status${info.loggedIn ? " connected" : ""}">${statusText}</div>
      </div>
      <div class="account-actions">
        ${
          info.loggedIn
            ? `
          <button class="btn-login" data-action="relogin" data-platform="${platformId}">Refresh</button>
          <button class="btn-logout" data-action="logout" data-platform="${platformId}">Disconnect</button>
        `
            : `
          <button class="btn-login" data-action="login" data-platform="${platformId}">Log in</button>
        `
        }
      </div>
    `;

    // Login / refresh
    const loginBtn = card.querySelector(
      '[data-action="login"], [data-action="relogin"]',
    );
    if (loginBtn) {
      loginBtn.addEventListener("click", async () => {
        loginBtn.disabled = true;
        loginBtn.textContent = "Opening...";
        showToast(`Opening ${meta.label} login...`);

        const result = await window.mediagrab.platformLogin(platformId);
        if (result.success) {
          showToast(`${meta.label} connected!`, "success");
        } else if (result.error !== "Login window closed") {
          showToast(`Login failed: ${result.error}`, "error");
        }

        loadAccountsTab();
      });
    }

    // Logout
    const logoutBtn = card.querySelector('[data-action="logout"]');
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await window.mediagrab.platformLogout(platformId);
        showToast(`${meta.label} disconnected`);
        loadAccountsTab();
      });
    }

    list.appendChild(card);
  }
}

// ===== GLOBAL FUNCTIONS (called from onclick in HTML) =====
window.openFile = (filePath) => window.mediagrab.openFile(filePath);
window.openFolder = (filePath) => window.mediagrab.openFolder(filePath);
window.cancelDownload = (id) => window.mediagrab.cancelDownload(id);

// ===== START =====
init();
