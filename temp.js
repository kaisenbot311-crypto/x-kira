// main.js (example)
const db = require('./settingsDB');
const path = require('path');

// call this at bot start
(async () => {
  await db.init({ file: path.join(__dirname, 'data', 'settings_db.json'), autosaveInterval: 3000 });
  console.log('DB initialized. startup:', db.getStartupTime());

  // set some defaults (only set if not present)
  if (db.getGlobal('autoreact') === undefined) await db.setGlobal('autoreact', true);
  if (db.getGlobal('seen') === undefined) await db.setGlobal('seen', true);

  // Example: listen for updates to react in runtime (optional)
  db.on('update', (payload) => {
    console.log('settings update ->', payload);
  });

  // load plugins and connect your Baileys client below...
  // Example plugin loader usage (see plugin-loader.js)
})();

 const emojis = [
                  "😅",
                  "😎",
                  "😂",
                  "🥰",
                  "🔥",
                  "💖",
                  "🤖",
                  "🌸",
                  "😳",
                  "❤️",
                  "🥺",
                  "👍",
                  "🎉",
                  "😜",
                  "💯",
                  "✨",
                  "💫",
                  "💥",
                  "⚡",
                  "✨",
                  "🎖️",
                  "💎",
                  "🔱",
                  "💗",
                  "❤‍🩹",
                  "👻",
                  "🌟",
                  "🪄",
                  "🎋",
                  "🪼",
                  "🍿",
                  "👀",
                  "👑",
                  "🦋",
                  "🐋",
                  "🌻",
                  "🌸",
                  "🔥",
                  "🍉",
                  "🍧",
                  "🍨",
                  "🍦",
                  "🧃",
                  "🪀",
                  "🎾",
                  "🪇",
                  "🎲",
                  "🎡",
                  "🧸",
                  "🎀",
                  "🎈",
                  "🩵",
                  "♥️",
                  "🚩",
                  "🏳️‍🌈",
                  "🏖️",
                  "🔪",
                  "🎏",
                  "🫐",
                  "🍓",
                  "💋",
                  "🍄",
                  "🎐",
                  "🍇",
                  "🐍",
                  "🪻",
                  "🪸",
                  "💀",
                ];

                   //=================================================================================
        // Messages Handler with LID Support
        //=================================================================================
        conn.ev.on("messages.upsert", async (m) => {
          try {
            if (m.type !== "notify") return;

            for (let msg of m.messages) {
              if (!msg?.message) continue;
              if (msg.key.fromMe) continue;

              const jid = msg.key.remoteJid;
              const participant =
                msg.key.participant || msg.key.participantAlt || jid;
              const mtype = getContentType(msg.message);

              msg.message =
                mtype === "ephemeralMessage"
                  ? msg.message.ephemeralMessage.message
                  : msg.message;

              // AUTO READ
              if (global.autoread === "true") {
                await conn.readMessages([msg.key]);
              }

              // AUTO STATUS SEEN
              if (jid === "status@broadcast") {
                if (global.autostatus_seen === "true") {
                  await conn.readMessages([msg.key]);
                }
              }

              // AUTO STATUS REACT
              if (jid === "status@broadcast") {
                if (global.autostatus_react === "true") {
                  const emojis = [
                    "🔥",
                    "❤️",
                    "💯",
                    "😎",
                    "🌟",
                    "💜",
                    "💙",
                    "👑",
                    "🥰",
                  ];
                  const randomEmoji =
                    emojis[Math.floor(Math.random() * emojis.length)];
                  const like = await conn.decodeJid(conn.user.id);
                  await conn.sendMessage(
                    jid,
                    { react: { text: randomEmoji, key: msg.key } },
                    { statusJidList: [participant, like] }
                  );
                }
              }

              // AUTO TYPING
              if (
                global.autotyping === "true" &&
                jid !== "status@broadcast"
              ) {
                await conn.sendPresenceUpdate("composing", jid);
                const typingDuration = Math.floor(Math.random() * 3000) + 2000;
                setTimeout(async () => {
                  try {
                    await conn.sendPresenceUpdate("paused", jid);
                  } catch (e) {
                    console.error("Error stopping typing indicator:", e);
                  }
                }, typingDuration);
              }
              // AUTO REACT
              if (
                global.autoreact === "true" &&
                jid !== "status@broadcast"
              ) {
                const emojis = [
            
                  "🏳️‍🌈",
                  "🏖️",
                  "🔪",
                  "🎏",
                  "🫐",
                  "🍓",
                  "💋",
                  "🍄",
                  "🎐",
                  "🍇",
                  "🐍",
                  "🪻",
                  "🪸",
                  "💀",
                ];
                const randomEmoji =
                  emojis[Math.floor(Math.random() * emojis.length)];
                await conn.sendMessage(jid, {
                  react: { text: randomEmoji, key: msg.key },
                });
                await new Promise((res) => setTimeout(res, 150));
              }
            }
          } catch (err) {
            console.error(
              `❌ [${file_path}] Unified messages.upsert error:`,
              err
            );
          }
        });


          let conn = makeWASocket({
            auth: state,
			printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            defaultQueryTimeoutMs: undefined,
            cachedGroupMetadata: async (jid) => {
            const cachedData = global.cache.groups.get(jid);
            if (cachedData) return cachedData;
            const metadata = await conn.groupMetadata(jid);
            global.cache.groups.set(jid, metadata);
            return metadata;
            }
        });


            conn.ev.on("groups.update", async (events) => {
    for (const event of events) {
        try {
            const metadata = await conn.groupMetadata(event.id);
            global.cache.groups.set(event.id, metadata);
        } catch (err) {
            console.error(`Failed to get group metadata for ${event.id}:`, err.message);
            global.cache.groups.del(event.id); // Optional: clean it from cache
        }
    }
});

   conn.ev.on("group-participants.update", async (event) => {
    try {
        const metadata = await conn.groupMetadata(event.id);
        global.cache.groups.set(event.id, metadata);
    } catch (err) {
        console.error(`Failed to get group metadata for ${event.id}:`, err.message);
        global.cache.groups.del(event.id);
    }
});



