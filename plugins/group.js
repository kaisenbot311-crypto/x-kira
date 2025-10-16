const { Module } = require("../lib/plugins");
const config = require("../config");
const Warn = require("../lib/database/warn");
const { getTheme } = require("../Themes/themes");
const theme = getTheme();

// Helper function to extract JID
const extractJid = (message) => {
  if (message.quoted?.participant) return message.quoted.participant;
  if (message.mentions?.[0]) return message.mentions[0];
  const text = message.body.split(" ").slice(1).join(" ");
  const number = text.replace(/[^0-9]/g, "");
  return number ? `${number}@s.whatsapp.net` : null;
};

// Helper function for permission checks
const checkPermissions = async (message) => {
  await message.loadGroupInfo();

  if (!message.isGroup) {
    await message.send(theme.isGroup);
    return false;
  }

  if (!message.isAdmin && !message.isfromMe) {
    await message.send(theme.isAdmin);
    return false;
  }

  if (!message.isBotAdmin) {
    await message.send(theme.isBotAdmin);
    return false;
  }

  return true;
};

// ==================== GROUP MENU ====================

Module({
  command: "add",
  package: "group",
  description: "Add member to group",
})(async (message) => {

  try {
    if (!(await checkPermissions(message))) return;

    const jid = extractJid(message);
    if (!jid)
      return message.send(
        "_Provide user number, tag, or reply_\n\nExample: .add 1234567890"
      );

    const res = await message.addParticipant(jid);
    const status = res?.[jid]?.status;
    const number = jid.split("@")[0];

    if (status === 200) {
      await message.send(`✅ @${number} has been added to the group`, {
        mentions: [jid],
      });
    } else if (status === 403) {
      await message.send(
        `⚠️ @${number} has disabled group invites or privacy settings`,
        {
          mentions: [jid],
        }
      );
    } else if (status === 409) {
      await message.send(`ℹ️ @${number} is already in the group`, {
        mentions: [jid],
      });
    } else {
      await message.send(`❌ Failed to add @${number} (Status: ${status})`, {
        mentions: [jid],
      });
    }
  } catch (error) {
    console.error("Add command error:", error);
    await message.send("❌ _Failed to add member_");
  }
});

Module({
  command: "kick",
  package: "group",
  description: "Remove member from group",
})(async (message) => {
  await message.loadGroupInfo();
 
  try {
    if (!(await checkPermissions(message))) return;

    const jid = extractJid(message);
    if (!jid) return message.send("_Tag or reply to a user to kick_");

    const botJid = message.conn.user.id.split(":")[0] + "@s.whatsapp.net";
    if (jid === botJid) {
      return message.send("❌ _Cannot kick the bot_");
    }

    if (jid === message.groupOwner) {
      return message.send("❌ _Cannot kick the group owner_");
    }

    if (message.groupAdmins.includes(jid) && !message.fromMe) {
      return message.send("❌ _Cannot kick other admins_");
    }

    await message.removeParticipant(jid);
    await message.sendreply(
      `✅ @${jid.split("@")[0]} has been removed from the group`,
      {
        mentions: [jid],
      }
    );
  } catch (error) {
    console.error("Kick command error:", error);
    await message.send("❌ _Failed to remove member_");
  }
});

Module({
  command: "promote",
  package: "group",
  description: "Promote member to admin",
})(async (message) => {

  try {
    if (!(await checkPermissions(message))) return;

    const jid = extractJid(message);
    if (!jid) return message.send("_Tag or reply to a user to promote_");

    if (message.groupAdmins.includes(jid)) {
      return message.send("ℹ️ _User is already an admin_");
    }

    if (!message.isParticipant(jid)) {
      return message.send("❌ _User is not in the group_");
    }

    await message.promoteParticipant(jid);
    await message.sendreply(
      `✅ @${jid.split("@")[0]} has been promoted to admin`,
      {
        mentions: [jid],
      }
    );
  } catch (error) {
    console.error("Promote command error:", error);
    await message.send("❌ _Failed to promote member_");
  }
});

