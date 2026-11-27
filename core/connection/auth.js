'use strict';
/**
 * core/connection/auth.js — Baileys auth-state save/load.
 *
 * Auth state lives in data/auth/ (creds.json + key files) via
 * useMultiFileAuthState — the WhatsApp equivalent of the Messenger bot's
 * fbstate.json. NEVER commit data/ (see .gitignore).
 *
 * Credential contents are NEVER logged.
 */

const fs = require('fs');
const path = require('path');
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');

const AUTH_DIR = path.join(__dirname, '..', '..', 'data', 'auth');

/**
 * Load (or create) the auth state.
 * @returns {Promise<{ state, saveCreds }>} — state for makeWASocket,
 *   saveCreds to persist credential updates (wire it to 'creds.update').
 */
async function getAuthState() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  return { state, saveCreds, authDir: AUTH_DIR };
}

/**
 * Wipe the auth state (used when WhatsApp reports the session logged out).
 * The next start prints a fresh QR code.
 */
async function clearAuthState() {
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch (err) {
    console.error(`[WABOT] Failed to clear auth state in ${AUTH_DIR}: ${err.message}`);
    throw err;
  }
}

module.exports = { getAuthState, clearAuthState, AUTH_DIR };
