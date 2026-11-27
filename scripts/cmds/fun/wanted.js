// .wanted — make a wanted poster (WhatsApp port of fun/wanted.js).
// ORION POST /fun-image/v1/wanted { avatars: [url] } -> PNG bytes.
// NoobCore stays as fallback when ORION fails, as in the original.

const {
  AVATAR_FAIL,
  resolveTarget,
  displayName,
  getAvatarUrl,
  mimeOf,
  orionFunImage,
  getNoobCoreApiBase,
  noobCoreImage,
} = require("./_funImage.js");

module.exports = {
  config: {
    name: "wanted",
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Make a wanted poster 😎",
    category: "fun",
    guide: "{pn} @tag or reply or just run (your own avatar)",
  },

  onStart: async function ({ event, message, usersData, api, sock }) {
    try {
      const targetID = resolveTarget(event);

      const userInfo = await displayName(api, usersData, targetID);

      let avatarURL;
      try {
        avatarURL = await getAvatarUrl(sock, targetID);
      } catch (_) {
        return message.reply(AVATAR_FAIL);
      }

      let buf = await orionFunImage("wanted", { avatars: [avatarURL] });
      if (!buf) {
        const apiBase = await getNoobCoreApiBase();
        if (!apiBase) {
          return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ API base URL missing.\n╚══════════════════╝");
        }
        const apiURL = `${apiBase}/api/wanted?url=${encodeURIComponent(avatarURL)}`;
        buf = await noobCoreImage(apiURL);
      }
      if (!buf) throw new Error("No image from ORION or NoobCore");

      await message.reply({
        body: `🎯 Target: ${userInfo}`,
        attachment: { buffer: buf, mimetype: mimeOf(buf), fileName: "wanted.png" },
      });
    } catch (err) {
      console.error(err);
      message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ Failed to generate wanted poster. Please try again later.\n╚══════════════════╝");
    }
  },
};
