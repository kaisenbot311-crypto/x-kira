const axios = require("axios");
const Jimp = require("jimp");
const cache = require('./group-cache'); 

async function makePp(buf) {
  let img = await Jimp.read(buf);
  let w = img.getWidth();
  let h = img.getHeight();
  let crop = img.crop(0, 0, w, h);
  return {
    img: await crop.scaleToFit(324, 720).getBufferAsync(Jimp.MIME_JPEG),
    prev: await crop.normalize().getBufferAsync(Jimp.MIME_JPEG),
  };
}

const serialize = async (msg, conn) => {
  const baileys = await import("baileys");
  const {
    getContentType,
    downloadContentFromMessage,
    jidNormalizedUser,
    areJidsSameUser,
    extractMessageContent,
  } = baileys;

  const key = msg.key;
  const from = key.remoteJid || key.remoteJidAlt || "";
  const fromMe = key.fromMe || false;
  const sender = jidNormalizedUser(
    key.participant || key.participantAlt || from
  );
  const isGroup = from.endsWith("@g.us");
  const pushName = msg.pushName || "Unknown";
  const messageContent = extractMessageContent(msg.message);
  const type = getContentType(messageContent || msg.message);
  const content = messageContent?.[type] || msg.message?.[type]
  const extractBody = () => {
    if (!content) return "";

    return type === "conversation"
      ? content
      : type === "extendedTextMessage"
        ? content.text
        : type === "imageMessage" && content.caption
          ? content.caption
          : type === "videoMessage" && content.caption
            ? content.caption
            : type === "templateButtonReplyMessage"
              ? content.selectedDisplayText
              : type === "buttonsResponseMessage"
                ? content.selectedButtonId
                : type === "listResponseMessage"
                  ? content.singleSelectReply?.selectedRowId
                  : "";
  };
  const isfromMe =
    fromMe ||
    areJidsSameUser(sender, jidNormalizedUser(conn.user.id)) ||
    (conn.user.lid &&
      areJidsSameUser(sender, jidNormalizedUser(conn.user.lid)));

  const extractQuoted = () => {
    const context = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = context?.quotedMessage;
    if (!quotedMsg) return null;
    const qt = getContentType(quotedMsg);
    const qContent = quotedMsg[qt];
    const b =
      qt === "conversation"
        ? qContent
        : qt === "extendedTextMessage"
          ? qContent.text || ""
          : qt === "imageMessage"
            ? qContent.caption || ""
            : qt === "videoMessage"
              ? qContent.caption || ""
              : qt === "templateButtonReplyMessage"
                ? qContent.selectedDisplayText || ""
                : qt === "buttonsResponseMessage"
                  ? qContent.selectedButtonId || ""
                  : qt === "listResponseMessage"
                    ? qContent.singleSelectReply?.selectedRowId || ""
                    : "";
    const quotedParticipant = jidNormalizedUser(
      context.participant || context.participantAlt || from
    );
    const isQuotedFromMe =
      areJidsSameUser(quotedParticipant, jidNormalizedUser(conn.user.id)) ||
      (conn.user.lid &&
        areJidsSameUser(quotedParticipant, jidNormalizedUser(conn.user.lid)));

    return {
      type: qt,
      msg: qContent,
      body: b,
      fromMe: isQuotedFromMe,
      participant: quotedParticipant,
      id: context.stanzaId,
      key: {
        remoteJid: from,
        fromMe: isQuotedFromMe,
        id: context.stanzaId,
        participant: quotedParticipant,
      },
      download: async () => {
        try {
          const stream = await downloadContentFromMessage(
            qContent,
            qt.replace("Message", "")
          );
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          return Buffer.concat(chunks);
        } catch (err) {
          console.error("Error downloading quoted media:", err);
          return null;
        }
      },
    };
  };

  const msgObj = {
    raw: msg,
    client: conn,
    conn,
    key,
    id: key.id,
    from,
    fromMe,
    sender,
    isGroup,
    isFromMe: isfromMe,
    isfromMe,
    pushName,
    type,
    body: extractBody(),
    content,
    quoted: extractQuoted(),
    mentions: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
  };


msgObj.loadGroupInfo = async () => {
  if (!msgObj.isGroup) return msgObj;

  try {
    // Use global cache from group-cache.js
    const md = await cache.getGroupMetadata(conn, msgObj.from); // read-through fetch & cache
    msgObj.groupMetadata = md;

    // Populate participants, admins, owner, and other flags
    msgObj.groupParticipants = md.participants || [];
    msgObj.groupAdmins = msgObj.groupParticipants
      .filter(p => p.admin === "admin" || p.admin === "superadmin")
      .map(p => jidNormalizedUser(p.id));
    msgObj.groupOwner = md.owner
      ? jidNormalizedUser(md.owner)
      : msgObj.groupAdmins[0] || null;

    msgObj.joinApprovalMode = md.joinApprovalMode || false;
    msgObj.memberAddMode = md.memberAddMode || false;
    msgObj.announce = md.announce || false;
    msgObj.restrict = md.restrict || false;

    const botJid = jidNormalizedUser(conn.user.id);
    const botLid = jidNormalizedUser(conn.user.lid);
    msgObj.isAdmin = msgObj.groupAdmins.some(adminId =>
      areJidsSameUser(adminId, msgObj.sender)
    );
    msgObj.isBotAdmin = msgObj.groupAdmins.some(adminId =>
      areJidsSameUser(adminId, botJid) ||
      (botLid && areJidsSameUser(adminId, botLid))
    );
  } catch (err) {
    console.error("Error loading group info:", err);
  }

  return msgObj;
};

  msgObj.muteGroup = async () => {
    try {
      return await conn.groupSettingUpdate(msgObj.from, "announcement");
    } catch (err) {
      console.error("Error muting group:", err);
      return null;
    }
  };

  msgObj.unmuteGroup = async () => {
    try {
      return await conn.groupSettingUpdate(msgObj.from, "not_announcement");
    } catch (err) {
      console.error("Error unmuting group:", err);
      return null;
    }
  };

  msgObj.setSubject = async (text) => {
    try {
      return await conn.groupUpdateSubject(msgObj.from, text);
    } catch (err) {
      console.error("Error updating subject:", err);
      return null;
    }
  };

  msgObj.setDescription = async (text) => {
    try {
      return await conn.groupUpdateDescription(msgObj.from, text);
    } catch (err) {
      console.error("Error updating description:", err);
      return null;
    }
  };
  msgObj.addParticipant = async (jid) => {
    try {
      const jids = Array.isArray(jid) ? jid : [jid];
      const normalized = jids.map((j) => jidNormalizedUser(j));
      return await conn.groupParticipantsUpdate(msgObj.from, normalized, "add");
    } catch (err) {
      console.error("Error adding participant:", err);
      return null;
    }
  };

  msgObj.removeParticipant = async (jid) => {
    try {
      const jids = Array.isArray(jid) ? jid : [jid];
      const normalized = jids.map((j) => jidNormalizedUser(j));
      return await conn.groupParticipantsUpdate(
        msgObj.from,
        normalized,
        "remove"
      );
    } catch (err) {
      console.error("Error removing participant:", err);
      return null;
    }
  };

  msgObj.promoteParticipant = async (jid) => {
    try {
      const jids = Array.isArray(jid) ? jid : [jid];
      const normalized = jids.map((j) => jidNormalizedUser(j));
      return await conn.groupParticipantsUpdate(
        msgObj.from,
        normalized,
        "promote"
      );
    } catch (err) {
      console.error("Error promoting participant:", err);
      return null;
    }
  };

  msgObj.demoteParticipant = async (jid) => {
    try {
      const jids = Array.isArray(jid) ? jid : [jid];
      const normalized = jids.map((j) => jidNormalizedUser(j));
      return await conn.groupParticipantsUpdate(
        msgObj.from,
        normalized,
        "demote"
      );
    } catch (err) {
      console.error("Error demoting participant:", err);
      return null;
    }
  };

  msgObj.leaveGroup = async () => {
    try {
      return await conn.groupLeave(msgObj.from);
    } catch (err) {
      console.error("Error leaving group:", err);
      return null;
    }
  };

  msgObj.inviteCode = async () => {
    try {
      return await conn.groupInviteCode(msgObj.from);
    } catch (err) {
      console.error("Error getting invite code:", err);
      return null;
    }
  };

  msgObj.revokeInvite = async () => {
    try {
      return await conn.groupRevokeInvite(msgObj.from);
    } catch (err) {
      console.error("Error revoking invite:", err);
      return null;
    }
  };

  msgObj.getInviteInfo = async (code) => {
    try {
      return await conn.groupGetInviteInfo(code);
    } catch (err) {
      console.error("Error getting invite info:", err);
      return null;
    }
  };

  msgObj.joinViaInvite = async (code) => {
    try {
      return await conn.groupAcceptInvite(code);
    } catch (err) {
      console.error("Error joining via invite:", err);
      return null;
    }
  };

  msgObj.getJoinRequests = async () => {
    try {
      return await conn.groupRequestParticipantsList(msgObj.from);
    } catch (err) {
      console.error("Error getting join requests:", err);
      return null;
    }
  };

  msgObj.updateJoinRequests = async (jids, action = "approve") => {
    try {
      const normalized = Array.isArray(jids)
        ? jids.map((j) => jidNormalizedUser(j))
        : [jidNormalizedUser(jids)];
      return await conn.groupRequestParticipantsUpdate(
        msgObj.from,
        normalized,
        action
      );
    } catch (err) {
      console.error("Error updating join requests:", err);
      return null;
    }
  };

  msgObj.setMemberAddMode = async (enable = true) => {
    try {
      return await conn.groupSettingUpdate(
        msgObj.from,
        enable ? "not_announcement" : "announcement"
      );
    } catch (err) {
      console.error("Error setting member add mode:", err);
      return null;
    }
  };

  msgObj.fetchStatus = async (jid) => {
    try {
      return await conn.fetchStatus(jidNormalizedUser(jid));
    } catch (err) {
      console.error("Error fetching status:", err);
      return null;
    }
  };

  msgObj.profilePictureUrl = async (jid, type = "image") => {
    try {
      return await conn.profilePictureUrl(jidNormalizedUser(jid), type);
    } catch (err) {
      console.error("Error getting profile picture:", err);
      return null;
    }
  };

  msgObj.blockUser = async (jid) => {
    try {
      return await conn.updateBlockStatus(jidNormalizedUser(jid), "block");
    } catch (err) {
      console.error("Error blocking user:", err);
      return null;
    }
  };

  msgObj.unblockUser = async (jid) => {
    try {
      return await conn.updateBlockStatus(jidNormalizedUser(jid), "unblock");
    } catch (err) {
      console.error("Error unblocking user:", err);
      return null;
    }
  };

  msgObj.getParticipants = () => msgObj.groupParticipants || [];

  msgObj.isParticipant = (jid) => {
    const normalized = jidNormalizedUser(jid);
    return msgObj
      .getParticipants()
      .some((p) => areJidsSameUser(jidNormalizedUser(p.id), normalized));
  };

  msgObj.download = async () => {
    try {
      if (!msgObj.content) return null;

      const stream = await downloadContentFromMessage(
        msgObj.content,
        msgObj.type.replace("Message", "")
      );
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch (err) {
      console.error("Error downloading media:", err);
      return null;
    }
  };

  msgObj.send = async (payload, options = {}) => {
    try {
      if (payload?.delete) {
        return await conn.sendMessage(msgObj.from, { delete: payload.delete });
      }

      let cend;
      if (typeof payload === "string") {
        cend = { text: payload };
      } else if (payload.video) {
        cend = {
          video: payload.video,
          caption: payload.caption || "",
          mimetype: payload.mimetype || "video/mp4",
        };
      } else if (payload.image) {
        cend = {
          image: payload.image,
          caption: payload.caption || "",
        };
      } else if (payload.audio) {
        cend = {
          audio: payload.audio,
          mimetype: payload.mimetype || "audio/mp4",
          ptt: payload.ptt || false,
        };
      } else {
        cend = payload;
      }

      if (options.edit) cend.edit = options.edit;
      if (options.quoted)
        return await conn.sendMessage(msgObj.from, cend, {
          quoted: options.quoted,
        });

      return await conn.sendMessage(msgObj.from, cend);
    } catch (err) {
      console.error("Error sending message:", err);
      return null;
    }
  };

  msgObj.react = async (emoji) => {
    try {
      return await conn.sendMessage(msgObj.from, {
        react: {
          text: emoji,
          key: msgObj.key,
        },
      });
    } catch (err) {
      console.error("Error reacting:", err);
      return null;
    }
  };

  const replyMethod = async (payload, options = {}) => {
    try {
      if (payload?.delete) {
        return await conn.sendMessage(msgObj.from, { delete: payload.delete });
      }

      let cend;
      if (typeof payload === "string") {
        cend = { text: payload };
      } else if (payload.video) {
        cend = {
          video: payload.video,
          caption: payload.caption || "",
          mimetype: payload.mimetype || "video/mp4",
        };
      } else if (payload.image) {
        cend = {
          image: payload.image,
          caption: payload.caption || "",
        };
      } else if (payload.audio) {
        cend = {
          audio: payload.audio,
          mimetype: payload.mimetype || "audio/mp4",
          ptt: payload.ptt || false,
        };
      } else {
        cend = payload;
      }

      if (options.edit) cend.edit = options.edit;
      return await conn.sendMessage(msgObj.from, cend, { quoted: msgObj.raw });
    } catch (err) {
      console.error("Error sending reply:", err);
      return null;
    }
  };

  msgObj.sendreply = replyMethod;
  msgObj.sendReply = replyMethod;
  msgObj.reply = replyMethod;

  msgObj.sendFromUrl = async (url, opts = {}) => {
    try {
      const res = await axios.get(url, { responseType: "arraybuffer" });
      const buffer = Buffer.from(res.data, "binary");

      if (opts.asSticker) {
        return await msgObj.send({ sticker: buffer });
      } else if (opts.asDocument) {
        return await msgObj.send({
          document: buffer,
          mimetype: opts.mimetype || "application/octet-stream",
          fileName: opts.fileName || "file",
        });
      } else if (opts.asVideo) {
        return await msgObj.send({
          video: buffer,
          caption: opts.caption || "",
        });
      } else if (opts.asAudio) {
        return await msgObj.send({
          audio: buffer,
          mimetype: "audio/mp4",
          ptt: opts.ptt || false,
        });
      } else {
        return await msgObj.send({
          image: buffer,
          caption: opts.caption || "",
        });
      }
    } catch (err) {
      console.error("Error sending from URL:", err);
      return null;
    }
  };

  msgObj.setPp = async (jid, buf) => {
    try {
      let { query } = conn;
      let { img } = await makePp(buf);
      await query({
        tag: "iq",
        attrs: {
          to: jidNormalizedUser(jid),
          type: "set",
          xmlns: "w:profile:picture",
        },
        content: [
          {
            tag: "picture",
            attrs: { type: "image" },
            content: img,
          },
        ],
      });
    } catch (err) {
      console.error("Error setting profile picture:", err);
    }
  };

   msgObj.botJid = () => {
    return botJid;
  };

  msgObj.getLID = async (phoneNumber) => {
    try {
      if (!conn.signalRepository?.lidMapping) return null;
      return await conn.signalRepository.lidMapping.getLIDForPN(phoneNumber);
    } catch (err) {
      console.error("Error getting LID:", err);
      return null;
    }
  };

  msgObj.getPN = async (lid) => {
    try {
      if (!conn.signalRepository?.lidMapping) return null;
      return await conn.signalRepository.lidMapping.getPNForLID(lid);
    } catch (err) {
      console.error("Error getting PN:", err);
      return null;
    }
  };

  msgObj.isPnUser = (jid) => {
    return jid?.includes("@s.whatsapp.net") || false;
  };

  msgObj.isLidUser = (jid) => {
    return jid?.includes("@lid") || false;
  };

  msgObj.areJidsSame = (jid1, jid2) => {
    return areJidsSameUser(jidNormalizedUser(jid1), jidNormalizedUser(jid2));
  };

  return msgObj;
};

module.exports = serialize;
