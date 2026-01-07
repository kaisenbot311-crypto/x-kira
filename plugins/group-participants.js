

const { Module } = require("../lib/plugins");
const settings = require("../lib/database/settingdb");
const cache = require("../lib/group-cache");
const axios = require("axios");
const config = require("../config");
const { getTheme } = require("../Themes/themes");
const theme = getTheme();

// defaults
function defaultWelcome() {
  return { status: false, message: "Hi &mention, welcome to &name! total &size", sendPpIfRequested: true };
}
function defaultGoodbye() {
  return { status: false, message: "Goodbye &mention. We will miss you from &name (now &size).", sendPpIfRequested: false };
}
function toBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string") return ["true", "1", "yes", "on"].includes(v.toLowerCase());
  return Boolean(v);
}

function buildText(template = "", replacements = {}) {
  let text = template || "";
  const wantsPp = text.includes("&pp");
  text = text.replace(/&pp/g, "").trim();
  text = text.replace(/&mention/g, replacements.mentionText || "");
  text = text.replace(/&name/g, replacements.name || "");
  text = text.replace(/&size/g, String(replacements.size ?? ""));
  return { text, wantsPp };
}

async function fetchProfileBuffer(conn, jid) {
  try {
    // conn.profilePictureUrl exists on the socket in v7
    const url = await conn.profilePictureUrl?.(jid, "image").catch(() => null);
    if (!url) return null;
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
    return Buffer.from(res.data);
  } catch (e) {
    return null;
  }
}

async function sendWelcomeMsg(conn, groupJid, text, mentions , imgBuffer = null) {
  try {
    if (imgBuffer) {
      await conn.sendMessage(groupJid, { image: imgBuffer, caption: text, mentions: [mentions] });
    } else {
      await conn.sendMessage(groupJid, { text , mentions: [mentions] });
    }
  } catch (err) {
    // fallback without mentions if library errors 
    try {
      await conn.sendMessage(groupJid, { text });
    } catch (e) {
      console.error("sendWelcomeMsg error:", e);
    }
  }
}

/* ---------------- COMMANDS ---------------- */

// .welcome [on|off|show|<message>]
Module({
  command: "welcome",
  package: "group",
  description: "Toggle/set/show welcome message for the group",
})(async (message, match) => {
  await message.loadGroupInfo?.();
  if (!message.isGroup) return message.send(theme.isGroup);
  if (!message.isAdmin && !message.isFromMe) return message.send(theme.isAdmin);

  const raw = (match || "").trim();
  let cfg = settings.getGroup(message.from, "welcome");
  if (!cfg || typeof cfg !== "object") cfg = defaultWelcome();

  if (!raw) {
    return await message.sendreply?.(
      `*Welcome Settings*\n• Status: ${toBool(cfg.status) ? "✅ ON" : "❌ OFF"}\n• Message: ${cfg.message || "(none)"}\n\nPlaceholders: &mention, &name, &size, &pp`
    );
  }

  const lower = raw.toLowerCase();
  if (lower === "on" || lower === "off") {
    cfg.status = lower === "on";
    await settings.setGroupPlugin(message.from, "welcome", cfg);
    await message.react?.("✅");
    return await message.send(cfg.status ? "✅ Welcome enabled for this group" : "❌ Welcome disabled for this group");
  }

  if (lower === "get") {
    return await message.sendreply?.(`Message: ${cfg.message || "(none)"}\nStatus: ${toBool(cfg.status) ? "ON" : "OFF"}`);
  }

  // save custom template
  cfg.message = raw;
  await settings.setGroupPlugin(message.from, "welcome", cfg);
  await message.react?.("✅");
  return await message.send("✅ Welcome message updated");
});

// .goodbye [on|off|show|<message>]
Module({
  command: "goodbye",
  package: "group",
  description: "Toggle/set/show goodbye message for the group",
})(async (message, match) => {
  await message.loadGroupInfo?.();
  if (!message.isGroup) return message.send(theme.isGroup);
  if (!message.isAdmin && !message.isFromMe) return message.send(theme.isAdmin);

  const raw = (match || "").trim();
  let cfg = settings.getGroup(message.from, "goodbye");
  if (!cfg || typeof cfg !== "object") cfg = defaultGoodbye();

  if (!raw) {
    return await message.sendreply?.(
      `*Goodbye Settings*\n• Status: ${toBool(cfg.status) ? "✅ ON" : "❌ OFF"}\n• Message: ${cfg.message || "(none)"}\n\nPlaceholders: &mention, &name, &size, &pp`
    );
  }

  const lower = raw.toLowerCase();
  if (lower === "on" || lower === "off") {
    cfg.status = lower === "on";
    await settings.setGroupPlugin(message.from, "goodbye", cfg);
    await message.react?.("✅");
    return await message.send(cfg.status ? "✅ Goodbye enabled for this group" : "❌ Goodbye disabled for this group");
  }

  if (lower === "show") {
    return await message.sendreply?.(`Message: ${cfg.message || "(none)"}\nStatus: ${toBool(cfg.status) ? "ON" : "OFF"}`);
  }

  cfg.message = raw;
  await settings.setGroupPlugin(message.from, "goodbye", cfg);
  await message.react?.("✅");
  return await message.send("✅ Goodbye message updated");
});

