'use strict';
/**
 * core/handler/handlerMessage.js — message routing.
 *
 * Pipeline for every incoming Baileys message:
 *   1. Ignore own messages (unless config.selfListen), status/broadcast,
 *      and protocol-only messages.
 *   2. Translate the Baileys message into the Messenger-style shape
 *      ({ event, message, api }) via scripts/cmds/_wa.js when it exists,
 *      otherwise via the built-in translator below.
 *   3. If the message starts with the prefix and names a known command:
 *      role check (0 all / 1 group admin / 2 bot admin), cooldown, then
 *      onStart({ api, event, args, message, threadsData, usersData,
 *      role, sock }).
 *   4. Else, if the message replies to a message registered in
 *      global.wabot.replyMap, call that command's onReply with
 *      { api, event, args, message, Reply }.
 *
 * _wa.js is written by another worker and may not exist yet, or may export
 * its translator under a different name — so it is required LAZILY here
 * (once, cached) and probed for several known export names. The built-in
 * translator implements the same contract, so routing works either way.
 * _wa.js is never imported at the top level of this file.
 */

const path = require('path');
const db = require('../database/db');

const WA_ADAPTER_PATH = path.join(__dirname, '..', '..', 'scripts', 'cmds', '_wa.js');

// ---------------------------------------------------------------------------
// _wa.js adapter loading (lazy, robust)
// ---------------------------------------------------------------------------

let adapterFn = null; // (sock, msg) => { event, message, api } | null
let adapterTried = false;

function loadAdapter() {
  if (adapterTried) return adapterFn;
  adapterTried = true;
  try {
    const mod = require(WA_ADAPTER_PATH);
    // Preferred interface (what _wa.js actually exports):
    //   translateMessage(sock, msg) -> event
    //   createMessage(sock, event)  -> message { reply, send, react, unsend }
    //   createApi(sock)             -> api { sendMessage, getThreadInfo, getUserInfo }
    if (mod && typeof mod.translateMessage === 'function'
      && typeof mod.createMessage === 'function'
      && typeof mod.createApi === 'function') {
      adapterFn = async (sock, msg) => {
        const event = await mod.translateMessage(sock, msg);
        if (!event) return null;
        return {
          event,
          message: mod.createMessage(sock, event),
          api: mod.createApi(sock)
        };
      };
      return adapterFn;
    }
    const candidates = ['translateMessage', 'translate', 'adaptMessage', 'toEvent', 'createContext', 'buildContext'];
    if (typeof mod === 'function') {
      adapterFn = mod;
    } else if (mod && typeof mod === 'object') {
      for (const name of candidates) {
        if (typeof mod[name] === 'function') {
          adapterFn = mod[name];
          break;
        }
      }
    }
    if (!adapterFn) {
      console.warn('[WABOT] _wa.js loaded but exposes no known translator export — using built-in translator.');
    }
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.warn(`[WABOT] Failed to load _wa.js (${err.message}) — using built-in translator.`);
    }
    // MODULE_NOT_FOUND: _wa.js not written yet — silent, built-in applies.
  }
  return adapterFn;
}

// ---------------------------------------------------------------------------
// Built-in translator (same contract as _wa.js)
// ---------------------------------------------------------------------------

function jidToBare(jid) {
  if (!jid || typeof jid !== 'string') return '';
  const [user, server] = jid.split('@');
  // LID jids (@lid) are not phone numbers — keep the raw user part.
  if (server === 'lid') return user;
  return (user || '').replace(/\D/g, '');
}

function unwrapMessage(message) {
  if (!message) return null;
  if (message.ephemeralMessage) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessage(message.viewOnceMessageV2.message);
  return message;
}

function extractBody(message) {
  const m = unwrapMessage(message);
  if (!m) return '';
  if (typeof m.conversation === 'string') return m.conversation;
  if (m.extendedTextMessage && typeof m.extendedTextMessage.text === 'string') {
    return m.extendedTextMessage.text;
  }
  const media = m.imageMessage || m.videoMessage || m.documentMessage;
  if (media && typeof media.caption === 'string') return media.caption;
  return '';
}

function extractQuoted(message) {
  const m = unwrapMessage(message);
  if (!m || !m.extendedTextMessage || !m.extendedTextMessage.contextInfo) return null;
  const ctx = m.extendedTextMessage.contextInfo;
  if (!ctx.quotedMessage) return null;
  return {
    senderID: jidToBare(ctx.participant || ''),
    body: extractBody(ctx.quotedMessage),
    messageID: ctx.stanzaId || ''
  };
}

function extractAttachments(message) {
  const m = unwrapMessage(message);
  if (!m) return [];
  const out = [];
  const kinds = [
    ['imageMessage', 'image'],
    ['videoMessage', 'video'],
    ['audioMessage', 'audio'],
    ['documentMessage', 'document'],
    ['stickerMessage', 'sticker']
  ];
  for (const [key, type] of kinds) {
    if (m[key]) {
      out.push({
        type,
        mimetype: m[key].mimetype || '',
        fileName: m[key].fileName || ''
      });
    }
  }
  return out;
}

