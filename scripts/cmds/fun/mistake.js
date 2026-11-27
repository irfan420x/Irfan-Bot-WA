// .mistake — funny mistake meme generator (WhatsApp port of fun/mistake.js).
// ORION POST /fun-image/v1/mistake { uid } -> PNG bytes (the server
// fetches the target's avatar by UID). NoobCore stays as fallback.
// NOTE (WhatsApp): the UID here is the WhatsApp bare id (phone number),
// not a Facebook UID as in the Messenger original — the ORION/NoobCore
// servers resolve the avatar by Facebook UID, so the rendered avatar may
// come out wrong/silhouette until an avatars-based template exists.
// Live-test before trusting the image.

const {
  resolveMentionOrReply,
  displayName,
  mimeOf,
  orionFunImage,
  getNoobCoreApiBase,
  noobCoreImage,
} = require("./_funImage.js");

module.exports = {
  config: {
    name: "mistake",
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Funny mistake meme generator",
    category: "fun",
    guide: "{pn} @mention or reply to someone",
  },

  onStart: async function ({ event, message, usersData, api }) {
    const targetID = resolveMentionOrReply(event);
    if (!targetID) {
      return message.reply("Please tag or reply to someone to create a mistake meme!");
    }

    try {
      let buf = await orionFunImage("mistake", { uid: targetID });
      if (!buf) {
        const apiBase = await getNoobCoreApiBase();
        if (!apiBase) throw new Error("NoobCore API base missing");
        const apiURL = `${apiBase}/api/mistake?uid=${targetID}`;
        buf = await noobCoreImage(apiURL);
      }
      if (!buf) throw new Error("No image from ORION or NoobCore");

      const tagName = await displayName(api, usersData, targetID);

      await message.reply({
        body: `@${tagName}`,
        attachment: { buffer: buf, mimetype: mimeOf(buf), fileName: "mistake.png" },
      });
    } catch (err) {
      console.error("❌ Mistake Command Error:", err?.message || err);
      message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ⚠️ An error occurred. Please try again later.\n╚══════════════════╝");
    }
  },
};
