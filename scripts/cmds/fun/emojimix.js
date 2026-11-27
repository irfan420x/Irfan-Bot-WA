// .emojimix — mix two emojis together (WhatsApp port of fun/emojimix.js).
// ORION POST /fun-image/v1/emojimix { emojis: [emoji1, emoji2] } -> PNG bytes.
// NoobCore stays as fallback when ORION fails, as in the original.
// No avatar needed, so this one works identically on WhatsApp.

const {
  mimeOf,
  orionFunImage,
  getNoobCoreApiBase,
  noobCoreImage,
} = require("./_funImage.js");

module.exports = {
  config: {
    name: "emojimix",
    aliases: ["mix"],
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Mix two emojis together",
    category: "fun",
    guide: "{pn} <emoji1> <emoji2>\nExample: {pn} 😭 🫦",
  },

  onStart: async function ({ event, message, args }) {
    try {
      const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || ".";

      if (args.length < 2) {
        return message.reply(`❌ Please provide two emojis.\nExample: ${prefix}emojimix 😭 🫦`);
      }

      const [emoji1, emoji2] = args;

      let buf = await orionFunImage("emojimix", { emojis: [emoji1, emoji2] });
      if (!buf) {
        const apiBase = await getNoobCoreApiBase();
        if (apiBase) {
          const apiUrl = `${apiBase}/api/emojimix?emoji1=${encodeURIComponent(emoji1)}&emoji2=${encodeURIComponent(emoji2)}`;
          buf = await noobCoreImage(apiUrl);
        }
      }
      if (!buf) {
        return message.reply("❌ Failed to generate mixed emoji image.");
      }

      await message.reply({
        body: `✨ Emoji Mix Result\n${emoji1} + ${emoji2} = ⬇️`,
        attachment: { buffer: buf, mimetype: mimeOf(buf), fileName: "emojimix.png" },
      });
    } catch (error) {
      console.error("EmojiMix Error:", error.message);
      message.reply("❌ Something went wrong while generating emoji mix. Please try again later!");
    }
  },
};
