// .kiss — romantic kiss image between you and your tagged partner (WhatsApp port of love/kiss.js).
// ORION POST /fun-image/v1/kiss { avatars: [avatar1, avatar2] } -> PNG bytes.
// NoobCore stays as fallback when ORION fails, as in the original.

const {
  AVATAR_FAIL,
  resolveMentionOrReply,
  displayName,
  getAvatarUrl,
  mimeOf,
  orionFunImage,
  getNoobCoreApiBase,
  noobCoreImage,
} = require("../fun/_funImage.js");

module.exports = {
  config: {
    name: "kiss",
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "💋 Create a romantic kiss image between you and your tagged partner! Just tag or reply to someone 💞",
    category: "love",
    guide: "{pn} @tag or reply — Generate kiss image 💋",
  },

  onStart: async function ({ event, message, usersData, api, sock }) {
    const uid1 = String(event.senderID).replace(/\D/g, "");
    const uid2 = resolveMentionOrReply(event);
    if (!uid2) {
      return message.reply("Please tag someone or reply to their message to use this command 💋");
    }

    try {
      const [name1, name2] = await Promise.all([
        displayName(api, usersData, uid1),
        displayName(api, usersData, uid2),
      ]);

      let avatar1;
      let avatar2;
      try {
        [avatar1, avatar2] = await Promise.all([
          getAvatarUrl(sock, uid1),
          getAvatarUrl(sock, uid2),
        ]);
      } catch (_) {
        return message.reply(AVATAR_FAIL);
      }

      let buf = await orionFunImage("kiss", { avatars: [avatar1, avatar2] });
      if (!buf) {
        const apiBase = await getNoobCoreApiBase();
        if (!apiBase) throw new Error("NoobCore API base missing");
        const apiURL = `${apiBase}/api/kiss?boy=${encodeURIComponent(avatar1)}&girl=${encodeURIComponent(avatar2)}`;
        buf = await noobCoreImage(apiURL);
      }
      if (!buf) throw new Error("No image from ORION or NoobCore");

      await message.reply({
        body: `💋 ${name1} just kissed ${name2}! ❤️`,
        attachment: { buffer: buf, mimetype: mimeOf(buf), fileName: "kiss.png" },
      });
    } catch (err) {
      console.error("❌ Kiss command error:", err);
      return message.reply("❌ | Couldn't generate kiss image,  Please try again later.");
    }
  },
};
