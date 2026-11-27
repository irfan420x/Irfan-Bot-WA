"use strict";

// _wa.js — MESSAGE ADAPTER: Baileys <-> Messenger-style event/message/api.
//
// Pure functions: NO Baileys import at top level. The socket object is
// passed in by the caller, so this file can be required and unit-tested
// without a live WhatsApp connection.
//
// Contract (see whatsapp-bot/PLAN.md + shared contract):
//   translateMessage(sock, msg) -> event
//   createMessage(sock, event)  -> message { reply, send, react, unsend }
//   createApi(sock)             -> api { sendMessage, getThreadInfo, getUserInfo }
//   helpers: getBody, isGroupJid, jidToId, idToJid
//
// global.wabot.send(jid, content, options) is the guarded send. When it
// exists it is used; otherwise sock.sendMessage is called directly.

const GROUP_SUFFIX = "@g.us";
const DM_SUFFIX = "@s.whatsapp.net";

// JIDs of groups seen by translateMessage. Bare-digit thread IDs are
// ambiguous (a group and a DM both look like digits), so the adapter
// remembers which ones are groups and idToJid() consults this set.
const knownGroupJids = new Set();

function isGroupJid(jid) {
  return typeof jid === "string" && jid.endsWith(GROUP_SUFFIX);
}

function jidToId(jid) {
  if (!jid || typeof jid !== "string") return "";
  return jid.replace(/@(s\.whatsapp\.net|g\.us|lid)$/, "");
}

function idToJid(id, isGroup) {
  if (!id || typeof id !== "string") return "";
  if (id.includes("@")) return id;
  const group = typeof isGroup === "boolean"
    ? isGroup
    : knownGroupJids.has(id + GROUP_SUFFIX);
  return id + (group ? GROUP_SUFFIX : DM_SUFFIX);
}

// Unwrap Baileys wrapper messages (ephemeral / view-once / captioned doc).
function unwrapMessage(message) {
  let m = message;
  let guard = 0;
  while (m && typeof m === "object" && guard < 5) {
    if (m.ephemeralMessage && m.ephemeralMessage.message) {
      m = m.ephemeralMessage.message;
    } else if (m.viewOnceMessage && m.viewOnceMessage.message) {
      m = m.viewOnceMessage.message;
    } else if (m.viewOnceMessageV2 && m.viewOnceMessageV2.message) {
      m = m.viewOnceMessageV2.message;
    } else if (m.documentWithCaptionMessage && m.documentWithCaptionMessage.message) {
      m = m.documentWithCaptionMessage.message;
    } else {
      break;
    }
    guard++;
  }
  return m || {};
}

function getContextInfo(content) {
  if (!content || typeof content !== "object") return {};
  return content.extendedTextMessage?.contextInfo
    || content.imageMessage?.contextInfo
    || content.videoMessage?.contextInfo
    || content.documentMessage?.contextInfo
    || content.audioMessage?.contextInfo
    || content.stickerMessage?.contextInfo
    || {};
}

// Extract the readable text of a Baileys message (or of a quotedMessage,
// which is itself a message-content object).
function getBody(msg) {
  if (!msg) return "";
  const content = unwrapMessage(msg.message || msg);
  if (!content || typeof content !== "object") return "";
  if (typeof content.conversation === "string") return content.conversation;
  if (typeof content.extendedTextMessage?.text === "string") {
    return content.extendedTextMessage.text;
  }
  if (typeof content.imageMessage?.caption === "string") {
    return content.imageMessage.caption;
  }
  if (typeof content.videoMessage?.caption === "string") {
    return content.videoMessage.caption;
  }
  if (typeof content.documentMessage?.caption === "string") {
    return content.documentMessage.caption;
  }
  if (typeof content.buttonsResponseMessage?.selectedButtonId === "string") {
    return content.buttonsResponseMessage.selectedButtonId;
  }
  if (typeof content.listResponseMessage?.title === "string") {
    return content.listResponseMessage.title;
  }
  if (typeof content.pollUpdateMessage?.name === "string") {
    return content.pollUpdateMessage.name;
  }
  return "";
}

