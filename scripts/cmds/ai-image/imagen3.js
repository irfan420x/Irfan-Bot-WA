// .imagen3 — AI image generation via ORION TensorArt (WhatsApp port of Messenger ai-image/imagen3.js).
// ORION is the ONLY source on WhatsApp — no Renz fallback. On ORION failure
// (except the daily limit) a clean error is replied, no dead fallback is called.
// Shared 1/day/user limit with .tart via orionTensorArt (data/tart/limits.json).
// TENSORART_LIMIT -> the Bengali limit message, no fallback (protects the
// shared 50/day credit pool). Image is downloaded with global fetch and sent
// as an attachment { buffer, mimetype: "image/png", fileName } (same as .tart).
//
// WhatsApp port notes (vs the Messenger original):
// - message.react("🎨") instead of api.setMessageReaction.
// - Waiting message is unsent via message.unsend (was api.unsendMessage).

const { orionTensorArt, tensorArtCountFor } = require("../_orionApi.js");

const DAILY_LIMIT_PER_USER = 1; // shared with .tart (see _orionApi.js)
const LIMIT_TEXT = "╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⏳ আজকের জন্য তোমার ছবির লিমিট শেষ (দিনে ১টা)। কাল আবার চেষ্টা করো।\n╚══════════════════╝";

async function downloadImageBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error("Image download HTTP " + res.status);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/")) {
    throw new Error("Response is not an image (content-type: " + (ct || "unknown") + ")");
  }
  return Buffer.from(await res.arrayBuffer());
}

module.exports = {
  config: {
    name: "imagen3",
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Generate an AI image using the Oculux Imagen3 API",
    category: "ai-image",
    guide: "{pn} <prompt>\nExample: {pn} futuristic dragon flying in space"
  },

  onStart: async function ({ message, event, args }) {
    const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || ".";
    const prompt = args.join(" ").trim();

    if (!prompt) {
      return message.reply(
        "⚠️ Please provide a prompt.\nExample: " + prefix + "imagen3 futuristic dragon flying in space"
      );
    }

    if (tensorArtCountFor(event.senderID) >= DAILY_LIMIT_PER_USER) {
      return message.reply(LIMIT_TEXT);
    }

    try { if (message.react) await message.react("🎨"); } catch (e) {}

    let waitingID = null;
    try {
      const waiting = await message.reply("🎨 Generating your Imagen3 image... Please wait...");
      waitingID = waiting && waiting.messageID;
    } catch (e) { /* waiting message is best-effort */ }

    try {
      const result = await orionTensorArt(prompt, { userID: event.senderID });
      const buffer = await downloadImageBuffer(result.url);

      await message.reply({
        body: "✅ Here is your generated imagen3 image.",
        attachment: { buffer, mimetype: "image/png", fileName: "imagen3.png" }
      });
    } catch (error) {
      console.error("[imagen3] generation error:", (error && error.message) || error);
      let text = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⚠️ Failed to generate image. Please try again later.\n╚══════════════════╝";
      if (error && error.code === "TENSORART_LIMIT") {
        text = LIMIT_TEXT;
      } else if (error && error.code === "TENSORART_LOGIN") {
        text = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⚠️ TensorArt লগইন শেষ হয়ে গেছে — Muse #1-কে জানানো হয়েছে।\n╚══════════════════╝";
      } else if (error && error.code === "TENSORART_CREDITS") {
        text = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⏳ আজকের ক্রেডিট শেষ — কাল আবার চেষ্টা করো।\n╚══════════════════╝";
      }
      try { await message.reply(text); } catch (e) {}
    } finally {
      if (waitingID && message.unsend) {
        try { await message.unsend(waitingID); } catch (e) {}
      }
    }
  }
};
