// .colorpick — Stylish Colorpick (WhatsApp port).
// Payout is UNCHANGED from the Messenger original:
//   1-in-3 pick; win = +bet net, loss = -bet (the stake is never
//   deducted up front — the reply settles it).
//   Max bet 1,000,000. Daily limit: 20 plays (30 for premium users).
//
// WhatsApp port notes (vs the Messenger original):
// - api.editMessage does not exist here, so the flip/reveal beats are
//   sent as their own message instead of edits, then the result box.
// - usersData has no addMoney(): balances change with get + set of the
//   whole user object.
// - The original never removed its reply registration after a pick;
//   this port deletes it after the first valid pick so one question
//   cannot be answered (and charged) twice.
// - The WA handler passes no usersData to onReply, so onReply resolves
//   it from global.wabot.db or core/database/db.js (same store the
//   handler itself falls back to). No countDown in the original.

const { fm, parseBet, box, streakText } = require("./_gameUI.js");
const { usersData: dbUsersData } = require("../../../core/database/db.js");

const mbet = 1_000_000;
const dln = 20;
const dlp = 30;

const bdDate = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function resolveUsersData(usersData) {
  return usersData
    || (global.wabot && global.wabot.db && global.wabot.db.usersData)
    || dbUsersData;
}

function replyWithId(message, content) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (id) => { if (!done) { done = true; resolve(id || null); } };
    try {
      const p = message.reply(content, (err, info) => finish(!err && info && info.messageID));
      if (p && typeof p.then === "function")
        p.then((info) => finish(info && info.messageID)).catch(() => finish(null));
      else
        setTimeout(() => finish(null), 5000);
    } catch (e) { finish(null); }
  });
}

function registerReply(messageID, entry) {
  if (!messageID || !global.wabot || !global.wabot.replyMap) return false;
  global.wabot.replyMap.set(messageID, { name: entry.name, commandName: entry.name, ...entry });
  return true;
}

function dropReply(messageID) {
  try {
    if (global.wabot && global.wabot.replyMap) global.wabot.replyMap.delete(messageID);
  } catch {}
}

