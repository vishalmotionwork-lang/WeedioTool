const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Tray,
  Menu,
} = require("electron");
const path = require("path");
const { ensureBinaries } = require("./binary-manager");
const { createDownloadManager } = require("./download-manager");
const {
  getHistory,
  clearHistory,
  deleteHistoryItem,
  searchHistory,
  closeDb,
} = require("./history");
const {
  scrapeImages,
  downloadImage,
  getFilenameFromUrl,
} = require("./image-scraper");
const { getCookieArgs, getBrowserList } = require("./cookie-manager");
const { createTray, destroyTray } = require("./tray");

let mainWindow = null;
let downloadManager = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: "#0f0f0f",
    titleBarStyle: "hiddenInset",
    frame: process.platform !== "darwin",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, "..", "..", "assets", "icon.png"),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  downloadManager = createDownloadManager(mainWindow);
  createTray(mainWindow);

  initBinaries();

  return mainWindow;
}

async function initBinaries() {
  try {
    await ensureBinaries((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("status:update", { message: status });
      }
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("status:update", {
        message: "Ready",
        ready: true,
      });
    }
  } catch (error) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("status:update", {
        message: `Setup failed: ${error.message}`,
        error: true,
      });
    }
  }
}

// --- IPC Handlers ---

ipcMain.handle("fetch-info", async (_, url) => {
  try {
    const info = await downloadManager.fetchInfo(url);
    return { success: true, data: info };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("start-download", async (_, options) => {
  const {
    url,
    title,
    formatId,
    thumbnail,
    duration,
    site,
    clipStart,
    clipEnd,
  } = options;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Download",
    defaultPath: path.join(
      app.getPath("downloads"),
      sanitizeFilename(title || "download"),
    ),
    filters: [
      { name: "Video", extensions: ["mp4", "mkv", "webm"] },
      { name: "Audio", extensions: ["mp3", "m4a", "opus", "wav"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled) {
    return { success: false, cancelled: true };
  }

  const downloadResult = downloadManager.addDownload({
    url,
    title,
    outputPath: result.filePath,
    formatId,
    thumbnail,
    duration,
    site,
    clipStart,
    clipEnd,
  });

  return { success: true, ...downloadResult };
});

ipcMain.handle("cancel-download", (_, id) => {
  return downloadManager.cancelDownload(id);
});

ipcMain.handle("cancel-all", () => {
  downloadManager.cancelAll();
  return true;
});

ipcMain.handle("scrape-images", async (_, url) => {
  try {
    const images = await scrapeImages(url);
    return { success: true, data: images };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("download-image", async (_, imageUrl) => {
  const filename = getFilenameFromUrl(imageUrl);

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Image",
    defaultPath: path.join(app.getPath("downloads"), filename),
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled) {
    return { success: false, cancelled: true };
  }

  try {
    await downloadImage(imageUrl, result.filePath);
    return { success: true, outputPath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-history", (_, limit, offset) => {
  return getHistory(limit, offset);
});

ipcMain.handle("clear-history", () => {
  clearHistory();
  return true;
});

ipcMain.handle("delete-history-item", (_, id) => {
  deleteHistoryItem(id);
  return true;
});

ipcMain.handle("search-history", (_, query) => {
  return searchHistory(query);
});

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("select-save-location", async (_, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath("downloads"), defaultName),
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle("open-file", (_, filePath) => {
  shell.openPath(filePath);
});

ipcMain.handle("open-folder", (_, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle("get-app-status", () => {
  return downloadManager.getStatus();
});

ipcMain.handle("get-browsers", () => {
  return getBrowserList();
});

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// --- App lifecycle ---

app.whenReady().then(() => {
  // Set dock icon on macOS
  if (process.platform === "darwin" && app.dock) {
    const { nativeImage } = require("electron");
    const iconPath = path.join(__dirname, "..", "..", "assets", "icon.png");
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on("before-quit", () => {
  app.isQuitting = true;
  closeDb();
  destroyTray();
});
