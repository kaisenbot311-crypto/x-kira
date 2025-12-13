const express = require("express");
const { WhatsApp } = require("./lib/index");
const config = require("./config.js");
const app = express();
const PORT = process.env.PORT || 8000;
const { initDatabases } = require("./lib/database/index.js");
const db = require('./lib/database/settingsdb');
app.use(express.json());

// ==================== ROUTES ====================
app.get("/", (req, res) => {
  res.json({
    status: "online",
    timestamp: new Date().toISOString(),
  });
});

// Start server and initialize WhatsApp session (if configured)
app.listen(PORT, async () => {
  try {
  console.log("Initializing databases...");
   await db.init({ file: path.join(__dirname, 'data', 'settings_db.json'), autosaveInterval: 3000 });
  console.log('DB initialized. startup:', db.getStartupTime());
  await initDatabases();
  console.log(`databases initialized. Server is running on port ${PORT}`);
  const sessionId = config.SESSION_ID;
  if (!sessionId) {
    console.log("No SESSION_ID configured; skipping WhatsApp initialization");
    return;
  }
    const wa = new WhatsApp('x-kira');
    await wa.connect();
    console.log(`WhatsApp session '${sessionId}' initialized`);
  } catch (err) {
    console.error("Failed to initialize WhatsApp session:", err?.message || err);
  }
});

process.on("unhandledRejection", (err) => console.error("UnhandledRejection:", err));
process.on("uncaughtException", (err) => {
  console.error("UncaughtException:", err);
  process.exit(1);
});
