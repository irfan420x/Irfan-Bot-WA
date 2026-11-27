"use strict";

// .contact — send a contact card for a phone number (role 0).
//
//   .contact <number> [display name]
//   .contact 6512345678 Irfan
//
// Sent via the adapter (message.send -> toBaileysContent contacts
// passthrough -> guarded send -> sock.sendMessage { contacts:
// { displayName, contacts: [{ displayName, vcard }] } }).
// Shape: Types/Message.d.ts:149-150. vCard 3.0 is the standard WhatsApp
// contact-card format. The number is used as-is (digits only); no
// country code is assumed — give the full number with country code.

module.exports = {
  config: {
    name: "contact",
    aliases: ["vcard", "sharecontact"],
    version: "1.0",
    role: 0,
    countDown: 5,
    description: "Send a contact card for a phone number",
    category: "utility",
    guide: "{pn} <number> [name] — e.g. {pn} 6512345678 Irfan"
  },

  onStart: async function ({ message, args }) {
    const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || ".";
    const digits = String((args && args[0]) || "").replace(/\D/g, "");
    if (!digits || digits.length < 7 || digits.length > 15) {
      return message.reply(
        "⚠️ Usage: " + prefix + "contact <number> [name]\n" +
        "Example: " + prefix + "contact 6512345678 Irfan\n" +
        "Give the full number with country code."
      );
    }
    const name = (args || []).slice(1).join(" ").trim() || ("+" + digits);
    const safeName = name.replace(/[\r\n;]/g, " ").slice(0, 100) || ("+" + digits);
    const vcard =
      "BEGIN:VCARD\n" +
      "VERSION:3.0\n" +
      "N:" + safeName + ";;;;\n" +
      "FN:" + safeName + "\n" +
      "TEL;TYPE=CELL:+" + digits + "\n" +
      "END:VCARD";
    try {
      await message.send({
        contacts: {
          displayName: safeName,
          contacts: [{ displayName: safeName, vcard }]
        }
      });
    } catch (e) {
      console.error("[contact] send failed:", (e && e.message) || e);
      return message.reply("❌ Could not send the contact card. Please try again later.");
    }
  }
};
