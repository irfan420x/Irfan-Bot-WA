// .dice — Dice betting game (WhatsApp port).
// Paytable / odds are UNCHANGED from the Messenger original:
//   high/low/even/odd single bet — 2x
//   "7" single bet — 5x, "double" single bet — 4x
//   two-bet combo (both must hit) — 5x
//   Max bet 1,000,000, min bet 10. Stake deducted first, payout added
//   on a win (net on a win = +payout - bet, net on a loss = -bet).
//
// WhatsApp port notes (vs the Messenger original):
// - usersData has no getMoney/subtractMoney/addMoney: balances change
//   with get + set of the whole user object.
// - No countDown in the Messenger original, so none here either.

const { box, fm, parseBet } = require("./_gameUI.js");

module.exports = {
  config: {
    name: "dice",
    aliases: ["dicegame", "rolldice", "dg", "dicebet"],
    version: "2.2.4",
    role: 0,
    description: "Dice betting game",
    category: "game",
    guide: "{pn} <bet> <amount> | {pn} <bet1> <bet2> <amount> — bets: high, low, even, odd, 7, double. Example: {pn} low odd 300k"
  },

  onStart: async function ({ args, usersData, event, message }) {
    const userID = event.senderID;
    const MAX_BET = 1_000_000;
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

    /* ===== INPUT CHECK ===== */
    if (args.length < 2) {
      return message.reply(
        `🎲 Dice Game\n\n` +
        `Use:\n` +
        `.dice <bet> <amount>\n` +
        `.dice <bet1> <bet2> <amount>\n\n` +
        `Example: .dice low odd 300k`
      );
    }

    let bet1, bet2, rawAmount;

    if (args.length === 2) {
      bet1 = args[0].toLowerCase();
      rawAmount = args[1];
    } else {
      bet1 = args[0].toLowerCase();
      bet2 = args[1].toLowerCase();
      rawAmount = args[2];
    }

    const amount = parseBet(rawAmount);
    const valid = ["high", "low", "even", "odd", "7", "double"];

    if (!valid.includes(bet1) || (bet2 && !valid.includes(bet2))) {
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ Invalid bet. Use high, low, even, odd, 7 or double.\n╚══════════════════╝");
    }

    if (amount === null || amount < 10) {
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ Minimum bet is 10.\n╚══════════════════╝");
    }

    if (amount > MAX_BET) {
      return message.reply(`Max bet is ${fm(MAX_BET)}.`);
    }

    const user = await usersData.get(userID) || {};
    const balance = user.money || 0;
    if (balance < amount) {
      return message.reply(
        `Not enough balance. You have ${fm(balance)}.`
      );
    }

    /* ===== STATS ===== */
    if (!user.data) user.data = {};
    let diceStats = user.data.diceStats || { win: 0, lose: 0 };

    /* ===== PLACE BET ===== */
    user.money = balance - amount;

    /* ===== ROLL ===== */
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const total = dice1 + dice2;

    const check = (b) => {
      if (b === "high") return total >= 8 && total <= 12;
      if (b === "low") return total >= 2 && total <= 6;
      if (b === "even") return total % 2 === 0;
      if (b === "odd") return total % 2 === 1;
      if (b === "7") return total === 7;
      if (b === "double") return dice1 === dice2;
      return false;
    };

    const win = check(bet1) && (bet2 ? check(bet2) : true);

    /* ===== MULTIPLIER ===== */
    let multiplier = 0;
    let title;

    if (win && bet2) {
      multiplier = 5;
      title = "🎉 BIG WIN";
    }
    else if (win) {
      if (bet1 === "double") multiplier = 4;
      else if (bet1 === "7") multiplier = 5;
      else multiplier = 2;
      title = "🏆 YOU WIN";
    }
    else {
      title = "💀 YOU LOSE";
    }

    /* ===== PAYOUT ===== */
    let payout = 0;
    if (multiplier > 0) {
      payout = amount * multiplier;
      user.money = user.money + payout;
    }

    const newBalance = user.money;

    /* ===== UPDATE STATS ===== */
    if (win) diceStats.win++;
    else diceStats.lose++;
    user.data.diceStats = diceStats;
    await usersData.set(userID, user);

    /* ===== RESULT ===== */
    const face1 = faces[dice1 - 1];
    const face2 = faces[dice2 - 1];

    const bodyLines = [
      `🎲 ${face1} + ${face2} = ${total}`,
      `🎯 Bet: ${[bet1, bet2].filter(Boolean).join(" + ")}`
    ];
    if (win) {
      bodyLines.push(`✨ Multiplier: ${multiplier}x`);
      bodyLines.push(`💰 Profit: +${fm(payout - amount)}  (returned ${fm(payout)})`);
    } else {
      bodyLines.push(`💸 Lost: -${fm(amount)}`);
    }
    bodyLines.push(`💳 Balance: ${fm(newBalance)}`);

    const footerLines = [
      `📊 Record: ${diceStats.win}W — ${diceStats.lose}L`,
      "📊 Odds: high/low 2x • 7 = 5x • double = 4x • combo = 5x"
    ];

    return message.reply(box(title, bodyLines, footerLines));
  }
};
