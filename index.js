const express = require("express");
const pino = require("pino");
const fs = require("fs-extra");
const path = require("path");
const { db } = require("./lib/blockDB");
const { ref, set, get, remove, child } = require("firebase/database");
const config = require("./config");
const NodeCache = require("node-cache");
const { Mutex } = require("async-mutex");
const mutex = new Mutex();

const {
  initSessions,
  saveSession,
  getAllSessions,
  deleteSession,
} = require("./lib/database/index");
const { WhatsApp } = require("./lib/index");
const { initializeLang } = require("./lang/iLang");
const manager = require("./lib/manager");

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
async function isBlocked(number) {
  try {
    const snapshot = await get(child(ref(db), `blocked/${number}`));
    return snapshot.exists();
  } catch (err) {
    console.error("Error checking block status:", err);
    return false;
  }
}

/**
 * Create a pairing session (temporary connection for QR/pairing code only)
 */
async function connector(Num, res) {
  const sessionDir = path.join(__dirname, "sessions", Num);
  await fs.ensureDir(sessionDir);

  let session = null;
  let cleanupDone = false;
  let pairingCodeSent = false; // Track if pairing code was sent
  let hasReconnected = false; // Track if already reconnected once

  const cleanup = async () => {
    if (cleanupDone) return;
    cleanupDone = true;

    if (session) {
      session.end(new Error("Cleanup"));
      session = null;
    }
  };

  try {
    const baileys = await import("baileys-mod");
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      delay,
      Browsers,
      makeCacheableSignalKeyStore,
    } = baileys;

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    session = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(
          state.keys,
          pino({ level: "fatal" }).child({ level: "fatal" })
        ),
      },
      logger: pino({ level: "fatal" }).child({ level: "fatal" }),
      browser: Browsers.macOS("Arc"),
      printQRInTerminal: false,
    });

    if (!session.authState.creds.registered) {
      await delay(3000);
      Num = Num.replace(/[^0-9]/g, "");

      // Only request pairing code once
      if (!pairingCodeSent) {
        try {
          const code = await session.requestPairingCode(Num);
          pairingCodeSent = true;
          console.log(`📱 Pairing code for ${Num}: ${code}`);

          if (!res.headersSent) {
            res.send({
              status: "success",
              code: code?.match(/.{1,4}/g)?.join("-") || code,
              number: Num,
              message: "Enter this code in WhatsApp: Link a Device",
            });
          }
        } catch (err) {
          console.error(`❌ Failed to get pairing code for ${Num}:`, err);

          if (!res.headersSent) {
            res.status(500).send({
              status: "error",
              message: "Failed to generate pairing code",
              error: err.message,
            });
          }

          await cleanup();
          return;
        }
      }
    }

    session.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        console.log(`✅ Credentials saved for ${Num}`);
      } catch (err) {
        console.error(`❌ Failed to save credentials for ${Num}:`, err);
      }
    });

    session.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        console.log(`✅ Pairing successful for ${Num}`);

        const release = await mutex.acquire();
        try {
          if (manager.isConnected(Num) || manager.isConnecting(Num)) {
            console.log(`⚠️ ${Num} is already connected, skipping startBot`);
            await cleanup();
            return;
          }

          console.log(`🔄 Closing pairing session for ${Num}...`);
          await delay(2000);
          await cleanup();
          await delay(3000);

          console.log(`🚀 Starting main bot for ${Num}...`);
          await startBot(Num);
        } catch (err) {
          console.error(`❌ Failed to start bot for ${Num}:`, err.message);
        } finally {
          release();
        }
      } else if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`❌ Pairing session closed for ${Num}, reason: ${reason}`);

        // Handle 515 (restartRequired) - reconnect once
        if (reason === 515 && !hasReconnected) {
          hasReconnected = true;
          console.log(`🔄 Restart required for ${Num}, reconnecting once...`);
          await cleanup();
          await delay(2000);

          // Reconnect once for 515 error
          return connector(Num, res);
        }

        await cleanup();

        // Don't reconnect for other reasons
        if (reason === DisconnectReason.loggedOut) {
          console.log(`🔄 User logged out, needs new pairing for ${Num}`);
        } else {
          console.log(
            `⚠️ Pairing session ended for ${Num}, no reconnection needed`
          );
        }

        // Send response if not already sent and it's a timeout
        if (!res.headersSent && reason === 408) {
          res.status(408).send({
            status: "timeout",
            message: "Pairing session timed out. Please try again.",
            number: Num,
          });
        }
      }
    });
  } catch (err) {
    console.error(`❌ Error in connector for ${Num}:`, err);
    await cleanup();

    if (!res.headersSent) {
      res.status(500).send({
        status: "error",
        message: "Connection failed",
        error: err.message,
      });
    }
  }
}
/*async function connector(Num, res) {
  const sessionDir = path.join(__dirname, "sessions", Num);
  await fs.ensureDir(sessionDir);

  let session = null;
  let cleanupDone = false;

  const cleanup = async () => {
    if (cleanupDone) return;
    cleanupDone = true;

    if (session) {
      session.end(new Error("Cleanup"));
      session = null;
    }
  };

  try {
    const baileys = await import("baileys-mod");
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      delay,
      Browsers,
      makeCacheableSignalKeyStore,
    } = baileys;

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    session = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(
          state.keys,
          pino({ level: "fatal" }).child({ level: "fatal" })
        ),
      },
      logger: pino({ level: "fatal" }).child({ level: "fatal" }),
      browser: Browsers.macOS("Arc"),
      printQRInTerminal: false,
    });

    if (!session.authState.creds.registered) {
      await delay(3000);
      Num = Num.replace(/[^0-9]/g, "");

      try {
        const code = await session.requestPairingCode(Num);
        console.log(`📱 Pairing code for ${Num}: ${code}`);

        if (!res.headersSent) {
          res.send({
            status: "success",
            code: code?.match(/.{1,4}/g)?.join("-") || code,
            number: Num,
            message: "Enter this code in WhatsApp: Link a Device",
          });
        }
      } catch (err) {
        console.error(`❌ Failed to get pairing code for ${Num}:`, err);

        if (!res.headersSent) {
          res.status(500).send({
            status: "error",
            message: "Failed to generate pairing code",
            error: err.message,
          });
        }

        await cleanup();
        return;
      }
    }

    session.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        console.log(`✅ Credentials saved for ${Num}`);
      } catch (err) {
        console.error(`❌ Failed to save credentials for ${Num}:`, err);
      }
    });

    session.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        console.log(`✅ Pairing successful for ${Num}`);

        const release = await mutex.acquire();
        try {
          if (manager.isConnected(Num) || manager.isConnecting(Num)) {
            console.log(`⚠️ ${Num} is already connected, skipping startBot`);
            await cleanup();
            return;
          }

          console.log(`🔄 Closing pairing session for ${Num}...`);
          await delay(2000);
          await cleanup();
          await delay(3000);

          console.log(`🚀 Starting main bot for ${Num}...`);
          await startBot(Num);
        } catch (err) {
          console.error(`❌ Failed to start bot for ${Num}:`, err.message);
        } finally {
          release();
        }
      } else if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`❌ Pairing session closed for ${Num}, reason: ${reason}`);
        await cleanup();
        reconn(reason, Num, res, DisconnectReason);
      }
    });
  } catch (err) {
    console.error(`❌ Error in connector for ${Num}:`, err);
    await cleanup();

    if (!res.headersSent) {
      res.status(500).send({
        status: "error",
        message: "Connection failed",
        error: err.message,
      });
    }
  }
}

function reconn(reason, Num, res, DisconnectReason) {
  if (
    [
      DisconnectReason.connectionLost,
      DisconnectReason.connectionClosed,
      DisconnectReason.restartRequired,
    ].includes(reason)
  ) {
    console.log(`🔄 Reconnecting pairing session for ${Num}...`);
    setTimeout(() => {
      connector(Num, res); // ⚠️ Still problematic - res already sent
    }, 3000);
  } else {
    console.log(
      `⛔ Not reconnecting pairing session for ${Num} (reason: ${reason})`
    );
  }
}*/

