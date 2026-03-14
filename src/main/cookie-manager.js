const os = require('os');
const path = require('path');
const fs = require('fs');

const BROWSER_PATHS = {
  darwin: [
    { id: 'brave', name: 'Brave', cookie: ['Library', 'Application Support', 'BraveSoftware', 'Brave-Browser', 'Default', 'Cookies'] },
    { id: 'chrome', name: 'Chrome', cookie: ['Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Cookies'] },
    { id: 'edge', name: 'Edge', cookie: ['Library', 'Application Support', 'Microsoft Edge', 'Default', 'Cookies'] },
    { id: 'firefox', name: 'Firefox', cookie: ['Library', 'Application Support', 'Firefox'] },
  ],
  win32: [
    { id: 'brave', name: 'Brave', cookie: ['AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Network', 'Cookies'] },
    { id: 'chrome', name: 'Chrome', cookie: ['AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies'] },
    { id: 'edge', name: 'Edge', cookie: ['AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies'] },
    { id: 'firefox', name: 'Firefox', cookie: ['AppData', 'Roaming', 'Mozilla', 'Firefox'] },
  ],
  linux: [
    { id: 'brave', name: 'Brave', cookie: ['.config', 'BraveSoftware', 'Brave-Browser', 'Default', 'Cookies'] },
    { id: 'chrome', name: 'Chrome', cookie: ['.config', 'google-chrome', 'Default', 'Cookies'] },
    { id: 'firefox', name: 'Firefox', cookie: ['.mozilla', 'firefox'] },
  ],
};

function getAvailableBrowsers() {
  const platform = os.platform();
  const home = os.homedir();
  const browsers = BROWSER_PATHS[platform] || BROWSER_PATHS.linux;

  return browsers.filter(b => {
    const cookiePath = path.join(home, ...b.cookie);
    return fs.existsSync(cookiePath);
  });
}

function getCookieArgs() {
  const available = getAvailableBrowsers();
  if (available.length === 0) return [];

  // Use first available browser
  return ['--cookies-from-browser', available[0].id];
}

function getBrowserList() {
  return getAvailableBrowsers().map(b => ({ name: b.name, id: b.id }));
}

module.exports = {
  getCookieArgs,
  getAvailableBrowsers,
  getBrowserList,
};