Module({
  command: "demote",
  package: "group",
  description: "Demote admin to member",
})(async (message) => {

  try {
    if (!(await checkPermissions(message))) return;

    const jid = extractJid(message);
    if (!jid) return message.send("_Tag or reply to an admin to demote_");

    if (jid === message.groupOwner) {
      return message.send("❌ _Cannot demote the group owner_");
    }

    if (!message.groupAdmins.includes(jid)) {
      return message.send("ℹ️ _User is not an admin_");
    }

    await message.demoteParticipant(jid);
    await message.sendreply(
      `✅ @${jid.split("@")[0]} has been demoted to member`,
      {
        mentions: [jid],
      }
    );
  } catch (error) {
    console.error("Demote command error:", error);
    await message.send("❌ _Failed to demote admin_");
  }
});

Module({
  command: "open",
  package: "group",
  description: "Open group (allow all members to send messages)",
})(async (message) => {
 
  try {
    if (!(await checkPermissions(message))) return;

    if (!message.announce) {
      return message.send("ℹ️ _Group is already open_");
    }

    await message.unmuteGroup();
    await message.sendreply(
      "🔓 _Group has been opened. All members can now send messages_"
    );
  } catch (error) {
    console.error("Open command error:", error);
    await message.send("❌ _Failed to open group_");
  }
});

Module({
  command: "close",
  package: "group",
  description: "Close group (only admins can send messages)",
})(async (message) => {

  try {
    if (!(await checkPermissions(message))) return;

    if (message.announce) {
      return message.send("ℹ️ _Group is already closed_");
    }

    await message.muteGroup();
    await message.sendreply(
      "🔒 _Group has been closed. Only admins can send messages now_"
    );
  } catch (error) {
    console.error("Close command error:", error);
    await message.send("❌ _Failed to close group_");
  }
});

Module({
  command: "setgpp",
  package: "group",
  description: "Set group profile picture",
})(async (message) => {

  try {
    if (!(await checkPermissions(message))) return;

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

    await message.setPp(message.from, buffer);
    await message.sendreply("✅ _Group profile picture updated successfully_");
  } catch (error) {
    console.error("SetGPP command error:", error);
    await message.send("❌ _Failed to update group profile picture_");
  }
});

Module({
  command: "subject",
  package: "group",
  description: "Change group name/subject",
})(async (message, match) => {
 
  try {
    if (!(await checkPermissions(message))) return;

    if (!match || match.trim().length === 0) {
      return message.send(
        "_Provide a new group name_\n\nExample: .subject New Group Name"
      );
    }

    if (match.length > 100) {
      return message.send("❌ _Group name too long (max 100 characters)_");
    }

    await message.setSubject(match.trim());
    await message.sendreply(`✅ _Group name updated to:_ *${match.trim()}*`);
  } catch (error) {
    console.error("Subject command error:", error);
    await message.send("❌ _Failed to update group name_");
  }
});

Module({
  command: "desc",
  package: "group",
  description: "Change group description",
})(async (message, match) => {

  try {
    if (!(await checkPermissions(message))) return;

    if (!match || match.trim().length === 0) {
      return message.send(
        "_Provide a new group description_\n\nExample: .desc This is our group"
      );
    }

    if (match.length > 512) {
      return message.send("❌ _Description too long (max 512 characters)_");
    }

    await message.setDescription(match.trim());
    await message.sendreply("✅ _Group description has been updated_");
  } catch (error) {
    console.error("Description command error:", error);
    await message.send("❌ _Failed to update group description_");
  }
});

Module({
  command: "groupinfo",
  package: "group",
  description: "Get detailed group information",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);

    const info = `
╭─「 *GROUP INFO* 」
│
│ *Name:* ${message.groupMetadata.subject}
│ *Created:* ${new Date(
      message.groupMetadata.creation * 1000
    ).toLocaleDateString()}
│ *Owner:* @${message.groupOwner.split("@")[0]}
│
│ *Total Members:* ${message.groupParticipants.length}
│ *Admins:* ${message.groupAdmins.length}
│ *Regular Members:* ${message.groupParticipants.length - message.groupAdmins.length
      }
│
│ *Settings:*
│ • Messages: ${message.announce ? "Admins Only" : "All Members"}
│ • Edit Info: ${message.restrict ? "Admins Only" : "All Members"}
│ • Join Approval: ${message.joinApprovalMode ? "Enabled" : "Disabled"}
│
${message.groupMetadata.desc
        ? `│ *Description:*\n│ ${message.groupMetadata.desc}\n│`
        : ""
      }
╰────────────
    `.trim();

    await message.sendreply(info, { mentions: [message.groupOwner] });
  } catch (error) {
    console.error("Groupinfo command error:", error);
    await message.send("❌ _Failed to fetch group info_");
  }
});

