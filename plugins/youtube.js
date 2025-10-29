const fs = require("fs");
const axios = require("axios");
const yts = require("yt-search");
const fetch = require("node-fetch");
const { Module } = require("../lib/plugins");

const x = "AIzaSyDLH31M0HfyB7Wjttl6QQudyBEq5x9s1Yg";

async function ytSearch(query, max = 10) {
  const url = `https://www.googleapis.com/youtube/v3/search?key=${x}&part=snippet&type=video&maxResults=${max}&q=${query}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  const data = await res.json();
  if (!data.items || !data.items.length) return [];
  return data.items.map((vid) => ({
    id: vid.id.videoId,
    title: vid.snippet.title,
    url: `https://www.youtube.com/watch?v=${vid.id.videoId}`,
    thumbnail: vid.snippet.thumbnails.high.url,
    channel: vid.snippet.channelTitle,
    publishedAt: vid.snippet.publishedAt,
  }));
}

// Helper function to download audio using the new API
async function downloadYtAudio(url) {
  const apiUrl = `https://api.zenzxz.my.id/api/downloader/ytmp3?url=${encodeURIComponent(
    url
  )}`;
  const response = await axios.get(apiUrl);

  if (!response.data || !response.data.success) {
    throw new Error("Failed to fetch audio data from API");
  }

  return response.data.data;
}

// Helper function to download video using the new API
async function downloadYtVideo(url, resolution = "720p") {
  const apiUrl = `https://api.zenzxz.my.id/api/downloader/ytmp4?url=${encodeURIComponent(
    url
  )}&resolution=${resolution}`;
  const response = await axios.get(apiUrl);

  if (!response.data || !response.data.success) {
    throw new Error("Failed to fetch video data from API");
  }

  return response.data.data;
}

