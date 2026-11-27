// .geminigen — text-to-image via ORION TensorArt (WhatsApp port of Messenger ai/geminigen.js).
// Text-to-image only. The Messenger original's image-EDIT path used Kay
// (base64 image + POST /generate) — Kay is not available on WhatsApp, so an
// edit attempt gets a clear notice instead of a broken edit.
//
// WhatsApp port notes (vs the Messenger original):
// - ORION is the ONLY source — no Kay fallback. On ORION failure (except the
//   daily limit) a clean error is replied, no dead fallback is called.
// - Shared 1/day/user limit with .tart/.lumin/.imagen3/.fluxproultra via
//   orionTensorArt (data/tart/limits.json). TENSORART_LIMIT -> the Bengali
//   limit message, no fallback (protects the shared 50/day credit pool).
// - Image is downloaded with global fetch and sent as an attachment
//   { buffer, mimetype: "image/png", fileName } (same as .tart).
// - Edit detection: the WhatsApp adapter exposes no media type for a
//   replied-to message (messageReply carries only senderID/body/messageID),
//   so an edit is detected when the command message itself carries an image
//   attachment, or when it replies to a message with an empty body (a quoted
//   image without a caption — the common edit case). A reply to a text
//   message is treated as a normal text-to-image request.

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

function isEditAttempt(event) {
  // Image attached to the command message itself.
  if (Array.isArray(event.attachments) &&
    event.attachments.some((a) => a && (a.type === "image" || a.type === "photo"))) {
    return true;
  }
  // Replying to a message with an empty body = quoted image without a
  // caption (the adapter gives no media type for quoted messages).
  if (event.messageReply && !(event.messageReply.body || "").trim()) return true;
  return false;
}

module.exports = {
  config: {
    name: "geminigen",
    version: "1.0",
    premium: true,
    countDown: 5,
    role: 0,
    description: "Generate or edit images using text prompts",
    category: "ai",
    guide:
      "{pn} <prompt>\n" +
      "{pn} <prompt> (reply to an image to edit it)"
  },

  onStart: async function ({ message, event, args }) {
    const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || ".";
    const prompt = args.join(" ").trim();

    if (!prompt) {
      return message.reply(
        "Please provide a prompt.\n\nExamples:\n" +
        prefix + "geminigen a cyberpunk city\n" +
        prefix + "geminigen make me anime (reply to an image)"
      );
    }

    if (isEditAttempt(event)) {
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ 🖌️ Image edit is not available on WhatsApp yet.\n╚══════════════════╝");
    }

    if (tensorArtCountFor(event.senderID) >= DAILY_LIMIT_PER_USER) {
      return message.reply(LIMIT_TEXT);
    }

    let waitingID = null;
    let waitEdited = false; // set when the wait message is edited in place (error path)
    try {
      const waiting = await message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ Processing your image...\n╚══════════════════╝");
      waitingID = waiting && waiting.messageID;
    } catch (e) { /* processing message is best-effort */ }

    try {
      const result = await orionTensorArt(prompt, { userID: event.senderID });
      const buffer = await downloadImageBuffer(result.url);

      await message.reply({
        body: `Image generated successfully.\nPrompt: ${prompt}`,
        attachment: { buffer, mimetype: "image/png", fileName: "geminigen.png" }
      });
    } catch (error) {
      console.error("[geminigen] generation error:", (error && error.message) || error);
      let text = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ Failed to process the image. Please try again later.\n╚══════════════════╝";
      if (error && error.code === "TENSORART_LIMIT") {
        text = LIMIT_TEXT;
      } else if (error && error.code === "TENSORART_LOGIN") {
        text = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⚠️ TensorArt লগইন শেষ হয়ে গেছে — Muse #1-কে জানানো হয়েছে।\n╚══════════════════╝";
      } else if (error && error.code === "TENSORART_CREDITS") {
        text = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⏳ আজকের ক্রেডিট শেষ — কাল আবার চেষ্টা করো।\n╚══════════════════╝";
      }
      // Edit-in-place: the wait message becomes the error (one message,
      // not wait + error). If the edit fails, fall back to a fresh reply
      // and let finally remove the wait message.
      if (waitingID && typeof message.edit === "function") {
        try { await message.edit(waitingID, text); waitEdited = true; } catch (e) {}
      }
      if (!waitEdited) {
        try { await message.reply(text); } catch (e) {}
      }
    } finally {
      if (waitingID && !waitEdited && message.unsend) {
        try { await message.unsend(waitingID); } catch (e) {}
      }
    }
  }
};
