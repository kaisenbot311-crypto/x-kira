/*const { Module } = require("../lib/plugins");

Module({
  command: "name",
  package: "type",
  description: "description name",
})(async (message, match) => {
  //your plugins code.....
});

*/
const axios = require("axios");
const { Module } = require("../lib/plugins");

Module({
  command: "quote",
  package: "anime",
  description: "Get a random anime quote",
})(async (message, match) => {
  try {
    await message.send("🎬 Fetching an anime quote...");

    // Fetch data from API
    const res = await axios.get("https://kyyokatsurestapi.my.id/anime/quote");
    const result = res.data?.result;

    if (!result) return message.send("⚠️ Failed to fetch quote.");

    const text =
      `🌸 *Anime Quote* 🌸\n\n` +
      `🎭 *Character:* ${result.char}\n` +
      `📺 *Anime:* ${result.from_anime}\n` +
      `🎞️ *Episode:* ${result.episode}\n\n` +
      `💬 *Quote:*\n${result.quote}`;

    await message.send(text);
  } catch (err) {
    console.error("Quote Plugin Error:", err.message);
    await message.send(
      "❌ Error fetching anime quote. Please try again later."
    );
  }
});

/*Module({
  command: "test",
  package: "type",
  description: "description name",
})(async (message, match) => {
  //your plugins code.....
  const m = await message;
  console.log(m);
});
*/
