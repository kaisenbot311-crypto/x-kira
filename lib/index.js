const pino = require("pino");
const path = require("path");
const axios = require("axios");
const config = require("../config.js");
const fs = require("fs");
const { version } = require("../package.json");
const serialize = require("./serialize");
const { loadPlugins } = require("./plugins");
const { downloadCreds } = require("./handier");
const db = require('./database/settingdb');
const cache = require('./group-cache');
const kf = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connect() {
  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      DisconnectReason,
      getContentType,
      makeCacheableSignalKeyStore,
      jidNormalizedUser,
      Browsers,
      delay,
    } = await import("baileys")
    const sessionDir = path.join(process.cwd(), "sessions");
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
     await downloadCreds(sessionDir);
    const logga = pino({ level: "silent" });
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    let conn = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logga),
      },
      version,
      browser: Browsers.windows("chrome"),
      logger: logga,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      cachedGroupMetadata: async (jid) => {
        return cache.getCached(jid);
      }
    });
    conn.ev.on("creds.update", saveCreds);
    let plugins = [];
    conn.ev.on("lid-mapping.update", async (mapping) => {
      console.log(`🆔  LID mapping updated:`, mapping);
    });
    conn.ev.on("connection.update", async (update) => {
      console.log(update)
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode || 0;
        console.log(`🛑 connection closed with status code: ${statusCode}`);
        switch (statusCode) {
          case DisconnectReason.badSession:
            console.log("❌ Bad Session File. Delete session and rescan QR.");
            await db.setGlobal('login', 'false');
            break;
          case DisconnectReason.connectionClosed:
            console.log("⚠️ Connection closed. Reconnecting...");
            await sleep(3000);
            connect();
            break;
          case DisconnectReason.connectionLost:
            console.log("⚠️ Connection lost. Trying to reconnect...");
            await sleep(3000);
            connect();
            break;
          case DisconnectReason.connectionReplaced:
            console.log("⚠️ Connection replaced by a new session. You might be logged in elsewhere.");
            break;
          case DisconnectReason.loggedOut:
            console.log("🛑 Logged out. Delete session and rescan QR.");
            await db.setGlobal('login', 'false');
            break;
          case DisconnectReason.restartRequired:
            console.log("🔁 Restart required. Reconnecting...");
            await sleep(3000);
            connect();
            break;
          case DisconnectReason.timedOut:
            console.log("⏱️ Connection timed out. Trying to reconnect...");
            await sleep(3000);
            connect();
            break;
          case DisconnectReason.multideviceMismatch:
            console.log("❌ Multi-device mismatch. Please re-login.");
            await db.setGlobal('login', 'false');
            break;
          default:
            console.log(`❌ Unknown disconnect reason: ${statusCode}. Restart...`);
            await sleep(3000);
            process.exit(0);
        }
      } else if (connection === "open") {
        const fullJid = conn.user.id;
        const botNumber = fullJid.split(":")[0];
        console.log(`✅ connected as ${botNumber} `);
        const botjid = jidNormalizedUser(conn.user.id);
        plugins = loadPlugins();
        try {
          const login = db.getGlobal('login');
          if (login !== "true") {
            await db.setGlobal('login', 'true');
            const start_msg = `
*╭━━━〔🍓X-KIRA ━ 𝐁𝕺𝐓 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃〕━━━✦*
*┃🌱 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 : ${botNumber}*
*┃👻 𝐏𝐑𝐄𝐅𝐈𝐗        : ${config.prefix}*
*┃🔮 𝐌𝐎𝐃𝐄        : ${config.WORK_TYPE}*
*┃🎐 𝐕𝐄𝐑𝐒𝐈𝐎𝐍      : ${version}*
*╰━━━━━━━━━━━━━━━━━━╯*

*╭━━━〔🛠️ 𝗧𝗜𝗣𝗦〕━━━━✦*
*┃✧ 𝐓𝐘𝐏𝐄 .menu 𝐓𝐎 𝐕𝐈𝐄𝐖 𝐀𝐋𝐋*
*┃✧ 𝐈𝐍𝐂𝐋𝐔𝐃𝐄𝐒 𝐅𝐔𝐍, 𝐆𝐀𝐌𝐄, 𝐒𝐓𝐘𝐋𝐄*
*╰━━━━━━━━━━━━━━━━━╯*
`;
            await conn.sendMessage(botjid, {
              text: start_msg,
              contextInfo: {
                mentionedJid: [botjid],
                externalAdReply: {
                  title: "𝐓𝐇𝐀𝐍𝐊𝐒 𝐅𝐎𝐑 𝐂𝐇𝐎𝐎𝐒𝐈𝐍𝐆 X-kira FREE BOT",
                  body: "X-kira ━ 𝐁𝕺𝐓",
                  thumbnailUrl:
                    "https://i.postimg.cc/HxHtd9mX/Thjjnv-KOMGGBCr11ncd-Fv-CP8Z7o73mu-YPcif.jpg",
                  sourceUrl:
                    "https://whatsapp.com/channel/0029VaoRxGmJpe8lgCqT1T2h",
                  mediaType: 1,
                  renderLargerThumbnail: true,
                },
              },
            });
          } else {
            console.log(`🍉  Connected to WhatsApp ${botNumber}`);
          }
        } catch (error) {
          console.log(
            `❌  Failed to send welcome message:`,
            error.message
          );
        }
        //=================================================================================
        // Group Participants Update Handler with Cache
        //=================================================================================
        conn.ev.on("group-participants.update", async (event) => {
          try {
            const jid = event.id;
            const cached = cache.getCached(jid) || (await cache.getGroupMetadata(conn, jid).catch(() => ({ id: jid, participants: [] })));
            let participants = Array.isArray(cached.participants) ? cached.participants.slice() : [];
            const incoming = (event.participants || []).map(p => (typeof p === "string" ? p : (p.id || p)));
            const byId = new Map(participants.map(p => [p.id, { ...p }]));
            if (event.action === "add") {
              for (const pid of incoming) {
                if (!byId.has(pid)) byId.set(pid, { id: pid, admin: null });
              }
            } else if (event.action === "remove") {
              for (const pid of incoming) {
                byId.delete(pid);
              }
            } else if (event.action === "promote" || event.action === "demote") {
              const newAdminValue = event.action === "promote" ? "admin" : null;
              for (const pid of incoming) {
                const cur = byId.get(pid);
                if (cur) {
                  cur.admin = newAdminValue;
                  byId.set(pid, cur);
                } else {
                  byId.set(pid, { id: pid, admin: newAdminValue });
                }
              }
            }
            const updatedParticipants = Array.from(byId.values());
            cache.updateCached(jid, { ...cached, participants: updatedParticipants });
            for (const plugin of plugins) {
              if (plugin.on === "group-participants.update") {
                try {
                  await plugin.exec(null, event, conn);
                } catch (e) {
                  console.error("plugin exec error:", e);
                }
              }
            }
          } catch (err) {
            console.error(`Failed to handle participant update ${event.id}:`, err);
            cache.deleteCached(event.id);
          }
        });
        conn.ev.on("groups.update", async (events) => {
          for (const event of events) {
            try {
              const jid = event.id;
              const cached = cache.getCached(jid) || {};
              cache.updateCached(jid, { ...cached, ...event });
              try {
                const md = await conn.groupMetadata(jid);
                cache.setCached(jid, md);
              } catch (err) {
                console.warn(`Failed to fetch metadata for ${jid}:`, err?.message ?? err);
              }
            } catch (err) {
              console.error(`Failed to update group ${event.id}:`, err?.message ?? err);
              cache.deleteCached(event.id);
            }
          }
        });
        //=================================================================================
        // ANTI CALL Handler
        //=================================================================================
        conn.ev.on("call", async (callData) => {
          try {
            const anticall = db.getGlobal("anticall", false);
            if (!anticall) return;
            const calls = Array.isArray(callData) ? callData : [callData];
            for (const call of calls) {
              if (call.isOffer || call.status === "offer") {
                const from = call.from || call.chatId;
                await conn.sendMessage(from, {
                  text: "Sorry, I do not accept calls.",
                });
                if (typeof conn.rejectCall === "function") {
                  await conn.rejectCall(call.id, from);
                } else if (typeof conn.updateCallStatus === "function") {
                  await conn.updateCallStatus(call.id, "reject");
                }
                console.log(`❌ AntiCall: rejected call from ${from}`);
              }
            }
          } catch (err) {
            console.error("❌ AntiCall handler error:", err);
          }
        });
        //=================================================================================
        // Messages Handler
        //=================================================================================
        conn.ev.on("messages.upsert", async (m) => {
          try {
            if (m.type !== "notify") return;
            for (let msg of m.messages) {
              if (!msg?.message) continue;
              // if (msg.key.fromMe) continue;
              const jid = msg.key.remoteJid;
              const participant =
                msg.key.participant || msg.key.participantAlt || jid;
              const mtype = getContentType(msg.message);
              msg.message =
                mtype === "ephemeralMessage"
                  ? msg.message.ephemeralMessage.message
                  : msg.message;
              const setting = db.getMultiple(
                null,
                [
                  'autoread',
                  'autotyping',
                  'autoreact',
                  'autostatus_seen',
                  'autostatus_react'
                ],
                {
                  autoread: config.AUTOREAD || false,
                  autotyping: config.AUTOTYPING || false,
                  autoreact: config.AUTOREACT || false,
                  autostatus_seen: config.STATUS_SEEN || false,
                  autostatus_react: config.STATUS_REACT || false
                }
              );
              // ================= AUTO READ =================
              if (setting.autoread === true) {
                await conn.readMessages([msg.key]);
              }
              // ================= STATUS SEEN =================
              if (jid === "status@broadcast" && setting.autostatus_seen === true) {
                await conn.readMessages([msg.key]);
              }
              // ================= STATUS REACT =================
              if (jid === "status@broadcast" && setting.autostatus_react === true) {
                const emojis = ["💖", "❤️‍🔥", "💝", "💓", "❤️", "❣️", "💔", "💗", "💞", "🦋", "✨", "🌹", "🌸", "🌼"];
                const randomEmoji =
                  emojis[Math.floor(Math.random() * emojis.length)];
                const like = await conn.decodeJid(conn.user.id);
                await conn.sendMessage(
                  jid,
                  { react: { text: randomEmoji, key: msg.key } },
                  { statusJidList: [participant, like] }
                );
              }
              // ================= AUTO TYPING =================
              if (setting.autotyping === true && jid !== "status@broadcast") {
                await conn.sendPresenceUpdate("composing", jid);
                setTimeout(async () => {
                  try {
                    await conn.sendPresenceUpdate("paused", jid);
                  } catch { }
                }, Math.floor(Math.random() * 3000) + 2000);
              }
              // ================= AUTO REACT =================
              if (setting.autoreact === true && jid !== "status@broadcast") {
                const emojis = ["💖", "❤️‍🔥", "💝", "💓", "❤️", "❣️", "💔", "💗", "💞", "🦋", "✨", "🌹", "🌸", "🌼"];
                const randomEmoji =
                  emojis[Math.floor(Math.random() * emojis.length)];
                await conn.sendMessage(jid, {
                  react: { text: randomEmoji, key: msg.key }
                });
              }
            }
          } catch (err) {
            console.error("❌ messages.upsert error:", err);
          }
        });
        //=================================================================================
        // Command Handler
        //=================================================================================
        conn.ev.on("messages.upsert", async ({ messages, type }) => {
          if (type !== "notify" || !messages || !messages.length) return;
          const raw = messages[0];
          if (!raw.message) return;
          if (!plugins.length) return;
          for (const plugin of plugins) {
            if (plugin.on === "raw") {
              try {
                await plugin.exec(raw, conn);
              } catch (e) {
                console.error("plugin exec error:", e);
              }
            }
          }
          const message = await serialize(raw, conn);
          if (!message || !message.body) return;
          console.log(
            `\n User: ${message.sender}\nMessage: ${message.body}\nFrom: ${message.from}\n`
          );
          if (
            global.statusreact && message.key?.remoteJid === "status@broadcast"
          ) {
            const st_id = `${message.key.participant}_${message.key.id}`;
            if (
              !kf.has(st_id) &&
              !conn.areJidsSameUser(message.key.participant, conn.user.id)
            ) {
              const reactions = ["❤️", "❣️", "🩷"];
              try {
                await conn.sendMessage(
                  "status@broadcast",
                  {
                    react: {
                      text: reactions[
                        Math.floor(Math.random() * reactions.length)
                      ],
                      key: message.key,
                    },
                  },
                  { statusJidList: [message.key.participant] }
                );
                kf.add(st_id);
              } catch (e) {
                console.error(e);
              }
            }
          }
          const WORK_TYPE = db.getGlobal("WORK_TYPE") ?? config.WORK_TYPE ?? "public";
          const PREFIX = db.getGlobal("prefix") ?? config.prefix ?? ".";
          // 🔹 command permission check
          const cmdEvent =
            WORK_TYPE === "public" ||
            (WORK_TYPE === "private" && message.isFromMe);
          if (!cmdEvent) return;
          const prefix = PREFIX;
          if (message.body.startsWith(prefix)) {
            const [cmd, ...args] = message.body
              .slice(prefix.length)
              .trim()
              .split(" ");
            const match = args.join(" ");
            const found = plugins.find((p) => p.command === cmd);
            if (found) {
              await found.exec(message, match);
              return;
            }
          }
          for (const plugin of plugins) {
            if (plugin.on === "text" && message.body) {
              await plugin.exec(message);
            }
          }
        });
      }
    });
    return conn;
  } catch (err) {
    console.error(`❌ Connect error:`, err);
    process.exit(1);
  }
};


module.exports = { connect };