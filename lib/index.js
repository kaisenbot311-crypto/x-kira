const pino = require("pino");
const path = require("path");
const config = require("../config.js");
const manager = require("./manager");
const fs = require("fs");
const { version } = require("../package.json");
const handleAnti = require("./anti");
const serialize = require("./serialize");
const { loadPlugins } = require("./plugins");
const { groupDB, personalDB, deleteSession } = require("./database");

// Optimize Sets with WeakMap where possible
const kf = new Set();
const sentGoodbye = new Map(); // Changed to Map with size limit
const MAX_GOODBYE_CACHE = 1000;

// Cleanup sentGoodbye periodically
setInterval(() => {
  if (sentGoodbye.size > MAX_GOODBYE_CACHE) {
    const keysToDelete = Array.from(sentGoodbye.keys()).slice(
      0,
      MAX_GOODBYE_CACHE / 2
    );
    keysToDelete.forEach((key) => sentGoodbye.delete(key));
  }
}, 60000); // Every minute

async function deathuser(file_path) {
  try {
    await deleteSession(file_path);
    const logoutSessionDir = path.resolve(process.cwd(), "sessions", file_path);
    if (fs.existsSync(logoutSessionDir)) {
      fs.rmSync(logoutSessionDir, { recursive: true, force: true });
      console.log(`✅ [${file_path}] Session folder deleted`);
    }
  } catch (err) {
    console.error(`❌ [${file_path}] Error deleting session:`, err);
  }
}

