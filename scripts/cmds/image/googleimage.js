// .googleimage — Google image search via the ORION APIs (WhatsApp port).
//   .googleimage <query> - <count>   (default 5, max 25)
// ORION: GET /image/v1/search?query=<q>&count=<n> -> {images:[{url,...}]}.
//
// WhatsApp port notes (vs the Messenger original):
// - NoobCore fallback dropped — ORION only (same as .pinterest on WhatsApp).
// - The adapter sends one attachment per message, so the images go out as
//   one captioned reply + plain sends (same pattern as .pinterest).
// - No temp files: image bytes are downloaded to a buffer with fetch.

const { orionGet } = require("../_orionApi.js");

async function downloadImage(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return null;
  }
}

module.exports = {
  config: {
    name: "googleimage",
    aliases: ["gimg", "googleimg", "gimage"],
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Search or get images from Google Images.",
    category: "image",
    guide: "{pn} <search query> - <number of images>\nExample: {pn} Naruto - 10",
  },

  onStart: async function ({ event, args, message }) {
    try {
      const input = args.join(" ").trim();
      if (!input)
        return message.reply(
          `❌ Please provide a search query.\nExample: .googleimg Sakura Haruka - 10`
        );

      let query = input;
      let count = 5;

      if (input.includes("-")) {
        const parts = input.split("-");
        query = parts[0].trim();
        count = parseInt(parts[1].trim()) || 5;
      }
      if (count > 25) count = 25;

      let data = [];
      try {
        const orionRes = await orionGet(
          `/image/v1/search?query=${encodeURIComponent(query)}&count=${count}`,
          { timeout: 20000 }
        );
        data = ((orionRes && orionRes.images) || [])
          .map((img) => (typeof img === "string" ? img : img && img.url))
          .filter(Boolean);
      } catch (e) {
        console.warn("[orion] googleimage failed:", e.message);
      }

      if (data.length === 0)
        return message.reply(
          `❌ No images found for "${query}". Try a different search.`
        );

      const buffers = [];
      for (const url of data) {
        if (buffers.length >= count) break;
        const buf = await downloadImage(url);
        if (buf) buffers.push(buf);
      }

      if (buffers.length === 0)
        return message.reply(
          `❌ Couldn't find any valid images for "${query}".`
        );

      await message.reply({
        body: `✅ Here are your images for "${query}"`,
        attachment: { buffer: buffers[0], mimetype: "image/jpeg", fileName: "googleimage-1.jpg" },
      });
      for (let i = 1; i < buffers.length; i++) {
        try {
          await message.send({
            body: "",
            attachment: { buffer: buffers[i], mimetype: "image/jpeg", fileName: `googleimage-${i + 1}.jpg` },
          });
        } catch (e) {
          console.error("[googleimage] extra image send failed:", e.message);
        }
      }
    } catch (error) {
      console.error("GoogleImg Error:", error.message);
      return message.reply(
        "❌ Something went wrong. Please try again later."
      );
    }
  },
};