function detectMedia(content) {
  if (!content || typeof content !== "object") return null;
  if (content.imageMessage) {
    return { type: "image", mimetype: content.imageMessage.mimetype || "image/jpeg", fileName: null };
  }
  if (content.videoMessage) {
    return { type: "video", mimetype: content.videoMessage.mimetype || "video/mp4", fileName: null };
  }
  if (content.audioMessage) {
    return { type: "audio", mimetype: content.audioMessage.mimetype || "audio/ogg", fileName: null };
  }
  if (content.documentMessage) {
    return {
      type: "document",
      mimetype: content.documentMessage.mimetype || "application/octet-stream",
      fileName: content.documentMessage.fileName || null
    };
  }
  if (content.stickerMessage) {
    return { type: "sticker", mimetype: content.stickerMessage.mimetype || "image/webp", fileName: null };
  }
  return null;
}

// Baileys message -> Messenger-style event object.
async function translateMessage(sock, msg) {
  const key = (msg && msg.key) || {};
  const remoteJid = key.remoteJid || "";
  const isGroup = isGroupJid(remoteJid);
  if (isGroup) knownGroupJids.add(remoteJid);

  // Sender JID: prefer the PHONE-number JID over the LID. WhatsApp hides
  // phone numbers behind LIDs for some users, so key.participant can be a
  // LID JID (e.g. 100000123456789@lid) while the phone JID arrives in
  // key.participantPn (groups) / key.senderPn (DMs) — Baileys 6.7.24
  // decode-wa-message.js populates both from the stanza attrs. The LID
  // never matches config.owner/adminBot (phone numbers), so using it made
  // the bot fail to recognise its own admin. Fall back to the raw
  // participant when no phone JID is present.
  const phoneJid = (jid) => (typeof jid === "string" && jid.endsWith("@s.whatsapp.net")) ? jid : null;
  const senderJid = isGroup
    ? (phoneJid(key.participantPn) || key.participant || remoteJid)
    : (phoneJid(key.senderPn) || remoteJid);
  const content = unwrapMessage(msg && msg.message);
  const contextInfo = getContextInfo(content);

  // Mentions: { bareId: "@Name" } — Baileys gives only JIDs, so the
  // display value falls back to "@" + the bare id.
  const mentions = {};
  const mentionedJid = contextInfo.mentionedJid;
  if (Array.isArray(mentionedJid)) {
    for (const jid of mentionedJid) {
      const bare = jidToId(jid);
      if (bare) mentions[bare] = "@" + bare;
    }
  }

  // Quoted (replied-to) message, if any.
  let messageReply = null;
  if (contextInfo.quotedMessage) {
    const quotedBody = getBody({ message: contextInfo.quotedMessage });
    messageReply = {
      senderID: jidToId(contextInfo.participant || ""),
      body: quotedBody,
      messageID: contextInfo.stanzaId || null
    };
  }

  // Attachments: metadata always; buffer best-effort, never throws.
  const attachments = [];
  const media = detectMedia(content);
  if (media) {
    const attachment = { type: media.type, mimetype: media.mimetype, fileName: media.fileName };
    try {
      if (sock && typeof sock.downloadMediaMessage === "function") {
        const buffer = await sock.downloadMediaMessage(msg);
        if (buffer) attachment.buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      }
    } catch (_) {
      // Media download failed (e.g. expired / undecryptable) — the
      // attachment stays metadata-only; the command must not crash.
    }
    attachments.push(attachment);
  }

  const ts = msg && msg.messageTimestamp;
  const timestamp = ts ? Number(ts) * 1000 : Date.now();

  return {
    body: getBody(msg),
    threadID: jidToId(remoteJid),
    threadIDFull: remoteJid,
    senderID: jidToId(senderJid),
    senderIDFull: senderJid,
    // The sender's LID (if WhatsApp sent one) — kept so group-admin checks
    // can match it when groupMetadata lists admins by LID.
    senderLid: jidToId(key.participantLid || key.senderLid || "") || null,
    // The sender's WhatsApp display name (push name) — the most reliable
    // name source. Commands use it when the DB record has no name yet.
    senderName: (msg && msg.pushName) || null,
    messageID: key.id || null,
    isGroup,
    type: "message",
    mentions,
    messageReply,
    attachments,
    timestamp,
    raw: msg
  };
}

// ---- Sending ------------------------------------------------------------

