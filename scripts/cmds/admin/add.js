"use strict";

/**
 * add.js — `.add <number>`: add a participant to the group by phone number.
 *
 * Group-only, role 1 (group admin). The number is digits only (a leading +
 * and spaces/dashes are stripped); the JID is built as <digits>@s.whatsapp.net.
 * The bot itself must also be a group admin, or WhatsApp rejects the add.
 * Note: WhatsApp may still refuse the add if the target's privacy settings
 * do not allow being added to groups — that failure is reported, not hidden.
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

/** { isAdmin, botIsAdmin, participantIds } for this group, best-effort. */
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
          participantIds: meta.participants.map((p) => bareId(p.id))
        };
      }
    }
  } catch {}
  return { isAdmin: false, botIsAdmin: false, participantIds: [] };
}

module.exports = {
  config: {
    name: "add",
    aliases: ["adduser"],
    version: "1.0",
    role: 1,
    countDown: 5,
    description: "Add a user to the group by phone number",
    category: "admin",
    guide: ".add <phone number> (digits only, e.g. .add 8801XXXXXXXXX)"
  },

  onStart: async function ({ api, event, args, message, sock }) {
    if (!event.isGroup) {
      return message.reply("⚠️ This command can only be used in a group chat!");
    }

    // Number first; a mention or a reply also resolves to a number.
    let digits = "";
    if (args && args[0]) digits = String(args[0]).replace(/\D/g, "");
    if (!digits && event.mentions && Object.keys(event.mentions).length > 0) {
      digits = bareId(Object.keys(event.mentions)[0]);
    }
    if (!digits && event.messageReply && event.messageReply.senderID) {
      digits = bareId(event.messageReply.senderID);
    }
    if (!digits) {
      return message.reply("⚠️ Please provide a phone number to add.\nUsage: .add <phone number> (digits only)");
    }
    if (digits.length < 8 || digits.length > 15) {
      return message.reply("⚠️ That does not look like a valid phone number. Use digits only, with country code (e.g. .add 8801XXXXXXXXX).");
    }

    const state = await groupAdminState({ api, event, sock });
    if (!state.isAdmin) {
      return message.reply("❌ Only group admins can use this command.");
    }
    if (!state.botIsAdmin) {
      return message.reply("⚠️ Bot is not an admin.\n👉 Please make the bot admin first.");
    }
    if (state.participantIds.length && state.participantIds.includes(digits)) {
      return message.reply("👥 That user is already in this group.");
    }
    if (digits === botBareId(sock)) {
      return message.reply("⚠️ The bot is already in this group.");
    }

    const targetJid = toJid(digits);
    try {
      const res = await sock.groupParticipantsUpdate(groupJidOf(event), [targetJid], "add");
      // Baileys returns per-participant results; status 200 = added,
      // 403 = invite required (privacy), 408/409 = already in group / error.
      const result = Array.isArray(res) ? res[0] : res;
      const status = result && (result.status || result.code);
      if (status && String(status) !== "200") {
        if (String(status) === "403") {
          return message.reply(
            `⏳ Could not add +${digits} directly — their privacy settings only allow adding via invite link.\n` +
            `Ask them to join with the group invite link instead.`
          );
        }
        if (String(status) === "409") {
          return message.reply("👥 That user is already in this group.");
        }
        return message.reply(`❌ Could not add +${digits} (WhatsApp status ${status}).`);
      }
      return message.reply(`✅ Successfully added +${digits} to the group.`);
    } catch (err) {
      return message.reply(`❌ Could not add +${digits}.\n${err.message || err}\nTheir privacy settings may not allow being added to groups.`);
    }
  }
};
