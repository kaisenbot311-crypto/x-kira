const { Module } = require('../lib/plugins');
const mention = require('./bin/mention');
const settings = require('../lib/database/settingdb');

function defaultMention() {
  return { status: false, message: "Hello &sender, you mentioned me in &name" };
}

/* ------------------ runtime: only when bot is mentioned ------------------ */
Module({ on: 'text' })(async (message) => {
  try {
    if (!message.isMentioned) return
    const from = message.botjid || null;
    let cfg = settings.getGroup(from, 'mention');
    if (!cfg || typeof cfg !== 'object') cfg = defaultMention();
    if (!cfg.status) return;
    const m = {
      sender: message.sender,
      jid: message.from,
      client: message.conn,
      originalMessage: message
    };
    const template = cfg.message || defaultMention().message;
    try {
      await mention(m, template);
    } catch (err) {
      console.error('mention module error:', err);
    }
  } catch (err) {
    console.error('mention runtime error:', err);
  }
});

/* ------------------ command: .mention (on|off|show|set <text>) ------------------ */
Module({
  command: "mention",
  package: "owner",
  description: "Enable/disable/show/set the mention auto-reply for the group",
})(async (message, match) => {
  try {
    let raw = (match || "").toString().trim();
    if (!raw) {
      const body = (message.body || "").trim();
      raw = body.replace(/^\.mention\b/i, "").trim();
    }
    if (!message.isAdmin && !message.isFromMe) return message.send?.("Only group admins or the bot owner can change mention settings.");
    const from = message.botjid;
    let cfg = settings.getGroup(from, 'mention');
    if (!cfg || typeof cfg !== 'object') cfg = defaultMention();
    if (!raw) {
      return message.send?.(
        `*Mention Settings*\n` +
        `• Status: ${cfg.status ? "✅ ON" : "❌ OFF"}\n` +
        `• Template:\n${cfg.message || "(none)"}\n\n` +
        `Usage:\n` +
        `.mention on        — enable mention auto-reply\n` +
        `.mention off       — disable mention auto-reply\n` +
        `.mention show      — show current settings\n` +
        `.mention set <text>— set the reply template (placeholders: &sender, )\n\n` +
        `Example template:\nHey &sender,`
      );
    }
    const lower = raw.toLowerCase();
    if (lower === 'on' || lower === 'off') {
      cfg.status = lower === 'on';
      settings.setGroupPlugin(from, 'mention', cfg);
      await message.react?.('✅');
      return message.send?.(cfg.status ? '✅ Mention enabled for this group' : '❌ Mention disabled for this group');
    }
    if (lower === 'show') {
      return message.send?.(
        `Mention Settings\n• Status: ${cfg.status ? 'ON' : 'OFF'}\n• Template:\n${cfg.message || '(none)'}`
      );
    }
    if (lower.startsWith('set ')) {
      const newText = raw.slice(4).trim();
      if (!newText) return message.send?.('Usage: .mention set <text>');
      cfg.message = newText;
      settings.setGroupPlugin(from, 'mention', cfg);
      await message.react?.('✅');
      return message.send?.('✅ Mention template updated');
    }
    cfg.message = raw;
    settings.setGroupPlugin(from, 'mention', cfg);
    await message.react?.('✅');
    return message.send?.('✅ Mention template updated (convenience mode)');
  } catch (err) {
    console.error('mention command error:', err);
    return message.send?.('An error occurred while processing the command.');
  }
});