/**
 * Start a bot instance for a given number
 */
async function startBot(number) {
  try {
    console.log(`🔄 [${number}] Starting bot...`);

    const sessionDir = path.join(__dirname, "sessions", number);
    await fs.ensureDir(sessionDir);

    // ✅ Create bot instance using WhatsApp class
    const bot = new WhatsApp(number);
    const conn = await bot.connect();

    if (!conn) {
      console.error(`❌ [${number}] Failed to create connection`);
      return null;
    }

    // ✅ Save credentials to database
    const credPath = path.join(sessionDir, "creds.json");
    if (fs.existsSync(credPath)) {
      const creds = fs.readJSONSync(credPath);
      await saveSession(number, creds);
      console.log(`✅ [${number}] Session saved to database`);
    }

    return conn;
  } catch (err) {
    console.error(`❌ Failed to start bot for ${number}:`, err);
    return null;
  }
}

/**
 * Restore all sessions from DB + local
 */
async function restoreSessions() {
  const baileys = await import("baileys");
  const { delay } = baileys;

  try {
    console.log("🌱 Syncing Database...");
    await config.DATABASE.sync();

    const baseDir = path.join(__dirname, "sessions");
    await fs.ensureDir(baseDir);

    // 1️⃣ Get sessions from DB
    const dbSessions = await getAllSessions();
    const dbNumbers = dbSessions.map((s) => s.number);

    // 2️⃣ Get sessions from local folder
    const folderNumbers = (await fs.readdir(baseDir)).filter((f) =>
      fs.existsSync(path.join(baseDir, f, "creds.json"))
    );

    // 3️⃣ Merge DB + Folder (avoid duplicates)
    const allNumbers = [...new Set([...dbNumbers, ...folderNumbers])];

    if (!allNumbers.length) {
      console.log("⚠️ No sessions found in DB or local folders.");
      return;
    }

    console.log(
      `♻️ Restoring ${
        allNumbers.length
      } sessions at ${new Date().toLocaleString()}...`
    );

    // ✅ Restore sessions with delay to avoid rate limits
    for (const number of allNumbers) {
      try {
        const sessionDir = path.join(baseDir, number);
        await fs.ensureDir(sessionDir);
        const credPath = path.join(sessionDir, "creds.json");

        let creds;

        // 4️⃣ If folder has creds → sync to DB
        if (fs.existsSync(credPath)) {
          creds = await fs.readJSON(credPath);
          await saveSession(number, creds);
        }
        // 5️⃣ Else if DB has creds → write to folder
        else {
          const dbSession = dbSessions.find((s) => s.number === number);
          if (dbSession?.creds) {
            creds = dbSession.creds;
            await fs.writeJSON(credPath, creds, { spaces: 2 });
          }
        }

        // 6️⃣ Start the bot
        if (creds) {
          console.log(`🔄 Restoring session for ${number}...`);
          await startBot(number);

          // ✅ Add delay between sessions to avoid connection issues
          await delay(2000);
        } else {
          await deleteSession(number);
          console.log(`⚠️ No creds found for ${number}, skipping...`);
        }
      } catch (err) {
        console.error(`❌ Failed restoring session for ${number}:`, err);
      }
    }
  } catch (err) {
    console.error("❌ restoreSessions() failed:", err);
  }
}

