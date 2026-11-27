// .userinfo — port of the Messenger bot's user_info.js v2.1 pattern:
// mention-first target resolution, enriched card (money / level / exp,
// group admin, nickname, messages here), ORION-brand card rendered via
// the shared _card.js helper (avatar drawn on the card, initial-letter
// fallback when the user has no profile picture).
const card = require("../_card.js");

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

    // 2. Name (best-effort, never throws). Order: live onWhatsApp push name,
    //    then the sender's live push name (self), then the stored DB name
    //    (the handler saves the push name on every command), then the raw ID.
    let displayName = null;
    try {
      const info = await api.getUserInfo(targetID);
      if (info && info.name) displayName = info.name;
    } catch (_e) { /* fall through */ }
    if (!displayName && String(targetID) === String(event.senderID).replace(/\D/g, "") && event.senderName) {
      displayName = event.senderName;
    }
    if (!displayName) {
      try {
        const stored = await usersData.get(targetID);
        if (stored && stored.name) displayName = stored.name;
      } catch (_e) { /* fall through */ }
    }
    if (!displayName) displayName = targetID;

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
    let groupData = null;
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
      groupData = { isAdmin, nickname, msgCount };
      groupLine = `\n${toBold("Group Admin")}: ${isAdmin ? "Yes" : "No"}\n${toBold("Nickname")}: ${nickname}\n${toBold("Messages here")}: ${msgCount}`;
    }

    const cardText = [
      toBold("User Info"),
      `${toBold("Name")}: ${displayName}`,
      `${toBold("User ID")}: ${targetID}`,
      `${toBold("Money")}: ${money.toLocaleString("en-US")}`,
      `${toBold("Level")}: ${level}`,
      `${toBold("Exp")}: ${exp.toLocaleString("en-US")}`
    ].join("\n") + groupLine;

    // 5. ORION card: avatar on the card (initial-letter fallback when the
    //    user has no picture). Any render failure falls back to text only.
    try {
      const buf = await renderUserinfoCard({
        sock, displayName, targetID, money, level, exp, groupData,
      });
      if (buf) {
        // No caption with the card — the card already shows the info, so
        // the full text below it would just duplicate it.
        return message.reply({
          body: "",
          attachment: { buffer: buf, mimetype: "image/png", fileName: "userinfo.png" },
        });
      }
    } catch (e) {
      console.error("Userinfo card render failed:", e.message);
    }
    return message.reply(cardText);
  }
};

/**
 * Render the 1000x520 userinfo card and return a PNG buffer, or null when
 * canvas is unavailable. Never throws for a missing avatar — the avatar
 * fetch returns null and drawAvatar draws the initial-letter fallback.
 */
async function renderUserinfoCard({ sock, displayName, targetID, money, level, exp, groupData }) {
  const c = card.newCard(1000, 520);
  if (!c) return null;
  const { canvas, ctx, W, H } = c;

  card.title(ctx, W, "USER INFO", 62, 40, card.BRAND.purpleLight);

  // Avatar (left) with purple ring; initial-letter fallback when absent.
  const avatarBuf = await card.fetchAvatar(sock, targetID + "@s.whatsapp.net");
  const avatarImg = await card.loadImageSafe(avatarBuf);
  card.drawAvatar(ctx, {
    img: avatarImg,
    x: 130, y: 175, r: 85,
    name: displayName,
    ring: card.BRAND.purple,
  });

  // Name + User ID (right of the avatar).
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = card.BRAND.text;
  ctx.font = "bold 40px sans-serif";
  ctx.fillText(card.truncate(displayName, 26), 250, 160);
  ctx.fillStyle = card.BRAND.muted;
  ctx.font = "24px sans-serif";
  ctx.fillText("ID: " + targetID, 250, 205);

  // Stats: left column (money / level / exp), right column (group lines).
  card.statRow(ctx, 60, 320, "Money:", "$" + money.toLocaleString("en-US"));
  card.statRow(ctx, 60, 362, "Level:", String(level));
  card.statRow(ctx, 60, 404, "Exp:", exp.toLocaleString("en-US"));
  if (groupData) {
    card.statRow(ctx, 560, 320, "Group Admin:", groupData.isAdmin ? "Yes" : "No");
    card.statRow(ctx, 560, 362, "Nickname:", card.truncate(groupData.nickname, 18));
    card.statRow(ctx, 560, 404, "Messages here:", String(groupData.msgCount));
  }

  card.footer(ctx, W, H);
  return card.toPng(canvas);
}

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