const connect = async (file_path) => {
  const baileys = await import("baileys");
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    getContentType,
    makeCacheableSignalKeyStore,
    Browsers,
  } = baileys;

  try {
    if (!file_path) {
      console.error("❌ file_path is undefined or null");
      return null;
    }

    if (manager.isConnected(file_path)) {
      console.log(`✓ [${file_path}] Already connected`);
      return manager.getConnection(file_path);
    }

    if (manager.isConnecting(file_path)) {
      console.log(
        `⏳ [${file_path}] Already connecting, skipping duplicate call`
      );
      return null;
    }

    manager.setConnecting(file_path);
    console.log(`🔄 [${file_path}] Starting connection...`);

    const sessionDir = path.join(process.cwd(), "sessions", file_path);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Use minimal logging
    const logga = pino({ level: "fatal" }); // Changed from silent to fatal for less overhead

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version: waVersion } = await fetchLatestBaileysVersion();

    // Optimized socket configuration
    let conn = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logga),
      },
      version: waVersion,
      browser: Browsers.macOS("Chrome"),
      logger: pino({ level: "fatal" }),
      downloadHistory: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      getMessage: async () => undefined, // Optimized
      emitOwnEvents: false,
      generateHighQualityLinkPreview: false, // Changed to false to save RAM
      printQRInTerminal: false,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      // Memory optimizations
      maxMsgRetryCount: 2, // Reduced retries
      msgRetryCounterMap: new Map(), // Explicit Map
      patchMessageBeforeSending: (msg) => msg, // Minimal processing
    });

    // Debounced creds save
    let credsSaveTimeout;
    conn.ev.on("creds.update", () => {
      clearTimeout(credsSaveTimeout);
      credsSaveTimeout = setTimeout(() => saveCreds(), 500);
    });

    let plugins = [];
    let reconnectTimeout;

    const reconnect = (delay = 3000) => {
      clearTimeout(reconnectTimeout);
      console.log(`🔄 [${file_path}] Reconnecting in ${delay}ms...`);
      reconnectTimeout = setTimeout(() => connect(file_path), delay);
    };

    // Helper function to cache DB queries
    const dbCache = new Map();
    const getCachedDB = async (key, fetcher, ttl = 60000) => {
      const cached = dbCache.get(key);
      if (cached && Date.now() - cached.time < ttl) {
        return cached.data;
      }
      const data = await fetcher();
      dbCache.set(key, { data, time: Date.now() });
      return data;
    };

    // Clear cache periodically
    setInterval(() => {
      if (dbCache.size > 100) {
        dbCache.clear();
      }
    }, 300000); // Every 5 minutes

    conn.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        const fullJid = conn.user.id;
        const botNumber = fullJid.split(":")[0];
        manager.addConnection(file_path, conn);
        manager.removeConnecting(file_path);
        console.log(`✅ [${file_path}] Connected - ${botNumber}`);

        // Load plugins once
        plugins = await loadPlugins();

        const { login = false } =
          (await personalDB(["login"], {}, "get", botNumber)) || {};

        if (login !== "true") {
          await personalDB(["login"], { content: "true" }, "set", botNumber);

          const mode = "public";
          const prefix = ".";
          const start_msg = `*╭━━━〔🍓X-KIRA ━ 𝐁𝕺𝐓 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃〕━━━✦*
*┃🌱 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 : ${botNumber}*
*┃👻 𝐏𝐑𝐄𝐅𝐈𝐗        : ${prefix}*
*┃🔮 𝐌𝐎𝐃𝐄        : ${mode}*
*┃🎐 𝐕𝐄𝐑𝐒𝐈𝐎𝐍      : ${version}*
*╰━━━━━━━━━━━━━━━━━━╯*

*╭━━━〔🛠️ 𝗧𝗜𝗣𝗦〕━━━━✦*
*┃✧ 𝐓𝐘𝐏𝐄 .menu 𝐓𝐎 𝐕𝐈𝐄𝐖 𝐀𝐋𝐋*
*╰━━━━━━━━━━━━━━━━━╯*`;

          await conn
            .sendMessage(conn.user.id, {
              text: start_msg,
              contextInfo: {
                mentionedJid: [conn.user.id],
                externalAdReply: {
                  title: "𝐓𝐇𝐀𝐍𝐊𝐒 𝐅𝐎𝐑 𝐂𝐇𝐎𝐎𝐒𝐈𝐍𝐆 X-kira FREE BOT",
                  body: "X-kira ━ 𝐁𝕺𝐓",
                  thumbnailUrl:
                    "https://i.postimg.cc/HxHtd9mX/Thjjnv-KOMGGBCr11ncd-Fv-CP8Z7o73mu-YPcif.jpg",
                  sourceUrl:
                    "https://whatsapp.com/channel/0029VaoRxGmJpe8lgCqT1T2h",
                  mediaType: 1,
                  renderLargerThumbnail: false, // Changed to false
                },
              },
            })
            .catch((err) => console.error("Welcome message error:", err));
        }

        //=================================================================================
        // Welcome Handler (Optimized)
        //=================================================================================
        const welcomeHandler = async (update) => {
          const { id: groupJid, participants, action } = update;
          if (action !== "add") return;

          try {
            const groupMetadata = await conn
              .groupMetadata(groupJid)
              .catch(() => null);
            if (!groupMetadata) return;

            const groupName = groupMetadata.subject || "Group";
            const groupSize = groupMetadata.participants?.length || "Unknown";

            const cacheKey = `welcome_${groupJid}`;
            const { welcome } =
              (await getCachedDB(
                cacheKey,
                () =>
                  groupDB(["welcome"], { jid: groupJid, content: {} }, "get"),
                300000 // 5 min cache
              )) || {};

            if (welcome?.status !== "true") return;

            const rawMessage = welcome.message || "Welcome &mention!";
            const hasProfilePic = rawMessage.includes("&pp");

            for (const user of participants) {
              const mentionTag = `@${user.split("@")[0]}`;
              let text = rawMessage
                .replace(/&mention/g, mentionTag)
                .replace(/&size/g, groupSize)
                .replace(/&name/g, groupName)
                .replace(/&pp/g, "");

              const msgOptions = { text, mentions: [user] };

              if (hasProfilePic) {
                const profileImage = await conn
                  .profilePictureUrl(user, "image")
                  .catch(() => "https://i.imgur.com/U6d9F1v.png");

                msgOptions.contextInfo = {
                  externalAdReply: {
                    showAdAttribution: true,
                    title: "Welcome",
                    body: "X-kira ━ 𝐁𝕺𝐓",
                    thumbnailUrl: profileImage,
                    sourceUrl:
                      "https://whatsapp.com/channel/0029VaAKCMO1noz22UaRdB1Q",
                    mediaType: 1,
                    renderLargerThumbnail: false,
                  },
                };
              }

              await conn.sendMessage(groupJid, msgOptions).catch(() => {});
            }
          } catch (err) {
            console.error("Welcome handler error:", err);
          }
        };

        //=================================================================================
        // Goodbye Handler (Optimized)
        //=================================================================================
        const goodbyeHandler = async (update) => {
          const { id: groupJid, participants, action } = update;
          if (action !== "remove") return;

          try {
            const cacheKey = `exit_${groupJid}`;
            const { exit } =
              (await getCachedDB(
                cacheKey,
                () => groupDB(["exit"], { jid: groupJid, content: {} }, "get"),
                300000
              )) || {};

            if (exit?.status !== "true") return;

            const groupMetadata = await conn
              .groupMetadata(groupJid)
              .catch(() => null);
            if (!groupMetadata) return;

            const groupName = groupMetadata.subject || "Group";
            const groupSize = groupMetadata.participants?.length || "Unknown";
            const rawMessage = exit.message || "Goodbye &mention!";
            const hasProfilePic = rawMessage.includes("&pp");

            for (const user of participants) {
              const key = `${groupJid}_${user}`;

              // Check with Map instead of Set
              if (sentGoodbye.has(key)) continue;
              sentGoodbye.set(key, Date.now());
              setTimeout(() => sentGoodbye.delete(key), 10000);

              const mentionTag = `@${user.split("@")[0]}`;
              const text = rawMessage
                .replace(/&mention/g, mentionTag)
                .replace(/&name/g, groupName)
                .replace(/&size/g, groupSize)
                .replace(/&pp/g, "");

              const msgOptions = { text, mentions: [user] };

              if (hasProfilePic) {
                const profileImage = await conn
                  .profilePictureUrl(user, "image")
                  .catch(() => "https://i.imgur.com/U6d9F1v.png");

                msgOptions.contextInfo = {
                  externalAdReply: {
                    showAdAttribution: true,
                    title: "Goodbye",
                    body: "X-kira ━ 𝐁𝕺𝐓",
                    thumbnailUrl: profileImage,
                    sourceUrl:
                      "https://whatsapp.com/channel/0029VaAKCMO1noz22UaRdB1Q",
                    mediaType: 1,
                    renderLargerThumbnail: false,
                  },
                };
              }

              await conn.sendMessage(groupJid, msgOptions).catch(() => {});
            }
          } catch (err) {
            console.error("Goodbye handler error:", err);
          }
        };

        // Register handlers
        conn.ev.on("group-participants.update", welcomeHandler);
        conn.ev.on("group-participants.update", goodbyeHandler);

        //=================================================================================
        // ANTI CALL Handler (Optimized)
        //=================================================================================
        const callHandler = async (callData) => {
          try {
            const cacheKey = `anticall_${botNumber}`;
            const anticallData = await getCachedDB(
              cacheKey,
              () => personalDB(["anticall"], {}, "get", botNumber),
              60000
            );

            if (anticallData?.anticall !== "true") return;

            const calls = Array.isArray(callData) ? callData : [callData];

            for (const call of calls) {
              if (call.isOffer || call.status === "offer") {
                const from = call.from || call.chatId;

                await conn
                  .sendMessage(from, {
                    text: "Sorry, I do not accept calls",
                  })
                  .catch(() => {});

                if (conn.rejectCall) {
                  await conn.rejectCall(call.id, from).catch(() => {});
                }

                console.log(`❌ [${file_path}] Rejected call from ${from}`);
              }
            }
          } catch (err) {
            console.error("Call handler error:", err);
          }
        };

        ["call", "CB:call", "calls.upsert", "calls.update"].forEach((event) => {
          conn.ev.on(event, callHandler);
        });

        //=================================================================================
        // Auto Features Handler (Optimized)
        //=================================================================================
        const autoFeaturesHandler = async (m) => {
          if (m.type !== "notify" || !m.messages?.length) return;

          for (let msg of m.messages) {
            if (!msg?.message || msg.key.fromMe) continue;

            const jid = msg.key.remoteJid;
            const participant = msg.key.participant || jid;
            const mtype = getContentType(msg.message);

            msg.message =
              mtype === "ephemeralMessage"
                ? msg.message.ephemeralMessage.message
                : msg.message;

            // Batch DB queries
            const [readData, seenData, reactData, typingData, autoReactData] =
              await Promise.all([
                getCachedDB(
                  `autoread_${botNumber}`,
                  () => personalDB(["autoread"], {}, "get", botNumber),
                  30000
                ),
                getCachedDB(
                  `autostatus_seen_${botNumber}`,
                  () => personalDB(["autostatus_seen"], {}, "get", botNumber),
                  30000
                ),
                getCachedDB(
                  `autostatus_react_${botNumber}`,
                  () => personalDB(["autostatus_react"], {}, "get", botNumber),
                  30000
                ),
                getCachedDB(
                  `autotyping_${botNumber}`,
                  () => personalDB(["autotyping"], {}, "get", botNumber),
                  30000
                ),
                getCachedDB(
                  `autoreact_${botNumber}`,
                  () => personalDB(["autoreact"], {}, "get", botNumber),
                  30000
                ),
              ]);

            // Auto read
            if (readData?.autoread === "true") {
              conn.readMessages([msg.key]).catch(() => {});
            }

            // Status handling
            if (jid === "status@broadcast") {
              if (seenData?.autostatus_seen === "true") {
                conn.readMessages([msg.key]).catch(() => {});
              }

              if (reactData?.autostatus_react === "true") {
                const emojis = ["🔥", "❤️", "💯", "😎", "🌟"];
                const randomEmoji =
                  emojis[Math.floor(Math.random() * emojis.length)];
                const jawadlike = await conn.decodeJid(conn.user.id);

                conn
                  .sendMessage(
                    jid,
                    { react: { text: randomEmoji, key: msg.key } },
                    { statusJidList: [participant, jawadlike] }
                  )
                  .catch(() => {});
              }
            }

            // Auto typing (with debounce)
            if (
              typingData?.autotyping === "true" &&
              jid !== "status@broadcast"
            ) {
              conn.sendPresenceUpdate("composing", jid).catch(() => {});
              setTimeout(() => {
                conn.sendPresenceUpdate("paused", jid).catch(() => {});
              }, 2000);
            }

            // Auto react
            if (
              autoReactData?.autoreact === "true" &&
              jid !== "status@broadcast"
            ) {
              const emojis = ["😅", "😎", "😂", "🥰", "🔥", "💖", "🤖"];
              const randomEmoji =
                emojis[Math.floor(Math.random() * emojis.length)];
              conn
                .sendMessage(jid, {
                  react: { text: randomEmoji, key: msg.key },
                })
                .catch(() => {});
            }
          }
        };

        conn.ev.on("messages.upsert", autoFeaturesHandler);

        //=================================================================================
        // Command Handler (Optimized)
        //=================================================================================
        const commandHandler = async ({ messages, type }) => {
          if (type !== "notify" || !messages?.length) return;

          const raw = messages[0];
          if (!raw.message || !plugins.length) return;

          const message = await serialize(raw, conn);
          if (!message?.body) return;

          console.log(
            `[${file_path}] ${message.sender}: ${message.body.substring(0, 50)}`
          );

          await handleAnti(message).catch(() => {});

          // Status react
          if (
            config.STATUS_REACT &&
            message.key?.remoteJid === "status@broadcast"
          ) {
            const st_id = `${message.key.participant}_${message.key.id}`;
            if (
              !kf.has(st_id) &&
              !conn.areJidsSameUser(message.key.participant, conn.user.id)
            ) {
              const reactions = ["❤️", "❣️", "🩷"];
              conn
                .sendMessage(
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
                )
                .catch(() => {});
              kf.add(st_id);
            }
          }

          const cmdEvent =
            config.WORK_TYPE === "public" ||
            (config.WORK_TYPE === "private" &&
              (message.fromMe || process.env.SUDO));

          if (!cmdEvent) return;

          const prefix = config.prefix || process.env.PREFIX;

          if (message.body.startsWith(prefix)) {
            const [cmd, ...args] = message.body
              .slice(prefix.length)
              .trim()
              .split(" ");
            const match = args.join(" ");
            const found = plugins.find((p) => p.command === cmd);

            if (found) {
              await found.exec(message, match).catch((err) => {
                console.error("Plugin error:", err);
              });
              return;
            }
          }

          // Text plugins
          for (const plugin of plugins) {
            if (plugin.on === "text" && message.body) {
              await plugin.exec(message).catch(() => {});
            }
          }
        };

        conn.ev.on("messages.upsert", commandHandler);
      }

      //=================================================================================
      // Connection Close Handler
      //=================================================================================
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.output?.payload?.error;

        console.log(`❌ [${file_path}] Closed: ${statusCode} - ${reason}`);

        manager.removeConnection(file_path);
        manager.removeConnecting(file_path);

        // Clear caches
        dbCache.clear();

        switch (statusCode) {
          case DisconnectReason.loggedOut:
          case DisconnectReason.forbidden:
          case DisconnectReason.connectionReplaced:
            await deathuser(file_path);
            await personalDB(["login"], { content: "false" }, "set", file_path);
            break;

          case DisconnectReason.badSession:
            reconnect(10000);
            break;

          case DisconnectReason.connectionClosed:
            reconnect(2000);
            break;

          case DisconnectReason.connectionLost:
          case DisconnectReason.timedOut:
          case DisconnectReason.restartRequired:
            reconnect(3000);
            break;

          case DisconnectReason.multideviceMismatch:
            reconnect(5000);
            break;

          case DisconnectReason.unavailableService:
            reconnect(10000);
            break;

          default:
            if (
              statusCode !== DisconnectReason.loggedOut &&
              statusCode !== DisconnectReason.forbidden &&
              statusCode !== DisconnectReason.connectionReplaced
            ) {
              reconnect(3000);
            } else {
              await deathuser(file_path);
              await personalDB(
                ["login"],
                { content: "false" },
                "set",
                file_path
              );
            }
            break;
        }
      }
    });

    return conn;
  } catch (err) {
    console.error(`❌ [${file_path}] Connect error:`, err);
    manager.removeConnecting(file_path);
    return null;
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

  async disconnect() {
    if (this.conn) {
      await this.conn.logout();
      manager.removeConnection(this.path);
      this.conn = null;
    }
  }
}

module.exports = { WhatsApp, connect };
