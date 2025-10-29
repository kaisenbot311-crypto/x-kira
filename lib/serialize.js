const axios = require("axios");
const Jimp = require("jimp");
const groupCache = new Map();

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
  const baileys = await import("@whiskeysockets/baileys");
  const {
    getContentType,
    downloadContentFromMessage,
    jidNormalizedUser,
    isPnUser,
    areJidsSameUser,
  } = baileys;

  const key = msg.key;

  // ✅ NEW: Use alternate JIDs for better LID support
  const from = key.remoteJidAlt || key.remoteJid;
  const fromMe = msg.key.fromMe;

  // ✅ NEW: Use participantAlt for better reliability
  const sender = key.participantAlt || key.participant || from;

  const isGroup = from.endsWith("@g.us");
  const pushName = msg.pushName || "nothing";
  const type = getContentType(msg.message);
  const content = msg.message[type];

  const extractBody = () => {
    return type === "conversation"
      ? content
      : type === "extendedTextMessage"
      ? content.text
      : type === "imageMessage"
      ? content.caption
      : type === "videoMessage"
      ? content.caption
      : type === "templateButtonReplyMessage"
      ? content.selectedDisplayText
      : type === "buttonsResponseMessage"
      ? content.selectedButtonId
      : type === "listResponseMessage"
      ? content.singleSelectReply?.selectedRowId
      : "";
  };

  // ✅ FIXED: Better fromMe detection with LID support
  const isfromMe =
    fromMe ||
    areJidsSameUser(sender, conn.user.id) ||
    (conn.user.lid && areJidsSameUser(sender, conn.user.lid));

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
        ? qContent.text
        : qt === "imageMessage"
        ? qContent.caption
        : qt === "videoMessage"
        ? qContent.caption
        : qt === "templateButtonReplyMessage"
        ? qContent.selectedDisplayText
        : qt === "buttonsResponseMessage"
        ? qContent.selectedButtonId
        : qt === "listResponseMessage"
        ? qContent.singleSelectReply?.selectedRowId
        : "";

    return {
      type: qt,
      msg: qContent,
      body: b,
      fromMe: areJidsSameUser(context.participant, conn.user.id),
      participant: context.participant,
      id: context.stanzaId,
      key: {
        remoteJid: from,
        fromMe: areJidsSameUser(context.participant, conn.user.id),
        id: context.stanzaId,
        participant: context.participant,
      },
      download: async () => {
        const stream = await downloadContentFromMessage(
          qContent,
          qt.replace("Message", "")
        );
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
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

  // ✅ NEW: Get LID mapping for sender
  msgObj.getLID = async () => {
    try {
      if (isPnUser(msgObj.sender)) {
        return await conn.signalRepository.lidMapping.getLIDForPN(
          msgObj.sender
        );
      }
      return null;
    } catch (err) {
      console.error("Error getting LID:", err);
      return null;
    }
  };

  // ✅ NEW: Get PN mapping for sender
  msgObj.getPN = async () => {
    try {
      if (!isPnUser(msgObj.sender)) {
        return await conn.signalRepository.lidMapping.getPNForLID(
          msgObj.sender
        );
      }
      return msgObj.sender;
    } catch (err) {
      console.error("Error getting PN:", err);
      return null;
    }
  };

  // ✅ FIXED: Updated to use .id instead of .jid for participants
  msgObj.loadGroupInfo = async () => {
    if (!msgObj.isGroup) return;
    const cached = groupCache.get(msgObj.from);
    const now = Date.now();
    if (cached && now - cached.timestamp < 5 * 60 * 1000) {
      msgObj.groupMetadata = cached.data;
    } else {
      const meta = await conn.groupMetadata(msgObj.from);
      groupCache.set(msgObj.from, { data: meta, timestamp: now });
      msgObj.groupMetadata = meta;
    }

    msgObj.groupParticipants = msgObj.groupMetadata.participants;

    // ✅ FIXED: Use .id instead of .jid for participants
    msgObj.groupAdmins = msgObj.groupParticipants
      .filter((p) => p.admin)
      .map((p) => p.id);

    // ✅ FIXED: Use ownerPn or owner (both LID and PN support)
    msgObj.groupOwner =
      msgObj.groupMetadata.ownerPn ||
      msgObj.groupMetadata.owner ||
      msgObj.groupAdmins[0];

    msgObj.joinApprovalMode = msgObj.groupMetadata.joinApprovalMode || false;
    msgObj.memberAddMode = msgObj.groupMetadata.memberAddMode || false;
    msgObj.announce = msgObj.groupMetadata.announce || false;
    msgObj.restrict = msgObj.groupMetadata.restrict || false;

    // ✅ FIXED: Better admin check with LID support
    msgObj.isAdmin = msgObj.groupAdmins.some((admin) =>
      areJidsSameUser(admin, msgObj.sender)
    );

    // ✅ FIXED: Better bot admin check with LID support
    msgObj.isBotAdmin = msgObj.groupAdmins.some(
      (admin) =>
        areJidsSameUser(admin, conn.user.id) ||
        (conn.user.lid && areJidsSameUser(admin, conn.user.lid))
    );

    return msgObj;
  };

  // Group management functions
  msgObj.muteGroup = () => conn.groupSettingUpdate(msgObj.from, "announcement");
  msgObj.unmuteGroup = () =>
    conn.groupSettingUpdate(msgObj.from, "not_announcement");
  msgObj.setSubject = (text) => conn.groupUpdateSubject(msgObj.from, text);
  msgObj.setDescription = (text) =>
    conn.groupUpdateDescription(msgObj.from, text);
  msgObj.addParticipant = (jid) =>
    conn.groupParticipantsUpdate(msgObj.from, [jid], "add");
  msgObj.removeParticipant = (jid) =>
    conn.groupParticipantsUpdate(msgObj.from, [jid], "remove");
  msgObj.promoteParticipant = (jid) =>
    conn.groupParticipantsUpdate(msgObj.from, [jid], "promote");
  msgObj.demoteParticipant = (jid) =>
    conn.groupParticipantsUpdate(msgObj.from, [jid], "demote");
  msgObj.leaveGroup = () => conn.groupLeave(msgObj.from);
  msgObj.inviteCode = () => conn.groupInviteCode(msgObj.from);
  msgObj.revokeInvite = () => conn.groupRevokeInvite(msgObj.from);
  msgObj.getInviteInfo = (code) => conn.groupGetInviteInfo(code);
  msgObj.joinViaInvite = (code) => conn.groupAcceptInvite(code);
  msgObj.getJoinRequests = () => conn.groupRequestParticipantsList(msgObj.from);
  msgObj.updateJoinRequests = (jids, action = "approve") =>
    conn.groupRequestParticipantsUpdate(msgObj.from, jids, action);
  msgObj.setMemberAddMode = (enable = true) =>
    conn.groupSettingUpdate(
      msgObj.from,
      enable ? "not_announcement" : "announcement"
    );

  // User functions
  msgObj.fetchStatus = (jid) => conn.fetchStatus(jid);
  msgObj.profilePictureUrl = (jid) => conn.profilePictureUrl(jid);
  msgObj.blockUser = async (jid) => conn.updateBlockStatus(jid, "block");
  msgObj.unblockUser = async (jid) => conn.updateBlockStatus(jid, "unblock");

  // ✅ FIXED: Better participant check with .id field
  msgObj.getParticipants = () => msgObj.groupParticipants || [];
  msgObj.isParticipant = (jid) =>
    msgObj.getParticipants().some((p) => areJidsSameUser(p.id, jid));

  // Download function
  msgObj.download = async () => {
    const stream = await downloadContentFromMessage(
      msgObj.content,
      msgObj.type.replace("Message", "")
    );
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  };

  // Send function
  msgObj.send = async (payload, options = {}) => {
    if (payload?.delete)
      return conn.sendMessage(msgObj.from, { delete: payload.delete });

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
      };
    } else if (payload.sticker) {
      cend = { sticker: payload.sticker };
    } else if (payload.document) {
      cend = {
        document: payload.document,
        mimetype: payload.mimetype || "application/octet-stream",
        fileName: payload.fileName || "document",
      };
    } else {
      cend = payload;
    }

    if (options.edit) cend.edit = options.edit;
    return conn.sendMessage(msgObj.from, cend);
  };

  // Reply functions (with quoted message)
  msgObj.sendreply = async (payload, options = {}) => {
    if (payload?.delete)
      return conn.sendMessage(msgObj.from, { delete: payload.delete });

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
      };
    } else if (payload.sticker) {
      cend = { sticker: payload.sticker };
    } else if (payload.document) {
      cend = {
        document: payload.document,
        mimetype: payload.mimetype || "application/octet-stream",
        fileName: payload.fileName || "document",
      };
    } else {
      cend = payload;
    }

    if (options.edit) cend.edit = options.edit;
    return conn.sendMessage(msgObj.from, cend, { quoted: msgObj.raw });
  };

  msgObj.sendReply = msgObj.sendreply;
  msgObj.reply = msgObj.sendreply;

  // React function
  msgObj.react = async (emoji) => {
    return conn.sendMessage(msgObj.from, {
      react: {
        text: emoji,
        key: msgObj.key,
      },
    });
  };

  // Send from URL function
  msgObj.sendFromUrl = async (url, opts = {}) => {
    try {
      const res = await axios.get(url, { responseType: "arraybuffer" });
      const buffer = Buffer.from(res.data, "binary");

      if (opts.asSticker) {
        return msgObj.send({ sticker: buffer });
      } else if (opts.asDocument) {
        return msgObj.send({
          document: buffer,
          mimetype: opts.mimetype || "application/octet-stream",
          fileName: opts.fileName || "file",
        });
      } else if (opts.asVideo) {
        return msgObj.send({
          video: buffer,
          caption: opts.caption || "",
          mimetype: opts.mimetype || "video/mp4",
        });
      } else if (opts.asAudio) {
        return msgObj.send({
          audio: buffer,
          mimetype: opts.mimetype || "audio/mp4",
        });
      } else {
        // Default to image
        return msgObj.send({
          image: buffer,
          caption: opts.caption || "",
        });
      }
    } catch (error) {
      console.error("Error in sendFromUrl:", error);
      throw error;
    }
  };

  // Set profile picture function
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
    } catch (error) {
      console.error("Error setting profile picture:", error);
      throw error;
    }
  };

  // ✅ NEW: Edit message function
  msgObj.edit = async (newText) => {
    return await conn.sendMessage(msgObj.from, {
      text: newText,
      edit: msgObj.key,
    });
  };

  // ✅ NEW: Delete message function
  msgObj.delete = async () => {
    return await conn.sendMessage(msgObj.from, {
      delete: msgObj.key,
    });
  };

  // ✅ NEW: Forward message function
  msgObj.forward = async (jid, forceForward = true) => {
    return await conn.sendMessage(
      jid,
      {
        forward: msgObj.raw,
      },
      {
        forceForward,
      }
    );
  };

  // ✅ NEW: Copy and forward function
  msgObj.copyNForward = async (jid, options = {}) => {
    let content = msgObj.message;
    let ctype = getContentType(content);
    let context = content[ctype];

    if (ctype === "viewOnceMessage") {
      content = content[ctype].message;
      ctype = getContentType(content);
      context = content[ctype];
    }

    const message = {
      ...content,
      [ctype]: {
        ...context,
        ...options,
      },
    };

    return await conn.sendMessage(jid, message, {
      ...options,
    });
  };

  // ✅ NEW: Check if sender is owner
  msgObj.isOwner = () => {
    const sudoNumbers = (process.env.SUDO || "")
      .split(",")
      .map((num) => num.trim())
      .filter(Boolean);
    const senderNumber = msgObj.sender.split("@")[0];
    return sudoNumbers.includes(senderNumber);
  };

  // ✅ NEW: Get user status
  msgObj.getUserStatus = async (jid = msgObj.sender) => {
    try {
      return await conn.fetchStatus(jid);
    } catch {
      return null;
    }
  };

  // ✅ NEW: Get user profile picture
  msgObj.getUserPP = async (jid = msgObj.sender) => {
    try {
      return await conn.profilePictureUrl(jid, "image");
    } catch {
      return null;
    }
  };

  // ✅ NEW: Check if user exists on WhatsApp
  msgObj.userExists = async (jid) => {
    try {
      const [result] = await conn.onWhatsApp(jid.split("@")[0]);
      return result?.exists || false;
    } catch {
      return false;
    }
  };

  return msgObj;
};

