// TensorArt image generation via the Orion APIs (scripts/cmds/ai-image/tart.js).
//   .tart <prompt>              -> 768x1024 portrait (default)
//   .tart square <prompt>       -> 768x768 square
//   .tart landscape <prompt>    -> 1024x768 landscape
//   .tart fresh <prompt>        -> skip the history check, always a new image
//
// LIVE findings (verified 2026-11-25, ORION-APIS-FOR-BOT.md is outdated here):
//  - The doc's models "flux"/"turbo" are REJECTED by the live API now
//    ("unknown model"). The working text-to-image model is "WAN_2_7 IMAGE".
//  - Cost is ~11 credits per image at 768x1024 (NOT 0.8 as the doc says),
//    so 50 credits/day = ~4 images/day total. Per-user limit is 1/day.
//  - WAN_2_7 IMAGE needs 589,824-4,194,304 pixels (512x768 is too small).
//  - POST /generate returns the FULL task object (task_id + status) and
//    usually blocks until FINISH — not {job_id}. Poll /jobs/<task_id> only
//    when the returned status is not FINISH yet.
//  - Check /v1/history FIRST: same prompt+size+steps already made -> reuse
//    the old image URL for 0 credit. Only generate when it is not there.
//  - 401 "need login" = the TensorArt cookie died -> tell Muse #1, do not retry.
//
// WhatsApp port note: all history / limit / generate / poll logic lives in
// scripts/cmds/_orionApi.js (orionTensorArt), which shares the same
// data/tart/limits.json file, so the 1/day/user pool is shared. This file
// only parses flags, downloads the image bytes and sends them as an
// attachment ({ buffer, mimetype, fileName }) via message.reply.

const { orionTensorArt, tensorArtCountFor } = require("../_orionApi.js");

const DAILY_LIMIT_PER_USER = 1; // ~11 credits/image; 50/day total

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
    name: "tart",
    aliases: ["tensorart"],
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Generate an AI image with TensorArt.",
    category: "ai-image",
    guide: "{pn} <prompt>\nExample: {pn} a cat astronaut on the moon\nFlags: square | landscape | fresh",
  },

  onStart: async function ({ message, event, args, commandName }) {
    const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || ".";

    let width = 768;
    let height = 1024;
    let fresh = false;
    const words = args.slice();
    while (words.length) {
      const w = words[0].toLowerCase();
      if (w === "square") { width = 768; height = 768; words.shift(); }
      else if (w === "landscape") { width = 1024; height = 768; words.shift(); }
      else if (w === "fresh") { fresh = true; words.shift(); }
      else break;
    }
    const prompt = words.join(" ").trim();

    if (!prompt) {
      return message.reply(
        "⚠️ Please provide a prompt.\nExample: " + prefix + (commandName || "tart") + " a cat astronaut on the moon"
      );
    }

    if (tensorArtCountFor(event.senderID) >= DAILY_LIMIT_PER_USER) {
      return message.reply(
        "╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⏳ আজকের জন্য তোমার ছবির লিমিট শেষ (দিনে ১টা)। কাল আবার চেষ্টা করো।\n╚══════════════════╝"
      );
    }

    try { if (message.react) await message.react("⏳"); } catch (e) {}

    let waitingID = null;
    let waitEdited = false; // set when the wait message is edited in place (error path)
    try {
      const waiting = await message.reply("⏳️ ছবি বানাচ্ছি… একটু অপেক্ষা করো।");
      waitingID = waiting && waiting.messageID;
    } catch (e) { /* waiting message is best-effort */ }

    try {
      // History-first + shared 1/day limit + generate + poll all live in
      // _orionApi.js. `reused` means 0 credit was spent.
      const result = await orionTensorArt(prompt, {
        width, height, fresh, userID: event.senderID
      });
      const generated = !result.reused;

      const buffer = await downloadImageBuffer(result.url);

      await message.reply(
        {
          body: "✅ \"" + prompt + "\"" + (generated ? "" : " (আগের বানানো ছবি, ক্রেডিট লাগেনি)"),
          attachment: { buffer, mimetype: "image/png", fileName: "tart.png" },
        }
      );
    } catch (error) {
      console.error("[tart] generation error:", error && error.message || error);
      let text = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⚠️ ছবি বানানো যায়নি। একটু পরে আবার চেষ্টা করো।\n╚══════════════════╝";
      if (error && error.code === "TENSORART_LIMIT") {
        text = "╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⏳ আজকের জন্য তোমার ছবির লিমিট শেষ (দিনে ১টা)। কাল আবার চেষ্টা করো।\n╚══════════════════╝";
      } else if (error && error.code === "TENSORART_LOGIN") {
        text = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⚠️ TensorArt লগইন শেষ হয়ে গেছে — Muse #1-কে জানানো হয়েছে।\n╚══════════════════╝";
      } else if (error && error.code === "TENSORART_CREDITS") {
        text = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⏳ আজকের ক্রেডিট শেষ — কাল আবার চেষ্টা করো।\n╚══════════════════╝";
      } else if (error && error.message) {
        text = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⚠️ " + error.message + "\n╚══════════════════╝";
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
  },
};
