// .animevideo — random anime video (WhatsApp port).
// ORION: GET /anime/v1/random-video returns {"url","title","anime_id",
// "source":"kitsu"} — the url is a YouTube trailer page, NOT a direct
// video file, so the ORION path sends the title + watch link as text.
//
// WhatsApp port notes (vs the Messenger original):
// - NoobCore fallback dropped (it returned a direct video URL, sent as a
//   video attachment). ORION only, text reply.
// - The "⏳ Please wait few seconds..." message is sent and then deleted
//   via message.unsend, same as the original's safeUnsend.

const { orionGet } = require("../_orionApi.js");

module.exports = {
  config: {
    name: "animevideo",
    aliases: ["animevid", "anivid"],
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Sends a random anime video.",
    category: "anime",
    guide: "{pn}",
  },

  onStart: async function ({ message }) {
    let processingMessage = null;
    try {
      const waiting = await message.reply("⏳ Please wait few seconds...");
      processingMessage = waiting && waiting.messageID;

      // ORION only (NoobCore fallback dropped).
      let resultText = null;
      try {
        const orionRes = await orionGet("/anime/v1/random-video", { timeout: 20000 });
        if (orionRes && orionRes.url) {
          const titleLine = orionRes.title ? `🎬 ${orionRes.title}\n` : "";
          resultText = `${titleLine}🎬 Here's a random anime video for you! 😊💖\n${orionRes.url}`;
        }
      } catch (e) {
        console.warn("[orion] animevideo failed:", e.message);
      }
      if (!resultText) resultText = "❌ Oops! Something went wrong, please try again later.";

      // Edit-in-place: the wait message becomes the result (one message,
      // not two). If the edit fails, fall back to a normal reply and
      // remove the wait message.
      if (processingMessage && typeof message.edit === "function") {
        try {
          await message.edit(processingMessage, resultText);
          return;
        } catch (_) { /* fall through to the plain-reply fallback */ }
      }
      if (processingMessage && message.unsend) {
        try { await message.unsend(processingMessage); } catch (e) {}
      }
      return message.reply(resultText);
    } catch (error) {
      console.error(error);
      // Last resort: edit the wait in place, else a fresh reply.
      if (processingMessage && typeof message.edit === "function") {
        try {
          await message.edit(processingMessage, "❌ Oops! Something went wrong, please try again later.");
          return;
        } catch (_) { /* fall through */ }
      }
      if (processingMessage && message.unsend) {
        try { await message.unsend(processingMessage); } catch (e) {}
      }
      await message.reply(
        "❌ Oops! Something went wrong, please try again later."
      );
    }
  },
};
