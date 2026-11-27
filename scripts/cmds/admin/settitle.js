"use strict";

/**
 * settitle.js — `.settitle <new name>`: change the group subject.
 *
 * Group-only, role 1 (group admin). Ported from the Messenger bot's
 * scripts/cmds/boxchat/settitle.js (api.setTitle -> sock.groupUpdateSubject).
 *
 * Role check: the sender must be a group admin, verified via
 * api.getThreadInfo adminIDs, falling back to sock.groupMetadata
 * participants with an admin flag.
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

function adminIdSet(info) {
  const ids = new Set();
  if (info && Array.isArray(info.adminIDs)) {
    for (const a of info.adminIDs) ids.add(bareId(typeof a === "object" ? a.id : a));
  }
  return ids;
}

/** True when senderID is a group admin. Falls back to groupMetadata. */
async function isGroupAdmin({ api, event, sock }) {
  const sender = bareId(event.senderID);
  try {
    if (api && typeof api.getThreadInfo === "function") {
      const info = await api.getThreadInfo(event.threadID);
      if (info) {
        const admins = adminIdSet(info);
        if (admins.size) return admins.has(sender);
        // getThreadInfo worked but reported no admins — fall through to metadata.
      }
    }
  } catch {}
  try {
    if (sock && typeof sock.groupMetadata === "function") {
      const meta = await sock.groupMetadata(groupJidOf(event));
      if (meta && Array.isArray(meta.participants)) {
        return meta.participants.some(
          (p) => bareId(p.id) === sender && (p.admin === "admin" || p.admin === "superadmin")
        );
      }
    }
  } catch {}
  return false;
}

module.exports = {
  config: {
    name: "settitle",
    aliases: ["changetitle", "groupname"],
    version: "1.0",
    role: 1,
    countDown: 5,
    description: "Change the group name",
    category: "admin",
    guide: ".settitle <new name>"
  },

  onStart: async function ({ api, event, args, message, sock }) {
    if (!event.isGroup) {
      return message.reply("⚠️ This command can only be used in a group chat!");
    }

    const title = (args || []).join(" ").trim();
    if (!title) {
      return message.reply("⚠️ Please enter the new name you want to set for the group!\nUsage: .settitle <new name>");
    }
    // WhatsApp group subjects are at most 25 characters.
    if (title.length > 25) {
      return message.reply(`⚠️ Group names can be at most 25 characters — yours is ${title.length}. Please use a shorter name.`);
    }

    if (!(await isGroupAdmin({ api, event, sock }))) {
      return message.reply("❌ Only group admins can use this command.");
    }

    const groupJid = groupJidOf(event);
    try {
      if (sock && typeof sock.groupUpdateSubject === "function") {
        await sock.groupUpdateSubject(groupJid, title);
      } else if (api && typeof api.setTitle === "function") {
        await api.setTitle(title, event.threadID);
      } else {
        return message.reply("❌ The bot socket is not available to change the group name.");
      }
      return message.reply(`✅ Successfully changed the group name to: ${title}\nStatus: Completed ✨`);
    } catch (err) {
      return message.reply(`❌ An error occurred while changing the group name:\n${err.message || err}`);
    }
  }
};
