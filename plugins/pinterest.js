const axios = require("axios");
const cheerio = require("cheerio");
const { Module } = require("../lib/plugins");

Module({
  command: "pint",
  package: "downloader",
  description: "Search Pinterest images",
})(async (message, match) => {
  if (!match) return message.send("Enter a search keyword or pinterest url");
  let img;
  if (/^(https?:\/\/)?(www\.)?(pin\.it|pinterest\.com)\/.+/.test(match)) {
    const res = await axios.get(match, {
      maxRedirects: 5,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const $ = cheerio.load(res.data);
    img = $('meta[property="og:image"]').attr("content");
    if (!img) return message.send("_not found_");
  } else {
    const q = `${match} site:pinterest.com`;
    const url = `https://www.google.com/search?q=${q}&tbm=isch`;
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const $ = cheerio.load(data);
    const images = [];
    $("img").each((_, el) => {
      const src =
        $(el).attr("data-iurl") || $(el).attr("data-src") || $(el).attr("src");
      if (src?.startsWith("http")) images.push(src);
    });
    if (!images.length) return message.send("_eish_");
    img = images[Math.floor(Math.random() * images.length)];
  }
  await message.send({ image: { url: img }, caption: `${match}` });
});
