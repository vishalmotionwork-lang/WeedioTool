const path = require("path");
const { getVideoInfo, startDownload } = require("./binary-manager");
const { addToHistory, isDuplicate } = require("./history");

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
