const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);

// ------------------------- Helper utilities -------------------------
async function downloadToFile(url, outPath) {
  const resp = await axios({ url, method: 'get', responseType: 'stream', timeout: 60_000 });
  await pipeline(resp.data, fs.createWriteStream(outPath));
}
function looksLikeRemote(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}
function getExtensionFromPathOrUrl(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return '';
  try {
    const u = new URL(urlOrPath);
    return (path.extname(u.pathname) || '').replace('.', '').toLowerCase();
  } catch (e) {
    const ext = path.extname(urlOrPath || '').replace('.', '').toLowerCase();
    return ext;
  }
}
async function ensureOggOpus(urlOrPath) {
  try {
    if (!urlOrPath || typeof urlOrPath !== 'string') return urlOrPath;
    const ext = getExtensionFromPathOrUrl(urlOrPath);
    if (ext === 'ogg' || ext === 'opus') return urlOrPath;
    const tmpDir = os.tmpdir();
    const id = uuidv4();
    const inExt = ext || 'in';
    const inPath = path.join(tmpDir, `${id}.${inExt}`);
    const outPath = path.join(tmpDir, `${id}.ogg`);
    if (looksLikeRemote(urlOrPath)) {
      await downloadToFile(urlOrPath, inPath);
    } else {
      await fs.copy(urlOrPath, inPath);
    }
    await new Promise((resolve, reject) => {
      ffmpeg(inPath)
        .audioCodec('libopus')
        .audioBitrate('32k')
        .format('ogg')
        .on('end', resolve)
        .on('error', reject)
        .save(outPath);
    });
    try { await fs.remove(inPath); } catch (e) { /* ignore */ }
    return outPath;
  } catch (err) {
    console.error('ensureOggOpus failed:', err);
    return urlOrPath;
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
        ["jpg", "jpeg", "png", "gif", "mp4", "webp", "mp3", "m4a", "ogg", "wav"].includes(
          url.split('.').pop().toLowerCase()
        )
      ) {
        array.push(url);
      }
    });
    return array.length ? array : false;
  } else {
    return false;
  }
}
function extractLastJsonBlock(s = "") {
  for (let i = s.lastIndexOf("{"); i !== -1; i = s.lastIndexOf("{", i - 1)) {
    const maybe = s.slice(i);
    try {
      const parsed = JSON.parse(maybe);
      const textWithoutJson = s.slice(0, i).trim();
      return { json: parsed, textWithoutJson };
    } catch (e) {
    }
  }
  return { json: null, textWithoutJson: s };
}
function buildMentionList(text, m) {
  const mentions = new Set();
  if (text.includes("&sender")) {
    const number = m.sender.split("@")[0];
    text = text.replace(/&sender/g, "@" + number);
    mentions.add(m.sender);
  }
  const atMatches = [...text.matchAll(/@(\d{5,})/g)];
  for (const mm of atMatches) {
    const num = mm[1];
    mentions.add(`${num}@s.whatsapp.net`);
  }
  return { text, mentionedJids: Array.from(mentions) };
}
function deepClone(o) {
  try {
    return JSON.parse(JSON.stringify(o));
  } catch {
    return o;
  }
}
function normalizeExternalAdReply(ear = {}) {
  const copy = { ...ear };
  if (typeof copy.thumbnail === "string" && /^https?:\/\//i.test(copy.thumbnail)) {
    copy.thumbnailUrl = copy.thumbnail;
    delete copy.thumbnail;
  }
  if (copy.thumbnail && typeof copy.thumbnail === "string" && !/^data:|^https?:\/\//i.test(copy.thumbnail)) {
    if (!/^data:/i.test(copy.thumbnail)) delete copy.thumbnail;
  }
  return copy;
}
function attachMediaMeta({ url, mimetype, ptt, waveform, contextInfo } = {}) {
  const mediaObj = {};
  if (url) mediaObj.url = url;
  if (mimetype) mediaObj.mimetype = mimetype;
  if (typeof ptt !== 'undefined') mediaObj.ptt = ptt;
  if (waveform) mediaObj.waveform = waveform;
  if (contextInfo) mediaObj.contextInfo = deepClone(contextInfo);
  return mediaObj;
}

