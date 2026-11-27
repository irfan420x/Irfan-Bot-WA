// .userinfo — port of the Messenger bot's user_info.js v2.1 pattern:
// mention-first target resolution, enriched card (money / level / exp,
// group admin, nickname, messages here), avatar attached when fetchable.
const https = require("https");

module.exports = {
  config: {
    name: "userinfo",
    aliases: ["profile"],
    version: "2.1",
    role: 0,
    countDown: 3,
    description: "Show information about a user (mention, reply, or yourself).",
    category: "info",
    guide: "{pn}userinfo [@user]"
  },

  onStart: async function ({ api, event, args, message, threadsData, usersData, sock }) {
    // 1. Target resolution: mention first, then numeric arg, then quoted
    //    sender, then self. (The Messenger bug was reading args[0] "@Name"
    //    as an ID; mentions are resolved here first.)
    let targetID = null;
    const mentionIDs = event.mentions ? Object.keys(event.mentions) : [];
    if (mentionIDs.length > 0) {
      targetID = String(mentionIDs[0]).replace(/\D/g, "");
    } else if (args[0] && /^\d+$/.test(String(args[0]).trim())) {
      targetID = String(args[0]).trim();
    } else if (event.messageReply && event.messageReply.senderID) {
      targetID = String(event.messageReply.senderID).replace(/\D/g, "");
    } else {
      targetID = String(event.senderID).replace(/\D/g, "");
    }
    if (!targetID) {
      return message.reply("Could not work out whose info to show.");
    }

    // 2. Name (best-effort, never throws).
    let displayName = targetID;
    try {
      const info = await api.getUserInfo(targetID);
      if (info && info.name) displayName = info.name;
    } catch (_e) { /* keep the raw ID */ }

    // 3. Bot data: money / exp / level (same curve as the Messenger bot:
    //    deltaNext = 5, level = floor((1 + sqrt(1 + 8*exp/5)) / 2)).
    let money = 0;
    let exp = 0;
    try {
      const user = await usersData.get(targetID);
      money = (user && typeof user.money === "number") ? user.money : 0;
      exp = (user && typeof user.exp === "number") ? user.exp : 0;
    } catch (_e) { /* show zeros */ }
    const level = Math.floor((1 + Math.sqrt(1 + (8 * exp) / 5)) / 2);

    // 4. Group data (groups only): admin, nickname, messages here.
    let groupLine = "";
    if (event.isGroup) {
      let isAdmin = false;
      let nickname = "—";
      let msgCount = "—";
      try {
        const thread = await api.getThreadInfo(event.threadIDFull || event.threadID);
        if (thread && Array.isArray(thread.adminIDs)) {
          isAdmin = thread.adminIDs.includes(targetID);
        }
        if (thread && thread.userInfo && thread.userInfo[targetID]) {
          nickname = thread.userInfo[targetID].nickname || "—";
        }
      } catch (_e) { /* leave defaults */ }
      try {
        const tdata = await threadsData.get(event.threadID);
        const member = (tdata && Array.isArray(tdata.members))
          ? tdata.members.find((m) => String(m.userID || m.id) === targetID)
          : null;
        if (member && typeof member.count === "number") msgCount = String(member.count);
        if (member && member.nickname) nickname = member.nickname;
      } catch (_e) { /* leave defaults */ }
      groupLine = `\n${toBold("Group Admin")}: ${isAdmin ? "Yes" : "No"}\n${toBold("Nickname")}: ${nickname}\n${toBold("Messages here")}: ${msgCount}`;
    }

    const card = [
      toBold("User Info"),
      `${toBold("Name")}: ${displayName}`,
      `${toBold("User ID")}: ${targetID}`,
      `${toBold("Money")}: ${money.toLocaleString("en-US")}`,
      `${toBold("Level")}: ${level}`,
      `${toBold("Exp")}: ${exp.toLocaleString("en-US")}`
    ].join("\n") + groupLine;

    // 5. Avatar: profile picture when fetchable, else text-only card.
    let attachment = null;
    try {
      if (sock && typeof sock.profilePictureUrl === "function") {
        const url = await sock.profilePictureUrl(targetID + "@s.whatsapp.net", "image");
        if (url) {
          const buf = await fetchBuffer(url);
          if (buf && isImageBuffer(buf)) {
            attachment = { buffer: buf, mimetype: "image/jpeg", fileName: "avatar.jpg" };
          }
        }
      }
    } catch (_e) { /* text-only fallback */ }

    if (attachment) {
      return message.reply({ body: card, attachment });
    }
    return message.reply(card);
  }
};

// Mathematical-bold conversion (same style as the Messenger bot's cards).
function toBold(text) {
  const map = {};
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  for (let i = 0; i < upper.length; i++) map[upper[i]] = String.fromCodePoint(0x1d400 + i);
  for (let i = 0; i < lower.length; i++) map[lower[i]] = String.fromCodePoint(0x1d41a + i);
  for (let i = 0; i < digits.length; i++) map[digits[i]] = String.fromCodePoint(0x1d7ce + i);
  return String(text).split("").map((c) => map[c] || c).join("");
}

function fetchBuffer(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", () => resolve(null));
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

function isImageBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
  // JPEG FF D8, PNG 89 50 4E 47
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  return false;
}