module.exports = {
  config: {
    name: "colorpick",
    aliases: ["cp"],
    version: "2.7.0",
    role: 0,
    category: "game",
    description: "🎨 Stylish Colorpick",
    guide: "{pn} <bet> | {pn} info | {pn} top — Example: {pn} 1k | 1m | 1b"
  },

  onStart: async function ({ event, usersData, args, message }) {
    usersData = resolveUsersData(usersData);
    const { senderID } = event;
    const sub = (args[0] || "").toLowerCase();
    const today = bdDate();

    const user = await usersData.get(senderID) || {};
    if (!user.data) user.data = {};
    const isPremium = user.data.premium && user.data.premium.status === true;
    const dailyLimit = isPremium ? dlp : dln;

    let todayStats = user.data.colorToday || {};
    if (todayStats.date !== today) {
      todayStats = { date: today, play: 0, win: 0, lose: 0 };
    }

    let allStats = user.data.colorAll || { win: 0 };

    /* ===== INFO ===== */
    if (sub === "info") {
      const rate = todayStats.play
        ? ((todayStats.win / todayStats.play) * 100).toFixed(1)
        : "0.0";

      return message.reply(
`
🎨 COLORPICK INFO
══════════════════════════════
• User   : ${user.name || "Unknown"}
• Premium: ${isPremium ? "YES" : "NO"}
• Limit  : ${todayStats.play}/${dailyLimit}

══════════════════════════════
• Played : ${todayStats.play}
• Win    : ${todayStats.win}
• Lose   : ${todayStats.lose}
• Rate   : ${rate}%
══════════════════════════════`);
    }

    /* ===== TOP ===== */
    if (sub === "top") {
      const all = await usersData.getAll();
      const top = Object.values(all)
        .map(u => ({
          name: u.name || u.id || "Unknown",
          win: (u.data && u.data.colorAll && u.data.colorAll.win) || 0
        }))
        .sort((a, b) => b.win - a.win)
        .slice(0, 10);

      return message.reply(
`
🏆 COLORPICK TOP 10
══════════════════════════════
${top.map((u, i) =>
`• #${i + 1} ${u.name}
  Wins : ${u.win}`
).join("\n\n")}
══════════════════════════════`);
    }

    /* ===== BET ===== */
    const bet = parseBet(args[0]);
    if (!bet || isNaN(bet) || bet <= 0)
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Invalid bet amount.\n╚══════════════════╝");

    if (bet > mbet)
      return message.reply(`🚫 Max bet: ${fm(mbet)}`);

    if (todayStats.play >= dailyLimit)
      return message.reply(
        `⛔ Daily limit reached (${dailyLimit})`
      );

    if (!user.money || user.money < bet)
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ 💸 Not enough balance.\n╚══════════════════╝");

    /* ===== GAME ===== */
    // Distinct colour squares — every option is easy to tell apart.
    const colors = [
      "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "⬛", "⬜",
      "🟫", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪"
    ];

    const options = [];
    while (options.length < 3) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      if (!options.includes(c)) options.push(c);
    }

    const correct = options[Math.floor(Math.random() * 3)];
    todayStats.play++;

    user.data.colorToday = todayStats;
    user.data.colorAll = allStats;
    await usersData.set(senderID, user);

    const msgID = await replyWithId(message,
`
🎨 COLOR PICK
══════════════════════════════
1️⃣ ${options[0]}
2️⃣ ${options[1]}
3️⃣ ${options[2]}

══════════════════════════════
• Bet   : ${fm(bet)}
• Limit : ${todayStats.play}/${dailyLimit}
🎲 Odds : 1 in 3 • Win = +${fm(bet)}
• Reply 1 / 2 / 3
══════════════════════════════`);
    if (!msgID) {
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Couldn't start the game — please try again.\n╚══════════════════╝");
    }

    registerReply(msgID, {
      name: "colorpick",
      author: senderID,
      bet,
      options,
      correct,
      messageID: msgID
    });
  },

  onReply: async function ({ event, usersData, message, Reply }) {
    usersData = resolveUsersData(usersData);
    if (!Reply || event.senderID !== Reply.author) return;

    const pick =
      (event.body || "").trim() === "1" ? Reply.options[0] :
      (event.body || "").trim() === "2" ? Reply.options[1] :
      (event.body || "").trim() === "3" ? Reply.options[2] : null;

    if (!pick) return;

    // One question, one pick — free the registration now.
    dropReply(Reply.messageID);

    const bet = Reply.bet;
    const user = await usersData.get(event.senderID) || {};
    if (!user.data) user.data = {};

    const todayStats = user.data.colorToday || { date: bdDate(), play: 0, win: 0, lose: 0 };
    const allStats = user.data.colorAll || { win: 0 };

    const isPremium = user.data.premium && user.data.premium.status === true;
    const dailyLimit = isPremium ? dlp : dln;

    /* ===== REVEAL: flip the options, highlight the correct one =====
       (sent as its own message — this bot has no editMessage). */
    const correctIndex = Reply.options.indexOf(Reply.correct);
    const revealLine = (c, i) =>
      `${i + 1}️⃣ ${c} ${i === correctIndex ? "✅ CORRECT!" : "❌"}`;
    try {
      await message.reply(
        `🎨 COLOR PICK — REVEAL!\n══════════════════════════════\n${Reply.options.map(revealLine).join("\n")}\n══════════════════════════════`
      );
      await sleep(900);
    } catch (e) {
      // Board already gone — the result card still goes out below.
    }

    const playAgain = `🔁 Play again: .cp <bet>`;
    let streak = user.data.colorStreak || 0;

    if (pick === Reply.correct) {
      user.money = (user.money || 0) + bet;
      todayStats.win++;
      allStats.win++;
      streak++;
      user.data.colorToday = todayStats;
      user.data.colorAll = allStats;
      user.data.colorStreak = streak;
      await usersData.set(event.senderID, user);

      return message.reply(
        box("🎉 YOU WIN", [
          `• Pick    : ${pick}`,
          `• Correct : ${Reply.correct}`,
          `• Won     : +${fm(bet)}`,
          `• Balance : ${fm(user.money)}`,
          `• Limit   : ${todayStats.play}/${dailyLimit}`
        ], [
          streakText(streak),
          playAgain
        ])
      );
    } else {
      user.money = (user.money || 0) - bet;
      todayStats.lose++;
      streak = 0;
      user.data.colorToday = todayStats;
      user.data.colorAll = allStats;
      user.data.colorStreak = streak;
      await usersData.set(event.senderID, user);

      return message.reply(
        box("💀 YOU LOSE", [
          `• Pick    : ${pick}`,
          `• Correct : ${Reply.correct}`,
          `• Lost    : -${fm(bet)}`,
          `• Balance : ${fm(user.money)}`,
          `• Limit   : ${todayStats.play}/${dailyLimit}`
        ], [
          playAgain
        ])
      );
    }
  }
};
