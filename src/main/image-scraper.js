const https = require('https');
const http = require('http');
const { URL } = require('url');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    };

    const request = protocol.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return fetchPage(response.headers.location).then(resolve).catch(reject);
      }

      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => resolve(data));
    });

    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

async function scrapeImages(pageUrl) {
  const html = await fetchPage(pageUrl);
  const $ = cheerio.load(html);
  const images = new Map();

  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    if (!src) return;

    const fullUrl = resolveUrl(pageUrl, src);
    if (!fullUrl) return;

    if (fullUrl.includes('data:image')) return;
    if (fullUrl.includes('spacer') || fullUrl.includes('pixel') || fullUrl.includes('blank')) return;
    if (fullUrl.includes('logo') || fullUrl.includes('icon') || fullUrl.includes('favicon')) return;

    const alt = $(el).attr('alt') || '';
    const width = parseInt($(el).attr('width'), 10) || 0;
    const height = parseInt($(el).attr('height'), 10) || 0;

    if (width > 0 && width < 100 && height > 0 && height < 100) return;

    images.set(fullUrl, {
      url: fullUrl,
      alt,
      width,
      height
    });
  });

  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => {
    const content = $(el).attr('content');
    if (content) {
      const fullUrl = resolveUrl(pageUrl, content);
      if (fullUrl) {
        images.set(fullUrl, {
          url: fullUrl,
          alt: 'Social media image',
          width: 0,
          height: 0,
          priority: true
        });
      }
    }
  });

  $('figure img, article img, .post-content img, .entry-content img, [role="main"] img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src) {
      const fullUrl = resolveUrl(pageUrl, src);
      if (fullUrl) {
        const existing = images.get(fullUrl);
        if (existing) {
          existing.priority = true;
        }
      }
    }
  });

  const results = Array.from(images.values());
  results.sort((a, b) => {
    if (a.priority && !b.priority) return -1;
    if (!a.priority && b.priority) return 1;
    return 0;
  });

  return results;
}

function downloadImage(imageUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith('https') ? https : http;

    const request = protocol.get(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': new URL(imageUrl).origin
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadImage(response.headers.location, outputPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}`));
      }

      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const file = fs.createWriteStream(outputPath);
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(outputPath); });
      file.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

function getFilenameFromUrl(imageUrl) {
  try {
    const urlObj = new URL(imageUrl);
    const pathname = urlObj.pathname;
    const basename = path.basename(pathname);

    if (basename && /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)/i.test(basename)) {
      return basename;
    }

    const ext = path.extname(pathname) || '.jpg';
    return `image-${Date.now()}${ext}`;
  } catch {
    return `image-${Date.now()}.jpg`;
  }
}

module.exports = {
  scrapeImages,
  downloadImage,
  getFilenameFromUrl
};
