"use strict";

/**
 * welcome.js — new-member welcome for `group-participants.update` (action 'add').
 *
 * Ported from the Messenger bot's scripts/events/welcome.js (batch welcome
 * v2.4): ONE message per batch event for the whole batch, live group name,
 * total member count, and each new member's number (memberCount - N + 1 + i).
 *
 * Baileys differences vs the Messenger original:
 * - No FCA / global.irfbot — the socket comes from global.wabot.sock (or the
 *   `sock` passed in by the handler) and config from global.wabot.config.
 * - Avatars come from sock.profilePictureUrl(jid) instead of the Facebook
 *   Graph picture URL.
 * - The welcome card is rendered with the optional `canvas` package when it
 *   is installed; `canvas` is NEVER a dependency (no package.json entry).
 *   If canvas is missing or the render fails, the text welcome is sent alone.
 *
 * Exported:
 *   { onGroupParticipantsUpdate, renderWelcomeCard }
 *
 * onGroupParticipantsUpdate accepts the Baileys update shape, either as
 *   onGroupParticipantsUpdate({ sock, update, threadsData, api })
 * or onGroupParticipantsUpdate(sock, update), where update is
 *   { id, participants: [jid, ...], action: 'add', author }.
 * It is a no-op (returns false) for any action other than 'add', and never
 * throws — a failed welcome must not break the event dispatcher.
 */

let canvasLib = null;
let canvasTried = false;

function loadCanvas() {
  if (canvasTried) return canvasLib;
  canvasTried = true;
  try {
    const { createCanvas, loadImage } = require("canvas");
    canvasLib = { createCanvas, loadImage };
  } catch (e) {
    canvasLib = null;
  }
  return canvasLib;
}

/** "123456@s.whatsapp.net" -> "123456"; "123456:12@s.whatsapp.net" -> "123456". */
function bareId(jid) {
  if (!jid) return "";
  return String(jid).split("@")[0].split(":")[0];
}

function toJid(bare) {
  const digits = String(bare || "").replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : null;
}

function groupJidOf(update) {
  if (!update) return null;
  if (update.id) return update.id;
  if (update.threadIDFull) return update.threadIDFull;
  if (update.threadID) return `${String(update.threadID).replace(/\D/g, "")}@g.us`;
  if (update.groupJid) return update.groupJid;
  return null;
}

