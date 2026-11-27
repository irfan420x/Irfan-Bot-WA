// .guess — Guess the emoji (WhatsApp port).
// Payout is UNCHANGED from the Messenger original:
//   correct guess pays bet x 4 (the stake is NOT deducted first —
//   a win is +bet*4 net, a loss is -bet).
//   Limit: 20 plays per 12 hours. Reply within 30 seconds.
//
// WhatsApp port notes (vs the Messenger original):
// - api.editMessage does not exist here, so the reveal (which slot
//   was correct) is sent as its own message instead of an edit.
// - usersData has no addMoney(): balances change with get + set of
//   the whole user object.
// - The WA handler passes no usersData to onReply, so onReply resolves
//   it from global.wabot.db or core/database/db.js (same store the
//   handler itself falls back to).

const { fm, parseBet, box } = require("./_gameUI.js");
const { usersData: dbUsersData } = require("../../../core/database/db.js");

const guessOptions = ["🐣", "🙂", "🍀", "🌸", "🌼", "🐟", "🍎", "🍪", "🦄"];

const LIMIT_INTERVAL_HOURS = 12;
const MAX_PLAYS = 20;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// The WA handler calls onReply with { api, event, args, message, Reply }
// and NO usersData — resolve the same store the handler falls back to.
function resolveUsersData(usersData) {
  return usersData
    || (global.wabot && global.wabot.db && global.wabot.db.usersData)
    || dbUsersData;
}

