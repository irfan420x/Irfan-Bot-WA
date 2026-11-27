// .pair2 — love match between you and another group member (WhatsApp port of love/pair2.js).
// ORION POST /fun-image/v1/pair2 { avatars: [avatar1, avatar2] } -> PNG bytes.
// NoobCore stays as fallback when ORION fails, as in the original.
// The /api/font?id=21 name styling is kept on NoobCore (plain name on failure).
//
// WhatsApp differences (vs the Messenger original):
// - NO GENDER FILTER: WhatsApp exposes no gender for participants, so the
//   match is a random OTHER group member instead of a random opposite-gender
//   one. Everything else (random pick, 70–100% compatibility, message text)
//   is unchanged.
// - Avatars come from sock.profilePictureUrl, not Facebook graph URLs.
// - Group members come from api.getThreadInfo (participantIDs + userInfo).

const {
  AVATAR_FAIL,
  bareId,
  displayName,
  getAvatarUrl,
  mimeOf,
  orionFunImage,
  getNoobCoreApiBase,
  noobCoreImage,
} = require("../fun/_funImage.js");

async function toFont(text, id) {
  try {
    const apiBase = await getNoobCoreApiBase();
    if (!apiBase) return text;
    const apiUrl = `${apiBase}/api/font?id=${id || 21}&text=${encodeURIComponent(text)}`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return text;
    const data = await res.json();
    return (data && data.output) || text;
  } catch (e) {
    console.error("Font API error:", e.message);
    return text;
  }
}

module.exports = {
  config: {
    name: "pair2",
    aliases: ["lovepair2", "match2"],
    version: "2.0",
    role: 0,
    description: "💘 Generate a love match between you and another group member",
    category: "love",
    guide: "{p}{n} — Use this command in a group to find a love match",
  },

  onStart: async function ({ event, message, usersData, api, sock }) {
    try {
      if (!event.isGroup) {
        return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⚠️ Please use this command in a group to find a love match.\n╚══════════════════╝");
      }

      const senderID = bareId(event.senderID);

      let threadData = null;
      try {
        threadData = await api.getThreadInfo(event.threadID);
      } catch (_) { /* handled below */ }
      const participantIDs = (threadData && Array.isArray(threadData.participantIDs))
        ? threadData.participantIDs.map(bareId).filter(Boolean)
        : [];
      const candidates = participantIDs.filter((id) => id !== senderID);

      if (candidates.length === 0) {
        return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ No suitable match found in the group. Please try again later.\n╚══════════════════╝");
      }

      const matchID = candidates[Math.floor(Math.random() * candidates.length)];

      let senderName = await displayName(api, usersData, senderID);
      let matchName = await displayName(api, usersData, matchID);
      senderName = await toFont(senderName, 21);
      matchName = await toFont(matchName, 21);

      let avatar1;
      let avatar2;
      try {
        [avatar1, avatar2] = await Promise.all([
          getAvatarUrl(sock, senderID),
          getAvatarUrl(sock, matchID),
        ]);
      } catch (_) {
        return message.reply(AVATAR_FAIL);
      }

      let buf = await orionFunImage("pair2", { avatars: [avatar1, avatar2] });
      if (!buf) {
        const apiBase = await getNoobCoreApiBase();
        if (!apiBase) {
          return message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ Failed to fetch API base. Please try again later.\n╚══════════════════╝");
        }
        const apiUrl = `${apiBase}/api/pair2?avatar1=${encodeURIComponent(avatar1)}&avatar2=${encodeURIComponent(avatar2)}`;
        buf = await noobCoreImage(apiUrl);
      }
      if (!buf) throw new Error("No image from ORION or NoobCore");

      const lovePercent = Math.floor(Math.random() * 31) + 70;

      const text = `💞 𝗠𝗮𝘁𝗰𝗵𝗺𝗮𝗸𝗶𝗻𝗴 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲 💞

🎀  ${senderName} ✨️
🎀  ${matchName} ✨️

🕊️ 𝓓𝓮𝓼𝓽𝓲𝓷𝔂 𝓱𝓪𝓼 𝔀𝓻𝓲𝓽𝓽𝓮𝓷 𝔂𝓸𝓾𝓻 𝓷𝓪𝓶𝓮𝓼 𝓽𝓸𝓰𝓮𝓽𝓱𝓮𝓻 🌹  
𝓜𝓪𝔂 𝔂𝓸𝓾𝓻 𝓫𝓸𝓷𝓭 𝓵𝓪𝓼𝓽 𝓯𝓸𝓻𝓮𝓿𝓮𝓻 ✨️  

💘 𝙲𝚘𝚖𝚙𝚊𝚝𝚒𝚋𝚒𝚕𝚒𝚝𝚢: ${lovePercent}% 💘`;

      await message.reply({
        body: text,
        attachment: { buffer: buf, mimetype: mimeOf(buf), fileName: "pair2.png" },
      });
    } catch (error) {
      console.error("❌ Pair2 command error:", error);
      message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ An error occurred while trying to find a match. Please try again later.\n╚══════════════════╝");
    }
  },
};
