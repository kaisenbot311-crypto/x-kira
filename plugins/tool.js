const { Module } = require("../lib/plugins");
const config = require("../config");
const { getTheme } = require("../Themes/themes");
const axios = require("axios");
const theme = getTheme();

// ==================== EXTRA USEFUL OWNER PLUGINS ====================


Module({
  command: "getname",
  package: "owner",
  description: "Get username of mentioned user",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    const jid =
      message.quoted?.participant ||
      message.quoted?.sender ||
      message.mentions?.[0];

    if (!jid) {
      return message.send("_Reply to or mention a user_");
    }

    // Try to get name from contacts
    const contacts = await message.conn.getContacts().catch(() => []);
    const contact = contacts.find((c) => c.id === jid);

    // Try to get name from group if in group
    let groupName = null;
    if (message.isGroup) {
      await message.loadGroupInfo();
      const participant = message.groupParticipants.find((p) => p.id === jid);
      groupName = participant?.notify || participant?.name;
    }

    const name =
      contact?.name || contact?.notify || groupName || jid.split("@")[0];

    await message.sendreply(
      `*Username Info*\n\n` +
        `*User:* @${jid.split("@")[0]}\n` +
        `*Name:* ${name}\n` +
        `*Source:* ${contact ? "Contact" : groupName ? "Group" : "Number"}`,
      { mentions: [jid] }
    );
  } catch (error) {
    console.error("GetName command error:", error);
    await message.send("❌ _Failed to get username_");
  }
});

Module({
  command: "myname",
  package: "owner",
  description: "Get the bot's own WhatsApp name",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);
    const botName = message.conn.user?.name || "Name not set";
    const msg = `𝗛𝗲𝘆! 𝗠𝘆 𝗻𝗮𝗺𝗲 𝗶𝘀 *${botName}*`;
    await message.sendreply(msg);
  } catch (error) {
    console.error("MyName command error:", error);
    await message.send("❌ _Failed to get my name._");
  }
});

Module({
  command: "setname",
  package: "owner",
  description: "Set bot display name",
})(async (message, match) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    if (!match) {
      return message.send("_Provide new name_\n\nExample: .setname MyBot");
    }

    if (match.length > 25) {
      return message.send("❌ _Name too long (max 25 characters)_");
    }

    await message.conn.updateProfileName(match);
    await message.send(`✅ *Name updated to:* ${match}`);
  } catch (error) {
    console.error("SetName command error:", error);
    await message.send("❌ _Failed to update name_");
  }
});

Module({
  command: "mystatus",
  package: "owner",
  description: "Get your current status/about",
})(async (message) => {
  try {
    const myJid = message.conn.user.id.split(":")[0] + "@s.whatsapp.net";
    const status = await message.fetchStatus(myJid).catch(() => null);

    await message.sendreply(
      `*My Current Status*\n\n` +
        `${status?.status || "_No status set_"}\n\n` +
        `*Set on:* ${
          status?.setAt
            ? new Date(status.setAt).toLocaleDateString()
            : "Unknown"
        }`
    );
  } catch (error) {
    console.error("MyStatus command error:", error);
    await message.send("❌ _Failed to get status_");
  }
});

Module({
  command: "leaveall",
  package: "owner",
  description: "Leave all groups except specified",
})(async (message, match) => {
  try {
    if (!message.isfromMev) return message.send(theme.isfromMe);

    const groups = message.conn.chats
      .all()
      .filter((c) => c.id.endsWith("@g.us"));

    if (groups.length === 0) {
      return message.send("_Bot is not in any groups_");
    }

    // Parse exception list
    const exceptions = match ? match.split(",").map((e) => e.trim()) : [];
    let left = 0;
    let kept = 0;

    await message.send(
      `⚠️ _Leaving ${groups.length} groups..._\n\n_This will take a few moments_`
    );

    for (const group of groups) {
      try {
        const metadata = await message.conn.groupMetadata(group.id);

        // Check if group is in exception list
        const isException = exceptions.some(
          (e) =>
            metadata.subject.toLowerCase().includes(e.toLowerCase()) ||
            group.id.includes(e)
        );

        if (isException) {
          kept++;
          continue;
        }

        await message.conn.groupLeave(group.id);
        left++;
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay
      } catch (error) {
        console.error(`Failed to leave group ${group.id}:`, error);
      }
    }

    await message.send(
      `✅ *Leave All Complete*\n\n` +
        `*Left:* ${left} groups\n` +
        `*Kept:* ${kept} groups`
    );
  } catch (error) {
    console.error("LeaveAll command error:", error);
    await message.send("❌ _Failed to leave groups_");
  }
});

