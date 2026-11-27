"use strict";

// .unpin — remove the pin from a message in this group (group-admin
// only, role 1). Reply to the pinned message with .unpin.
// Shape verified in Baileys 6.7.24 source — see admin/_pin.js.
// UNVERIFIED LIVE: mock-tested only (same caveats as .pin).

const { doPin } = require("./_pin.js");

module.exports = {
  config: {
    name: "unpin",
    aliases: [],
    version: "1.0",
    role: 1,
    countDown: 5,
    description: "Unpin the replied-to message in this group",
    category: "admin",
    guide: "Reply to a pinned message, then send {pn}"
  },

  onStart: async function ({ message, event, sock }) {
    return doPin({ message, event, sock, unpin: true });
  }
};
