const { Module } = require("../lib/plugins");
const { personalDB } = require("../lib/database");
const config = require("../config");
const { getTheme } = require("../Themes/themes");
const theme = getTheme();

// 🔹 Auto Status Seen
Module({
  command: "autostatus",
  package: "owner",
  description: "Toggle auto view WhatsApp status",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);

  const input = match?.trim()?.toLowerCase();

  if (input === "on" || input === "off") {
    await db.setGlobal("autostatus_seen", input === "on");
    return message.send(
      `✅ *Auto Status Seen is now ${input === "on" ? "ON" : "OFF"}*`
    );
  }

  const { autostatus_seen } = db.getMultiple(
    null,
    ["autostatus_seen"],
    { autostatus_seen: config.STATUS_SEEN || false }
  );

  return message.send(
    `⚙️ *Auto Status Seen*\n> Status: ${
      autostatus_seen ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autostatus on\n• autostatus off`
  );
});

// 🔹 Auto Typing
Module({
  command: "autotyping",
  package: "owner",
  description: "Toggle auto typing",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);

  const input = match?.trim()?.toLowerCase();

  if (input === "on" || input === "off") {
    await db.setGlobal("autotyping", input === "on");
    return message.send(
      `✅ *Auto Typing is now ${input === "on" ? "ON" : "OFF"}*`
    );
  }

  const { autotyping } = db.getMultiple(
    null,
    ["autotyping"],
    { autotyping: config.AUTOTYPING || false }
  );

  return message.send(
    `⚙️ *Auto Typing*\n> Status: ${
      autotyping ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autotyping on\n• autotyping off`
  );
});

// 🔹 Auto Recording
Module({
  command: "autorecord",
  package: "owner",
  description: "Toggle auto voice recording in chats",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);

  const botNumber = message.conn.user.id.split(":")[0];
  const input = match?.trim().toLowerCase();

  if (input === "on" || input === "off") {
    await message.react("⏳");
    const result = await personalDB(
      ["autorecord"],
      { content: input === "on" ? "true" : "false" },
      "set",
      botNumber
    );
    await message.react(result ? "✅" : "❌");
    return await message.send(
      result
        ? `✅ *Auto record is now \`${input.toUpperCase()}\`*`
        : "❌ *Error updating auto record*"
    );
  }

  const data = await personalDB(["autorecord"], {}, "get", botNumber);
  const status = data?.autorecord === "true";
  return await message.send(
    `🎤 *Auto Record*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autorecord on\n• autorecord off`
  );
});

// 🔹 Auto React to Messages
Module({
  command: "autoreact",
  package: "owner",
  description: "Toggle auto react",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);

  const input = match?.trim()?.toLowerCase();

  if (input === "on" || input === "off") {
    await db.setGlobal("autoreact", input === "on");
    return message.send(
      `✅ *Auto React is now ${input === "on" ? "ON" : "OFF"}*`
    );
  }

  const { autoreact } = db.getMultiple(
    null,
    ["autoreact"],
    { autoreact: config.AUTOREACT || false }
  );

  return message.send(
    `⚙️ *Auto React*\n> Status: ${
      autoreact ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autoreact on\n• autoreact off`
  );
});

// 🔹 Anti Call
Module({
  command: "anticall",
  package: "owner",
  description: "Block users who call the bot",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);

  const botNumber = message.conn.user.id.split(":")[0];
  const input = match?.trim().toLowerCase();

  if (input === "on" || input === "off") {
    await message.react("⏳");
    const result = await personalDB(
      ["anticall"],
      { content: input === "on" ? "true" : "false" },
      "set",
      botNumber
    );
    await message.react(result ? "✅" : "❌");
    return await message.send(
      result
        ? `✅ *AntiCall is now \`${input.toUpperCase()}\`*`
        : "❌ *Error updating AntiCall*"
    );
  }

  const data = await personalDB(["anticall"], {}, "get", botNumber);
  const status = data?.anticall === "true";
  return await message.send(
    `⚙️ *AntiCall*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• anticall on\n• anticall off`
  );
});

// 🔹 Auto Read
Module({
  command: "autoread",
  package: "owner",
  description: "Toggle auto read messages",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);

  const input = match?.trim()?.toLowerCase();

  if (input === "on" || input === "off") {
    await db.setGlobal("autoread", input === "on");
    return message.send(
      `✅ *Auto Read is now ${input === "on" ? "ON" : "OFF"}*`
    );
  }

  const { autoread } = db.getMultiple(
    null,
    ["autoread"],
    { autoread: config.AUTOREAD || false }
  );

  return message.send(
    `⚙️ *Auto Read*\n> Status: ${
      autoread ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autoread on\n• autoread off`
  );
});

// 🔹 Save Status
Module({
  command: "savestatus",
  package: "owner",
  description: "Toggle auto save viewed statuses",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);

  const botNumber = message.conn.user.id.split(":")[0];
  const input = match?.trim().toLowerCase();

  if (input === "on" || input === "off") {
    await message.react("⏳");
    const result = await personalDB(
      ["save_status"],
      { content: input === "on" ? "true" : "false" },
      "set",
      botNumber
    );
    await message.react(result ? "✅" : "❌");
    return await message.send(
      result
        ? `✅ *AutoSave Status is now \`${input.toUpperCase()}\`*`
        : "❌ *Error updating AutoSave Status*"
    );
  }

  const data = await personalDB(["save_status"], {}, "get", botNumber);
  const status = data?.save_status === "true";
  return await message.send(
    `⚙️ *AutoSave Status*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• savestatus on\n• savestatus off`
  );
});