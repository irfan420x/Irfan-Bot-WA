'use strict';
/**
 * WABOT.js — core entry point for the WhatsApp bot.
 *
 * Boots the pieces in order:
 *   1. load config.json
 *   2. connect the database (MongoDB, or in-memory fallback with a warning)
 *   3. load commands via core/loader.js
 *   4. load Baileys auth state and create the socket via core/connection/connect.js
 *   5. attach event handlers and expose everything on global.wabot
 *
 * IMPORTANT: requiring this file must NOT auto-connect. Nothing happens
 * until start() is called, so tests can require it safely.
 * index.js (the supervisor) calls start().
 */

const fs = require('fs');
const path = require('path');

const db = require('./core/database/db');
const loader = require('./core/loader');
const { getAuthState, clearAuthState } = require('./core/connection/auth');
const { createSocket } = require('./core/connection/connect');
const { attachHandlers } = require('./core/handler/handlerEvents');
const { createGuardedSend } = require('./core/sendGuard');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Reconnect tuning (in-process; the supervisor restarts the whole process
// after repeated failures).
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 5_000;
const RECONNECT_MAX_DELAY_MS = 60_000;

let started = false;
let sock = null;
let reconnectAttempts = 0;
let reconnectTimer = null;

function makeLogger() {
  const prefix = '[WABOT]';
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args)
  };
}

function loadConfig() {
  let raw;
  try {
    raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `Cannot read ${CONFIG_PATH} (${err.code}). Copy config.example.json to config.json and fill it in.`
    );
  }
  const config = JSON.parse(raw);
  // Defaults so a minimal config.json still works.
  config.prefix = config.prefix || '.';
  config.nickNameBot = config.nickNameBot || 'WABOT';
  config.owner = String(config.owner || '0000000000');
  config.adminBot = Array.isArray(config.adminBot) ? config.adminBot.map(String) : [];
  config.sendDelayMs = config.sendDelayMs || { min: 800, max: 1500 };
  config.selfListen = Boolean(config.selfListen);
  config.pairingNumber = config.pairingNumber ? String(config.pairingNumber) : '';
  config.database = config.database || { type: 'mongodb', uri: '', dbName: 'whatsapp' };
  return config;
}

function reconnectDelayMs(attempt) {
  return Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
}

async function start() {
  if (started) {
    throw new Error('WABOT.start() called twice — the bot is already running.');
  }
  started = true;

  const logger = makeLogger();
  const config = loadConfig();
  logger.info(`Starting ${config.nickNameBot} (prefix "${config.prefix}")...`);

  // 1. Database (MongoDB, or in-memory fallback with a loud warning).
  await db.init(config);
  const { usersData, threadsData } = db;

  // 2. Commands.
  const { commands, failed } = loader.loadCommands();
  logger.info(`Loaded ${commands.size} command(s).`);
  for (const f of failed) {
    logger.warn(`Command failed to load: ${f.file} — ${f.error}`);
  }

  // 3. Global bot object (shared contract — see PLAN.md).
  const wabot = {
    sock: null,
    config,
    commands,
    replyMap: new Map(), // messageID -> { name, author, data } for onReply
    db: { usersData, threadsData },
    // Replaced with the real guarded send once the socket opens.
    send: async () => {
      logger.warn('send() called before the socket is open — message dropped.');
      return null;
    },
    logger
  };
  global.wabot = wabot;

  // 4. Auth state + socket, with reconnect handling.
  const { state, saveCreds } = await getAuthState();

  async function connectOnce() {
    const socket = await createSocket(state, config, {
      onOpen: (openedSock) => {
        sock = openedSock;
        wabot.sock = openedSock;
        reconnectAttempts = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        wabot.send = createGuardedSend(openedSock, config);
        attachHandlers(openedSock);
        logger.info('Connected to WhatsApp. Bot is online.');
      },
      onClose: (reason, shouldReconnect) => {
        logger.warn(`Connection closed (${reason}). shouldReconnect=${shouldReconnect}`);
        if (sock) {
          try { sock.ev.removeAllListeners('messages.upsert'); } catch (_) { /* ignore */ }
          sock = null;
          wabot.sock = null;
        }
        if (!shouldReconnect) return; // e.g. clean shutdown
        scheduleReconnect();
      },
      onLoggedOut: async () => {
        logger.error('Session logged out (401). Clearing auth state — a fresh QR scan will be needed.');
        await clearAuthState();
        logger.error('Auth state cleared. Restarting so a new QR code is printed...');
        // Exit so the supervisor restarts us and prints a fresh QR.
        process.exit(1);
      }
    });
    return socket;
  }

  function scheduleReconnect() {
    if (reconnectTimer) return; // already scheduled
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error(
        `${MAX_RECONNECT_ATTEMPTS} reconnect attempts failed — exiting so the supervisor restarts the process.`
      );
      process.exit(1);
      return;
    }
    const delay = reconnectDelayMs(reconnectAttempts);
    reconnectAttempts += 1;
    logger.info(`Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectOnce().catch((err) => {
        logger.error(`Reconnect failed: ${err.message}`);
        scheduleReconnect();
      });
    }, delay);
  }

  sock = await connectOnce();

  // Graceful shutdown: close the socket, then exit.
  const shutdown = async (signal) => {
    logger.info(`Received ${signal} — closing socket...`);
    try {
      if (sock) sock.end(undefined);
    } catch (_) { /* ignore */ }
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return wabot;
}

function getWabot() {
  return global.wabot || null;
}

module.exports = { start, getWabot };
