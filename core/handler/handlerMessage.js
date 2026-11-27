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
const { createGetLang, DEFAULT_LANG } = require('../languages/makeFuncGetLangs');

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

// ---------------------------------------------------------------------------
// Smart feedback helpers (typing presence, read receipts, reactions).
// Every helper is best-effort: it never throws, so a Baileys hiccup can
// never break the command it decorates.
// ---------------------------------------------------------------------------

// Commands that already react to the triggering message themselves (found
// by grepping all command files for message.react / .react(). The handler
// must NOT overwrite their completion emoji with its own ✅/❌.
// Names + aliases, lower-cased — the handler checks both the typed token
// and cmd.config.name against this set.
const SELF_REACT_COMMANDS = new Set([
  'irfan',
  'gemini', 'ai', 'chat',
  'gpt', 'chatgpt', 'gpt5',
  'deepseek', 'ds',
  'tart', 'tensorart',
  'imagen3',
  'fluxproultra', 'fpu',
  'lumin',
  'imgur'
]);

// Typing presence: 'composing' while a command runs, 'paused' when done.
// Verified to exist in Baileys 6.7.24 (lib/Socket/chats.js).
async function setPresence(sock, type, jid) {
  try {
    if (sock && typeof sock.sendPresenceUpdate === 'function') {
      await sock.sendPresenceUpdate(type, jid);
    }
  } catch (_) { /* presence is cosmetic — never break the command */ }
}

// Blue ticks: mark the triggering message as read.
// Verified to exist in Baileys 6.7.24 (lib/Socket/messages-send.js).
async function markRead(sock, key) {
  try {
    if (sock && typeof sock.readMessages === 'function' && key) {
      await sock.readMessages([key]);
    }
  } catch (_) { /* read receipt is cosmetic — never break the command */ }
}

// Reaction on the triggering message ('' removes it).
async function setReaction(message, emoji) {
  try {
    if (message && typeof message.react === 'function') {
      await message.react(emoji);
    }
  } catch (_) { /* reaction is cosmetic — never break the command */ }
}

// ---------------------------------------------------------------------------
// Never-stay-silent helpers (user complaint 2026-11-27 18:18 SGT: the bot
// stayed silent on a bare prefix, on unknown/typo'd commands, on command
// errors in reply-flows, and on group commands typed in a DM).
// ---------------------------------------------------------------------------

// Classic Levenshtein distance (small strings only — command names).
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

// Best "did you mean" match over command names + aliases, or null.
// Accepts distance <= 2, or a shared prefix of >= 3 chars (covers
// truncations like ".balanc" -> ".balance").
function suggestCommand(commands, typed) {
  let best = null, bestDist = Infinity;
  for (const cmd of commands.values()) {
    const names = [cmd.config.name, ...(cmd.config.aliases || [])]
      .filter(Boolean).map((s) => String(s).toLowerCase());
    for (const candidate of names) {
      const dist = levenshtein(typed, candidate);
      const prefixHit = typed.length >= 3 && candidate.length >= 3
        && (candidate.startsWith(typed) || typed.startsWith(candidate));
      if (prefixHit && dist < 3) {
        if (dist < bestDist) { best = candidate; bestDist = dist; }
      } else if (dist <= 2 && dist < bestDist) {
        best = candidate; bestDist = dist;
      }
    }
  }
  return best;
}

function isBotAdmin(config, senderID) {
  const admins = (config.adminBot || []).map(String);
  return admins.includes(String(senderID)) || String(config.owner) === String(senderID);
}

// ---------------------------------------------------------------------------
// Silent-failure guards.
// A reply the handler itself sends must never throw out of the handler:
// if the send fails, log it and move on (the user simply gets nothing,
// but the bot stays alive and the next message still works).
// ---------------------------------------------------------------------------
async function safeReply(message, text) {
  try {
    if (message && typeof message.reply === 'function') await message.reply(text);
  } catch (err) {
    console.warn(`[WABOT] handler reply failed: ${err.message}`);
  }
}

