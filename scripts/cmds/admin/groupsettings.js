"use strict";

// .groupsettings / .gsettings — view (and toggle) this group's settings
// (role 1, group-only).
//
//   .groupsettings              — show current settings
//   .groupsettings announce on  — only admins can send messages
//   .groupsettings announce off — everyone can send messages
//   .groupsettings edit lock    — only admins can edit group info
//   .groupsettings edit unlock  — everyone can edit group info
//
// View reads sock.groupMetadata(jid): GroupMetadata.announce (only
// admins may send) and .restrict (only admins may change group settings)
// — Types/GroupMetadata.d.ts:32-34.
// Toggle uses sock.groupSettingUpdate(jid, setting) — Socket/groups.d.ts:40:
//   "announcement" | "not_announcement" | "locked" | "unlocked".
// Toggle was verified in a mock (fake sock records the call); it has NOT
// been run live. After a toggle the command re-reads metadata and shows
// the new state; if the re-read fails it still reports the requested change.

function groupJidOf(event) {
  if (event.threadIDFull) return event.threadIDFull;
  if (event.threadID) return String(event.threadID).replace(/\D/g, "") + "@g.us";
  return null;
}

function describe(meta) {
  const announce = meta && meta.announce === true;
  const restrict = meta && meta.restrict === true;
  return [
    "⚙️ GROUP SETTINGS",
    "══════════════════════",
    "💬 Messages: " + (announce ? "Admins only 🔒" : "Everyone ✅"),
    "✏️ Edit group info: " + (restrict ? "Admins only 🔒" : "Everyone ✅"),
    "══════════════════════",
    "Change: .gsettings announce on|off | .gsettings edit lock|unlock"
  ].join("\n");
}

module.exports = {
  config: {
    name: "groupsettings",
    aliases: ["gsettings"],
    version: "1.0",
    role: 1,
    countDown: 5,
    description: "View / toggle group settings (admin-only messages, locked group info)",
    category: "admin",
    guide:
      "{pn} — show current settings\n" +
      "{pn} announce on|off — only admins can send messages or not\n" +
      "{pn} edit lock|unlock — only admins can edit group info or not"
  },

  onStart: async function ({ message, event, args, sock }) {
    if (!event.isGroup) {
      return message.reply("⚠️ This command can only be used in a group chat!");
    }
    const groupJid = groupJidOf(event);
    if (!groupJid) return message.reply("❌ Could not work out which group this is.");
    if (!sock || typeof sock.groupMetadata !== "function") {
      return message.reply("❌ Group settings are not available right now. Please try again later.");
    }

    const what = String((args && args[0]) || "").toLowerCase();
    const how = String((args && args[1]) || "").toLowerCase();

    // --- Toggle -------------------------------------------------------
    let setting = null;
    if (what === "announce" || what === "send" || what === "messages" || what === "message") {
      if (how === "on" || how === "lock" || how === "locked" || how === "admin" || how === "admins") setting = "announcement";
      else if (how === "off" || how === "unlock" || how === "unlocked" || how === "everyone" || how === "all") setting = "not_announcement";
    } else if (what === "edit" || what === "info" || what === "restrict" || what === "locked") {
      if (how === "lock" || how === "locked" || how === "on" || how === "admin" || how === "admins") setting = "locked";
      else if (how === "unlock" || how === "unlocked" || how === "off" || how === "everyone" || how === "all") setting = "unlocked";
    } else if (what) {
      return message.reply(
        "⚠️ Unknown setting \"" + what + "\".\n" +
        "Usage: .gsettings announce on|off  OR  .gsettings edit lock|unlock\n" +
        "Send .gsettings with no arguments to see the current settings."
      );
    }

    if (setting) {
      try {
        if (typeof sock.groupSettingUpdate !== "function") {
          return message.reply("❌ Changing settings is not available right now. Please try again later.");
        }
        await sock.groupSettingUpdate(groupJid, setting);
      } catch (e) {
        console.error("[groupsettings] toggle failed:", (e && e.message) || e);
        return message.reply(
          "❌ Could not change that setting — the bot probably needs to be a group admin."
        );
      }
      try {
        const meta = await sock.groupMetadata(groupJid);
        return message.reply("✅ Setting updated.\n\n" + describe(meta));
      } catch (_) {
        return message.reply("✅ Setting updated (" + setting + ").");
      }
    }

    // --- View ---------------------------------------------------------
    try {
      const meta = await sock.groupMetadata(groupJid);
      return message.reply(describe(meta));
    } catch (e) {
      console.error("[groupsettings] view failed:", (e && e.message) || e);
      return message.reply("❌ Could not read the group settings. Please try again later.");
    }
  }
};