/** Convert Messenger-style content into a Baileys message content object. */
function toBaileysContent(content) {
  if (typeof content === 'string') return { text: content };
  if (!content || typeof content !== 'object') return { text: String(content ?? '') };

  const body = typeof content.body === 'string' ? content.body : '';
  const att = content.attachment;

  if (!att) return { text: body };

  // { buffer, mimetype, fileName }
  if (att.buffer) {
    const mime = att.mimetype || '';
    if (mime.startsWith('image/')) {
      return { image: att.buffer, caption: body || undefined, fileName: att.fileName };
    }
    if (mime.startsWith('video/')) {
      return { video: att.buffer, caption: body || undefined, fileName: att.fileName, mimetype: mime };
    }
    if (mime.startsWith('audio/')) {
      return { audio: att.buffer, mimetype: mime, fileName: att.fileName };
    }
    return { document: att.buffer, mimetype: mime || 'application/octet-stream', fileName: att.fileName || 'file', caption: body || undefined };
  }

  // { url } (+ optional mimetype/fileName)
  if (att.url) {
    const mime = att.mimetype || '';
    const ext = String(att.url).split('?')[0].split('.').pop().toLowerCase();
    const isImage = mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    const isVideo = mime.startsWith('video/') || ['mp4', 'mov', 'webm'].includes(ext);
    if (isImage) return { image: { url: att.url }, caption: body || undefined };
    if (isVideo) return { video: { url: att.url }, caption: body || undefined };
    return { document: { url: att.url }, mimetype: mime || 'application/octet-stream', fileName: att.fileName || 'file', caption: body || undefined };
  }

  return { text: body };
}