// ------------------------- Main mention function -------------------------
async function mention(m, text = "") {
  try {
    if (!m || !m.client) throw new Error("Missing 'm' or 'm.client'");
    const types = ["type/image", "type/video", "type/audio", "type/sticker", "type/gif"];
    const { json: parsedJson, textWithoutJson } = extractLastJsonBlock(text || "");
    let msg = (textWithoutJson || text || "").trim();
    let message = {
      contextInfo: {
        mentionedJid: [m.sender],
        isForwarded: false,
        forwardingScore: 0,
      },
    };
    const setForwardingFlags = (ctxInfo) => {
      if (!ctxInfo) return;
      delete ctxInfo.forwardedNewsletterMessageInfo;
      const providedIsForwarded =
        parsedJson && parsedJson.contextInfo && typeof parsedJson.contextInfo.isForwarded !== "undefined"
          ? parsedJson.contextInfo.isForwarded
          : parsedJson && typeof parsedJson.isForwarded !== "undefined"
            ? parsedJson.isForwarded
            : undefined;
      const providedScore =
        parsedJson && parsedJson.contextInfo && typeof parsedJson.contextInfo.forwardingScore !== "undefined"
          ? parsedJson.contextInfo.forwardingScore
          : parsedJson && typeof parsedJson.forwardingScore !== "undefined"
            ? parsedJson.forwardingScore
            : undefined;
      if (typeof providedIsForwarded !== "undefined") ctxInfo.isForwarded = providedIsForwarded;
      else ctxInfo.isForwarded = false;
      if (typeof providedScore !== "undefined") ctxInfo.forwardingScore = providedScore;
      else ctxInfo.forwardingScore = 0;
    };
    if (parsedJson) {
      if (Object.prototype.hasOwnProperty.call(parsedJson, "ptt")) message.ptt = parsedJson.ptt;
      if (Object.prototype.hasOwnProperty.call(parsedJson, "mimetype")) message.mimetype = parsedJson.mimetype;
      if (parsedJson.waveform) message.waveform = parsedJson.waveform;
      if (parsedJson.contextInfo) {
        message.contextInfo = { ...(message.contextInfo || {}), ...parsedJson.contextInfo };
        if (message.contextInfo.externalAdReply) {
          message.contextInfo.externalAdReply = normalizeExternalAdReply(message.contextInfo.externalAdReply);
        }
        if (Array.isArray(parsedJson.contextInfo.mentionedJid)) {
          message.contextInfo.mentionedJid = Array.from(
            new Set([...(message.contextInfo.mentionedJid || []), ...parsedJson.contextInfo.mentionedJid])
          );
        }
      }
      if (parsedJson.externalAdReply) {
        parsedJson.externalAdReply = normalizeExternalAdReply(parsedJson.externalAdReply);
        message.contextInfo = message.contextInfo || {};
        message.contextInfo.externalAdReply = { ...(message.contextInfo.externalAdReply || {}), ...parsedJson.externalAdReply };
      }
      setForwardingFlags(message.contextInfo);
    } else {
      setForwardingFlags(message.contextInfo);
    }
    let type = "text";
    for (const t of types) {
      if (msg.includes(t)) {
        type = t.replace("type/", "");
        break;
      }
    }
    const { text: withMentionsReplaced, mentionedJids } = buildMentionList(msg, m);
    msg = withMentionsReplaced;
    if (message.contextInfo?.mentionedJid && Array.isArray(message.contextInfo.mentionedJid)) {
      message.contextInfo.mentionedJid = Array.from(new Set([...message.contextInfo.mentionedJid, ...mentionedJids]));
    } else if (mentionedJids.length) {
      message.contextInfo = message.contextInfo || {};
      message.contextInfo.mentionedJid = mentionedJids;
    }
    let URLS = MediaUrls(msg || "");
    const pickUrlForType = (desiredType) => {
      if (!URLS) URLS = false;
      if (URLS && URLS.length) {
        const audioExt = /\.(mp3|m4a|ogg|opus|wav|aac)(\?|$)/i;
        const videoExt = /\.(mp4|mkv|mov|webm)(\?|$)/i;
        const imageExt = /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i;
        let filtered = [];
        if (desiredType === "audio") filtered = URLS.filter(u => audioExt.test(u));
        else if (desiredType === "video") filtered = URLS.filter(u => videoExt.test(u));
        else if (desiredType === "image" || desiredType === "sticker") filtered = URLS.filter(u => imageExt.test(u));
        if (filtered.length) return filtered[Math.floor(Math.random() * filtered.length)];
      }
      const earMedia = parsedJson?.contextInfo?.externalAdReply?.mediaUrl
        || parsedJson?.contextInfo?.externalAdReply?.thumbnailUrl
        || parsedJson?.mediaUrl;
      if (earMedia) return earMedia;
      if (URLS && URLS.length) return URLS[Math.floor(Math.random() * URLS.length)];
      return null;
    };

    if (type !== "text") {
      if (URLS && URLS.length) for (const u of URLS) msg = msg.replace(u, "");
      msg = msg.replace("type/", "").replace(type, "").replace(/,/g, "").trim();
      const URL = pickUrlForType(type);
      if (msg) message.caption = msg;
      const attachMediaMetaLocal = (mediaObj = {}) => {
        if (message.mimetype) mediaObj.mimetype = message.mimetype;
        if (Object.prototype.hasOwnProperty.call(message, "ptt")) mediaObj.ptt = message.ptt;
        if (message.waveform) mediaObj.waveform = message.waveform;
        if (message.contextInfo) mediaObj.contextInfo = deepClone(message.contextInfo);
        return mediaObj;
      };
      switch (type) {
        case "image":
          if (!URL) throw new Error("No image URL found");
          message.image = attachMediaMetaLocal({ url: URL });
          message.mimetype = message.mimetype || "image/jpeg";
          break;
        case "video":
          if (!URL) throw new Error("No video URL found");
          message.video = attachMediaMetaLocal({ url: URL });
          message.mimetype = message.mimetype || "video/mp4";
          break;
        case "audio":
          if (!Object.prototype.hasOwnProperty.call(message, "ptt")) message.ptt = true;
          message.mimetype = message.mimetype || "audio/mpeg";
          if (!URL) throw new Error("No audio URL found");
          if (message.ptt) {
            try {
              const sourceUrl = (message.audio && message.audio.url) ? message.audio.url : URL;
              const converted = await ensureOggOpus(sourceUrl);

              if (converted && typeof converted === 'string' && converted.toLowerCase().endsWith('.ogg')) {
                message.mimetype = 'audio/ogg; codecs=opus';
                message.audio = attachMediaMetaLocal({ url: converted });
              } else {
                message.mimetype = message.mimetype || 'audio/mpeg';
                message.audio = attachMediaMetaLocal({ url: converted || URL });
              }
            } catch (convErr) {
              console.error('Audio conversion error, sending original:', convErr);
              message.audio = attachMediaMetaLocal({ url: URL });
            }
          } else {
            message.audio = attachMediaMetaLocal({ url: URL });
          }
          break;
        case "sticker":
          if (!URL) throw new Error("No sticker URL found");
          message.sticker = attachMediaMetaLocal({ url: URL });
          message.mimetype = message.mimetype || "image/webp";
          delete message.caption;
          if (!parsedJson?.contextInfo) delete message.contextInfo;
          break;
        case "gif":
          if (!URL) throw new Error("No gif URL found");
          message.video = attachMediaMetaLocal({ url: URL });
          message.gifPlayback = true;
          message.mimetype = message.mimetype || "video/mp4";
          break;
        default:
          throw new Error("Unknown media type: " + type);
      }
      delete message.forward;
      if (message.contextInfo) setForwardingFlags(message.contextInfo);
      try { console.log("[mention] final message object being sent:", JSON.stringify(message, null, 2)); } catch (e) { }
      const sent = await m.client.sendMessage(m.jid, message);
      return sent;
    }
    if (!message.text) message.text = msg || message.caption || "Hello!";
    if (message.text.includes("@") && (!message.contextInfo || !message.contextInfo.mentionedJid)) {
      const { mentionedJids: auto } = buildMentionList(message.text, m);
      if (auto.length) {
        message.contextInfo = message.contextInfo || {};
        message.contextInfo.mentionedJid = Array.from(new Set([...(message.contextInfo.mentionedJid || []), ...auto]));
      }
    }
    delete message.forward;
    if (message.contextInfo) setForwardingFlags(message.contextInfo);
    try { console.log("[mention] final text message object:", JSON.stringify(message, null, 2)); } catch (e) { }
    return await m.client.sendMessage(m.jid, message);
  } catch (error) {
    console.error("Mention function error:", error);
    try {
      await m.client.sendMessage(m.jid, {
        text: (text || "").substring(0, 300),
        contextInfo: {
          mentionedJid: [m.sender],
          isForwarded: false,
        },
      });
    } catch (fallbackError) {
      console.error("Fallback message failed:", fallbackError);
    }
  }
}

module.exports = mention;