// ==================== ROUTES ====================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    timestamp: new Date().toISOString(),
    sessions: manager.connections.size,
  });
});

// 🔹 Block user and delete session
app.get("/block", async (req, res) => {
  let num = req.query.number;
  if (!num) {
    return res.status(400).send({
      error: "Please provide ?number=XXXXXXXXXX",
    });
  }

  num = num.replace(/[^0-9]/g, "");

  try {
    // 🔹 Mark user as blocked in DB
    await set(ref(db, "blocked/" + num), {
      blocked: true,
      timestamp: Date.now(),
    });

    // 🔹 Check if session folder exists
    const sessionPath = path.join(__dirname, "sessions", num);

    if (fs.existsSync(sessionPath)) {
      // ✅ Close active connection
      const conn = manager.getConnection(num);
      if (conn) {
        try {
          await conn.logout();
        } catch (e) {
          console.error(`Error logging out ${num}:`, e);
        }
      }

      // ✅ Clean up
      await deleteSession(num).catch(() => {});
      await fs.remove(sessionPath);
      manager.removeConnection(num);
      manager.removeConnecting(num);

      return res.send({
        status: "success",
        message: `${num} blocked & session deleted`,
      });
    } else {
      return res.send({
        status: "success",
        message: `${num} blocked (no session folder found)`,
      });
    }
  } catch (err) {
    console.error(`❌ Failed to block/delete session for ${num}:`, err);
    return res.status(500).send({
      status: "error",
      message: "Failed to block/delete session",
      error: err.message,
    });
  }
});

// 🔹 Unblock user
app.get("/unblock", async (req, res) => {
  let num = req.query.number;
  if (!num) {
    return res.send({ error: "Please provide ?number=XXXXXXXXXX" });
  }

  num = num.replace(/[^0-9]/g, "");

  try {
    await remove(ref(db, "blocked/" + num));
    res.send({
      success: true,
      message: `${num} unblocked`,
    });
  } catch (err) {
    res.send({ error: err.message });
  }
});

// 🔹 Get blocklist
app.get("/blocklist", async (req, res) => {
  try {
    const snapshot = await get(ref(db, "blocked"));
    if (snapshot.exists()) {
      res.send(snapshot.val());
    } else {
      res.send({});
    }
  } catch (err) {
    res.send({ error: err.message });
  }
});

