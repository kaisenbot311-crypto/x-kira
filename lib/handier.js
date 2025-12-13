const axios = require("axios");
const fs = require("fs");
const path = require("path");
const config = require("../config");
async function getJson(url, options) {
  try {
    options ? options : {};
    const res = await axios({
      method: "GET",
      url: url,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36",
      },
      ...options,
    });
    return res.data;
  } catch (err) {
    return err;
  }
}

function MediaUrls(text) {
  let array = [];
  const regexp =
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()'@:%_\+.~#?!&//=]*)/gi;
  let urls = text.match(regexp);
  if (urls) {
    urls.map((url) => {
      if (
        ["jpg", "jpeg", "png", "gif", "mp4", "webp"].includes(
          url.split(".").pop().toLowerCase()
        )
      ) {
        array.push(url);
      }
    });
    return array;
  } else {
    return false;
  }
}

const BASE_URL = "https://x-kira-json-host.vercel.app";

/**
 * Extract token from session ID text
 * Example:
 * 𓂃...≈d1gd8gtn^☁️  →  "d1gd8gtn"
 */
function extractToken(sessionId) {
  if (!sessionId) return null;

  // Prefer token after "≈"
  let m = sessionId.match(/≈\s*([^\^\s]+)/);
  if (m) return m[1].replace(/[^a-zA-Z0-9_-]/g, "");

  // Fallback: find alphanumeric token containing both letters & digits
  let fallback = sessionId.match(/([A-Za-z0-9_-]{6,})/g);
  if (fallback) {
    return fallback.find(t => /[A-Za-z]/.test(t) && /\d/.test(t));
  }

  return null;
}

/**
 * Main downloader
 */
async function downloadCreds(sessionDir) {
  try {
    const token = extractToken(config.SESSION_ID);
    if (!token) {
      throw new Error("❌ Could not extract token from SESSION_ID");
    }
    const outPath = path.join(sessionDir, "creds.json");

    // 🔥 FAST CHECK: creds.json already exists → SKIP DOWNLOAD
    if (fs.existsSync(outPath)) {
      console.log("⚡ creds.json already exists → skipping download");
      return;
    }

    // Otherwise → Download from API
    const url = `${BASE_URL}/${encodeURIComponent(token)}`;
    console.log("Downloading creds from:", url);

    const res = await axios.get(url, { 
      timeout: 10000,
      validateStatus: () => true // Allow any status code to handle errors
    });

    // Validate response
    if (res.status !== 200) {
      throw new Error(`❌ Failed to download creds. Status: ${res.status}`);
    }

    if (!res.data) {
      throw new Error("❌ Empty response from server");
    }

    const creds = typeof res.data === "object" ? res.data : { data: res.data };

    fs.writeFileSync(outPath, JSON.stringify(creds, null, 2));

    console.log("✅ creds.json saved at:", outPath);

    return outPath;
  } catch (err) {
    console.error("❌ downloadCreds error:", err.message);
    throw err;
  }
}


module.exports = { getJson, MediaUrls, downloadCreds };