// .pdm on/off (global)
Module({
  command: "pdm",
  package: "group",
  description: "Toggle global promote/demote message (PDM) on/off",
})(async (message, match) => {
  // treat as owner/bot-only toggle to avoid abuse
  if (!message.isFromMe) {
    // you can relax this if you want admins to change it per-group
  }
  const raw = (match || "").trim();
  if (!raw) {
    const current = settings.getGlobal("pdm") || false;
    return await message.sendreply?.(`PDM (global promote/demote message) is ${toBool(current) ? "✅ ON" : "❌ OFF"}\nUse: .pdm on / .pdm off`);
  }
  const lower = raw.toLowerCase();
  if (lower === "on" || lower === "off") {
    await settings.setGlobal("pdm", lower === "on", { persist: true });
    await message.react?.("✅");
    return await message.send(lower === "on" ? "*_Global PDM enabled_*" : "❌ Global PDM disabled");
  }
  await message.react?.("❌");
  return await message.send("Usage: .pdm on / .pdm off");
});

/* ---------------- EVENT: group-participants.update ----------------
   Module system will call plugin.exec(null, event, conn)
*/
Module({
  on: "group-participants.update"
})(async (_msg, event, conn) => {
  try {
    if (!event || !event.id || !event.action || !Array.isArray(event.participants)) return;
    const groupJid = event.id;

    let md = cache.getCached(groupJid);
    if (!md) {
      try {
        md = await conn.groupMetadata?.(groupJid);
        if (md) cache.setCached(groupJid, md);
      } catch (e) {
        md = { subject: "", participants: [] };
      }
    }
    const groupName = md.subject || "";
    const groupSize = (md.participants && md.participants.length) || 0;
    const jidNormalizedUser = global.baileys?.jidNormalizedUser || ((jid) => jid);
    for (const p of event.participants) {
      const participantJid = jidNormalizedUser((typeof p === "string") ? p : (p.id || p.jid));
      if (!participantJid) continue;
      const botJid = conn.user?.id ? (conn.user.id.includes(":") ? conn.user.id.split(":")[0] + "" : conn.user.id) : null;
      if (botJid && participantJid && participantJid.includes(botJid.split(":")[0])) {
        continue;
      }
      // ADD -> welcome
      if (event.action === "add") {
        const cfgRaw = settings.getGroup(groupJid, "welcome");
        const cfg = (cfgRaw && typeof cfgRaw === "object") ? cfgRaw : defaultWelcome();
        if (!toBool(cfg.status)) continue;
        const mentionText = `@${participantJid.split("@")[0]}`;
        const replacements = { mentionText, name: groupName, size: groupSize };
        const { text, wantsPp } = buildText(cfg.message, replacements);
        let imgBuf = null;
        if (wantsPp) imgBuf = await fetchProfileBuffer(conn, participantJid);
        await sendWelcomeMsg(conn, groupJid, text, participantJid, imgBuf);
      }
      // REMOVE -> goodbye
      if (event.action === "remove") {
        const cfgRaw = settings.getGroup(groupJid, "goodbye");
        const cfg = (cfgRaw && typeof cfgRaw === "object") ? cfgRaw : defaultGoodbye();
        if (!toBool(cfg.status)) continue;
        const mentionText = `@${participantJid.split("@")[0]}`;
        const replacements = { mentionText, name: groupName, size: groupSize };
        const { text, wantsPp } = buildText(cfg.message, replacements);
        let imgBuf = null;
        if (wantsPp) imgBuf = await fetchProfileBuffer(conn, participantJid);
        await sendWelcomeMsg(conn, groupJid, text, participantJid, imgBuf);
      }
      // PROMOTE / DEMOTE -> PDM (global)
      if (event.action === "promote" || event.action === "demote") {
        const pdmOn = settings.getGlobal("pdm") || false;
        if (!toBool(pdmOn)) continue;
        const botname =
          settings.getGlobal("BOT_NAME") ??
          config.BOT_NAME ??
          "x-kira";
        // actor may not be present in all versions; try common fields
        const actor = event.actor || event.author || event.by || null;
        const actorText = actor ? `@${actor.split("@")[0]}` : "Admin";
        const targetText = `@${participantJid.split("@")[0]}`;
        const actionText = event.action === "promote" ? "promoted" : "demoted";
        // const sendText = `${actorText} ${actionText} ${targetText}`;
        const sendText = `╭─〔 *🎉 Admin Event* 〕
├─ ${actorText} has ${actionText} ${targetText}
├─ Group: ${groupName}
╰─➤ *Powered by ${botname}*`;
        try {
          await conn.sendMessage(groupJid, { text: sendText,  mentions: [actor, participantJid].filter(Boolean) });
        } catch (e) {
          try { await conn.sendMessage(groupJid, { text: sendText }); } catch (_) { }
        }
      }
    }
  } catch (err) {
    console.error("welcome-pdm event handler error:", err);
  }
});