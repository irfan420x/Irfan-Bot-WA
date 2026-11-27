// .nokia — profile picture inside a Nokia phone (WhatsApp port of fun/nokia.js).
// Free public API, unchanged: GET https://azadx69x-all-apis-top.vercel.app/api/nokia?image=<avatarURL>
// Avatar URL is the WhatsApp profile-picture URL (sock.profilePictureUrl)
// instead of the Facebook graph URL used in the original.

const {
  AVATAR_FAIL,
  displayName,
  getAvatarUrl,
  mimeOf,
  fetchImageBuffer,
} = require("./_funImage.js");

const NOKIA_API = "https://azadx69x-all-apis-top.vercel.app/api/nokia?image=";

module.exports = {
  config: {
    name: "nokia",
    version: "0.0.7",
    countDown: 3,
    role: 0,
    description: "𝐏𝐫𝐨𝐟𝐢𝐥𝐞 𝐩𝐢𝐜𝐭𝐮𝐫𝐞 𝐢𝐧𝐬𝐢𝐝𝐞 𝐚 𝐍𝐨𝐤𝐢𝐚 𝐩𝐡𝐨𝐧𝐞",
    category: "fun",
    guide: "{pn} (𝐫𝐞𝐩𝐥𝐲 𝐨𝐫 𝐧𝐨 𝐫𝐞𝐩𝐥𝐲)",
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

      const buf = await fetchImageBuffer(NOKIA_API + encodeURIComponent(avatarURL), 30000);
      if (!buf) throw new Error("Nokia API did not return an image");

      return await message.reply({
        body: `𝐇𝐞𝐫𝐞 𝐍𝐨𝐤𝐢𝐚 𝐩𝐡𝐨𝐧𝐞 𝐨𝐟 ${name}'𝐬📱`,
        attachment: { buffer: buf, mimetype: mimeOf(buf), fileName: "nokia.jpg" },
      });
    } catch (err) {
      console.error("𝐍𝐎𝐊𝐈𝐀 𝐂𝐌𝐃 𝐄𝐑𝐑𝐎𝐑:", err);
      return message.reply("❌ 𝐂𝐨𝐮𝐥𝐝 𝐧𝐨𝐭 𝐟𝐞𝐭𝐜𝐡 𝐭𝐡𝐞 𝐍𝐨𝐤𝐢𝐚 𝐩𝐡𝐨𝐧𝐞 𝐢𝐦𝐚𝐠𝐞.");
    }
  },
};