Module({
  command: "hidetag",
  package: "group",
  description: "Send message with hidden tags",
})(async (message, match) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.fromMe) return message.send(theme.isAdmin);

    if (!match)
      return message.send(
        "_Provide message to send_\n\nExample: .hidetag Hello everyone"
      );

    const mentions = message.groupParticipants.map((p) => p.id);
    await message.send(match, { mentions });
  } catch (error) {
    console.error("Hidetag command error:", error);
    await message.send("❌ _Failed to send hidden tag message_");
  }
});


Module({
  command: "invite",
  package: "group",
  description: "Get group invite link",
})(async (message) => {
 
  try {
    if (!(await checkPermissions(message))) return;

    const code = await message.inviteCode();
    await message.sendreply(
      `*Group Invite Link:*\n\nhttps://chat.whatsapp.com/${code}`
    );
  } catch (error) {
    console.error("Invite command error:", error);
    await message.send("❌ _Failed to generate invite link_");
  }
});

Module({
  command: "revoke",
  package: "group",
  description: "Revoke group invite link",
})(async (message) => {

  try {
    if (!(await checkPermissions(message))) return;

    await message.revokeInvite();
    await message.sendreply(
      "✅ _Group invite link has been revoked. Previous links are now invalid_"
    );
  } catch (error) {
    console.error("Revoke command error:", error);
    await message.send("❌ _Failed to revoke invite link_");
  }
});

Module({
  command: "leave",
  package: "group",
  description: "Bot leaves the group",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.fromMe) return message.send(theme.isfromMe);

    await message.sendreply("👋 _Goodbye! Leaving the group..._");

    setTimeout(async () => {
      await message.leaveGroup();
    }, 2000);
  } catch (error) {
    console.error("Leave command error:", error);
    await message.send("❌ _Failed to leave group_");
  }
});

Module({
  command: "lock",
  package: "group",
  description: "Lock group info (only admins can edit)",
})(async (message) => {
  
  try {
    if (!(await checkPermissions(message))) return;

    await message.conn.groupSettingUpdate(message.from, "locked");
    await message.sendreply("🔒 _Group info locked. Only admins can edit now_");
  } catch (error) {
    console.error("Lock command error:", error);
    await message.send("❌ _Failed to lock group info_");
  }
});

Module({
  command: "unlock",
  package: "group",
  description: "Unlock group info (all members can edit)",
})(async (message) => {
 
  try {
    if (!(await checkPermissions(message))) return;

    await message.conn.groupSettingUpdate(message.from, "unlocked");
    await message.sendreply(
      "🔓 _Group info unlocked. All members can edit now_"
    );
  } catch (error) {
    console.error("Unlock command error:", error);
    await message.send("❌ _Failed to unlock group info_");
  }
});

Module({
  command: "approve",
  package: "group",
  description: "Approve pending join requests",
})(async (message) => {
 
  try {
    if (!(await checkPermissions(message))) return;

    const requests = await message.getJoinRequests();

    if (!requests || requests.length === 0) {
      return message.send("ℹ️ _No pending join requests_");
    }

    const jids = requests.map((r) => r.jid);
    await message.updateJoinRequests(jids, "approve");
    await message.sendreply(`✅ Approved ${requests.length} join request(s)`);
  } catch (error) {
    console.error("Approve command error:", error);
    await message.send("❌ _Failed to approve requests_");
  }
});

Module({
  command: "reject",
  package: "group",
  description: "Reject pending join requests",
})(async (message) => {

  try {
    if (!(await checkPermissions(message))) return;

    const requests = await message.getJoinRequests();

    if (!requests || requests.length === 0) {
      return message.send("ℹ️ _No pending join requests_");
    }

    const jids = requests.map((r) => r.jid);
    await message.updateJoinRequests(jids, "reject");
    await message.sendreply(`✅ Rejected ${requests.length} join request(s)`);
  } catch (error) {
    console.error("Reject command error:", error);
    await message.send("❌ _Failed to reject requests_");
  }
});
