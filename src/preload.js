const { contextBridge, ipcRenderer, clipboard } = require("electron");

contextBridge.exposeInMainWorld("mediagrab", {
  readClipboard: () => clipboard.readText(),

  fetchInfo: (url) => ipcRenderer.invoke("fetch-info", url),

  startDownload: (options) => ipcRenderer.invoke("start-download", options),
  cancelDownload: (id) => ipcRenderer.invoke("cancel-download", id),
  cancelAll: () => ipcRenderer.invoke("cancel-all"),

  scrapeImages: (url) => ipcRenderer.invoke("scrape-images", url),
  downloadImage: (imageUrl, outputPath) =>
    ipcRenderer.invoke("download-image", imageUrl, outputPath),

  getHistory: (limit, offset) =>
    ipcRenderer.invoke("get-history", limit, offset),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  deleteHistoryItem: (id) => ipcRenderer.invoke("delete-history-item", id),
  searchHistory: (query) => ipcRenderer.invoke("search-history", query),

  selectFolder: () => ipcRenderer.invoke("select-folder"),
  selectSaveLocation: (defaultName) =>
    ipcRenderer.invoke("select-save-location", defaultName),
  openFile: (filePath) => ipcRenderer.invoke("open-file", filePath),
  openFolder: (filePath) => ipcRenderer.invoke("open-folder", filePath),

  getAppStatus: () => ipcRenderer.invoke("get-app-status"),
  getBrowsers: () => ipcRenderer.invoke("get-browsers"),

  // Transcripts
  fetchChannelVideos: (channelUrl, limit) =>
    ipcRenderer.invoke("fetch-channel-videos", channelUrl, limit),
  transcribeVideos: (videos, outputDir) =>
    ipcRenderer.invoke("transcribe-videos", videos, outputDir),

  // Platform Auth
  platformLogin: (platformId) =>
    ipcRenderer.invoke("platform-login", platformId),
  platformLoginStatus: () => ipcRenderer.invoke("platform-login-status"),
  platformLogout: (platformId) =>
    ipcRenderer.invoke("platform-logout", platformId),

  onDownloadStarted: (callback) => {
    ipcRenderer.on("download:started", (_, data) => callback(data));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on("download:progress", (_, data) => callback(data));
  },
  onDownloadComplete: (callback) => {
    ipcRenderer.on("download:complete", (_, data) => callback(data));
  },
  onDownloadError: (callback) => {
    ipcRenderer.on("download:error", (_, data) => callback(data));
  },
  onDownloadQueued: (callback) => {
    ipcRenderer.on("download:queued", (_, data) => callback(data));
  },
  onDownloadCancelled: (callback) => {
    ipcRenderer.on("download:cancelled", (_, data) => callback(data));
  },
  onStatusUpdate: (callback) => {
    ipcRenderer.on("status:update", (_, data) => callback(data));
  },
  onTranscriptProgress: (callback) => {
    ipcRenderer.on("transcript:progress", (_, data) => callback(data));
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
