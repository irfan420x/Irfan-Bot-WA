"use strict";

/**
 * groupUpdate.js — handles `group-participants.update` for 'remove',
 * 'promote' and 'demote' (welcome for 'add' lives in welcome.js).
 *
 * - remove: short farewell. If the update's `author` is present and differs
 *   from the removed participant, they were removed by someone; otherwise
 *   they left on their own.
 * - promote / demote: short admin-change notice.
 *
 * All notices respect the per-group setting `settings.sendWelcome`
 * (default true) via threadsData — turning welcomes off also turns these
 * notices off. One message per batch event (all affected participants in
 * one message, mentions for all).
 *
 * Exported: { onGroupParticipantsUpdate }
 *
 * Accepts the Baileys update shape, either as
 *   onGroupParticipantsUpdate({ sock, update, threadsData, api })
 * or onGroupParticipantsUpdate(sock, update), where update is
 *   { id, participants: [jid, ...], action, author }.
 * Returns false (no-op) for any other action, and never throws.
 */

/** "123456@s.whatsapp.net" -> "123456"; "123456:12@s.whatsapp.net" -> "123456". */
function bareId(jid) {
  if (!jid) return "";
  return String(jid).split("@")[0].split(":")[0];
}

function groupJidOf(update) {
  if (!update) return null;
  if (update.id) return update.id;
  if (update.threadIDFull) return update.threadIDFull;
  if (update.threadID) return `${String(update.threadID).replace(/\D/g, "")}@g.us`;
  if (update.groupJid) return update.groupJid;
  return null;
}

/** Best-effort display name for a participant: api.getUserInfo, else the bare number. */
async function displayName(api, sock, jid) {
  const bare = bareId(jid);
  try {
    if (api && typeof api.getUserInfo === "function") {
      const info = await api.getUserInfo(bare);
      const name = info && (info.name || (info[bare] && info[bare].name));
      if (name) return name;
    }
  } catch {}
  try {
    if (sock && typeof sock.getName === "function") {
      const name = await sock.getName(jid);
      if (name && name !== jid) return name;
    }
  } catch {}
  return bare;
}

/** Send text into a group: guarded global.wabot.send first, sock fallback. */
async function sendGroupText(sock, groupJid, text, mentionJids) {
  const wabot = global.wabot || {};
  if (typeof wabot.send === "function") {
    try {
      await wabot.send(groupJid, { body: text, mentions: mentionJids });
      return true;
    } catch (e) {
      console.error("[groupUpdate] wabot.send failed, falling back to sock:", e.message);
    }
  }
  if (sock && typeof sock.sendMessage === "function") {
    await sock.sendMessage(groupJid, { text, mentions: mentionJids });
    return true;
  }
  return false;
}

async function onGroupParticipantsUpdate(input, maybeUpdate) {
  try {
    // Normalise the call shape: (ctx) with ctx.sock/ctx.update, or (sock, update).
    let sock = null;
    let update = null;
    let threadsData = null;
    let api = null;
    if (input && typeof input === "object" && (input.update || input.sock || input.threadsData)) {
      sock = input.sock || (global.wabot && global.wabot.sock) || null;
      update = input.update || input;
      threadsData = input.threadsData || (global.wabot && global.wabot.db && global.wabot.db.threadsData) || null;
      api = input.api || null;
    } else if (input && typeof input.sendMessage === "function") {
      sock = input;
      update = maybeUpdate || {};
      threadsData = (global.wabot && global.wabot.db && global.wabot.db.threadsData) || null;
    } else {
      update = input || {};
      sock = (global.wabot && global.wabot.sock) || null;
      threadsData = (global.wabot && global.wabot.db && global.wabot.db.threadsData) || null;
    }
    if (!api && global.wabot && global.wabot.api) api = global.wabot.api;

    const action = update && update.action;
    if (action !== "remove" && action !== "promote" && action !== "demote") return false;

    const groupJid = groupJidOf(update);
    const affected = Array.isArray(update.participants) ? update.participants.filter(Boolean) : [];
    if (!groupJid || !affected.length) return false;

    const threadBare = bareId(groupJid);

    // Per-group setting: sendWelcome (default true).
    let threadData = null;
    if (threadsData && typeof threadsData.get === "function") {
      try {
        threadData = await threadsData.get(threadBare);
      } catch {}
    }
    const settings = (threadData && threadData.settings) || {};
    if (settings.sendWelcome === false) return false;

    // Live group name for the notice, best-effort.
    let groupName = (threadData && (threadData.threadName || threadData.name)) || null;
    if (!groupName) {
      try {
        if (sock && typeof sock.groupMetadata === "function") {
          const meta = await sock.groupMetadata(groupJid);
          if (meta && meta.subject) groupName = meta.subject;
        }
      } catch {}
    }
    if (!groupName && api && typeof api.getThreadInfo === "function") {
      try {
        const info = await api.getThreadInfo(threadBare);
        if (info && info.threadName) groupName = info.threadName;
      } catch {}
    }
    groupName = groupName || "this group";

    const names = [];
    for (const jid of affected) names.push(await displayName(api, sock, jid));
    const mentionJids = affected.slice();
    const who = names.map((n, i) => `${n} (@${bareId(affected[i])})`).join(", ");

    let text;
    if (action === "remove") {
      const author = update.author ? bareId(update.author) : null;
      const removedByOther = author && !affected.some((j) => bareId(j) === author);
      if (removedByOther) {
        const byName = await displayName(api, sock, update.author);
        text = `👋 ${who} — removed from ${groupName} by ${byName}.`;
      } else if (affected.length === 1) {
        text = `👋 ${who} left ${groupName}. Take care!`;
      } else {
        text = `👋 ${who} left ${groupName}. Take care!`;
      }
    } else if (action === "promote") {
      text = affected.length === 1
        ? `🛡️ ${who} is now an admin of ${groupName}. Congratulations! 🎉`
        : `🛡️ ${who} are now admins of ${groupName}. Congratulations! 🎉`;
    } else {
      text = affected.length === 1
        ? `🛡️ ${who} is no longer an admin of ${groupName}.`
        : `🛡️ ${who} are no longer admins of ${groupName}.`;
    }

    const sent = await sendGroupText(sock, groupJid, text, mentionJids);
    if (!sent) return false;

    // Best-effort: keep the thread's member list in sync on removals.
    if (action === "remove" && threadsData && typeof threadsData.set === "function" && threadData) {
      try {
        if (Array.isArray(threadData.members)) {
          for (const jid of affected) {
            const row = threadData.members.find((m) => String(m.userID) === bareId(jid));
            if (row) row.inGroup = false;
          }
          await threadsData.set(threadBare, threadData);
        }
      } catch {}
    }

    return true;
  } catch (e) {
    console.error("[groupUpdate] failed:", e.message);
    return false;
  }
}

module.exports = { onGroupParticipantsUpdate };