Module({
  command: "profilepic",
  package: "owner",
  description: "Change profile picture from URL or quoted image",
})(async (message, match) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    let buffer;

    if (match && match.startsWith("http")) {
      // Download from URL
      await message.react("⏳");
      const response = await axios.get(match, { responseType: "arraybuffer" });
      buffer = Buffer.from(response.data);
    } else if (message.type === "imageMessage") {
      buffer = await message.download();
    } else if (message.quoted?.type === "imageMessage") {
      buffer = await message.quoted.download();
    } else {
      return message.send(
        "_Send image or provide URL_\n\n" +
          "*Methods:*\n" +
          "1. Send image with .profilepic\n" +
          "2. Reply to image with .profilepic\n" +
          "3. .profilepic <image_url>"
      );
    }

    await message.setPp(message.conn.user.id, buffer);
    await message.send("✅ _Profile picture updated successfully_");
    await message.react("✅");
  } catch (error) {
    console.error("ProfilePic command error:", error);
    await message.react("❌");
    await message.send("❌ _Failed to update profile picture_");
  }
});

Module({
  command: "removepp",
  package: "owner",
  description: "Remove bot profile picture",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    await message.conn.removeProfilePicture(message.conn.user.id);
    await message.send("✅ _Profile picture removed successfully_");
  } catch (error) {
    console.error("RemovePP command error:", error);
    await message.send("❌ _Failed to remove profile picture_");
  }
});

Module({
  command: "blocklist",
  package: "owner",
  description: "Get list of all blocked users",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    const blocklist = await message.conn.fetchBlocklist();

    if (!blocklist || blocklist.length === 0) {
      return message.send("_No blocked users_");
    }

    let text = `*🚫 Blocked Users (${blocklist.length})*\n\n`;

    for (let i = 0; i < Math.min(blocklist.length, 50); i++) {
      const jid = blocklist[i];
      text += `${i + 1}. ${jid.split("@")[0]}\n`;
    }

    if (blocklist.length > 50) {
      text += `\n_Showing first 50 of ${blocklist.length} blocked users_`;
    }

    await message.send(text, { mentions: blocklist.slice(0, 50) });
  } catch (error) {
    console.error("Blocklist command error:", error);
    await message.send("❌ _Failed to fetch blocklist_");
  }
});

Module({
  command: "unblockall",
  package: "owner",
  description: "Unblock all blocked users",
})(async (message) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    const blocklist = await message.conn.fetchBlocklist();

    if (!blocklist || blocklist.length === 0) {
      return message.send("_No blocked users_");
    }

    await message.send(`_Unblocking ${blocklist.length} users..._`);

    let unblocked = 0;
    for (const jid of blocklist) {
      try {
        await message.unblockUser(jid);
        unblocked++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch {
        // Continue on error
      }
    }

    await message.send(`✅ *Unblocked ${unblocked} users*`);
  } catch (error) {
    console.error("UnblockAll command error:", error);
    await message.send("❌ _Failed to unblock users_");
  }
});

Module({
  command: "setabout",
  package: "owner",
  description: "Set WhatsApp about/bio",
})(async (message, match) => {
  try {
    if (!message.isfromMe) return message.send(theme.isfromMe);

    if (!match) {
      return message.send(
        "_Provide new about text_\n\n" +
          "*Example:* .setabout Hey there! I'm using WhatsApp"
      );
    }

    if (match.length > 139) {
      return message.send("❌ _About text too long (max 139 characters)_");
    }

    await message.conn.updateProfileStatus(match);
    await message.send(`✅ *About updated to:*\n\n${match}`);
  } catch (error) {
    console.error("SetAbout command error:", error);
    await message.send("❌ _Failed to update about_");
  }
});


Module({
  command: "save",
  package: "utility",
  description: "Save quoted message to private",
})(async (message) => {
  try {
    if (!message.quoted) return message.send("_Reply to a message to save_");

    const myJid = message.sender;

    if (message.quoted.type === "conversation" || message.quoted.body) {
      await message.conn.sendMessage(myJid, {
        text: `*💾 Saved Message*\n\n${message.quoted.body}\n\n*From:* ${
          message.isGroup ? message.groupMetadata.subject : message.pushName
        }\n*Time:* ${new Date().toLocaleString()}`,
      });
    } else if (
      [
        "imageMessage",
        "videoMessage",
        "audioMessage",
        "documentMessage",
      ].includes(message.quoted.type)
    ) {
      const buffer = await message.quoted.download();
      const mediaType = message.quoted.type.replace("Message", "");

      await message.conn.sendMessage(myJid, {
        [mediaType]: buffer,
        caption: `*💾 Saved from:* ${
          message.isGroup ? message.groupMetadata.subject : message.pushName
        }`,
      });
    }

    await message.react("✅");
    await message.send("_Message saved to your private chat_");
  } catch (error) {
    console.error("Save command error:", error);
    await message.send("❌ _Failed to save message_");
  }
});