// Helper function to handle song downloads
async function handleSongDownload(conn, input, message) {
  let videoUrl = input;
  let videoInfo = null;

  // Check if input is a URL or search query
  const urlRegex = /(?:youtube\.com\/.*v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  if (!urlRegex.test(input)) {
    // Search for the song
    await message.react("🔍");
    const searchResults = await yts(input);
    if (!searchResults.videos || searchResults.videos.length === 0) {
      return await message.send("❌ No results found");
    }
    videoInfo = searchResults.videos[0];
    videoUrl = videoInfo.url;
  } else {
    // Get video info from URL
    const videoId = input.match(urlRegex)[1];
    const searchResults = await yts({ videoId: videoId });
    videoInfo = searchResults;
  }

  // Download audio
  await message.react("⬇️");
  const audioData = await downloadYtAudio(videoUrl);

  // Download the audio file
  const audioBuffer = await axios.get(audioData.download_url, {
    responseType: "arraybuffer",
  });

  // Send audio with thumbnail and link preview
  await message.react("🎧");
  await conn.sendMessage(message.from, {
    audio: Buffer.from(audioBuffer.data),
    mimetype: "audio/mpeg",
    fileName: `${audioData.title}.mp3`,
    contextInfo: {
      externalAdReply: {
        title: audioData.title,
        body: `Duration: ${Math.floor(audioData.duration / 60)}:${(
          audioData.duration % 60
        )
          .toString()
          .padStart(2, "0")}`,
        thumbnail: await axios
          .get(audioData.thumbnail, { responseType: "arraybuffer" })
          .then((res) => Buffer.from(res.data)),
        mediaType: 2,
        mediaUrl: videoUrl,
        sourceUrl: videoUrl,
      },
    },
  });
}

// Helper function to handle video downloads
async function handleVideoDownload(conn, input, message, resolution = "720p") {
  let videoUrl = input;

  // Check if input is a URL or search query
  const urlRegex = /(?:youtube\.com\/.*v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  if (!urlRegex.test(input)) {
    // Search for the video
    await message.send("🔍 Searching...");
    const searchResults = await yts(input);
    if (!searchResults.videos || searchResults.videos.length === 0) {
      return await message.send("❌ No results found");
    }
    videoUrl = searchResults.videos[0].url;
  }

  // Download video
  await message.send(`⬇️ Downloading video in ${resolution}...`);
  const videoData = await downloadYtVideo(videoUrl, resolution);

  // Download the video file
  const videoBuffer = await axios.get(videoData.download_url, {
    responseType: "arraybuffer",
  });

  // Get thumbnail
  const thumbnailBuffer = await axios.get(videoData.thumbnail, {
    responseType: "arraybuffer",
  });

  // Send video with small link preview
  await conn.sendMessage(message.from, {
    video: Buffer.from(videoBuffer.data),
    caption: `*${videoData.title}*\n\n📹 Quality: ${
      videoData.format
    }\n⏱️ Duration: ${Math.floor(videoData.duration / 60)}:${(
      videoData.duration % 60
    )
      .toString()
      .padStart(2, "0")}`,
    jpegThumbnail: Buffer.from(thumbnailBuffer.data),
  });
}

Module({
  command: "yts",
  package: "search",
  description: "Search YouTube videos",
})(async (message, match) => {
  if (!match) return await message.send("Please provide a search query");
  const query = match.trim();
  const results = await ytSearch(query, 10);
  if (!results.length) return await message.send("❌ No results found");

  let reply = `*YouTube results for "${query}":*\n\n`;
  results.forEach((v, i) => {
    const date = new Date(v.publishedAt).toISOString().split("T")[0];
    reply += `⬢ ${i + 1}. ${v.title}\n   Channel: ${
      v.channel
    }\n   Published: ${date}\n   Link: ${v.url}\n\n`;
  });

  await message.send({
    image: { url: results[0].thumbnail },
    caption: reply,
  });
});

Module({
  command: "song",
  package: "downloader",
  description: "Download audio from YouTube",
})(async (message, match) => {
  if (!match) return message.send("_need a yt url or song name_");
  let input = match.trim();
  try {
    await handleSongDownload(message.conn, input, message);
  } catch (err) {
    console.error("[PLUGIN SONG] Error:", err?.message || err);
    await message.send("⚠️ Song download failed. Please try again later.");
  }
});

Module({
  command: "mp4",
  package: "downloader",
  description: "Download YouTube MP4",
})(async (message, match) => {
  if (!match) return message.send("_need a yt url or video name_");
  let input = match.trim();
  try {
    await handleVideoDownload(message.conn, input, message, "720p");
  } catch (err) {
    console.error("[PLUGIN MP4] Error:", err?.message || err);
    await message.send("⚠️ Video download failed. Please try again later.");
  }
});

Module({
  command: "video",
  package: "downloader",
  description: "Download YouTube Video",
})(async (message, match) => {
  if (!match) return message.send("_need a yt url or video name_");
  let input = match.trim();
  try {
    await handleVideoDownload(message.conn, input, message, "720p");
  } catch (err) {
    console.error("[PLUGIN VIDEO] Error:", err?.message || err);
    await message.send("⚠️ Video download failed. Please try again later.");
  }
});

Module({
  command: "ytv",
  package: "downloader",
  description: "Download YouTube Video",
})(async (message, match) => {
  if (!match) return message.send("_need a yt url or video name_");
  let input = match.trim();
  try {
    await handleVideoDownload(message.conn, input, message, "720p");
  } catch (err) {
    console.error("[PLUGIN YTV] Error:", err?.message || err);
    await message.send("⚠️ Video download failed. Please try again later.");
  }
});

Module({
  command: "yta",
  package: "downloader",
  description: "Download YouTube Audio",
})(async (message, match) => {
  if (!match) return message.send("_need a yt url or song name_");
  let input = match.trim();
  try {
    await handleSongDownload(message.conn, input, message);
  } catch (err) {
    console.error("[PLUGIN YTA] Error:", err?.message || err);
    await message.send("⚠️ Audio download failed. Please try again later.");
  }
});

Module({
  command: "ytmp3",
  package: "downloader",
  description: "Download YouTube MP3",
})(async (message, match) => {
  if (!match) return message.send("_need a yt url or song name_");
  let input = match.trim();
  try {
    await handleSongDownload(message.conn, input, message);
  } catch (err) {
    console.error("[PLUGIN YTMP3] Error:", err?.message || err);
    await message.send("⚠️ MP3 download failed. Please try again later.");
  }
});

Module({
  command: "play",
  package: "downloader",
  description: "YouTube video player",
})(async (message, match) => {
  if (!match) return message.send("_need a yt url or song name_");
  let input = match.trim();
  try {
    await handleSongDownload(message.conn, input, message);
  } catch (err) {
    console.error("[PLUGIN PLAY] Error:", err?.message || err);
    await message.send("⚠️ Playback failed. Please try again later.");
  }
});