function botBareId(sock) {
  const raw = (sock && sock.user && sock.user.id) || (global.wabot && global.wabot.sock && global.wabot.sock.user && global.wabot.sock.user.id) || "";
  return bareId(raw);
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

/** Fetch one avatar as a Buffer, or null. Best-effort, short timeout. */
async function fetchAvatar(sock, jid) {
  try {
    if (!sock || typeof sock.profilePictureUrl !== "function") return null;
    const url = await sock.profilePictureUrl(jid, "image");
    if (!url) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) return null;
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      if (!isJpeg && !isPng) return null;
      return buf;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * One welcome card for the WHOLE batch: every new member's picture in a
 * single 1000x560 image. Returns a PNG Buffer, or null when canvas is
 * unavailable or rendering fails. `members` is [{ jid, name, number }],
 * `avatarBuffers` is a parallel array of Buffers (or nulls).
 */
async function renderWelcomeCard(members, groupName, memberCount, avatarBuffers) {
  const cv = loadCanvas();
  if (!cv) return null;
  const { createCanvas, loadImage } = cv;
  try {
    const n = members.length;
    const W = 1000, H = 560;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Background: dark gradient + soft purple glow.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0A0C1C");
    bg.addColorStop(0.6, "#14172B");
    bg.addColorStop(1, "#1B1F38");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 90, 10, W / 2, 90, 420);
    glow.addColorStop(0, "rgba(139, 92, 246, 0.35)");
    glow.addColorStop(1, "rgba(139, 92, 246, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(139, 92, 246, 0.6)";
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Title.
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "64px sans-serif";
    ctx.fillText("WELCOME", W / 2, 82);

    // Group name.
    ctx.fillStyle = "#C4B5FD";
    ctx.font = "34px sans-serif";
    const gName = groupName.length > 34 ? groupName.slice(0, 33) + "…" : groupName;
    ctx.fillText(gName, W / 2, 142);

    // Avatar layout: 1 row up to 5, else 2 rows.
    const twoRows = n > 5;
    const rows = twoRows
      ? [members.slice(0, Math.ceil(n / 2)), members.slice(Math.ceil(n / 2))]
      : [members];
    const diameter = n === 1 ? 190 : n === 2 ? 170 : n <= 4 ? 140 : n <= 5 ? 120 : 100;
    const gap = 28;
    const rowCenters = twoRows ? [255, 405] : [310];

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const rowWidth = row.length * diameter + (row.length - 1) * gap;
      let x = (W - rowWidth) / 2 + diameter / 2;
      const cy = rowCenters[r];
      for (let i = 0; i < row.length; i++) {
        const member = row[i];
        const globalIdx = twoRows ? (r === 0 ? i : Math.ceil(n / 2) + i) : i;
        const imgBuf = avatarBuffers ? avatarBuffers[globalIdx] : null;
        const radius = diameter / 2;

        // Ring.
        ctx.beginPath();
        ctx.arc(x, cy, radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "#8B5CF6";
        ctx.lineWidth = 5;
        ctx.stroke();

        // Picture (circle-clipped) or initial-letter fallback.
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, cy, radius, 0, Math.PI * 2);
        ctx.clip();
        let drawn = false;
        if (imgBuf) {
          try {
            const img = await loadImage(imgBuf);
            ctx.drawImage(img, x - radius, cy - radius, diameter, diameter);
            drawn = true;
          } catch {}
        }
        if (!drawn) {
          const g = ctx.createLinearGradient(x - radius, cy - radius, x + radius, cy + radius);
          g.addColorStop(0, "#8B5CF6");
          g.addColorStop(1, "#EC4899");
          ctx.fillStyle = g;
          ctx.fillRect(x - radius, cy - radius, diameter, diameter);
          const first = (member.name || "?").trim().charAt(0).toUpperCase() || "?";
          ctx.fillStyle = "#FFFFFF";
          ctx.font = `bold ${Math.round(diameter * 0.45)}px sans-serif`;
          ctx.fillText(first, x, cy + 2);
        }
        ctx.restore();

        // First name under the avatar.
        const firstName = (member.name || "New Member").trim().split(/\s+/)[0] || "New Member";
        const shown = firstName.length > 12 ? firstName.slice(0, 11) + "…" : firstName;
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "22px sans-serif";
        ctx.fillText(shown, x, cy + radius + 26);

        x += diameter + gap;
      }
    }

    // Bottom line: how many joined + total members.
    ctx.fillStyle = "#9AA3C7";
    ctx.font = "26px sans-serif";
    ctx.fillText(`${n} new member${n === 1 ? "" : "s"}  •  ${memberCount} total`, W / 2, 530);

    return canvas.toBuffer("image/png");
  } catch (e) {
    console.error("[welcome] card render failed:", e.message);
    return null;
  }
}

/**
 * Send the welcome into a group. Prefers the guarded global.wabot.send
 * (content shape: string or { body, attachment, mentions }); falls back to
 * sock.sendMessage with a Baileys-native payload.
 */
async function sendWelcome(sock, groupJid, text, mentionJids, cardBuffer) {
  const wabot = global.wabot || {};
  if (typeof wabot.send === "function") {
    try {
      const content = cardBuffer
        ? { body: text, mentions: mentionJids, attachment: { buffer: cardBuffer, mimetype: "image/png", fileName: "welcome.png" } }
        : { body: text, mentions: mentionJids };
      await wabot.send(groupJid, content);
      return true;
    } catch (e) {
      console.error("[welcome] wabot.send failed, falling back to sock:", e.message);
    }
  }
  if (sock && typeof sock.sendMessage === "function") {
    if (cardBuffer) {
      await sock.sendMessage(groupJid, { image: cardBuffer, caption: text, mentions: mentionJids });
    } else {
      await sock.sendMessage(groupJid, { text, mentions: mentionJids });
    }
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
    if (!update || update.action !== "add") return false;

    const groupJid = groupJidOf(update);
    const added = Array.isArray(update.participants) ? update.participants.filter(Boolean) : [];
    if (!groupJid || !added.length) return false;

    const threadBare = bareId(groupJid);

    // Per-group setting: sendWelcome (default true). The Messenger original
    // used sendWelcomeMessage; honour either flag being explicitly false.
    let threadData = null;
    if (threadsData && typeof threadsData.get === "function") {
      try {
        threadData = await threadsData.get(threadBare);
      } catch {}
    }
    const settings = (threadData && threadData.settings) || {};
    if (settings.sendWelcome === false || settings.sendWelcomeMessage === false) return false;

    // If the bot itself was just added, there is nobody to welcome yet —
    // skip (the Messenger original also returned early here, after applying
    // the bot nickname; WhatsApp has no per-group bot nickname, so nothing
    // else to do).
    const botId = botBareId(sock);
    if (botId && added.some((j) => bareId(j) === botId)) return false;

    // Live group info: sock.groupMetadata first, then api.getThreadInfo,
    // then the stored thread name. Retry metadata once — a transient
    // failure must not silently fall back to "this group" + member #0.
    let groupName = (threadData && (threadData.threadName || threadData.name)) || "this group";
    let memberCount = 0;
    let meta = null;
    try {
      if (sock && typeof sock.groupMetadata === "function") meta = await sock.groupMetadata(groupJid);
    } catch {}
    if (!meta) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        if (sock && typeof sock.groupMetadata === "function") meta = await sock.groupMetadata(groupJid);
      } catch {}
    }
    if (meta) {
      if (meta.subject) groupName = meta.subject;
      if (Array.isArray(meta.participants) && meta.participants.length) {
        memberCount = meta.participants.length;
      }
    }
    if (!memberCount && api && typeof api.getThreadInfo === "function") {
      try {
        const info = await api.getThreadInfo(threadBare);
        if (info) {
          if (!meta && info.threadName) groupName = info.threadName;
          if (Array.isArray(info.participantIDs) && info.participantIDs.length) {
            memberCount = info.participantIDs.length;
          } else if (Array.isArray(info.userInfo) && info.userInfo.length) {
            memberCount = info.userInfo.length;
          }
        }
      } catch {}
    }
    if (!memberCount && threadData && Array.isArray(threadData.members)) {
      const ids = new Set(threadData.members.filter((m) => m.inGroup).map((m) => String(m.userID)));
      for (const j of added) ids.add(bareId(j));
      memberCount = ids.size;
    }
    if (!memberCount) memberCount = added.length;

    // ---- BATCH: one message for everyone added in this event ----
    // Member numbers: the new members are the last N of the group.
    const n = added.length;
    const firstNumber = memberCount - n + 1;
    const members = [];
    for (let i = 0; i < n; i++) {
      members.push({
        jid: added[i],
        name: await displayName(api, sock, added[i]),
        number: firstNumber + i
      });
    }

    // Irfan's welcome template (Messenger original, 2026-11-26) — same
    // wording, live group name / total count / each member's number.
    let memberLine;
    if (n === 1) {
      memberLine = `👥 এই পরিবারে এখন মোট ${memberCount} জন সদস্য — তুমি ${memberCount} নম্বর সদস্য! ✨`;
    } else {
      const list = members.map((m) => `${m.name} (#${m.number})`).join(", ");
      memberLine = `👥 এই পরিবারে এখন মোট ${memberCount} জন সদস্য! ✨\n🌸 নতুন সদস্য: ${list}`;
    }

    const welcomeMsg =
      `╭━━━❥🌸❥━━━╮\n` +
      ` 🌺 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 🌺 \n` +
      `╰━━━❥🌸❥━━━╯\n` +
      `\n` +
      `💝𝐑𝐞𝐬𝐩𝐞𝐜𝐭𝐞𝐝 𝐍𝐞𝐰 𝐌𝐞𝐦𝐛𝐞𝐫𝐬 🌸  🫶\n` +
      `ꔷꕥ̳̳̳̳̳̳̳̿̿̿̿̿⃢ꕥ̳̳̳̳̳̳̳̿̿̿̿̿💖★⃝🕊️ ${groupName} ♛𝄞⃝🌷💖ꕥ̳̳̳̳̳̳̳̿̿̿❥\n` +
      `\n` +
      `আমাদের ছোট্ট পরিবারের নতুন সদস্য হয়ে যুক্ত হওয়ার জন্য জানাই আন্তরিক ভালোবাসা ও স্বাগতম। 🥰\n` +
      `\n` +
      `🌸 আপনাদের উপস্থিতিতেই আমাদের গ্রুপ আরও সুন্দর, আরও প্রাণবন্ত। 💖\n` +
      `\n` +
      `${memberLine}\n` +
      `\n` +
      `আশা করি, সবাই মিলে ভালোবাসা, সম্মান আর সুন্দর করে ভালোবাসার মাধ্যমে এই পরিবারটাকে আরও এগিয়ে নিয়ে যাবো। 🫂✨\n` +
      `\n` +
      `💝 𝐖𝐞𝐥𝐜𝐨𝐦𝐞 𝐓𝐨 𝐎𝐮𝐫 𝐋𝐢𝐭𝐭𝐥𝐞 𝐅𝐚𝐦𝐢𝐥𝐲 💝 𝐒𝐭𝐚𝐲 𝐖𝐢𝐭𝐡 𝐔𝐬 • 𝐒𝐭𝐚𝐲 𝐇𝐚𝐩𝐩𝐲`;

    const mentionJids = members.map((m) => m.jid);

    // Welcome card (optional canvas): avatars fetched in parallel, then one
    // card for the whole batch. Any failure -> text only.
    let cardBuffer = null;
    try {
      const avatars = await Promise.all(members.map((m) => fetchAvatar(sock, m.jid)));
      cardBuffer = await renderWelcomeCard(members, groupName, memberCount, avatars);
    } catch (e) {
      console.error("[welcome] card failed:", e.message);
      cardBuffer = null;
    }

    const sent = await sendWelcome(sock, groupJid, welcomeMsg, mentionJids, cardBuffer);
    if (!sent) return false;

    // Best-effort: record the new members in the thread data so later
    // member counts stay right even if groupMetadata is unavailable.
    if (threadsData && typeof threadsData.set === "function" && threadData) {
      try {
        const existing = Array.isArray(threadData.members) ? threadData.members : [];
        const seen = new Set(existing.map((m) => String(m.userID)));
        for (const m of members) {
          const id = bareId(m.jid);
          if (!seen.has(id)) {
            existing.push({ userID: id, inGroup: true });
            seen.add(id);
          } else {
            const row = existing.find((r) => String(r.userID) === id);
            if (row) row.inGroup = true;
          }
        }
        threadData.members = existing;
        if (!threadData.threadName && groupName !== "this group") threadData.threadName = groupName;
        await threadsData.set(threadBare, threadData);
      } catch {}
    }

    return true;
  } catch (e) {
    console.error("[welcome] failed:", e.message);
    return false;
  }
}

module.exports = { onGroupParticipantsUpdate, renderWelcomeCard };