// Reply and resolve the sent message's ID (works with both the _wa.js
// adapter and the built-in fallback translator).
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
    name: "guess",
    version: "1.5",
    countDown: 5,
    role: 0,
    category: "game",
    description: "Guess the emoji!",
    guide: "{pn} [amount] - Play guessing game\n{pn} top - See leaderboard"
  },

  onStart: async function ({ args, event, message, usersData }) {
    usersData = resolveUsersData(usersData);
    const senderID = event.senderID;

    if (args[0] === "top") {
      const allUsers = await usersData.getAll();
      const filtered = allUsers
        .filter(u => u.data && u.data.guessWin)
        .sort((a, b) => ((b.data && b.data.guessWin) || 0) - ((a.data && a.data.guessWin) || 0))
        .slice(0, 20);

      if (filtered.length === 0)
        return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ 🚫 No winners yet!\n╚══════════════════╝");

      const topList = filtered.map((u, i) =>
        `${i + 1}. ${u.name || u.id || "Unknown"} - 🏆 ${u.data.guessWin || 0} wins`
      ).join("\n");

      return message.reply(`🏆 TOP 20 GUESS WINNERS 🏆\n\n${topList}`);
    }

    const user = await usersData.get(senderID) || {};
    if (!user.data) user.data = {};
    const amount = parseBet(args[0]);

    if (!amount)
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⚠️ Please enter a valid positive amount to bet.\n╚══════════════════╝");

    if ((user.money || 0) < amount)
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ 💸 You don't have enough money to play.\n╚══════════════════╝");

    // Limit logic
    const now = Date.now();
    const lastReset = user.data.guessLastReset || 0;
    let playHistory = user.data.guessPlayHistory || [];

    // If last reset was over 12 hours ago, reset the play history
    if (now - lastReset > LIMIT_INTERVAL_HOURS * 60 * 60 * 1000) {
      playHistory = [];
      user.data.guessLastReset = now;
      user.data.guessPlayHistory = [];
      await usersData.set(senderID, user);
    }

    if (playHistory.length >= MAX_PLAYS) {
      return message.reply(`⛔ You've reached the limit of ${MAX_PLAYS} plays in ${LIMIT_INTERVAL_HOURS} hours.\n⏳ Please wait and try again later.`);
    }

    // Draw 3 DISTINCT options (no repeats — every slot is a real choice).
    const pool = [...guessOptions];
    const options = [];
    while (options.length < 3) {
      const idx = Math.floor(Math.random() * pool.length);
      options.push(pool.splice(idx, 1)[0]);
    }

    const correctIndex = Math.floor(Math.random() * 3);
    const correctEmoji = options[correctIndex];

    const remaining = MAX_PLAYS - playHistory.length - 1;

    const question =
      `🎯 GUESS THE EMOJI!\n\n` +
      `1️⃣ ${options[0]}    2️⃣ ${options[1]}    3️⃣ ${options[2]}\n\n` +
      `💰 Bet: ${fm(amount)}  •  🎮 Plays left: ${remaining}/${MAX_PLAYS}\n` +
      `Reply with 1, 2, or 3 within 30 seconds to guess.`;

    const msgID = await replyWithId(message, question);
    if (!msgID) {
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Couldn't start the game — please try again.\n╚══════════════════╝");
    }

    const timeout = setTimeout(() => {
      message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⌛ Time's up! You didn't guess in time.\n╚══════════════════╝");
      dropReply(msgID);
    }, 30 * 1000);

    registerReply(msgID, {
      name: "guess",
      author: senderID,
      correct: correctIndex + 1,
      bet: amount,
      emoji: correctEmoji,
      options,
      messageID: msgID,
      timeout
    });
  },

  onReply: async function ({ event, message, Reply, usersData }) {
    usersData = resolveUsersData(usersData);
    const senderID = event.senderID;

    if (!Reply || senderID !== Reply.author) return;

    if (!["1", "2", "3"].includes((event.body || "").trim()))
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⚠️ Please reply with 1, 2, or 3 only.\n╚══════════════════╝");

    clearTimeout(Reply.timeout);
    dropReply(Reply.messageID);

    const user = await usersData.get(senderID) || {};
    if (!user.data) user.data = {};
    const guess = parseInt((event.body || "").trim());

    const now = Date.now();
    const playHistory = user.data.guessPlayHistory || [];

    // Add current time to history
    playHistory.push(now);
    user.data.guessPlayHistory = playHistory;

    const remaining = MAX_PLAYS - playHistory.length;
    const limitLines = [
      `🎮 You've played ${playHistory.length}/${MAX_PLAYS} times in the last ${LIMIT_INTERVAL_HOURS} hours.`,
      remaining > 0 ? `🕹️ You can play ${remaining} more time(s).` : `⛔ No more plays left.`
    ];

    let resultMessage = "";

    if (guess === Reply.correct) {
      const newMoney = (user.money || 0) + Reply.bet * 4;
      const wins = (user.data.guessWin || 0) + 1;
      user.money = newMoney;
      user.data.guessWin = wins;
      await usersData.set(senderID, user);

      resultMessage = box("🏆 YOU WIN", [
        `✅ Correct! The emoji was ${Reply.emoji}`,
        `💰 You won: ${fm(Reply.bet * 4)} coins (${fm(Reply.bet)} × 4)`,
        `💵 Your new balance: ${fm(newMoney)} coins`,
        `🎉 Congratulations!`
      ], limitLines);
    } else {
      const newMoney = (user.money || 0) - Reply.bet;
      user.money = newMoney;
      await usersData.set(senderID, user);

      resultMessage = box("💀 YOU LOSE", [
        `❌ Wrong! The correct answer was ${Reply.correct} → ${Reply.emoji}`,
        `💸 You lost: ${fm(Reply.bet)} coins`,
        `💵 Your new balance: ${fm(newMoney)} coins`,
        `😢 Better luck next time!`
      ], limitLines);
    }

    /* ===== REVEAL: highlight the correct slot on the question card =====
       (sent as its own message — this bot has no editMessage). */
    const reveal = Reply.options.map((e, i) =>
      `${i + 1}️⃣ ${e} ${i + 1 === Reply.correct ? "✅" : "❌"}`
    ).join("    ");
    try {
      await message.reply(`🎯 GUESS THE EMOJI! — REVEAL!\n\n${reveal}`);
    } catch (e) {
      // Question already gone — the result card still goes out below.
    }
    await sleep(900);

    return message.reply(resultMessage);
  }
};
