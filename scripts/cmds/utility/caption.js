// .caption — get a random caption from a selected category (WhatsApp port).
//   .caption <category>
//
// Local caption list (pure local, no network) — copied from the Messenger
// bot's scripts/cmds/data/captions.json to scripts/cmds/data/captions.json
// in this repo. All 15 categories are in the local list.
//
// WhatsApp port note: the Messenger original fell back to the NoobCore
// API when a category was missing from the local list. That fallback is
// dropped here — every listed category exists locally, so a missing one
// is reported as "no caption found" instead.

let localCaptions = null;
try {
  localCaptions = require("../data/captions.json");
} catch (e) {
  console.error("Local captions.json could not be loaded:", e.message);
  localCaptions = null;
}

module.exports = {
  config: {
    name: "caption",
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Get random caption from selected category",
    category: "utility",
    guide: "{pn} <category>",
  },

  onStart: async function ({ message, args }) {
    try {
      const availableCats = [
        "anime",
        "attitude",
        "alone",
        "breakup",
        "birthday",
        "emotional",
        "friendship",
        "funny",
        "islamic",
        "love",
        "motivational",
        "romantic",
        "sad",
        "success",
        "advice",
      ];

      let cat = args[0];
      if (!cat) {
        return message.reply(`📚 𝘈𝘷𝘢𝘪𝘭𝘢𝘣𝘭𝘦 𝘊𝘢𝘵𝘦𝘨𝘰𝘳𝘪𝘦𝘴:\n• ${availableCats.join(" • ")}`);
      }

      cat = cat.toLowerCase();

      if (!availableCats.includes(cat)) {
        return message.reply(`❌ Invalid category!\n\n📚 𝘈𝘷𝘢𝘪𝘭𝘢𝘣𝘭𝘦 𝘊𝘢𝘵𝘦𝘨𝘰𝘳𝘪𝘦𝘴:\n• ${availableCats.join(" • ")}`);
      }

      const localList = localCaptions && Array.isArray(localCaptions[cat]) ? localCaptions[cat] : null;
      if (localList && localList.length > 0) {
        const picked = localList[Math.floor(Math.random() * localList.length)];
        const { bn, en } = picked;

        const text = `
💬 𝘙𝘢𝘯𝘥𝘰𝘮 𝘊𝘢𝘱𝘵𝘪𝘰𝘯

🌸 𝑩𝒂𝒏𝒈𝒍𝒂:
${bn}

🌎 𝑬𝒏𝒈𝒍𝒊𝒔𝒉:
${en}
`;

        await message.reply(text.trim());
        return;
      }

      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ No caption found for this category.\n╚══════════════════╝");
    } catch (e) {
      console.error(e);
      message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ | Something went wrong. Please try again later.\n╚══════════════════╝");
    }
  },
};
