const pino = require("pino");
const path = require("path");
const axios = require("axios");
const config = require("../config.js");
const fs = require("fs");
const { version } = require("../package.json");
const serialize = require("./serialize");
const { loadPlugins } = require("./plugins");
const { downloadCreds } = require("./handier");
const db = require('./database/settingsdb');
const cache = require('./group-cache');
const kf = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const connect = async (file_path) => {
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
    } = await import("baileys");
    const sessionDir = path.join(process.cwd(), "sessions", file_path);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    await downloadCreds(sessionDir);
    const logga = pino({ level: "silent" });
    console.log(`📂 Using session directory: ${sessionDir}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const baileysVersion = await fetchLatestBaileysVersion();

    let conn = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logga),
      },
      version: baileysVersion,
      browser: Browsers.macOS("Chrome"),
      logger: pino({ level: "silent" }),
      downloadHistory: false,
      syncFullHistory: true,
      markOnlineOnConnect: false,
      getMessage: false,
      emitOwnEvents: false,
      generateHighQualityLinkPreview: true,
      defaultQueryTimeoutMs: undefined,
      cachedGroupMetadata: async (jid) => {
        const cached = cache.getCached(jid);
        if (cached) return cached;
        const md = await conn.groupMetadata(jid);
        cache.setCached(jid, md);
        return md;
      }
    });
    conn.ev.on("creds.update", saveCreds);
    let plugins = [];
    conn.ev.on("lid-mapping.update", async (mapping) => {
      console.log(`🆔 [${file_path}] LID mapping updated:`, mapping);
    });
    conn.ev.on("connection.update", async (update) => {
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
            connect(file_path);
            break;
          case DisconnectReason.connectionLost:
            console.log("⚠️ Connection lost. Trying to reconnect...");
            await sleep(3000);
            connect(file_path);
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
            connect(file_path);
            break;
          case DisconnectReason.timedOut:
            console.log("⏱️ Connection timed out. Trying to reconnect...");
            await sleep(3000);
            connect(file_path);
            break;
          case DisconnectReason.multideviceMismatch:
            console.log("❌ Multi-device mismatch. Please re-login.");
            await db.setGlobal('login', 'false');
            break;
          default:
            console.log(`❌ Unknown disconnect reason: ${statusCode}. Reconnecting...`);
            await sleep(3000);
            connect(file_path);
        }
      } else if (connection === "open") {
        const fullJid = conn.user.id;
        const botNumber = fullJid.split(":")[0];
        console.log(`✅ [${file_path}] connected as ${botNumber} `);
        const botjid = jidNormalizedUser(conn.user.id);
        plugins = await loadPlugins();
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
            console.log(`🍉 [${file_path}] Connected to WhatsApp ${botNumber}`);
          }
        } catch (error) {
          console.log(
            `❌ [${file_path}] Failed to send welcome message:`,
            error.message
          );
        }

        //=================================================================================
        // Group Participants Update Handler with Cache
        //=================================================================================
        conn.ev.on("group-participants.update", async (event) => {
          try {
            // 🔹 Update cache (your existing logic)
            const cached = cache.getCached(event.id) || {};
            const participants = cached.participants || [];
            const updated = { ...cached };

            if (event.action === "add") {
              updated.participants = [...participants, ...event.participants];
            } else if (event.action === "remove") {
              updated.participants = participants.filter(
                p => !event.participants.includes(p.id)
              );
            } else if (event.action === "promote" || event.action === "demote") {
              updated.participants = participants.map(p =>
                event.participants.includes(p.id)
                  ? { ...p, admin: event.action === "promote" ? "admin" : null }
                  : p
              );
            }

            cache.setCached(event.id, updated);
            for (const plugin of plugins) {
              if (plugin.on === "group-participants.update") {
                await plugin.exec(null, event, conn);
              }
            }

          } catch (err) {
            console.error(`Failed to handle participant update ${event.id}:`, err);
            cache.deleteCached(event.id);
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

        //=================================================================================
        // ANTI CALL Handler
        //=================================================================================
        conn.ev.on("call", async (callData) => {
          try {
            // 🔹 Read once from cache/db
            const anticall = db.getGlobal("anticall", false);
            if (!anticall) return;

            const calls = Array.isArray(callData) ? callData : [callData];

            for (const call of calls) {
              if (call.isOffer || call.status === "offer") {
                const from = call.from || call.chatId;

                // 🔹 Warn caller
                await conn.sendMessage(from, {
                  text: " Sorry, I do not accept calls.",
                });

                // 🔹 Reject call safely (Baileys compatibility)
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
        // Messages Handler (DB + CACHE BASED)
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
                const emojis = ["🔥", "❤️", "💯", "😎", "🌟", "👑", "🥰"];
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
                const emojis = ["💀", "🔥", "🥰", "👑", "🍓", "🎐", "🐍"];
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
        // Command Handler with LID Support
        //=================================================================================
        conn.ev.on("messages.upsert", async ({ messages, type }) => {
          if (type !== "notify" || !messages || !messages.length) return;
          const raw = messages[0];
          if (!raw.message) return;
          if (!plugins.length) return;
          const message = await serialize(raw, conn);
          if (!message || !message.body) return;
          console.log(
            `\n[${file_path}] User: ${message.sender}\nMessage: ${message.body}\nFrom: ${message.from}\n`
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

          const cmdEvent =
            global.WORK_TYPE === "public" ||
            (global.WORK_TYPE === "private" &&
              (message.isfromMe || global.SUDO));
          if (!cmdEvent) return;

          const prefix = config.prefix || ".";
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
    console.error(`❌ [${file_path}] Connect error:`, err);
    process.exit(1);
  }
};

class WhatsApp {
  constructor(fp) {
    this.path = fp;
    this.conn = null;
  }
  async connect() {
    this.conn = await connect(this.path);
    return this.conn;
  }
}

module.exports = { WhatsApp, connect };