const { makeWASocket } = require("@whiskeysockets/baileys");
const pino = require("pino");
const cache = require("./group-cache"); // import our cache module

let conn = makeWASocket({
  auth: state,
  printQRInTerminal: false,
  logger: pino({ level: "silent" }),
  defaultQueryTimeoutMs: undefined,
  cachedGroupMetadata: async (jid) => {
    const cached = cache.getCached(jid);
    if (cached) return cached;
    const md = await conn.groupMetadata(jid);
    cache.setCached(jid, md);
    return md;
  }
});

// Handle group metadata updates
conn.ev.on("groups.update", async (events) => {
  for (const event of events) {
    try {
      const cached = cache.getCached(event.id) || {};
      // merge event info into cached
      cache.updateCached(event.id, { ...cached, ...event });
      // optionally fetch full metadata
      const md = await conn.groupMetadata(event.id);
      cache.setCached(event.id, md);
    } catch (err) {
      console.error(`Failed to update group ${event.id}:`, err.message);
      cache.deleteCached(event.id);
    }
  }
});

// Handle participant updates
conn.ev.on("group-participants.update", async (event) => {
  try {
    const cached = cache.getCached(event.id) || {};
    const participants = cached.participants || [];
    const updated = { ...cached };

    if (event.action === "add") {
      updated.participants = [...participants, ...event.participants];
    } else if (event.action === "remove") {
      updated.participants = participants.filter(
        p => !event.participants.includes(p)
      );
    } else if (event.action === "promote" || event.action === "demote") {
      updated.participants = participants.map(p =>
        event.participants.includes(p.id)
          ? { ...p, isAdmin: event.action === "promote" }
          : p
      );
    }

    cache.setCached(event.id, updated);
  } catch (err) {
    console.error(`Failed to update participants for ${event.id}:`, err.message);
    cache.deleteCached(event.id);
  }
});

// Example: get metadata somewhere in your bot
async function printGroupName(jid) {
  const metadata = await cache.getGroupMetadata(conn, jid);
  console.log("Group name:", metadata.subject);
}