function buildContextFallback(sock, msg) {
  const key = msg.key || {};
  const remoteJid = key.remoteJid || '';
  const isGroup = remoteJid.endsWith('@g.us');
  const senderJid = isGroup ? (key.participant || '') : remoteJid;
  const unwrapped = unwrapMessage(msg.message);
  const ctxInfo = (unwrapped && unwrapped.extendedTextMessage && unwrapped.extendedTextMessage.contextInfo) || {};

  const mentions = {};
  for (const jid of ctxInfo.mentionedJid || []) {
    const bare = jidToBare(jid);
    if (bare) mentions[bare] = `@${bare}`;
  }

  const event = {
    body: extractBody(msg.message),
    threadID: jidToBare(remoteJid),
    threadIDFull: remoteJid,
    senderID: jidToBare(senderJid),
    senderIDFull: senderJid,
    messageID: key.id || '',
    isGroup,
    type: 'message',
    mentions,
    messageReply: extractQuoted(msg.message),
    attachments: extractAttachments(msg.message),
    timestamp: msg.messageTimestamp
      ? Number(msg.messageTimestamp) * 1000
      : Date.now(),
    raw: msg
  };

  // Send through the guarded send when the bot is live, else direct
  // (keeps unit tests working with a mock socket).
  const wabot = global.wabot;
  const useGuarded = wabot && wabot.sock === sock && typeof wabot.send === 'function';
  async function doSend(content, options) {
    const baileysContent = toBaileysContent(content);
    if (useGuarded) return wabot.send(remoteJid, baileysContent, options);
    return sock.sendMessage(remoteJid, baileysContent, options);
  }

  const message = {
    reply(content, cb) {
      doSend(content, { quoted: msg })
        .then((info) => cb && cb(null, { messageID: info && info.key ? info.key.id : '' }))
        .catch((err) => cb && cb(err));
    },
    send(content, cb) {
      doSend(content, {})
        .then((info) => cb && cb(null, { messageID: info && info.key ? info.key.id : '' }))
        .catch((err) => cb && cb(err));
    },
    react(emoji) {
      return sock.sendMessage(remoteJid, { react: { text: emoji, key } }).catch(() => null);
    },
    unsend(id) {
      return sock.sendMessage(remoteJid, {
        delete: { remoteJid, fromMe: true, id: id || key.id }
      }).catch(() => null);
    }
  };

  const api = {
    sendMessage(content, threadID, cb, messageID) {
      const jid = threadID.includes('@') ? threadID : `${threadID}@s.whatsapp.net`;
      const options = {};
      if (messageID) options.quoted = { key: { remoteJid: jid, id: messageID } };
      doSend(content, options)
        .then((info) => cb && cb(null, { messageID: info && info.key ? info.key.id : '' }))
        .catch((err) => cb && cb(err));
    },
    async getThreadInfo(threadID) {
      const jid = threadID.includes('@') ? threadID : `${threadID}@s.whatsapp.net`;
      const isGrp = jid.endsWith('@g.us');
      if (!isGrp) {
        return { threadName: threadID, participantIDs: [jidToBare(jid)], adminIDs: [], userInfo: {}, isGroup: false };
      }
      const meta = await sock.groupMetadata(jid);
      return {
        threadName: meta.subject || '',
        participantIDs: (meta.participants || []).map((p) => jidToBare(p.id)),
        adminIDs: (meta.participants || [])
          .filter((p) => p.admin === 'admin' || p.admin === 'superadmin')
          .map((p) => jidToBare(p.id)),
        userInfo: {},
        isGroup: true
      };
    },
    async getUserInfo(userID) {
      // Baileys has no contact store by default; the name resolves to the
      // bare id unless _wa.js (or a contacts cache) supplies better data.
      return { name: String(userID) };
    }
  };

  return { event, message, api };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const cooldowns = new Map(); // `${commandName}:${senderID}` -> epoch ms

function isBotAdmin(config, senderID) {
  const admins = (config.adminBot || []).map(String);
  return admins.includes(String(senderID)) || String(config.owner) === String(senderID);
}

async function isGroupAdmin(sock, api, event) {
  try {
    const info = await api.getThreadInfo(event.threadIDFull || event.threadID);
    return (info.adminIDs || []).includes(String(event.senderID));
  } catch (err) {
    console.warn(`[WABOT] groupMetadata failed for ${event.threadIDFull}: ${err.message}`);
    return false; // fail closed on role-1 checks
  }
}

async function handlerMessage(sock, msg) {
  if (!msg || !msg.message) return;
  const key = msg.key || {};
  const remoteJid = key.remoteJid || '';

  // Ignore status/broadcast and protocol-only messages.
  if (remoteJid === 'status@broadcast') return;
  if (msg.message.protocolMessage && !unwrapMessage(msg.message)) return;

  const config = (global.wabot && global.wabot.config) || {};
  const prefix = config.prefix || '.';

  // Ignore our own messages unless selfListen is on.
  if (key.fromMe && !config.selfListen) return;

  // Translate (adapter first, built-in fallback).
  const adapter = loadAdapter();
  let ctx = null;
  if (adapter) {
    try {
      ctx = await adapter(sock, msg);
    } catch (err) {
      console.warn(`[WABOT] _wa.js translator failed (${err.message}) — using built-in translator.`);
      ctx = null;
    }
  }
  if (!ctx || !ctx.event) ctx = buildContextFallback(sock, msg);

  const { event, message, api } = ctx;
  const commands = (global.wabot && global.wabot.commands) || new Map();
  const replyMap = (global.wabot && global.wabot.replyMap) || new Map();
  const usersData = (global.wabot && global.wabot.db && global.wabot.db.usersData) || db.usersData;
  const threadsData = (global.wabot && global.wabot.db && global.wabot.db.threadsData) || db.threadsData;

  const body = (event.body || '').trim();

  // --- Command path -------------------------------------------------------
  if (body.startsWith(prefix)) {
    const withoutPrefix = body.slice(prefix.length).trim();
    if (!withoutPrefix) return;
    const parts = withoutPrefix.split(/\s+/);
    const name = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    const cmd = commands.get(name);

    if (!cmd) return; // unknown command — stay silent

    const role = cmd.config.role || 0;

    // Role check.
    if (role === 2 && !isBotAdmin(config, event.senderID)) {
      return message.reply('This command is for bot admins only.');
    }
    if (role === 1) {
      if (!event.isGroup) return message.reply('This command only works in groups.');
      if (!(await isGroupAdmin(sock, api, event))) {
        return message.reply('This command is for group admins only.');
      }
    }

    // Cooldown (config.countDown, seconds, per user).
    const countDown = Number(cmd.config.countDown) || 0;
    if (countDown > 0) {
      const cdKey = `${cmd.config.name}:${event.senderID}`;
      const last = cooldowns.get(cdKey) || 0;
      const remainingMs = last + countDown * 1000 - Date.now();
      if (remainingMs > 0) {
        return message.reply(`Slow down — wait ${Math.ceil(remainingMs / 1000)}s before using ${prefix}${cmd.config.name} again.`);
      }
      cooldowns.set(cdKey, Date.now());
    }

    try {
      await cmd.onStart({ api, event, args, message, threadsData, usersData, role, sock });
    } catch (err) {
      console.error(`[WABOT] Command "${cmd.config.name}" failed: ${err.stack || err.message}`);
      try {
        await message.reply('Something went wrong while running that command.');
      } catch (_) { /* ignore reply failure */ }
    }
    return;
  }

  // --- Reply path ---------------------------------------------------------
  // A message replying to a message a command registered in replyMap.
  if (event.messageReply && event.messageReply.messageID) {
    const entry = replyMap.get(event.messageReply.messageID);
    if (entry && entry.name) {
      const cmd = commands.get(String(entry.name).toLowerCase());
      if (cmd && typeof cmd.onReply === 'function') {
        // Only the user the reply was meant for (if recorded) may trigger it.
        if (entry.author && String(entry.author) !== String(event.senderID)) return;
        try {
          await cmd.onReply({
            api,
            event,
            args: body ? body.split(/\s+/) : [],
            message,
            Reply: entry
          });
        } catch (err) {
          console.error(`[WABOT] onReply of "${entry.name}" failed: ${err.stack || err.message}`);
        }
      }
    }
  }
}

module.exports = handlerMessage;
module.exports.translate = buildContextFallback;
module.exports.toBaileysContent = toBaileysContent;
