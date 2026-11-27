"use strict";

/**
 * demote.js — `.demote @user` (or reply to their message, or give their
 * number): remove admin rights from a group admin.
 *
 * Group-only, role 1 (group admin). The bot itself must also be a group
 * admin or WhatsApp will reject the demotion. Refuses to demote the bot
 * itself (the bot needs admin rights to manage the group).
 */

function bareId(jid) {
  if (!jid) return "";
  return String(jid).split("@")[0].split(":")[0];
}

function toJid(bare) {
  const digits = String(bare || "").replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : null;
}

function groupJidOf(event) {
  if (event.threadIDFull) return event.threadIDFull;
  if (event.threadID) return `${String(event.threadID).replace(/\D/g, "")}@g.us`;
  return null;
}

function botBareId(sock) {
  const raw = (sock && sock.user && sock.user.id) || (global.wabot && global.wabot.sock && global.wabot.sock.user && global.wabot.sock.user.id) || "";
  return bareId(raw);
}

function adminIdSet(info) {
  const ids = new Set();
  if (info && Array.isArray(info.adminIDs)) {
    for (const a of info.adminIDs) ids.add(bareId(typeof a === "object" ? a.id : a));
  }
  return ids;
}

/** { isAdmin, botIsAdmin, adminIds, participantIds } for this group. */
async function groupAdminState({ api, event, sock }) {
  const sender = bareId(event.senderID);
  const botId = botBareId(sock);
  let info = null;
  try {
    if (api && typeof api.getThreadInfo === "function") info = await api.getThreadInfo(event.threadID);
  } catch {}
  if (info) {
    const admins = adminIdSet(info);
    if (admins.size || (Array.isArray(info.participantIDs) && info.participantIDs.length)) {
      return {
        isAdmin: admins.has(sender),
        botIsAdmin: botId ? admins.has(botId) : false,
        adminIds: admins,
        participantIds: (info.participantIDs || []).map(bareId)
      };
    }
  }
  try {
    if (sock && typeof sock.groupMetadata === "function") {
      const meta = await sock.groupMetadata(groupJidOf(event));
      if (meta && Array.isArray(meta.participants)) {
        const admins = new Set(
          meta.participants
            .filter((p) => p.admin === "admin" || p.admin === "superadmin")
            .map((p) => bareId(p.id))
        );
        return {
          isAdmin: admins.has(sender),
          botIsAdmin: botId ? admins.has(botId) : false,
          adminIds: admins,
          participantIds: meta.participants.map((p) => bareId(p.id))
        };
      }
    }
  } catch {}
  return { isAdmin: false, botIsAdmin: false, adminIds: new Set(), participantIds: [] };
}

/** Mention, reply, or a bare number/UID argument — in that order. */
function resolveTarget(event, args) {
  if (event.mentions && Object.keys(event.mentions).length > 0) {
    return bareId(Object.keys(event.mentions)[0]);
  }
  if (event.messageReply && event.messageReply.senderID) {
    return bareId(event.messageReply.senderID);
  }
  if (args && args[0]) {
    const digits = String(args[0]).replace(/\D/g, "");
    if (digits) return digits;
  }
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

module.exports = {
  config: {
    name: "demote",
    aliases: ["removeadmin"],
    version: "1.0",
    role: 1,
    countDown: 5,
    description: "Demote a group admin to regular member",
    category: "admin",
    guide: ".demote @user | .demote (reply to a message)"
  },

  onStart: async function ({ api, event, args, message, sock, usersData }) {
    if (!event.isGroup) {
      return message.reply("⚠️ This command can only be used in a group chat!");
    }

    const target = resolveTarget(event, args);
    if (!target) {
      return message.reply("⚠️ Please mention, reply to, or give the number of the user to demote.\nUsage: .demote @user");
    }

    const botId = botBareId(sock);
    if (botId && target === botId) {
      return message.reply("❌ I cannot demote myself — the bot needs admin rights to manage this group.");
    }

    const state = await groupAdminState({ api, event, sock });
    if (!state.isAdmin) {
      return message.reply("❌ Only group admins can use this command.");
    }
    if (!state.botIsAdmin) {
      return message.reply("⚠️ Bot is not an admin.\n👉 Please make the bot admin first.");
    }
    if (state.participantIds.length && !state.participantIds.includes(target)) {
      return message.reply("⚠️ That user is not in this group.");
    }
    if (!state.adminIds.has(target)) {
      return message.reply("⚠️ That user is not an admin.");
    }

    const targetName = await displayName(api, usersData, target);
    try {
      await sock.groupParticipantsUpdate(groupJidOf(event), [toJid(target)], "demote");
      return message.reply(`🛡️ ${targetName} is no longer an admin of this group.`);
    } catch (err) {
      return message.reply(`❌ Failed to demote the user.\n${err.message || err}`);
    }
  }
};