// Convert a command's content (string | { body, attachment }) into a
// Baileys sendable object.
function toBaileysContent(content) {
  if (typeof content === "string") return { text: content };
  if (!content || typeof content !== "object") return { text: "" };

  const body = typeof content.body === "string" ? content.body : "";
  const att = content.attachment;
  // Native WhatsApp message kinds that toBaileysContent cannot express as
  // text/media. These pass through verbatim to sock.sendMessage via
  // deliver() (guarded send). Verified against Baileys 6.7.24:
  // - poll: Types/Message.d.ts:145 { poll: PollMessageOptions } and
  //   Utils/messages.js:394-410 (messageSecret auto-generated).
  // - pin: Types/Message.d.ts:162-170 { pin: WAMessageKey,
  //   type: proto.PinInChat.Type, time?: 86400|604800|2592000 } and
  //   Utils/messages.js:351-357 (type 1 = pin, 2 = unpin — runtime
  //   proto.Message.PinInChatMessage.Type: PIN_FOR_ALL=1,
  //   UNPIN_FOR_ALL=2).
  // - contacts: Types/Message.d.ts:149 { contacts: { displayName?,
  //   contacts: proto.Message.IContactMessage[] } }.
  // - location: Types/Message.d.ts:152 { location: WALocationMessage }
  //   (= proto.Message.ILocationMessage: degreesLatitude,
  //   degreesLongitude, name?, address?).
  if (content.poll && typeof content.poll === "object") return { poll: content.poll };
  if (content.pin) return { pin: content.pin, type: content.type, time: content.time };
  if (content.contacts) return { contacts: content.contacts };
  if (content.location) return { location: content.location };
  if (!att) return { text: body };

  const media = att.buffer || att.url;
  if (!media) return { text: body };
  const mimetype = att.mimetype || "";
  const fileName = att.fileName || undefined;

  if (att.type === "sticker" || mimetype === "image/webp") {
    return { sticker: media };
  }
  if (mimetype.startsWith("image/")) {
    return { image: media, caption: body || undefined, fileName };
  }
  if (mimetype.startsWith("video/")) {
    return { video: media, caption: body || undefined, fileName };
  }
  if (mimetype.startsWith("audio/")) {
    return { audio: media, mimetype };
  }
  // Anything else (pdf, zip, ...) goes as a document.
  return { document: media, fileName: fileName || "file", mimetype: mimetype || "application/octet-stream", caption: body || undefined };
}

function invokeCb(cb, err, info) {
  if (typeof cb === "function") {
    try { cb(err, info); } catch (_) { /* callback errors must not crash the send */ }
  }
}

// One guarded send. Prefers global.wabot.send (rate-limit guard); falls
// back to sock.sendMessage so tests can run without a live socket.
async function deliver(sock, jid, content, options) {
  const wabot = global.wabot;
  if (wabot && typeof wabot.send === "function") {
    return await wabot.send(jid, content, options || {});
  }
  if (!sock || typeof sock.sendMessage !== "function") {
    throw new Error("No socket available to send message");
  }
  return await sock.sendMessage(jid, content, options || {});
}

function normalizeInfo(result) {
  const messageID = result && result.key && result.key.id
    ? result.key.id
    : (result && result.messageID) || null;
  return { messageID, raw: result };
}

function createMessage(sock, event) {
  const jid = (event && event.threadIDFull) || idToJid(event && event.threadID, event && event.isGroup);

  function quotedMessage() {
    if (!event || !event.messageID) return undefined;
    const quoted = {
      key: {
        remoteJid: jid,
        fromMe: false,
        id: event.messageID
      },
      message: { conversation: event.body || "" }
    };
    if (event.isGroup && event.senderIDFull) quoted.key.participant = event.senderIDFull;
    return quoted;
  }

  async function doSend(content, cb, quoted) {
    try {
      const baileysContent = toBaileysContent(content);
      const options = {};
      if (quoted) options.quoted = quoted;
      const result = await deliver(sock, jid, baileysContent, options);
      const info = normalizeInfo(result);
      invokeCb(cb, null, info);
      return info;
    } catch (err) {
      invokeCb(cb, err, null);
      throw err;
    }
  }

  return {
    // Quoted reply to the triggering message.
    reply(content, cb) {
      return doSend(content, cb, quotedMessage());
    },
    // Plain send, no quote.
    send(content, cb) {
      return doSend(content, cb, undefined);
    },
    // React to the triggering message ("" removes the reaction).
    async react(emoji) {
      if (!event || !event.messageID) return null;
      const key = { remoteJid: jid, fromMe: false, id: event.messageID };
      if (event.isGroup && event.senderIDFull) key.participant = event.senderIDFull;
      const result = await deliver(sock, jid, { react: { text: emoji || "", key } }, {});
      return normalizeInfo(result);
    },
    // Delete a message the bot sent (id = messageID returned by a send).
    async unsend(id) {
      const targetId = id || (event && event.messageID);
      if (!targetId) return null;
      const result = await deliver(sock, jid, {
        delete: { remoteJid: jid, fromMe: true, id: targetId }
      }, {});
      return normalizeInfo(result);
    },
    // Edit a text message the bot sent (id = messageID returned by a send).
    // WhatsApp edits only change text — a text message cannot be edited
    // into an image, so animated commands edit the spin text, then unsend
    // it and send the result card as a fresh message.
    async edit(id, text) {
      if (!id) return null;
      const result = await deliver(sock, jid, {
        text: text || "",
        edit: { remoteJid: jid, fromMe: true, id }
      }, {});
      return normalizeInfo(result);
    }
  };
}

