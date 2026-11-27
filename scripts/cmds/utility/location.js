"use strict";

// .location — send a location pin (role 0).
//
//   .location <latitude> <longitude> [name | address]
//   .location 1.3521 103.8198 Singapore
//
// Sent via the adapter (message.send -> toBaileysContent location
// passthrough -> guarded send -> sock.sendMessage { location:
// { degreesLatitude, degreesLongitude, name?, address? } }).
// Shape: Types/Message.d.ts:152 { location: WALocationMessage }
// (= proto.Message.ILocationMessage). Everything after the two numbers
// is used as the place name.

module.exports = {
  config: {
    name: "location",
    aliases: ["loc", "sendlocation"],
    version: "1.0",
    role: 0,
    countDown: 5,
    description: "Send a location pin",
    category: "utility",
    guide: "{pn} <latitude> <longitude> [place name] — e.g. {pn} 1.3521 103.8198 Singapore"
  },

  onStart: async function ({ message, args }) {
    const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || ".";
    const lat = Number(args && args[0]);
    const lng = Number(args && args[1]);
    if (!args || args.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return message.reply(
        "⚠️ Usage: " + prefix + "location <latitude> <longitude> [place name]\n" +
        "Example: " + prefix + "location 1.3521 103.8198 Singapore\n" +
        "Latitude -90 to 90, longitude -180 to 180."
      );
    }
    const name = (args || []).slice(2).join(" ").trim().slice(0, 100) || undefined;
    try {
      await message.send({
        location: {
          degreesLatitude: lat,
          degreesLongitude: lng,
          ...(name ? { name } : {})
        }
      });
    } catch (e) {
      console.error("[location] send failed:", (e && e.message) || e);
      return message.reply("❌ Could not send the location. Please try again later.");
    }
  }
};