// Damerau-Levenshtein edit distance (small strings only — command names).
// An adjacent transposition costs 1, not 2, because swapping two letters
// is the most common typo (".slto" -> ".slots" is one transposition, while
// plain Levenshtein scores it 2 — the same as ".slto" -> ".set" — and the
// wrong suggestion wins the tie).
function editDistance(a, b) {
  const m = a.length, n = b.length;
  const d = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

function commonPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// Closest command for a mistyped token, or null. Only suggests when the
// token is at least 3 chars and within edit distance 2 of a real command
// name/alias; ties break toward the longer shared prefix. The suggestion
// is the command's canonical name, so the user can copy-paste it.
function findClosestCommand(commands, typed) {
  if (!typed || typed.length < 3) return null;
  let best = null, bestDist = Infinity, bestPrefix = -1;
  for (const [key, cmd] of commands) {
    const d = editDistance(typed, key);
    if (d > 2) continue;
    const p = commonPrefixLen(typed, key);
    if (d < bestDist || (d === bestDist && p > bestPrefix)) {
      bestDist = d; bestPrefix = p; best = cmd;
    }
  }
  if (!best || !best.config || !best.config.name) return null;
  return String(best.config.name).toLowerCase();
}

async function isGroupAdmin(sock, api, event) {
  try {
    const info = await api.getThreadInfo(event.threadIDFull || event.threadID);
    // groupMetadata may list admins by LID while event.senderID is the
    // phone number (or vice versa) — accept either.
    const ids = [String(event.senderID), event.senderLid ? String(event.senderLid) : null].filter(Boolean);
    return (info.adminIDs || []).some((id) => ids.includes(String(id)));
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

  // Per-thread language (default 'en'). Attached to the event so commands can use event.getLang(path, ...args).
  let threadLang = DEFAULT_LANG || 'en';
  try {
    const thread = await threadsData.get(event.threadID);
    const saved = thread && thread.settings && thread.settings.language;
    if (saved === 'en' || saved === 'bn') threadLang = saved;
  } catch (_) { /* keep default */ }
  event.language = threadLang;
  event.getLang = createGetLang(threadLang);

  const body = (event.body || '').trim();

  // --- Command path -------------------------------------------------------
  if (body.startsWith(prefix)) {
    const withoutPrefix = body.slice(prefix.length).trim();
    if (!withoutPrefix) {
      // Prefix alone ("." / ".   "): hint at .help instead of staying silent.
      const botName = config.nickNameBot || 'WABOT';
      await safeReply(message, event.getLang('wabot.prefixHint', botName, prefix));
      return;
    }
    const parts = withoutPrefix.split(/\s+/);
    const name = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    const cmd = commands.get(name);

    if (!cmd) {
      // Unknown command: say so, and suggest the closest real command when
      // the typo is close (".slto" -> ".slots"). Plain chatter without the
      // prefix still gets no reply — only prefixed text is answered.
      const suggestion = findClosestCommand(commands, name);
      let text = event.getLang('wabot.unknownCommand', name, prefix);
      if (suggestion) text += event.getLang('wabot.didYouMean', prefix + suggestion);
      await safeReply(message, text);
      return;
    }

    // Read receipt: the bot acts on every known command (even one it then
    // rejects with a denial reply), so mark it read. Status/broadcast and
    // protocol-only messages were already filtered out above, and own
    // messages (unless selfListen) too — so this only ever marks real
    // incoming messages the bot responds to.
    await markRead(sock, msg.key);

    const role = cmd.config.role || 0;

    // Role check.
    if (role === 2 && !isBotAdmin(config, event.senderID)) {
      await safeReply(message, event.getLang('wabot.onlyBotAdmin'));
      return;
    }
    if (role === 1) {
      if (!event.isGroup) {
        await safeReply(message, event.getLang('wabot.onlyGroup'));
        return;
      }
      if (!(await isGroupAdmin(sock, api, event))) {
        await safeReply(message, event.getLang('wabot.onlyGroupAdmin'));
        return;
      }
    }

    // Cooldown (config.countDown, seconds, per user).
    const countDown = Number(cmd.config.countDown) || 0;
    if (countDown > 0) {
      const cdKey = `${cmd.config.name}:${event.senderID}`;
      const last = cooldowns.get(cdKey) || 0;
      const remainingMs = last + countDown * 1000 - Date.now();
      if (remainingMs > 0) {
        await safeReply(message, event.getLang('wabot.cooldown', String(Math.ceil(remainingMs / 1000)), prefix + cmd.config.name));
        return;
      }
      cooldowns.set(cdKey, Date.now());
    }

    // Save the sender's WhatsApp display name (push name) into their user
    // record so commands that show user info (.bal, .info) display the real
    // name instead of the "User" fallback. Best-effort: only write when the
    // stored name is missing or different, and never block the command.
    if (event.senderName) {
      try {
        const senderData = (await usersData.get(event.senderID)) || {};
        if (senderData.name !== event.senderName) {
          senderData.name = event.senderName;
          await usersData.set(event.senderID, senderData);
        }
      } catch (_) { /* name save is best-effort */ }
    }

    // Smart feedback starts ONLY here — after the role and cooldown checks
    // have passed. A rejected command therefore never shows typing and
    // never leaves a stale ⏳ behind (no reaction to clean up).
    const selfReacts = SELF_REACT_COMMANDS.has(name)
      || SELF_REACT_COMMANDS.has(String(cmd.config.name || '').toLowerCase());
    await setPresence(sock, 'composing', event.threadIDFull);
    await setReaction(message, '⏳');
    let succeeded = false;
    try {
      await cmd.onStart({ api, event, args, message, threadsData, usersData, role, sock });
      succeeded = true;
    } catch (err) {
      console.error(`[WABOT] Command "${cmd.config.name}" failed: ${err.stack || err.message}`);
      await safeReply(message, event.getLang('wabot.commandError'));
    } finally {
      // Completion reaction first (skipped for commands that react
      // themselves, so their emoji is never overwritten), then typing off.
      // 'paused' is sent on success AND error.
      if (!selfReacts) await setReaction(message, succeeded ? '✅' : '❌');
      await setPresence(sock, 'paused', event.threadIDFull);
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
        await markRead(sock, msg.key);
        const selfReacts = SELF_REACT_COMMANDS.has(String(entry.name).toLowerCase());
        await setPresence(sock, 'composing', event.threadIDFull);
        await setReaction(message, '⏳');
        let succeeded = false;
        try {
          await cmd.onReply({
            api,
            event,
            args: body ? body.split(/\s+/) : [],
            message,
            Reply: entry
          });
          succeeded = true;
        } catch (err) {
          console.error(`[WABOT] onReply of "${entry.name}" failed: ${err.stack || err.message}`);
          await safeReply(message, event.getLang('wabot.replyError'));
        } finally {
          if (!selfReacts) await setReaction(message, succeeded ? '✅' : '❌');
          await setPresence(sock, 'paused', event.threadIDFull);
        }
      }
    }
  }
}

module.exports = handlerMessage;
module.exports.translate = buildContextFallback;
module.exports.toBaileysContent = toBaileysContent;
