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
const qrcodePng = require('qrcode');
const path = require('path');
const fs = require('fs');
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

async function createSocket(state, config, events = {}, saveCreds) {
  const { onOpen, onClose, onLoggedOut, onQR } = events;

  // fetchLatestBaileysVersion() has no built-in timeout and fetches from
  // raw.githubusercontent.com — if that host is unreachable the fetch HANGS
  // and the socket is never created (seen on the VM 2026-11-27: GitHub raw
  // returns nothing while web.whatsapp.com works). Race it against a 10s
  // timeout so a hang becomes a fallback. The fallback MUST be a real
  // version array — NOT undefined: Baileys' getUserAgent reads
  // config.version[0..2] during reconnect validation, and undefined
  // crashes it ("Cannot read properties of undefined (reading '0')").
  // [2, 3000, 1043857760] is Baileys 6.7.24's bundled default
  // (lib/Defaults/baileys-version.json).
  const BUNDLED_VERSION = [2, 3000, 1043857760];
  let version;
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('version fetch timed out after 10s')), 10_000)
    );
    ({ version } = await Promise.race([fetchLatestBaileysVersion(), timeout]));
    if (!Array.isArray(version) || version.length < 3) throw new Error('bad version from fetch');
  } catch (err) {
    console.warn(`[WABOT] Could not fetch latest Baileys version (${err.message}) — using bundled ${JSON.stringify(BUNDLED_VERSION)}.`);
    version = BUNDLED_VERSION;
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

  // Persist credential updates. saveCreds comes from useMultiFileAuthState
  // as a SEPARATE return value — it is NOT a property of `state`
  // (state is only { creds, keys }). Wiring state.saveCreds (undefined)
  // throws "listener must be of type function".
  if (typeof saveCreds === 'function') {
    sock.ev.on('creds.update', saveCreds);
  } else {
    console.error('[WABOT] WARNING: saveCreds is not a function — credential updates will NOT be persisted. The session will not survive a restart.');
  }

  // Pairing code flow: DISABLED (2026-11-27). Requesting a pairing code
  // in parallel with a QR login corrupts the session: Baileys sends a
  // link_code_companion_reg for the same number AFTER the QR login
  // succeeds, and WhatsApp then invalidates the session (401 within
  // ~2 min). QR and pairing code are mutually exclusive login methods —
  // this bot uses QR only. Pairing code can be re-enabled by setting
  // config.pairingNumber AND removing this guard.
  const pairingNumber = '';
  if (false && pairingNumber && !state.creds.registered) {
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
      // Save the QR as a PNG image too (for sending to the operator).
      // Overwritten on every new QR so the file is always the current one.
      // QR codes expire quickly — scan promptly.
      try {
        const qrPath = path.join(__dirname, '..', '..', 'data', 'qr.png');
        fs.mkdirSync(path.dirname(qrPath), { recursive: true });
        qrcodePng.toFile(qrPath, qr, { width: 512, margin: 2 }, (err) => {
          if (err) console.error(`[WABOT] Could not save QR PNG: ${err.message}`);
          else console.log(`[WABOT] QR PNG saved: ${qrPath} — scan it promptly, it expires fast.`);
        });
      } catch (err) {
        console.error(`[WABOT] Could not save QR PNG: ${err.message}`);
      }
      if (typeof onQR === 'function') onQR(qr);
    }

    if (connection === 'open') {
      const jid = sock.user && sock.user.id ? sock.user.id : 'unknown';
      console.log(`[WABOT] Connection open — logged in as ${jid}.`);
      // FIX (2026-11-27): Baileys does NOT always set creds.registered=true
      // after a QR login — it can emit 'open' while registered stays false.
      // A false registered flag makes every reconnect request a NEW pairing
      // code and lets WhatsApp invalidate the session (401). So mark the
      // session registered HERE and persist it immediately.
      try {
        if (state && state.creds && state.creds.registered !== true) {
          state.creds.registered = true;
          if (typeof saveCreds === 'function') {
            saveCreds().catch((e) => console.error(`[WABOT] Could not persist registered flag: ${e.message}`));
          }
          console.log('[WABOT] Session marked registered and persisted.');
        }
      } catch (e) {
        console.error(`[WABOT] Could not mark session registered: ${e.message}`);
      }
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
