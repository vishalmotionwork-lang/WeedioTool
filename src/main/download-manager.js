const path = require("path");
const { getVideoInfo, startDownload } = require("./binary-manager");
const { addToHistory, isDuplicate } = require("./history");
const {
  getTwitterVideoInfo,
  downloadDirectUrl,
  isTwitterUrl,
} = require("./twitter-downloader");

const MAX_CONCURRENT = 3;

function createDownloadManager(mainWindow) {
  const queue = [];
  const active = new Map();
  let nextId = 1;

  function sendToRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }

  function processQueue() {
    while (active.size < MAX_CONCURRENT && queue.length > 0) {
      const item = queue.shift();
      executeDownload(item);
    }
  }

  async function executeDownload(item) {
    active.set(item.id, item);
    sendToRenderer("download:started", { id: item.id });

    try {
      // Twitter: try direct MP4 download first (no yt-dlp needed)
      if (isTwitterUrl(item.url) && item.directUrl) {
        await downloadDirectUrl(item.directUrl, item.outputPath, (progress) => {
          sendToRenderer("download:progress", {
            id: item.id,
            ...progress,
          });
        });
      } else {
        // Standard yt-dlp download (with cookies auto-injected)
        const download = startDownload(
          item.url,
          item.outputPath,
          item.formatId,
          (progress) => {
            sendToRenderer("download:progress", {
              id: item.id,
              ...progress,
            });
          },
          item.clipStart,
          item.clipEnd,
        );

        item.process = download.process;
        await download.promise;
      }

      addToHistory({
        url: item.url,
        title: item.title,
        outputPath: item.outputPath,
        thumbnail: item.thumbnail,
        duration: item.duration,
        site: item.site,
      });

      sendToRenderer("download:complete", {
        id: item.id,
        outputPath: item.outputPath,
      });
    } catch (error) {
      sendToRenderer("download:error", { id: item.id, error: error.message });
    } finally {
      active.delete(item.id);
      processQueue();
    }
  }

  async function fetchInfo(url) {
    // Twitter: try direct API first (no auth needed)
    if (isTwitterUrl(url)) {
      try {
        const twitterInfo = await getTwitterVideoInfo(url);
        if (twitterInfo) {
          return {
            title: twitterInfo.title,
            thumbnail: twitterInfo.thumbnail,
            duration: twitterInfo.duration,
            extractor: "twitter",
            webpage_url: url,
            _directUrl: twitterInfo.url,
            _method: twitterInfo.method,
            formats: twitterInfo.variants.map((v, i) => ({
              format_id: `direct-${i}`,
              url: v.url,
              vcodec: "h264",
              acodec: "mp4a",
              ext: "mp4",
              height: null,
              filesize: null,
              tbr: v.bitrate ? v.bitrate / 1000 : null,
            })),
          };
        }
      } catch {
        // Fall through to yt-dlp
      }
    }

    // Standard yt-dlp path (cookies auto-injected for Instagram/LinkedIn/etc)
    const info = await getVideoInfo(url);
    return info;
  }

  function addDownload({
    url,
    title,
    outputPath,
    formatId,
    thumbnail,
    duration,
    site,
    clipStart,
    clipEnd,
    directUrl,
  }) {
    const duplicate = isDuplicate(url);

    const id = nextId++;
    const item = {
      id,
      url,
      title,
      outputPath,
      formatId,
      thumbnail,
      duration,
      site,
      clipStart,
      clipEnd,
      directUrl,
      status: "queued",
      duplicate,
    };

    if (active.size < MAX_CONCURRENT) {
      executeDownload(item);
    } else {
      queue.push(item);
      sendToRenderer("download:queued", { id, position: queue.length });
    }

    return { id, duplicate };
  }

  function cancelDownload(id) {
    const activeItem = active.get(id);
    if (activeItem && activeItem.process) {
      activeItem.process.kill("SIGTERM");
      active.delete(id);
      sendToRenderer("download:cancelled", { id });
      processQueue();
      return true;
    }

    const queueIndex = queue.findIndex((item) => item.id === id);
    if (queueIndex !== -1) {
      queue.splice(queueIndex, 1);
      sendToRenderer("download:cancelled", { id });
      return true;
    }

    return false;
  }

  function cancelAll() {
    for (const [id, item] of active) {
      if (item.process) {
        item.process.kill("SIGTERM");
      }
      sendToRenderer("download:cancelled", { id });
    }
    active.clear();

    for (const item of queue) {
      sendToRenderer("download:cancelled", { id: item.id });
    }
    queue.length = 0;
  }

  function getStatus() {
    return {
      active: active.size,
      queued: queue.length,
      items: [
        ...Array.from(active.values()).map((i) => ({
          id: i.id,
          title: i.title,
          status: "downloading",
        })),
        ...queue.map((i) => ({ id: i.id, title: i.title, status: "queued" })),
      ],
    };
  }

  return {
    fetchInfo,
    addDownload,
    cancelDownload,
    cancelAll,
    getStatus,
  };
}

module.exports = { createDownloadManager };
