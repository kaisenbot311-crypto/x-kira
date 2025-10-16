const { Module } = require("../lib/plugins");
const config = require("../config");
const { getTheme } = require("../Themes/themes");
const theme = getTheme();

// ==================== OWNER MENU ====================

Module({
  command: "block",
  package: "owner",
  description: "Block a user",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);
    if (!message.quoted)
      return message.send("_Reply to the user you want to block_");

    const jid = message.quoted.participant || message.quoted.sender;
    if (!jid) return message.send("_Could not identify user_");

    await message.blockUser(jid);
    await message.send(`✅ Blocked @${jid.split("@")[0]}`, {
      mentions: [jid],
    });
  } catch (error) {
    console.error("Block command error:", error);
    await message.send("❌ _Failed to block user_");
  }
});

Module({
  command: "unblock",
  package: "owner",
  description: "Unblock a user",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);
    if (!message.quoted)
      return message.send("_Reply to the user you want to unblock_");

    const jid = message.quoted.participant || message.quoted.sender;
    if (!jid) return message.send("_Could not identify user_");

    await message.unblockUser(jid);
    await message.send(`✅ Unblocked @${jid.split("@")[0]}`, {
      mentions: [jid],
    });
  } catch (error) {
    console.error("Unblock command error:", error);
    await message.send("❌ _Failed to unblock user_");
  }
});

Module({
  command: "setpp",
  package: "owner",
  description: "Set bot profile picture",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    if (
      message.type !== "imageMessage" &&
      !message.quoted?.type?.includes("image")
    ) {
      return message.send("_Reply to an image or send an image with command_");
    }

    const buffer =
      message.type === "imageMessage"
        ? await message.download()
        : await message.quoted.download();

    await message.setPp(message.conn.user.id, buffer);
    await message.send("✅ _Profile picture updated successfully_");
  } catch (error) {
    console.error("SetPP command error:", error);
    await message.send("❌ _Failed to update profile picture_");
  }
});

Module({
  command: "setbio",
  package: "owner",
  description: "Set bot status/bio",
})(async (message, match) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);
    if (!match)
      return message.send(
        "_Provide bio text_\n\nExample: .setbio Hello, I am a bot"
      );

    await message.conn.updateProfileStatus(match);
    await message.send(`✅ _Bio updated to:_\n${match}`);
  } catch (error) {
    console.error("SetBio command error:", error);
    await message.send("❌ _Failed to update bio_");
  }
});

Module({
  command: "setstatus",
  package: "owner",
  description: "Set bot status message",
})(async (message, match) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);
    if (!match)
      return message.send(
        "_Provide status text_\n\nExample: .setstatus Available"
      );

    await message.conn.updateProfileStatus(match);
    await message.send(`✅ _Status updated to:_\n${match}`);
  } catch (error) {
    console.error("SetStatus command error:", error);
    await message.send("❌ _Failed to update status_");
  }
});

Module({
  command: "broadcast",
  package: "owner",
  description: "Broadcast message to all chats",
})(async (message, match) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);
    if (!match) return message.send("_Provide broadcast message_");

    const chats = message.conn.chats
      .all()
      .filter(
        (c) => c.id.endsWith("@s.whatsapp.net") || c.id.endsWith("@g.us")
      );
    let sent = 0;
    let failed = 0;

    await message.send(`📢 Broadcasting to ${chats.length} chats...`);

    for (const chat of chats) {
      try {
        await message.conn.sendMessage(chat.id, { text: match });
        sent++;
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay to avoid spam
      } catch {
        failed++;
      }
    }

    await message.send(
      `✅ Broadcast complete!\n\n*Sent:* ${sent}\n*Failed:* ${failed}`
    );
  } catch (error) {
    console.error("Broadcast command error:", error);
    await message.send("❌ _Failed to broadcast_");
  }
});


Module({
  command: "getbio",
  package: "owner",
  description: "Get bio/status of a user",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    const jid =
      message.quoted?.participant ||
      message.quoted?.sender ||
      message.mentions?.[0];
    if (!jid) return message.send("_Reply to a user or mention them_");

    const status = await message.fetchStatus(jid);
    await message.send(
      `*Bio of @${jid.split("@")[0]}:*\n\n${
        status?.status || "_No bio set_"
      }\n\n*Set on:* ${
        status?.setAt ? new Date(status.setAt).toLocaleDateString() : "Unknown"
      }`,
      { mentions: [jid] }
    );
  } catch (error) {
    console.error("GetBio command error:", error);
    await message.send("❌ _Failed to fetch bio_");
  }
});

Module({
  command: "restart",
  package: "owner",
  description: "Restart the bot",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    await message.send("🔄 _Restarting bot..._");
    process.exit(0); // Use PM2 or similar to auto-restart
  } catch (error) {
    console.error("Restart command error:", error);
    await message.send("❌ _Failed to restart_");
  }
});


Module({
  command: "save",
  package: "owner",
  description: "Save quoted message media",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);
    if (!message.quoted) return message.send("_Reply to a media message_");

    const type = message.quoted.type;
    if (
      ![
        "imageMessage",
        "videoMessage",
        "audioMessage",
        "documentMessage",
        "stickerMessage",
      ].includes(type)
    ) {
      return message.send(
        "_Reply to an image, video, audio, document, or sticker_"
      );
    }

    const buffer = await message.quoted.download();
    await message.send({
      document: buffer,
      mimetype: "application/octet-stream",
      fileName: `media_${Date.now()}.${
        type.includes("image")
          ? "jpg"
          : type.includes("video")
          ? "mp4"
          : type.includes("audio")
          ? "mp3"
          : "bin"
      }`,
    });
  } catch (error) {
    console.error("Save command error:", error);
    await message.send("❌ _Failed to save media_");
  }
});

Module({
  command: "join",
  package: "owner",
  description: "Join group via invite link",
})(async (message, match) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    const inviteCode = match?.match(
      /chat.whatsapp.com\/([0-9A-Za-z]{20,24})/i
    )?.[1];
    if (!inviteCode)
      return message.send("_Provide valid WhatsApp group invite link_");

    const info = await message.getInviteInfo(inviteCode);
    await message.send(
      `*Group Info:*\n\n*Name:* ${info.subject}\n*Members:* ${
        info.size
      }\n*Created:* ${new Date(
        info.creation * 1000
      ).toLocaleDateString()}\n\nJoining...`
    );

    await message.joinViaInvite(inviteCode);
    await message.send("✅ _Successfully joined the group_");
  } catch (error) {
    console.error("Join command error:", error);
    await message.send(
      "❌ _Failed to join group. Link may be invalid or revoked_"
    );
  }
});
