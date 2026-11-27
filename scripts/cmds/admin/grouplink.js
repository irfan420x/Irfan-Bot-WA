"use strict";

// .grouplink / .invite — return this group's invite link (role 1,
// group-only). Uses sock.groupInviteCode(jid) — Baileys 6.7.24,
// Socket/groups.d.ts:22: groupInviteCode: (jid: string) =>
// Promise<string | undefined>. Link: https://chat.whatsapp.com/<code>.
// Fetching the code normally needs the bot to be a group admin; any
// failure replies in plain text, never crashes.

function groupJidOf(event) {
  if (event.threadIDFull) return event.threadIDFull;
  if (event.threadID) return String(event.threadID).replace(/\D/g, "") + "@g.us";
  return null;
}

module.exports = {
  config: {
    name: "grouplink",
    aliases: ["invite", "invitelink"],
    version: "1.0",
    role: 1,
    countDown: 5,
    description: "Show this group's invite link",
    category: "admin",
    guide: "{pn} — shows the group invite link"
  },

  onStart: async function ({ message, event, sock }) {
    if (!event.isGroup) {
      return message.reply("⚠️ This command can only be used in a group chat!");
    }
    const groupJid = groupJidOf(event);
    if (!groupJid) return message.reply("❌ Could not work out which group this is.");
    try {
      if (!sock || typeof sock.groupInviteCode !== "function") {
        return message.reply("❌ Invite link is not available right now. Please try again later.");
      }
      const code = await sock.groupInviteCode(groupJid);
      if (!code) {
        return message.reply(
          "❌ Could not get the invite link — the bot probably needs to be a group admin.\n" +
          "👉 Please make the bot an admin and try again."
        );
      }
      return message.reply("🔗 Group invite link:\nhttps://chat.whatsapp.com/" + code);
    } catch (e) {
      console.error("[grouplink] failed:", (e && e.message) || e);
      return message.reply(
        "❌ Could not get the invite link — the bot probably needs to be a group admin.\n" +
        "👉 Please make the bot an admin and try again."
      );
    }
  }
};
