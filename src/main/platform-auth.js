const { BrowserWindow, session } = require("electron");
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const COOKIES_DIR = path.join(app.getPath("userData"), "cookies");

// Platforms that support embedded browser login
const PLATFORMS = {
  instagram: {
    name: "Instagram",
    loginUrl: "https://www.instagram.com/accounts/login/",
    checkUrl: "https://www.instagram.com/",
    domain: ".instagram.com",
    // After login, this element indicates success
    successIndicator: /instagram\.com\/(?!accounts\/login)/,
  },
  twitter: {
    name: "X / Twitter",
    loginUrl: "https://x.com/i/flow/login",
    checkUrl: "https://x.com/home",
    domain: ".x.com",
    successIndicator: /x\.com\/home/,
  },
  linkedin: {
    name: "LinkedIn",
    loginUrl: "https://www.linkedin.com/login",
    checkUrl: "https://www.linkedin.com/feed/",
    domain: ".linkedin.com",
    successIndicator: /linkedin\.com\/feed/,
  },
};

function ensureCookiesDir() {
  if (!fs.existsSync(COOKIES_DIR)) {
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
  }
}

/**
 * Convert Electron cookies to Netscape cookie.txt format (for yt-dlp --cookies)
 */
function toNetscapeFormat(cookies) {
  const lines = ["# Netscape HTTP Cookie File"];

  for (const cookie of cookies) {
    const domain = cookie.domain.startsWith(".")
      ? cookie.domain
      : `.${cookie.domain}`;
    const includeSubdomains = domain.startsWith(".") ? "TRUE" : "FALSE";
    const cookiePath = cookie.path || "/";
    const secure = cookie.secure ? "TRUE" : "FALSE";
    const expires = cookie.expirationDate
      ? Math.floor(cookie.expirationDate)
      : "0";

    lines.push(
      `${domain}\t${includeSubdomains}\t${cookiePath}\t${secure}\t${expires}\t${cookie.name}\t${cookie.value}`,
    );
  }

  return lines.join("\n") + "\n";
}

/**
 * Get the cookie file path for a platform
 */
function getCookiePath(platform) {
  ensureCookiesDir();
  return path.join(COOKIES_DIR, `${platform}-cookies.txt`);
}

/**
 * Check if we have saved cookies for a platform
 */
function hasCookies(platform) {
  const cookiePath = getCookiePath(platform);
  return fs.existsSync(cookiePath);
}

/**
 * Get cookie args for yt-dlp if cookies exist for the given URL
 */
function getCookieArgsForUrl(url) {
  for (const [platformId, platform] of Object.entries(PLATFORMS)) {
    const domainClean = platform.domain.replace(/^\./, "");
    if (url.includes(domainClean) && hasCookies(platformId)) {
      return ["--cookies", getCookiePath(platformId)];
    }
  }
  return [];
}

/**
 * Get login status for all platforms
 */
function getLoginStatus() {
  const status = {};
  for (const [id, platform] of Object.entries(PLATFORMS)) {
    const cookiePath = getCookiePath(id);
    let loggedIn = false;
    let lastLogin = null;

    if (fs.existsSync(cookiePath)) {
      loggedIn = true;
      const stat = fs.statSync(cookiePath);
      lastLogin = stat.mtime.toISOString();
    }

    status[id] = {
      name: platform.name,
      loggedIn,
      lastLogin,
    };
  }
  return status;
}

/**
 * Open a BrowserWindow for the user to log in to a platform.
 * Saves cookies on successful login.
 * Returns a promise that resolves with { success: true } or { success: false, error }
 */
function openLoginWindow(platformId, parentWindow) {
  const platform = PLATFORMS[platformId];
  if (!platform) {
    return Promise.resolve({
      success: false,
      error: `Unknown platform: ${platformId}`,
    });
  }

  return new Promise((resolve) => {
    // Use a separate session partition so it doesn't interfere with the main app
    const partition = `persist:${platformId}`;
    const ses = session.fromPartition(partition);

    const loginWindow = new BrowserWindow({
      width: 480,
      height: 700,
      parent: parentWindow,
      modal: true,
      title: `Log in to ${platform.name}`,
      backgroundColor: "#0f0f0f",
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
      },
      autoHideMenuBar: true,
    });

    let resolved = false;

    // Watch for navigation to detect successful login
    loginWindow.webContents.on("did-navigate", async (_event, navUrl) => {
      if (resolved) return;

      if (platform.successIndicator.test(navUrl)) {
        // Login successful - extract cookies
        try {
          const cookies = await ses.cookies.get({
            domain: platform.domain.replace(/^\./, ""),
          });

          if (cookies.length > 0) {
            const cookieText = toNetscapeFormat(cookies);
            const cookiePath = getCookiePath(platformId);
            fs.writeFileSync(cookiePath, cookieText, "utf-8");

            resolved = true;
            loginWindow.close();
            resolve({ success: true, cookieCount: cookies.length });
          }
        } catch (err) {
          // Keep window open, let user try again
        }
      }
    });

    // Also check in-page navigations (SPAs like Twitter)
    loginWindow.webContents.on(
      "did-navigate-in-page",
      async (_event, navUrl) => {
        if (resolved) return;

        if (platform.successIndicator.test(navUrl)) {
          // Wait a moment for cookies to settle
          await new Promise((r) => setTimeout(r, 2000));

          try {
            const cookies = await ses.cookies.get({
              domain: platform.domain.replace(/^\./, ""),
            });

            if (cookies.length > 0) {
              const cookieText = toNetscapeFormat(cookies);
              const cookiePath = getCookiePath(platformId);
              fs.writeFileSync(cookiePath, cookieText, "utf-8");

              resolved = true;
              loginWindow.close();
              resolve({ success: true, cookieCount: cookies.length });
            }
          } catch {
            // Keep window open
          }
        }
      },
    );

    loginWindow.on("closed", () => {
      if (!resolved) {
        resolve({ success: false, error: "Login window closed" });
      }
    });

    loginWindow.loadURL(platform.loginUrl);
  });
}

/**
 * Clear saved cookies for a platform
 */
function clearPlatformCookies(platformId) {
  const cookiePath = getCookiePath(platformId);
  if (fs.existsSync(cookiePath)) {
    fs.unlinkSync(cookiePath);
  }

  // Also clear the session partition
  const partition = `persist:${platformId}`;
  const ses = session.fromPartition(partition);
  ses.clearStorageData();
}

module.exports = {
  PLATFORMS,
  openLoginWindow,
  hasCookies,
  getCookieArgsForUrl,
  getLoginStatus,
  clearPlatformCookies,
  getCookiePath,
};
