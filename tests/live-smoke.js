'use strict';
/**
 * tests/live-smoke.js — Phase 0 proof script.
 *
 * NO live connection. This script only loads modules — it NEVER calls
 * WABOT.start() and never attempts any network connection. It:
 *   1. requires WABOT.js (must load without connecting) and checks it
 *      exports start(),
 *   2. requires the core modules,
 *   3. finds every command module by scanning scripts/cmds/ and requires
 *      each one, validating the shared command shape
 *      ({ config: { name, role, ... }, onStart: function }),
 *   4. prints the checklist of manual Phase 0 steps.
 *
 * Exit 0 with a clear "MANUAL STEPS REQUIRED — no number configured"
 * message when everything loads. Exit 1 listing what is missing or
 * failed to load, so the coordinator knows the build is incomplete.
 *
 * Run: node tests/live-smoke.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const failures = [];
const loadedCommands = [];

function tryRequire(label, relPath) {
  try {
    const mod = require(path.join(root, relPath));
    console.log(`OK: ${label} loads (${relPath})`);
    return mod;
  } catch (err) {
    console.log(`MISSING/FAIL: ${label} (${relPath}) — ${err.message}`);
    failures.push(`${label} (${relPath}): ${err.message}`);
    return null;
  }
}

function scanCommands(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanCommands(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
}

console.log('live-smoke.js — Phase 0 proof (load-only, no connection)\n');

// 1. WABOT.js must load without connecting.
const wabot = tryRequire('WABOT.js', 'WABOT.js');
if (wabot) {
  if (typeof wabot.start === 'function') {
    console.log('OK: WABOT.js exports start() (not called — no connection attempted)');
  } else {
    console.log('FAIL: WABOT.js does not export start()');
    failures.push('WABOT.js does not export start()');
  }
}

// 2. Core modules.
const coreModules = [
  ['core/connection/connect.js', 'core/connection/connect.js'],
  ['core/connection/auth.js', 'core/connection/auth.js'],
  ['core/handler/handlerEvents.js', 'core/handler/handlerEvents.js'],
  ['core/handler/handlerMessage.js', 'core/handler/handlerMessage.js'],
  ['core/database/db.js', 'core/database/db.js'],
];
for (const [label, rel] of coreModules) tryRequire(label, rel);

// 3. Command modules, found by scanning scripts/cmds/.
const cmdsDir = path.join(root, 'scripts', 'cmds');
const files = [];
scanCommands(cmdsDir, files);
console.log(`\nFound ${files.length} JS file(s) under scripts/cmds/.`);
for (const file of files) {
  const rel = path.relative(root, file);
  const base = path.basename(file);
  if (base.startsWith('_')) {
    // Shared helpers (_wa.js, _orionApi.js, _prayerTimes.js) — load only.
    tryRequire(`helper ${rel}`, rel);
    continue;
  }
  const mod = tryRequire(`command ${rel}`, rel);
  if (!mod) continue;
  const cfg = mod.config || {};
  const problems = [];
  if (!cfg.name) problems.push('config.name missing');
  if (typeof cfg.role !== 'number') problems.push('config.role missing/not a number');
  if (typeof mod.onStart !== 'function') problems.push('onStart missing/not a function');
  if (problems.length > 0) {
    console.log(`FAIL: command ${rel} — ${problems.join('; ')}`);
    failures.push(`command ${rel}: ${problems.join('; ')}`);
  } else {
    loadedCommands.push(cfg.name);
  }
}

console.log(`\nCommands loaded OK (${loadedCommands.length}): ${loadedCommands.join(', ') || '(none)'}`);

// 4. Manual Phase 0 checklist — these need a human and a spare number.
console.log('\n--- Phase 0 manual checklist (NOT automated, no number configured) ---');
console.log('[ ] 1. Spare number ready (NOT the main number — see docs/BAN-RISKS.md).');
console.log('[ ] 2. Run `node index.js` and scan the QR code from the spare phone');
console.log('      (WhatsApp -> Settings -> Linked Devices -> Link a Device),');
console.log('      or use the pairing-code alternative in docs/SETUP.md.');
console.log('[ ] 3. Send `.ping` to the bot in a DM — expect a `Pong` reply.');
console.log('[ ] 4. Send `.ping` in a test group the bot is in — expect a reply.');
console.log('[ ] 5. Send `.help` and `.info` — expect the command list and bot info.');
console.log('[ ] 6. Send one media message (photo) to the bot and have the bot');
console.log('      send one media message back (`.pinterest cat`) — media works both ways.');
console.log('[ ] 7. Restart the bot — it must reconnect from data/auth/ without a new QR scan.');
console.log('--- end of checklist ---\n');

if (failures.length > 0) {
  console.log(`live-smoke.js: ${failures.length} load failure(s) — build incomplete:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

console.log('MANUAL STEPS REQUIRED — no number configured.');
console.log('All modules load without connecting. Phase 0 needs a human with a spare');
console.log('number to run the checklist above. No network connection was attempted.');
process.exit(0);
