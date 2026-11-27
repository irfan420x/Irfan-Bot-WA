'use strict';
/**
 * core/connection/connect.js — creates the Baileys socket.
 *
 * - Auth from core/connection/auth.js (useMultiFileAuthState).
 * - Prints the login QR in the terminal via qrcode-terminal.
 * - Pairing code: if config.pairingNumber is set (digits, with country
 *   code, e.g. "6591234567"), requests a pairing code instead of a QR.
 * - Handles connection.update: open / close / reconnect signals.
 *   On logged-out (401) it calls events.onLoggedOut() — the caller clears
 *   auth state and restarts so a fresh QR is printed. It NEVER crash-loops
 *   by itself: reconnect decisions are handed to the caller via
 *   events.onClose(reason, shouldReconnect).
 *
 * Exports createSocket(state, config, events).
 *   events: { onOpen(sock), onClose(reason, shouldReconnect),
 *             onLoggedOut(), onQR(qr) }
 */

const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

// Minimal pino-compatible logger for Baileys: keep Baileys' own chatter
// quiet (warn/error only) so the terminal stays readable. Set
// WABOT_DEBUG=1 to see Baileys info logs too.
function makeBaileysLogger() {
  const debug = process.env.WABOT_DEBUG === '1';
  const base = {
    level: debug ? 'info' : 'warn',
    info: (...args) => { if (debug) console.log('[BAILEYS]', ...args); },
    debug: (...args) => { if (debug) console.log('[BAILEYS]', ...args); },
    trace: () => {},
    warn: (...args) => console.warn('[BAILEYS]', ...args),
    error: (...args) => console.error('[BAILEYS]', ...args),
    fatal: (...args) => console.error('[BAILEYS]', ...args),
    child: () => base
  };
  return base;
}

/** Extract the HTTP-ish status code from a Baileys disconnect error (a Boom). */
function disconnectStatusCode(err) {
  if (!err) return null;
  if (err.output && typeof err.output.statusCode === 'number') return err.output.statusCode;
  if (err.statusCode) return err.statusCode;
  return null;
}

async function createSocket(state, config, events = {}) {
  const { onOpen, onClose, onLoggedOut, onQR } = events;

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (err) {
    console.warn(`[WABOT] Could not fetch latest Baileys version (${err.message}) — using bundled default.`);
    version = undefined;
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger: makeBaileysLogger(),
    printQRInTerminal: false, // we print the QR ourselves (below)
    browser: ['WABOT', 'Chrome', '1.0'],
    markOnlineOnConnect: true,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    defaultQueryTimeoutMs: 60_000,
    // Needed so Baileys can retry failed message decryption.
    getMessage: async () => undefined
  });

  // Persist credential updates.
  sock.ev.on('creds.update', state.saveCreds);

  // Pairing code flow: only when the session is not registered yet and the
  // operator asked for it. Runs async — the QR flow is the fallback.
  const pairingNumber = (config.pairingNumber || '').replace(/\D/g, '');
  if (pairingNumber && !state.creds.registered) {
    // Small delay: requestPairingCode right at socket creation can race
    // the underlying connection setup.
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(pairingNumber);
        console.log('');
        console.log('[WABOT] ========================================================');
        console.log(`[WABOT] Pairing code for +${pairingNumber}: ${code}`);
        console.log('[WABOT] On the phone: WhatsApp > Linked devices > Link a device');
        console.log('[WABOT] > "Link with phone number instead" > enter this code.');
        console.log('[WABOT] ========================================================');
        console.log('');
      } catch (err) {
        console.error(`[WABOT] Pairing code request failed: ${err.message}`);
        console.error('[WABOT] Falling back to QR login — scan the QR printed below.');
      }
    }, 3000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('');
      console.log('[WABOT] Scan this QR code with WhatsApp (Linked devices):');
      qrcode.generate(qr, { small: true });
      console.log('');
      if (typeof onQR === 'function') onQR(qr);
    }

    if (connection === 'open') {
      const jid = sock.user && sock.user.id ? sock.user.id : 'unknown';
      console.log(`[WABOT] Connection open — logged in as ${jid}.`);
      if (typeof onOpen === 'function') onOpen(sock);
      return;
    }

    if (connection === 'close') {
      const statusCode = disconnectStatusCode(lastDisconnect && lastDisconnect.error);
      const reasonName = Object.keys(DisconnectReason).find(
        (k) => DisconnectReason[k] === statusCode
      );

      if (statusCode === DisconnectReason.loggedOut) {
        console.error('[WABOT] Logged out (401) — session is dead. A fresh QR scan is required.');
        if (typeof onLoggedOut === 'function') onLoggedOut();
        return;
      }

      // Everything else is treated as transient: the caller decides the
      // backoff and re-creates the socket. Known transient reasons:
      // 408 timeout, 428 connection replaced, 515 restart required,
      // 503 service unavailable, plus plain network drops (no code).
      const reason = reasonName
        ? `${reasonName} (${statusCode})`
        : (statusCode ? `status ${statusCode}` : 'network drop / unknown');
      console.warn(`[WABOT] Connection closed: ${reason}.`);
      if (typeof onClose === 'function') onClose(reason, true);
    }
  });

  return sock;
}

module.exports = { createSocket };
