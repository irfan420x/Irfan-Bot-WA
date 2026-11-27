'use strict';
/**
 * index.js — supervisor for WABOT.js.
 *
 * Spawns `node WABOT.js` as a child process and restarts it on ANY exit
 * code, with exponential backoff (5s -> 5min cap) and a crash-loop guard:
 * 5 crashes within 10 minutes stops restarting and prints a loud banner.
 * A healthy run of >= 5 minutes resets the crash counter and the backoff.
 *
 * Run: `node index.js` (or `npm start`).
 */

const { spawn } = require('child_process');
const path = require('path');

const CHILD_PATH = path.join(__dirname, 'WABOT.js');

// Backoff / crash-loop tuning.
const INITIAL_BACKOFF_MS = 5_000; // 5s
const MAX_BACKOFF_MS = 5 * 60_000; // 5min cap
const HEALTHY_RUN_MS = 5 * 60_000; // >= 5 min counts as healthy
const CRASH_WINDOW_MS = 10 * 60_000; // 10 min window
const MAX_CRASHES_IN_WINDOW = 5;

let backoffMs = INITIAL_BACKOFF_MS;
let crashTimestamps = []; // epoch ms of each unhealthy exit
let shuttingDown = false;

function log(msg) {
  console.log(`[SUPERVISOR] ${new Date().toISOString()} ${msg}`);
}

function crashLoopBanner() {
  console.error('');
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('!!! WABOT CRASH-LOOP GUARD TRIPPED                            !!!');
  console.error(`!!! ${MAX_CRASHES_IN_WINDOW} crashes within ${CRASH_WINDOW_MS / 60000} minutes — STOPPING restarts. !!!`);
  console.error('!!! Check the logs above, fix the problem, then start the bot  !!!');
  console.error('!!! again manually with:  node index.js                       !!!');
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('');
}

function spawnBot() {
  if (shuttingDown) return;

  log(`Starting WABOT.js (backoff ${backoffMs / 1000}s, crashes in window: ${crashTimestamps.length})`);
  const startedAt = Date.now();
  const child = spawn(process.execPath, [CHILD_PATH], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env }
  });

  child.on('error', (err) => {
    console.error(`[SUPERVISOR] Failed to spawn child: ${err.message}`);
    scheduleRestart(Date.now() - startedAt);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const uptimeMs = Date.now() - startedAt;
    log(`WABOT.js exited (code=${code}, signal=${signal || 'none'}, uptime=${Math.round(uptimeMs / 1000)}s)`);
    scheduleRestart(uptimeMs);
  });
}

function scheduleRestart(uptimeMs) {
  if (shuttingDown) return;

  if (uptimeMs >= HEALTHY_RUN_MS) {
    // Healthy run: reset everything.
    if (crashTimestamps.length > 0 || backoffMs !== INITIAL_BACKOFF_MS) {
      log(`Healthy run (>= ${HEALTHY_RUN_MS / 60000} min) — resetting crash counter and backoff.`);
    }
    crashTimestamps = [];
    backoffMs = INITIAL_BACKOFF_MS;
  } else {
    // Unhealthy exit: record the crash, prune old ones, check the guard.
    const now = Date.now();
    crashTimestamps.push(now);
    crashTimestamps = crashTimestamps.filter((t) => now - t <= CRASH_WINDOW_MS);

    if (crashTimestamps.length >= MAX_CRASHES_IN_WINDOW) {
      crashLoopBanner();
      process.exit(1);
      return;
    }

    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }

  log(`Restarting in ${backoffMs / 1000}s...`);
  setTimeout(spawnBot, backoffMs);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal} — supervisor stopping (child will be terminated).`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log('WABOT supervisor started.');
log(`Crash-loop guard: ${MAX_CRASHES_IN_WINDOW} crashes in ${CRASH_WINDOW_MS / 60000} min stops restarts.`);
spawnBot();