// ---- API shim -----------------------------------------------------------

function createApi(sock) {
  function resolveJid(threadID) {
    if (!threadID) return "";
    if (String(threadID).includes("@")) return String(threadID);
    return idToJid(String(threadID));
  }

  return {
    // sendMessage(content, threadID, cb, messageID?)
    // threadID may be bare digits or a full JID. messageID (when given)
    // quotes that message, like the Messenger api's messageID argument.
    async sendMessage(content, threadID, cb, messageID) {
      const jid = resolveJid(threadID);
      try {
        const baileysContent = toBaileysContent(content);
        const options = {};
        if (messageID) {
          options.quoted = {
            key: { remoteJid: jid, fromMe: false, id: messageID },
            message: { conversation: "" }
          };
        }
        const result = await deliver(sock, jid, baileysContent, options);
        const info = normalizeInfo(result);
        invokeCb(cb, null, info);
        return info;
      } catch (err) {
        invokeCb(cb, err, null);
        throw err;
      }
    },

    // getThreadInfo(threadID) -> { threadName, participantIDs, adminIDs,
    //   userInfo, isGroup }. Groups use groupMetadata; DMs resolve a name.
    async getThreadInfo(threadID) {
      const jid = resolveJid(threadID);
      if (isGroupJid(jid) || knownGroupJids.has(jid)) {
        try {
          const meta = await sock.groupMetadata(jid);
          const participants = Array.isArray(meta.participants) ? meta.participants : [];
          const participantIDs = participants.map(p => jidToId(p.id || p));
          const adminIDs = participants
            .filter(p => p.admin === "admin" || p.admin === "superadmin")
            .map(p => jidToId(p.id));
          const userInfo = {};
          for (const p of participants) {
            const id = jidToId(p.id || p);
            if (id) userInfo[id] = { name: p.notify || null };
          }
          return {
            threadName: meta.subject || null,
            participantIDs,
            adminIDs,
            userInfo,
            isGroup: true
          };
        } catch (_) {
          return { threadName: null, participantIDs: [], adminIDs: [], userInfo: {}, isGroup: true };
        }
      }
      // DM: best-effort contact name.
      const bare = jidToId(jid);
      let name = null;
      try {
        const info = await this.getUserInfo(bare);
        name = info && info.name;
      } catch (_) { /* never throw */ }
      return {
        threadName: name,
        participantIDs: bare ? [bare] : [],
        adminIDs: [],
        userInfo: bare ? { [bare]: { name } } : {},
        isGroup: false
      };
    },

    // getUserInfo(userID) -> { name }. Best effort, never throws.
    async getUserInfo(userID) {
      const bare = String(userID || "").replace(/@.*$/, "");
      if (!bare) return { name: null };
      const jid = bare + DM_SUFFIX;
      try {
        if (sock && typeof sock.onWhatsApp === "function") {
          const res = await sock.onWhatsApp(jid);
          const entry = Array.isArray(res) ? res[0] : null;
          if (entry && entry.notify) return { name: entry.notify };
        }
      } catch (_) { /* never throw */ }
      return { name: null };
    }
  };
}

module.exports = {
  translateMessage,
  createMessage,
  createApi,
  getBody,
  isGroupJid,
  jidToId,
  idToJid,
  unwrapMessage,
  toBaileysContent
};
