const { from } = require("form-data");
const { groupDB } = require("./database/index");

const LINK_PATTERNS = [
  // HTTP/HTTPS URLs
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi,

  // WhatsApp links
  /chat\.whatsapp\.com\/[a-zA-Z0-9_-]+/gi,
  /wa\.me\/[0-9]+/gi,
  /whatsapp\.com\/channel\/[a-zA-Z0-9_-]+/gi,

  // Common domains without protocol
  /(?:^|\s)(www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi,

  // Telegram links
  /t\.me\/[a-zA-Z0-9_]+/gi,
  /telegram\.me\/[a-zA-Z0-9_]+/gi,

  // Discord links
  /discord\.gg\/[a-zA-Z0-9]+/gi,
  /discord\.com\/invite\/[a-zA-Z0-9]+/gi,

  // YouTube links
  /youtu\.be\/[a-zA-Z0-9_-]+/gi,
  /youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/gi,

  // TikTok links
  /tiktok\.com\/@?[a-zA-Z0-9._]+/gi,
  /vm\.tiktok\.com\/[a-zA-Z0-9]+/gi,

  // Instagram links
  /instagram\.com\/[a-zA-Z0-9._]+/gi,

  // Twitter/X links
  /(?:twitter|x)\.com\/[a-zA-Z0-9_]+/gi,

  // Generic short URLs
  /bit\.ly\/[a-zA-Z0-9]+/gi,
  /tinyurl\.com\/[a-zA-Z0-9]+/gi,
  /goo\.gl\/[a-zA-Z0-9]+/gi,

  // Domain patterns (catches most URLs without protocol)
  /(?:^|\s)([a-zA-Z0-9-]+\.(?:com|net|org|io|co|me|tv|gg|xyz|info|biz|online|site|club|top|pro|vip|app)(?:\/[^\s]*)?)/gi,
];

/**
 * Extract all links from text
 */
function extractLinks(text) {
  if (!text) {
    return [];
  }

  const links = new Set();

  LINK_PATTERNS.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((link) => links.add(link.trim()));
    }
  });

  return Array.from(links);
}

/**
 * Default banned words
 */
const defaultWords = [
  "sex",
  "porn",
  "xxx",
  "xvideo",
  "cum4k",
  "randi",
  "chuda",
  "fuck",
  "nude",
  "bobs",
  "vagina",
];

/**
 * Main anti handler - combines antilink and antiword
 */
module.exports = async function handleAnti(message) {
  try {
    await message.loadGroupInfo();
    if (!message.isGroup) return;
    if (message.isfromMe) return;
    if (message.isAdmin) return;

    const jid = message.from;
    const sender = message.sender;
    const text = message.body;
    let linkData, wordData;
    try {
      [linkData, wordData] = await Promise.all([
        groupDB(["link"], { jid }, "get"),
        groupDB(["word"], { jid }, "get"),
      ]);
    } catch (e) {
      console.error("❌ Error reading groupDB:", e.message);
      return;
    }

    const antilink = linkData?.link;
    const antiword = wordData?.word;

    // Check ANTILINK first (higher priority)
    if (antilink && antilink.status === "true") {
      const links = extractLinks(text);

      if (links.length > 0) {
        // Filter out whitelisted links
        const whitelist = antilink.not_del || [];
        const filtered = links.filter((link) => {
          const isWhitelisted = !whitelist.some((whitelisted) =>
            link.toLowerCase().includes(whitelisted.toLowerCase())
          );
          return isWhitelisted;
        });

        if (filtered.length > 0) {
          await handleViolation(
            text,
            message,
            jid,
            sender,
            antilink,
            "link",
            `🔗 Link: ${filtered[0]}`,
            "sharing links"
          );
          return; // Stop processing after antilink violation
        }
      }
    }

    // Check ANTIWORD (if no link violation)
    if (antiword && antiword.status === "true") {
      const bannedWords =
        Array.isArray(antiword.words) && antiword.words.length > 0
          ? antiword.words
          : defaultWords;

      const lowered = text.toLowerCase();
      const foundWord = bannedWords.find((word) => {
        const found = lowered.includes(word);
        return found;
      });

      if (foundWord) {
        await handleViolation(
          text,
          message,
          jid,
          sender,
          antiword,
          "word",
          `🚫 Banned word detected`,
          "using banned words"
        );
      }
    }
  } catch (error) {
    console.error("❌ Anti handler error:", error);
  }
};

/**
 * Handle violation (link or word) with warn/kick actions
 */
async function handleViolation(
  text,
  message,
  jid,
  sender,
  settings,
  type,
  extraInfo,
  reason
) {
  try {
    const deleteMsg = async () => {
      await message.conn.sendMessage(jid, { delete: message.key });
    };

    const action = settings.action || "null";
    const warns = settings.warns || {};
    const maxWarn = settings.warn_count || 3;
    const warnCount = warns[sender] || 0;

    // Action: null → just delete
    if (action === "null") {
      await deleteMsg();
      return;
    }

    // Action: warn → delete + warn + kick if limit exceeded
    if (action === "warn") {
      await deleteMsg();

      const newWarn = warnCount + 1;
      warns[sender] = newWarn;

      // Save updated warns to DB
      await groupDB([type], { jid, content: { ...settings, warns } }, "set");

      if (newWarn >= maxWarn) {
        try {
          await message.conn.groupParticipantsUpdate(jid, [sender], "remove");
          await message.conn.sendMessage(jid, {
            text: `❌ @${
              sender.split("@")[0]
            } removed after ${maxWarn} warnings for ${reason}.`,
            mentions: [sender],
          });

          // Reset warn count after kick
          delete warns[sender];
          await groupDB(
            [type],
            { jid, content: { ...settings, warns } },
            "set"
          );
        } catch (e) {
          console.error("❌ Failed to remove user:", e.message);
          await message.conn.sendMessage(jid, {
            text: `⚠️ Cannot remove @${
              sender.split("@")[0]
            }. Bot needs admin privileges.`,
            mentions: [sender],
          });
        }
      } else {
        await message.conn.sendMessage(jid, {
          text: `⚠️ @${
            sender.split("@")[0]
          }, ${reason} is not allowed!\n\n⚠️ Warning ${newWarn}/${maxWarn}`,
          mentions: [sender],
        });
      }
      return;
    }

    // Action: kick → delete + remove immediately
    if (action === "kick") {
      await deleteMsg();
      try {
        await message.conn.groupParticipantsUpdate(jid, [sender], "remove");
        await message.conn.sendMessage(jid, {
          text: `❌ @${sender.split("@")[0]} removed for ${reason}.`,
          mentions: [sender],
        });
      } catch (e) {
        console.error("❌ Failed to remove user:", e.message);
        await message.conn.sendMessage(jid, {
          text: `⚠️ Cannot remove @${
            sender.split("@")[0]
          }. Bot needs admin privileges.`,
          mentions: [sender],
        });
      }
    }
  } catch (error) {
    console.error("❌ anti error:", error);
  }
}
