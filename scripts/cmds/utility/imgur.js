// .imgur — upload an image/video to Imgur (WhatsApp port).
//   .imgur <image/video URL>
// ORION: POST /imgur/v1/upload {"url": "<media_url>"} -> {"link": "..."}.
//
// WhatsApp port notes (vs the Messenger original):
// - NoobCore fallback dropped — ORION only.
// - Reply-to-media upload is NOT possible on WhatsApp: the ORION endpoint
//   takes a public media URL, and a WhatsApp attached/quoted image has
//   no public URL. Only a URL argument is accepted.
// - Reactions use message.react (⏳ while uploading, ✅ on success).

const { orionPost } = require("../_orionApi.js");

module.exports = {
  config: {
    name: "imgur",
    version: "0.0.1",
    countDown: 0,
    role: 0,
    description: "Upload an image/video to Imgur",
    category: "utility",
    guide: "{pn} <image/video URL>",
  },

  onStart: async function ({ event, args, message }) {
    let mediaUrl = "";

    if (args.length > 0) {
      mediaUrl = args.join(" ");
    }

    if (!mediaUrl) {
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Please provide an image/video URL!\n╚══════════════════╝");
    }

    try {
      try { if (message.react) await message.react("⏳"); } catch (e) {}

      // ORION only (NoobCore fallback dropped).
      let ok = null;
      try {
        const orionRes = await orionPost("/imgur/v1/upload", { url: mediaUrl }, { timeout: 30000 });
        ok = orionRes && orionRes.link;
      } catch (e) {
        console.warn("[orion] imgur failed:", e.message);
      }

      if (!ok) {
        try { if (message.react) await message.react(""); } catch (e) {}
        return message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ Failed to upload to Imgur.\n╚══════════════════╝");
      }

      try { if (message.react) await message.react("✅"); } catch (e) {}
      return message.reply(`${ok}`);
    } catch (err) {
      try { if (message.react) await message.react(""); } catch (e) {}
      return message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⚠️ An error occurred while uploading.\n╚══════════════════╝");
    }
  },
};