// 🔹 Get pairing code
app.get("/pair", async (req, res) => {
  let Num = req.query.code;

  if (!Num) {
    return res.status(418).json({
      status: "error",
      message: "Phone number is required. Use: /pair?code=1234567890",
    });
  }

  // Sanitize number
  Num = Num.replace(/[^0-9]/g, "");

  if (!Num || Num.length < 10) {
    return res.status(400).json({
      status: "error",
      message: "Invalid phone number format",
    });
  }

  // Check if already blocked
  try {
    const blocked = await isBlocked(Num);
    if (blocked) {
      return res.status(403).json({
        status: "error",
        message: "This number is blocked",
      });
    }
  } catch (err) {
    console.error(`Error checking block status for ${Num}:`, err);
  }

  // Check if already connected
  if (manager.isConnected(Num)) {
    return res.status(409).json({
      status: "error",
      message: "This number is already connected",
      connected: true,
    });
  }

  // Check if already connecting
  if (manager.isConnecting(Num)) {
    return res.status(409).json({
      status: "error",
      message: "This number is already in pairing process",
      connecting: true,
    });
  }

  const release = await mutex.acquire();
  try {
    await connector(Num, res);
  } catch (error) {
    console.error(`❌ Pairing error for ${Num}:`, error);

    // ✅ Only send response if not already sent
    if (!res.headersSent) {
      res.status(500).json({
        status: "error",
        error: "Failed to connect",
        details: error.message,
      });
    }
  } finally {
    release();
  }
});

/**
 * Route: List active sessions
 */
app.get("/sessions", (req, res) => {
  const sessions = {};

  // ✅ FIX: Iterate over Map correctly
  for (const [num, conn] of manager.connections.entries()) {
    sessions[num] = {
      connected: !!conn?.user,
      user: conn?.user?.name || "unknown",
      jid: conn?.user?.id || null,
    };
  }

  res.json({
    total: manager.connections.size,
    sessions,
  });
});

/**
 * Route: Delete session
 */
app.get("/delete", async (req, res) => {
  let num = req.query.number?.replace(/[^0-9]/g, "");

  if (!num) {
    return res.send({ error: "Please provide ?number=XXXXXXXXXX" });
  }

  try {
    const sessionPath = path.join(__dirname, "sessions", num);

    if (!fs.existsSync(sessionPath)) {
      return res.send({
        status: "error",
        message: "No session found for this number",
      });
    }

    // ✅ Close connection if active
    const conn = manager.getConnection(num);
    if (conn) {
      try {
        await conn.logout();
      } catch (e) {
        console.error(`Error logging out ${num}:`, e);
      }
    }

    // ✅ Clean up
    await deleteSession(num);
    await fs.remove(sessionPath);
    manager.removeConnection(num);
    manager.removeConnecting(num);

    res.send({
      status: "success",
      message: `Deleted session for ${num}`,
    });

    // Optional: Restart server after deletion
    // setTimeout(() => process.exit(0), 5000);
  } catch (err) {
    console.error(`❌ Failed to delete session for ${num}:`, err);
    res.send({
      status: "error",
      message: "Failed to delete session",
      error: err.message,
    });
  }
});

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
  console.error("Express error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    available_routes: [
      "GET /",
      "GET /pair?code=NUMBER",
      "GET /sessions",
      "GET /delete?number=NUMBER",
      "GET /block?number=NUMBER",
      "GET /unblock?number=NUMBER",
      "GET /blocklist",
    ],
  });
});

// ==================== GRACEFUL SHUTDOWN ====================

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

// ==================== START SERVER ====================

app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🚀 Multi-User WhatsApp Bot Server   ║
║   🌐 Port: ${PORT.toString().padEnd(28)}║
║   📅 ${new Date().toLocaleString().padEnd(34)}║
╚═══════════════════════════════════════╝
  `);

  // Restore all sessions
  try {
    // await initializeLang();
    await initSessions();
    await restoreSessions();

    console.log(`
    ✅ Server ready!
    📊 Active sessions: ${manager.connections.size}
    🔗 Endpoints:
       - GET  /                         (Health check)
       - GET  /pair?code=NUM             (Get pairing code)
       - GET  /sessions                  (List active sessions)
       - GET  /delete?number=NUM         (Delete session)
       - GET  /block?number=NUM          (Block user)
       - GET  /unblock?number=NUM        (Unblock user)
       - GET  /blocklist                 (View blocked users)
    `);
  } catch (err) {
    console.error("❌ Failed to restore sessions:", err);
  }
});
