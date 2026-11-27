'use strict';
/**
 * core/sendGuard.js — rate-limit guard for ALL outbound sends.
 *
 * createGuardedSend(sock, config) returns an async send(jid, content,
 * options) that:
 *   - serialises every send through ONE queue (no bursts),
 *   - waits a human-like random delay before each send
 *     (config.sendDelayMs.min/max, plus up to +300ms jitter),
 *   - then calls sock.sendMessage(jid, content, options) and returns
 *     its result.
 *
 * This is the anti-ban guard (PLAN.md risk #5): bursts of messages,
 * especially to many people, trigger WhatsApp bans. Every send from the
 * bot should go through global.wabot.send, which is this guarded send.
 *
 * Exports createGuardedSend.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(config) {
  const cfg = (config && config.sendDelayMs) || {};
  const min = Number(cfg.min) || 800;
  const max = Number(cfg.max) || 1500;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const jitter = Math.random() * 300; // extra human-like wobble
  return lo + Math.random() * (hi - lo) + jitter;
}

function createGuardedSend(sock, config) {
  if (!sock || typeof sock.sendMessage !== 'function') {
    throw new Error('createGuardedSend requires a Baileys socket with sendMessage()');
  }

  // One promise chain = one queue. Each send waits for the previous one
  // (including its delay) before starting.
  let chain = Promise.resolve();
  let pending = 0;

  async function send(jid, content, options) {
    if (!jid || typeof jid !== 'string') {
      throw new Error('guarded send requires a JID string');
    }
    pending += 1;
    const task = chain.then(async () => {
      try {
        await sleep(randomDelayMs(config));
        return await sock.sendMessage(jid, content, options);
      } finally {
        pending -= 1;
      }
    });
    // Keep the chain alive even if one send rejects — a failed send must
    // not block every later send.
    chain = task.catch(() => {});
    return task;
  }

  send.pendingCount = () => pending;

  return send;
}

module.exports = { createGuardedSend };
