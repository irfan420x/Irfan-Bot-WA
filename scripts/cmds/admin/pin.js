"use strict";

// .pin — pin a message in this group (group-admin only, role 1).
// Reply to a message with .pin. Pins for 24 hours (Baileys default).
// Shape verified in Baileys 6.7.24 source — see admin/_pin.js.
// UNVERIFIED LIVE: mock-tested only; WhatsApp may still reject the pin
// (e.g. bot not admin, LID-hidden quoted sender) — failures reply in
// plain text, never crash.

const { doPin } = require("./_pin.js");

module.exports = {
  config: {
    name: "pin",
    aliases: [],
    version: "1.0",
    role: 1,
    countDown: 5,
    description: "Pin the replied-to message in this group (24h)",
    category: "admin",
    guide: "Reply to a message, then send {pn} — pins it for 24 hours"
  },

  onStart: async function ({ message, event, sock }) {
    return doPin({ message, event, sock, unpin: false });
  }
};