/*async function makePp(buf) {
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
  const { getContentType, downloadContentFromMessage, jidNormalizedUser } =
    baileys;
  const key = msg.key;
  const from = key.remoteJid;
  const fromMe = msg.key.fromMe;
  const sender = key.participant || from;
  const isGroup = from.endsWith("@g.us");
  const pushName = msg.pushName || "nothing";
  const type = getContentType(msg.message);
  const content = msg.message[type];

  const extractBody = () => {
    return type === "conversation"
      ? content
      : type === "extendedTextMessage"
      ? content.text
      : type === "imageMessage"
      ? content.caption
      : type === "videoMessage"
      ? content.caption
      : type === "templateButtonReplyMessage"
      ? content.selectedDisplayText
      : "";
  };
  const isfromMe =
    fromMe ||
    sender === jidNormalizedUser(conn.user.id) ||
    sender === jidNormalizedUser(conn.user.lid);

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
        ? qContent.text
        : qt === "imageMessage"
        ? qContent.caption
        : qt === "videoMessage"
        ? qContent.caption
        : qt === "templateButtonReplyMessage"
        ? qContent.setonsResponseMessage
          ? qContent.selectedDisplayText
          : qt === "butlectedButtonId"
        : "";

    return {
      type: qt,
      msg: qContent,
      body: b,
      fromMe: context.participant === jidNormalizedUser(conn.user.id),
      participant: context.participant,
      id: context.stanzaId,
      key: {
        remoteJid: from,
        fromMe: context.participant === jidNormalizedUser(conn.user.id),
        id: context.stanzaId,
        participant: context.participant,
      },
      download: async () => {
        const stream = await downloadContentFromMessage(
          qContent,
          qt.replace("Message", "")
        );
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
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
    if (!msgObj.isGroup) return;
    const cached = groupCache.get(msgObj.from);
    const now = Date.now();
    if (cached && now - cached.timestamp < 5 * 60 * 1000) {
      msgObj.groupMetadata = cached.data;
    } else {
      const meta = await conn.groupMetadata(msgObj.from);
      groupCache.set(msgObj.from, { data: meta, timestamp: now });
      msgObj.groupMetadata = meta;
    }

    msgObj.groupParticipants = msgObj.groupMetadata.participants;
    msgObj.groupAdmins = msgObj.groupParticipants
      .filter((p) => p.admin)
      .map((p) => p.id);
    msgObj.groupOwner = msgObj.groupMetadata.owner || msgObj.groupAdmins[0];
    msgObj.joinApprovalMode = msgObj.groupMetadata.joinApprovalMode || false;
    msgObj.memberAddMode = msgObj.groupMetadata.memberAddMode || false;
    msgObj.announce = msgObj.groupMetadata.announce || false;
    msgObj.restrict = msgObj.groupMetadata.restrict || false;
    msgObj.isAdmin = msgObj.groupAdmins.includes(msgObj.sender);
    msgObj.isBotAdmin =
      msgObj.groupAdmins.includes(jidNormalizedUser(conn.user.lid)) ||
      msgObj.groupAdmins.includes(jidNormalizedUser(conn.user.id));
    return msgObj;
  };
  msgObj.muteGroup = () => conn.groupSettingUpdate(msgObj.from, "announcement");
  msgObj.unmuteGroup = () =>
    conn.groupSettingUpdate(msgObj.from, "not_announcement");
  msgObj.setSubject = (text) => conn.groupUpdateSubject(msgObj.from, text);
  msgObj.setDescription = (text) =>
    conn.groupUpdateDescription(msgObj.from, text);
  msgObj.addParticipant = (jid) =>
    conn.groupParticipantsUpdate(msgObj.from, [jid], "add");
  msgObj.removeParticipant = (jid) =>
    conn.groupParticipantsUpdate(msgObj.from, [jid], "remove");
  msgObj.promoteParticipant = (jid) =>
    conn.groupParticipantsUpdate(msgObj.from, [jid], "promote");
  msgObj.demoteParticipant = (jid) =>
    conn.groupParticipantsUpdate(msgObj.from, [jid], "demote");
  msgObj.leaveGroup = () => conn.groupLeave(msgObj.from);
  msgObj.inviteCode = () => conn.groupInviteCode(msgObj.from);
  msgObj.revokeInvite = () => conn.groupRevokeInvite(msgObj.from);
  msgObj.getInviteInfo = (code) => conn.groupGetInviteInfo(code);
  msgObj.joinViaInvite = (code) => conn.groupAcceptInvite(code);
  msgObj.getJoinRequests = () => conn.groupRequestParticipantsList(msgObj.from);
  msgObj.updateJoinRequests = (jids, action = "approve") =>
    conn.groupRequestParticipantsUpdate(msgObj.from, jids, action);
  msgObj.setMemberAddMode = (enable = true) =>
    conn.groupSettingUpdate(
      msgObj.from,
      enable ? "not_announcement" : "announcement"
    );
  msgObj.fetchStatus = (jid) => conn.fetchStatus(jid);
  msgObj.profilePictureUrl = (jid) => conn.profilePictureUrl(jid);
  msgObj.blockUser = async (jid) => conn.updateBlockStatus(jid, "block");
  msgObj.unblockUser = async (jid) => conn.updateBlockStatus(jid, "unblock");
  msgObj.getParticipants = () => msgObj.groupParticipants || [];
  msgObj.isParticipant = (jid) =>
    msgObj.getParticipants().some((p) => p.id === jid);
  msgObj.download = async () => {
    const stream = await downloadContentFromMessage(
      msgObj.content,
      msgObj.type.replace("Message", "")
    );
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  };

  msgObj.send = async (payload, options = {}) => {
    if (payload?.delete)
      return conn.sendMessage(msgObj.from, { delete: payload.delete });
    let cend;
    if (typeof payload === "string") {
      cend = { text: payload };
    } else if (payload.video) {
      cend = {
        video: payload.video,
        caption: payload.caption || "",
        mimetype: payload.mimetype || "video/mp4",
      };
    } else {
      cend = payload;
    }

    if (options.edit) cend.edit = options.edit;
    return conn.sendMessage(msgObj.from, cend); //
  };

  msgObj.react = async (emoji) => {
    return conn.sendMessage(msgObj.from, {
      reactionMessage: {
        text: emoji,
        key: msgObj.key,
      },
    });
  };

  msgObj.sendreply = async (payload, options = {}) => {
    if (payload?.delete)
      return conn.sendMessage(msgObj.from, { delete: payload.delete });
    let cend;
    if (typeof payload === "string") {
      cend = { text: payload };
    } else if (payload.video) {
      cend = {
        video: payload.video,
        caption: payload.caption || "",
        mimetype: payload.mimetype || "video/mp4",
      };
    } else {
      cend = payload;
    }

    if (options.edit) cend.edit = options.edit;
    return conn.sendMessage(msgObj.from, cend, { quoted: msgObj.raw }); // { quoted: msgObj.raw }
  };

  msgObj.sendReply = async (payload, options = {}) => {
    if (payload?.delete)
      return conn.sendMessage(msgObj.from, { delete: payload.delete });
    let cend;
    if (typeof payload === "string") {
      cend = { text: payload };
    } else if (payload.video) {
      cend = {
        video: payload.video,
        caption: payload.caption || "",
        mimetype: payload.mimetype || "video/mp4",
      };
    } else {
      cend = payload;
    }

    if (options.edit) cend.edit = options.edit;
    return conn.sendMessage(msgObj.from, cend, { quoted: msgObj.raw }); // { quoted: msgObj.raw }
  };

  msgObj.reply = async (payload, options = {}) => {
    if (payload?.delete)
      return conn.sendMessage(msgObj.from, { delete: payload.delete });
    let cend;
    if (typeof payload === "string") {
      cend = { text: payload };
    } else if (payload.video) {
      cend = {
        video: payload.video,
        caption: payload.caption || "",
        mimetype: payload.mimetype || "video/mp4",
      };
    } else {
      cend = payload;
    }

    if (options.edit) cend.edit = options.edit;
    return conn.sendMessage(msgObj.from, cend, { quoted: msgObj.raw }); // { quoted: msgObj.raw }
  };

  msgObj.react = async (emoji) => {
    return conn.sendMessage(msgObj.from, {
      react: {
        text: emoji,
        key: msgObj.key,
      },
    });
  };

  msgObj.sendFromUrl = async (url, opts = {}) => {
    const res = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(res.data, "binary");
    if (opts.asSticker) {
      return msgObj.send({ sticker: buffer });
    } else if (opts.asDocument) {
      return msgObj.send({
        document: buffer,
        mimetype: "application/octet-stream",
        fileName: opts.fileName || "file",
      });
    } else {
      return msgObj.send({ image: buffer });
    }
  };

  msgObj.setPp = async (jid, buf) => {
    let { query } = conn;
    let { img } = await makePp(buf);
    await query({
      tag: "iq",
      attrs: {
        to: "@s.whatsapp.net",
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
  };

  return msgObj;
};*/

module.exports = serialize;
