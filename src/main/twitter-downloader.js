const https = require("https");
const http = require("http");

// Twitter Syndication API — no auth required
// Fallback: Guest token + Twitter API 1.1

const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

function extractTweetId(url) {
  const match = url.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/i);
  return match ? match[1] : null;
}

function calcSyndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, "");
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...headers,
      },
      timeout: 15000,
    };

    const req = client.get(options, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpGet(res.headers.location, headers).then(resolve).catch(reject);
      }

      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...headers,
      },
      timeout: 15000,
    };

    const req = client.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Strategy 1: Twitter Syndication API (no auth)
 */
async function trySyndicationApi(tweetId) {
  const token = calcSyndicationToken(tweetId);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`;

  const res = await httpGet(url);
  if (res.status !== 200) return null;

  const data = JSON.parse(res.body);
  if (!data.mediaDetails || data.mediaDetails.length === 0) return null;

  const videoMedia = data.mediaDetails.find(
    (m) => m.type === "video" || m.type === "animated_gif",
  );
  if (!videoMedia || !videoMedia.video_info) return null;

  const variants = videoMedia.video_info.variants
    .filter((v) => v.content_type === "video/mp4")
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  if (variants.length === 0) return null;

  return {
    url: variants[0].url,
    title: data.text ? data.text.slice(0, 100) : `Tweet ${tweetId}`,
    thumbnail:
      videoMedia.media_url_https || data.mediaDetails[0]?.media_url_https,
    duration: videoMedia.video_info.duration_millis
      ? videoMedia.video_info.duration_millis / 1000
      : null,
    variants: variants.map((v) => ({
      url: v.url,
      bitrate: v.bitrate,
      contentType: v.content_type,
    })),
  };
}

/**
 * Strategy 2: Guest Token + Twitter API 1.1
 */
async function tryGuestTokenApi(tweetId) {
  // Get guest token
  const activateRes = await httpPost(
    "https://api.twitter.com/1.1/guest/activate.json",
    "",
    { Authorization: `Bearer ${decodeURIComponent(BEARER_TOKEN)}` },
  );

  if (activateRes.status !== 200) return null;

  const { guest_token } = JSON.parse(activateRes.body);
  if (!guest_token) return null;

  // Fetch tweet
  const tweetRes = await httpGet(
    `https://api.twitter.com/1.1/statuses/show/${tweetId}.json?tweet_mode=extended&include_entities=true`,
    {
      Authorization: `Bearer ${decodeURIComponent(BEARER_TOKEN)}`,
      "x-guest-token": guest_token,
    },
  );

  if (tweetRes.status !== 200) return null;

  const tweet = JSON.parse(tweetRes.body);
  const media = tweet.extended_entities?.media?.find(
    (m) => m.type === "video" || m.type === "animated_gif",
  );

  if (!media || !media.video_info) return null;

  const variants = media.video_info.variants
    .filter((v) => v.content_type === "video/mp4")
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  if (variants.length === 0) return null;

  return {
    url: variants[0].url,
    title: tweet.full_text ? tweet.full_text.slice(0, 100) : `Tweet ${tweetId}`,
    thumbnail: media.media_url_https,
    duration: media.video_info.duration_millis
      ? media.video_info.duration_millis / 1000
      : null,
    variants: variants.map((v) => ({
      url: v.url,
      bitrate: v.bitrate,
      contentType: v.content_type,
    })),
  };
}

/**
 * Main entry: try all strategies in order
 * Returns { url, title, thumbnail, duration, variants } or null
 */
async function getTwitterVideoInfo(tweetUrl) {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) return null;

  // Strategy 1: Syndication API
  try {
    const result = await trySyndicationApi(tweetId);
    if (result) {
      result.method = "syndication";
      return result;
    }
  } catch {
    // continue to next strategy
  }

  // Strategy 2: Guest Token
  try {
    const result = await tryGuestTokenApi(tweetId);
    if (result) {
      result.method = "guest-token";
      return result;
    }
  } catch {
    // continue to fallback
  }

  return null;
}

/**
 * Download a direct MP4 URL to a file path
 */
function downloadDirectUrl(videoUrl, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(videoUrl);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const req = client.get(videoUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadDirectUrl(res.headers.location, outputPath, onProgress)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }

      const fs = require("fs");
      const totalBytes = parseInt(res.headers["content-length"], 10) || 0;
      let downloadedBytes = 0;

      const file = fs.createWriteStream(outputPath);

      res.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0 && onProgress) {
          onProgress({
            percent: (downloadedBytes / totalBytes) * 100,
            speed: "",
            eta: "",
          });
        }
      });

      res.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });

      file.on("error", (err) => {
        fs.unlink(outputPath, () => {});
        reject(err);
      });
    });

    req.on("error", reject);
  });
}

function isTwitterUrl(url) {
  return /(twitter|x)\.com\/\w+\/status\/\d+/i.test(url);
}

module.exports = {
  getTwitterVideoInfo,
  downloadDirectUrl,
  isTwitterUrl,
  extractTweetId,
};
