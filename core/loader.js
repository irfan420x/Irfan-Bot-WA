'use strict';
/**
 * core/loader.js — command loader.
 *
 * Recursively loads every *.js file under scripts/cmds/ (skipping files
 * whose basename starts with "_", e.g. _wa.js, _orionApi.js — those are
 * helpers, not commands). Each command module must export:
 *
 *   { config: { name, aliases, version, role, countDown, description,
 *               category, guide },
 *     onStart: async ({ api, event, args, message, threadsData,
 *                       usersData, role, sock }) => {},
 *     onReply?: async ({ api, event, args, message, Reply }) => {} }
 *
 * Commands are registered in a single Map by name AND by alias, so the
 * handler can look either up directly.
 *
 * Returns { commands: Map, failed: [{ file, error }] }.
 * A bad file never kills the whole load — it lands in `failed`.
 */

const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'scripts', 'cmds');

function collectCommandFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out; // no commands dir yet — not fatal
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectCommandFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.startsWith('_')) {
      out.push(full);
    }
  }
  return out;
}

function validateCommand(mod, file) {
  if (!mod || typeof mod !== 'object') {
    throw new Error('module.exports must be an object');
  }
  if (!mod.config || typeof mod.config.name !== 'string' || mod.config.name.trim() === '') {
    throw new Error('missing config.name (string)');
  }
  if (typeof mod.onStart !== 'function') {
    throw new Error('missing onStart (function)');
  }
  if (mod.config.aliases !== undefined && !Array.isArray(mod.config.aliases)) {
    throw new Error('config.aliases must be an array');
  }
  if (mod.onReply !== undefined && typeof mod.onReply !== 'function') {
    throw new Error('onReply must be a function');
  }
}

function loadCommands(commandsDir = COMMANDS_DIR) {
  const commands = new Map();
  const failed = [];

  for (const file of collectCommandFiles(commandsDir)) {
    const rel = path.relative(path.join(__dirname, '..'), file);
    try {
      // Fresh require each time so a reload picks up edited files.
      delete require.cache[require.resolve(file)];
      const mod = require(file);
      validateCommand(mod, file);

      const name = mod.config.name.trim().toLowerCase();
      if (commands.has(name)) {
        throw new Error(`duplicate command name "${name}" (already registered)`);
      }
      commands.set(name, mod);

      const aliases = (mod.config.aliases || []).map((a) => String(a).trim().toLowerCase());
      for (const alias of aliases) {
        if (!alias) continue;
        if (commands.has(alias)) {
          throw new Error(`alias "${alias}" of "${name}" collides with an existing command/alias`);
        }
        commands.set(alias, mod);
      }
    } catch (err) {
      failed.push({ file: rel, error: err.message });
    }
  }

  return { commands, failed };
}

module.exports = { loadCommands, COMMANDS_DIR };
