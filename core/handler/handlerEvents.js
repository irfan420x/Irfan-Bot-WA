'use strict';
/**
 * core/handler/handlerEvents.js — wires Baileys socket events to the
 * dispatcher.
 *
 *   messages.upsert            -> core/handler/handlerMessage.js
 *   group-participants.update  -> scripts/events/groupUpdate.js
 *                                + scripts/events/welcome.js
 *   connection.update          -> owned by core/connection/connect.js
 *                                (NOT attached here — one owner only)
 *   creds.update               -> owned by core/connection/connect.js
 *
 * Event files (groupUpdate.js / welcome.js) are loaded lazily: they may
 * not exist yet, or may export their handler as a bare function, as
 * .onUpdate/.handle, or as .onGroupParticipantsUpdate. A missing or
 * unusable event file only logs a warning — it never kills the bot.
 *
 * Exports attachHandlers(sock).
 */

const path = require('path');
const handlerMessage = require('./handlerMessage');

const EVENTS_DIR = path.join(__dirname, '..', '..', 'scripts', 'events');

function loadEventModule(fileName) {
  try {
    const mod = require(path.join(EVENTS_DIR, fileName));
    if (typeof mod === 'function') return mod;
    if (mod && typeof mod.handle === 'function') return mod.handle;
    if (mod && typeof mod.onUpdate === 'function') return mod.onUpdate;
    if (mod && typeof mod.onGroupParticipantsUpdate === 'function') {
      return mod.onGroupParticipantsUpdate;
    }
    console.warn(`[WABOT] Event file ${fileName} has no callable export — skipping.`);
    return null;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.warn(`[WABOT] Event file ${fileName} not found — skipping.`);
    } else {
      console.warn(`[WABOT] Failed to load event file ${fileName}: ${err.message}`);
    }
    return null;
  }
}

function attachHandlers(sock) {
  if (!sock || !sock.ev || typeof sock.ev.on !== 'function') {
    throw new Error('attachHandlers requires a Baileys socket with .ev.on');
  }

  // --- Incoming messages -------------------------------------------------
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // 'notify' = new live message. 'append' is history sync — ignore it.
    if (type !== 'notify') return;
    for (const msg of messages || []) {
      try {
        await handlerMessage(sock, msg);
      } catch (err) {
        console.error(`[WABOT] handlerMessage failed for ${msg && msg.key && msg.key.id}: ${err.message}`);
      }
    }
  });

  // --- Group membership changes ------------------------------------------
  sock.ev.on('group-participants.update', async (update) => {
    const ctx = { sock, wabot: global.wabot || null, update };
    const groupUpdate = loadEventModule('groupUpdate.js');
    if (groupUpdate) {
      try {
        await groupUpdate(update, ctx);
      } catch (err) {
        console.error(`[WABOT] groupUpdate failed: ${err.message}`);
      }
    }
    const welcome = loadEventModule('welcome.js');
    if (welcome) {
      try {
        await welcome(update, ctx);
      } catch (err) {
        console.error(`[WABOT] welcome failed: ${err.message}`);
      }
    }
  });

  // NOTE: connection.update and creds.update are owned by
  // core/connection/connect.js — do not attach them here.
}

module.exports = { attachHandlers };
