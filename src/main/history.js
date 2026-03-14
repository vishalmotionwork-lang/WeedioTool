const { app } = require("electron");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(app.getPath("userData"), "weediotool-history.db");

let db = null;

function getDb() {
  if (db) return db;

  db = new Database(DB_PATH);

  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      output_path TEXT,
      thumbnail TEXT,
      duration TEXT,
      site TEXT,
      format TEXT,
      file_size INTEGER,
      downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_url ON downloads(url);
    CREATE INDEX IF NOT EXISTS idx_downloads_date ON downloads(downloaded_at);
  `);

  return db;
}

function addToHistory({
  url,
  title,
  outputPath,
  thumbnail,
  duration,
  site,
  format,
  fileSize,
}) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO downloads (url, title, output_path, thumbnail, duration, site, format, file_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    url,
    title,
    outputPath,
    thumbnail,
    duration,
    site,
    format,
    fileSize,
  );
}

function getHistory(limit = 50, offset = 0) {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM downloads ORDER BY downloaded_at DESC LIMIT ? OFFSET ?
  `);
  return stmt.all(limit, offset);
}

function isDuplicate(url) {
  const database = getDb();
  const stmt = database.prepare(
    "SELECT COUNT(*) as count FROM downloads WHERE url = ?",
  );
  const result = stmt.get(url);
  return result.count > 0;
}

function clearHistory() {
  const database = getDb();
  database.exec("DELETE FROM downloads");
}

function deleteHistoryItem(id) {
  const database = getDb();
  const stmt = database.prepare("DELETE FROM downloads WHERE id = ?");
  return stmt.run(id);
}

function searchHistory(query) {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM downloads
    WHERE title LIKE ? OR url LIKE ? OR site LIKE ?
    ORDER BY downloaded_at DESC LIMIT 50
  `);
  const searchTerm = `%${query}%`;
  return stmt.all(searchTerm, searchTerm, searchTerm);
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  addToHistory,
  getHistory,
  isDuplicate,
  clearHistory,
  deleteHistoryItem,
  searchHistory,
  closeDb,
};
