// .uid — view a WhatsApp user id (WhatsApp port).
//   .uid                 -> your own id
//   .uid @user           -> id of the mentioned user
//   .uid <number>        -> that number's id
//   .uid <wa.me link>    -> id from the link
//   Reply to someone's message with .uid to view their id.
//
// WhatsApp port notes (vs the Messenger original):
// - The original resolved Facebook profile links to Facebook UIDs via
//   global.utils.findUid — that is Facebook-only and has no WhatsApp
//   equivalent, so link handling is limited to wa.me/<number> links.
// - Mentions come from event.mentions (bare id -> "@id"), same shape as
//   the Messenger original.

const regExCheckURL = /^(http|https):\/\/[^ "]+$/;

module.exports = {
  config: {
    name: "uid",
    version: "1.4",
    countDown: 5,
    role: 0,
    description: "View WhatsApp user id of a user",
    category: "utility",
    guide: "{pn}: view your own id\n{pn} @tag: view id of tagged people\n{pn} <wa.me link>: view id from the link\nReply to someone's message with the command to view their id",
  },

  onStart: async function ({ message, event, args }) {
    if (event.messageReply)
      return message.reply(`╔═══ 𝐔𝐈𝐃 ═══╗\n║ 🆔 ${event.messageReply.senderID}\n╚══════════════════╝`);
    if (!args[0])
      return message.reply(`╔═══ 𝐔𝐈𝐃 ═══╗\n║ 🆔 ${event.senderID}\n╚══════════════════╝`);

    if (args[0].match(regExCheckURL)) {
      let msg = "╔═══ 𝐔𝐈𝐃 ═══╗\n";
      for (const link of args) {
        const m = link.match(/wa\.me\/(\d+)/);
        if (m) {
          msg += `║ 🔗 ${m[1]}\n`;
        } else {
          msg += `║ ❌ Error: only wa.me links can be resolved on WhatsApp\n`;
        }
      }
      msg += "╚══════════════════╝";
      return message.reply(msg);
    }

    // A bare number is its own id.
    if (/^\d+$/.test(args[0].trim())) {
      return message.reply(`╔═══ 𝐔𝐈𝐃 ═══╗\n║ 🆔 ${args[0].trim()}\n╚══════════════════╝`);
    }

    let msg = "╔═══ 𝐔𝐈𝐃 ═══╗\n";
    const { mentions } = event;
    let hasMentions = false;
    for (const id in mentions) {
      msg += `║ 👤 ${mentions[id].replace("@", "")}: ${id}\n`;
      hasMentions = true;
    }
    msg += "╚══════════════════╝";

    if (!hasMentions) {
      return message.reply(`╔═══ 𝐒𝐘𝐒𝐓𝐄𝐌 ═══╗\n║ ⚠️ Please tag the person you want to view uid or leave it blank to view your own uid\n╚══════════════════╝`);
    }
    message.reply(msg);
  },
};
