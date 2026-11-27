"use strict";

/**
 * groupinfo.js — `.groupinfo`: show this group's details.
 *
 * Group-only, role 0 (any member). Shows group name, ID, member count,
 * admin list, description, creation date, and the invite code/link
 * (best-effort — fetching the invite code needs the bot to be a group
 * admin; if it fails, that line is omitted rather than failing the command).
 *
 * Group metadata comes from sock.groupMetadata; api.getThreadInfo is used
 * as a fallback for name/member count when metadata is unavailable.
 */

function bareId(jid) {
  if (!jid) return "";
  return String(jid).split("@")[0].split(":")[0];
}

function groupJidOf(event) {
  if (event.threadIDFull) return event.threadIDFull;
  if (event.threadID) return `${String(event.threadID).replace(/\D/g, "")}@g.us`;
  return null;
}

async function displayName(api, usersData, bare) {
  try {
    if (api && typeof api.getUserInfo === "function") {
      const info = await api.getUserInfo(bare);
      const name = info && (info.name || (info[bare] && info[bare].name));
      if (name) return name;
    }
  } catch {}
  try {
    if (usersData && typeof usersData.getName === "function") {
      const name = await usersData.getName(bare);
      if (name) return name;
    }
  } catch {}
  return bare;
}

function formatDate(unixSeconds) {
  if (!unixSeconds) return "Unknown";
  const d = new Date(unixSeconds * 1000);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

module.exports = {
  config: {
    name: "groupinfo",
    aliases: ["boxinfo", "ginfo"],
    version: "1.0",
    role: 0,
    countDown: 5,
    description: "View all info about this group",
    category: "admin",
    guide: ".groupinfo"
  },

  onStart: async function ({ api, event, message, sock, usersData }) {
    if (!event.isGroup) {
      return message.reply("⚠️ This command can only be used in a group chat!");
    }

    const groupJid = groupJidOf(event);
    let meta = null;
    try {
      if (sock && typeof sock.groupMetadata === "function") meta = await sock.groupMetadata(groupJid);
    } catch {}

    let info = null;
    if (!meta && api && typeof api.getThreadInfo === "function") {
      try {
        info = await api.getThreadInfo(event.threadID);
      } catch {}
    }

    const groupName = (meta && meta.subject) || (info && info.threadName) || "Unnamed Group";
    const groupId = bareId(groupJid);

    let participantIds = [];
    let adminIds = [];
    if (meta && Array.isArray(meta.participants)) {
      participantIds = meta.participants.map((p) => bareId(p.id));
      adminIds = meta.participants
        .filter((p) => p.admin === "admin" || p.admin === "superadmin")
        .map((p) => bareId(p.id));
    } else if (info) {
      participantIds = (info.participantIDs || []).map(bareId);
      adminIds = (info.adminIDs || []).map((a) => bareId(typeof a === "object" ? a.id : a));
    }
    const memberCount = participantIds.length ||
      (info && Array.isArray(info.userInfo) ? info.userInfo.length : 0);

    const description = (meta && meta.desc) || "";
    const created = meta && meta.creation ? formatDate(meta.creation) : "Unknown";
    const owner = meta && meta.owner ? bareId(meta.owner) : null;
    const restrict = meta ? (meta.announce ? "Yes (admins only)" : "No (all members)") : null;

    const adminNames = [];
    for (const id of adminIds) adminNames.push(await displayName(api, usersData, id));

    // Invite code: best-effort — requires the bot to be a group admin.
    let inviteCode = null;
    try {
      if (sock && typeof sock.groupInviteCode === "function") {
        inviteCode = await sock.groupInviteCode(groupJid);
      }
    } catch {}

    const lines = [
      `✨ 𝐆𝐑𝐎𝐔𝐏 𝐈𝐍𝐅𝐎 ✨`,
      `══════════════════════════════`,
      `🏷️ 𝗡𝗮𝗺𝗲: ${groupName}`,
      `🆔 𝗜𝗗: ${groupId}`,
      `👥 𝗠𝗲𝗺𝗯𝗲𝗿𝘀: ${memberCount}`,
      `🛡️ 𝗔𝗱𝗺𝗶𝗻𝘀: ${adminIds.length}`,
      `📅 𝗖𝗿𝗲𝗮𝘁𝗲𝗱: ${created}`
    ];
    if (owner) lines.push(`👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗯𝘆: +${owner}`);
    if (restrict !== null) lines.push(`🔒 𝗔𝗱𝗺𝗶𝗻𝘀-𝗼𝗻𝗹𝘆 𝗺𝗲𝘀𝘀𝗮𝗴𝗲𝘀: ${restrict}`);
    if (description) lines.push(`📝 𝗗𝗲𝘀𝗰𝗿𝗶𝗽𝘁𝗶𝗼𝗻: ${description}`);
    lines.push(`══════════════════════════════`);
    lines.push(`👑 𝗔𝗱𝗺𝗶𝗻 𝗟𝗶𝘀𝘁:`);
    if (adminNames.length) {
      for (const n of adminNames) lines.push(`• ${n}`);
    } else {
      lines.push(`• (none found)`);
    }
    if (inviteCode) {
      lines.push(`══════════════════════════════`);
      lines.push(`🔗 𝗜𝗻𝘃𝗶𝘁𝗲: https://chat.whatsapp.com/${inviteCode}`);
    }

    return message.reply(lines.join("\n"));
  }
};
