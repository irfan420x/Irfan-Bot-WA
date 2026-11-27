// .mnm — MNM effect on profile pic (WhatsApp port of fun/mnm.js).
// Free public API, unchanged: GET https://azadx69x-all-apis-top.vercel.app/api/mnm?image=<avatarURL>
// Avatar URL is the WhatsApp profile-picture URL (sock.profilePictureUrl)
// instead of the Facebook graph URL used in the original.

const {
  AVATAR_FAIL,
  resolveTarget,
  displayName,
  getAvatarUrl,
  mimeOf,
  fetchImageBuffer,
} = require("./_funImage.js");

const MNM_API = "https://azadx69x-all-apis-top.vercel.app/api/mnm?image=";

module.exports = {
  config: {
    name: "mnm",
    aliases: [],
    version: "0.0.7",
    countDown: 3,
    role: 0,
    description: "𝐌𝐍𝐌 𝐞𝐟𝐟𝐞𝐜𝐭 𝐨𝐧 𝐩𝐫𝐨𝐟𝐢𝐥𝐞 𝐩𝐢𝐜",
    category: "fun",
    guide: "{pn} (𝐫𝐞𝐩𝐥𝐲 𝐨𝐫 𝐦𝐞𝐧𝐭𝐢𝐨𝐧 𝐨𝐫 𝐧𝐨𝐧𝐞)",
  },

  onStart: async function ({ event, message, usersData, api, sock }) {
    try {
      // Original order: reply first, then mention, then self.
      let targetID = null;
      if (event.messageReply && event.messageReply.senderID) {
        targetID = String(event.messageReply.senderID).replace(/\D/g, "");
      } else if (event.mentions && Object.keys(event.mentions).length > 0) {
        targetID = String(Object.keys(event.mentions)[0]).replace(/\D/g, "");
      } else {
        targetID = String(event.senderID).replace(/\D/g, "");
      }

      const name = await displayName(api, usersData, targetID);

      let avatarURL;
      try {
        avatarURL = await getAvatarUrl(sock, targetID);
      } catch (_) {
        return message.reply(AVATAR_FAIL);
      }

      const buf = await fetchImageBuffer(MNM_API + encodeURIComponent(avatarURL), 30000);
      if (!buf) throw new Error("MNM API did not return an image");

      return await message.reply({
        body: `🦧 𝐇𝐞𝐫𝐞 𝐢𝐬 𝐭𝐡𝐞 𝑴𝑵𝑴 𝐞𝐟𝐟𝐞𝐜𝐭 𝐨𝐟 ${name}’𝐬`,
        attachment: { buffer: buf, mimetype: mimeOf(buf), fileName: "mnm.jpg" },
      });
    } catch (err) {
      console.error("MNM CMD ERROR:", err);
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ 𝐂𝐨𝐮𝐥𝐝 𝐧𝐨𝐭 𝐠𝐞𝐧𝐞𝐫𝐚𝐭𝐞 𝐌𝐍𝐌 𝐢𝐦𝐚𝐠𝐞.\n╚══════════════════╝");
    }
  },
};
