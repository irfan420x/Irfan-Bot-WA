// .kicked — generate a kicked image for a tagged user (WhatsApp port of fun/kicked.js).
// ORION POST /fun-image/v1/kicked { avatars: [kickerAvatar, kickedAvatar] } -> PNG bytes.
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
} = require("./_funImage.js");

module.exports = {
  config: {
    name: "kicked",
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "👢 Generate a kicked image for a tagged user",
    category: "fun",
    guide: "{pn} @tag or reply — Generate a kicked image",
  },

  onStart: async function ({ event, message, usersData, api, sock }) {
    const kickerID = String(event.senderID).replace(/\D/g, "");
    const kickedID = resolveMentionOrReply(event);
    if (!kickedID) {
      return message.reply("Please tag someone or reply to their message to use this command 👢");
    }

    try {
      const [kickerName, kickedName] = await Promise.all([
        displayName(api, usersData, kickerID),
        displayName(api, usersData, kickedID),
      ]);

      let kickerAvatar;
      let kickedAvatar;
      try {
        [kickerAvatar, kickedAvatar] = await Promise.all([
          getAvatarUrl(sock, kickerID),
          getAvatarUrl(sock, kickedID),
        ]);
      } catch (_) {
        return message.reply(AVATAR_FAIL);
      }

      let buf = await orionFunImage("kicked", { avatars: [kickerAvatar, kickedAvatar] });
      if (!buf) {
        const apiBase = await getNoobCoreApiBase();
        if (!apiBase) throw new Error("NoobCore API base missing");
        const apiURL = `${apiBase}/api/kicked?kicker=${encodeURIComponent(kickerAvatar)}&kicked=${encodeURIComponent(kickedAvatar)}`;
        buf = await noobCoreImage(apiURL);
      }
      if (!buf) throw new Error("No image from ORION or NoobCore");

      await message.reply({
        body: `👢 ${kickerName} just kicked ${kickedName}!`,
        attachment: { buffer: buf, mimetype: mimeOf(buf), fileName: "kicked.png" },
      });
    } catch (err) {
      console.error("❌ Kicked command error:", err);
      return message.reply("❌ | Couldn't generate kicked image, please try again later.");
    }
  },
};
