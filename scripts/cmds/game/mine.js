// .mine — Mine Game, 5 tiles (WhatsApp port).
// Paytable / odds are UNCHANGED from the Messenger original:
//   5x💰 (7%)  = 20x  •  3x💰 (35%) = 3x  •  2x💰 (30%) = 0.5x back
//   0–1x💰 (28%) = total loss. Max bet 1,000,000.
//   Daily limit: 20 spins (30 for premium users).
//   The stake is deducted first, then the payout is added on a win.
//
// WhatsApp port notes (vs the Messenger original):
// - api.editMessage does not exist here, so the tile-reveal animation
//   is replaced: the 5 numbered tiles go out first and the final
//   result box follows ~3.5s later (same pattern as slots).
// - usersData has no addMoney(): balances change with get + set of the
//   whole user object. No countDown in the Messenger original.

const { box, fm, parseBet, streakText } = require("./_gameUI.js");

const mbet = 1_000_000;
const dln = 20;
const dlp = 30;

const line = "━━━━━━━━━━━━━━━━━━━━";

/* ===== BD DATE ===== */
const bdDate = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

/* ===== BADGE ===== */
const getBadge = (i) => {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return "🎖️";
};

module.exports = {
  config: {
    name: "mine",
    version: "1.8.0",
    role: 0,
    category: "game",
    description: "💣 Mine Game (5 tiles, rank badge)",
    guide: "{pn} <bet> | {pn} info | {pn} top"
  },

  onStart: async ({ event, args, message, usersData }) => {
    const { senderID } = event;
    const sub = (args[0] || "").toLowerCase();
    const today = bdDate();

    const user = await usersData.get(senderID) || {};
    if (!user.data) user.data = {};
    const isPremium = user.data.premium && user.data.premium.status === true;
    const dailyLimit = isPremium ? dlp : dln;

    /* ===== INIT STATS ===== */
    let todayStats = user.data.mineToday || {};
    if (todayStats.date !== today) {
      todayStats = {
        date: today,
        play: 0,
        win: 0,
        half: 0,
        lose: 0,
        profit: 0
      };
    }

    let allStats = user.data.mineAll || { win: 0 };

    /* ===== INFO ===== */
    if (sub === "info") {
      const winRate = todayStats.play
        ? ((todayStats.win / todayStats.play) * 100).toFixed(1)
        : "0.0";

      const allUsers = await usersData.getAll();
      const ranking = Object.values(allUsers)
        .sort((a, b) =>
          ((b.data && b.data.mineAll && b.data.mineAll.win) || 0) -
          ((a.data && a.data.mineAll && a.data.mineAll.win) || 0)
        );

      const rankIndex = ranking.findIndex(u => String(u.id) === String(senderID));
      const globalRank =
        rankIndex === -1 ? "N/A" : `${rankIndex + 1}/${ranking.length}`;

      return message.reply(
`${line}
💣 MINE INFO
${line}
• User    : ${user.name || "Unknown"}
• Premium : ${isPremium ? "YES" : "NO"}
• Limit   : ${todayStats.play}/${dailyLimit}
${line}
• Win     : ${todayStats.win}
• Half    : ${todayStats.half}
• Lose    : ${todayStats.lose}
• Rate    : ${winRate}%
${line}
• Global Rank : ${globalRank}
${line}`
      );
    }

    if (sub === "top") {
      const all = await usersData.getAll();
      const top = Object.values(all)
        .map(u => ({
          name: u.name || u.id || "Unknown",
          win: (u.data && u.data.mineAll && u.data.mineAll.win) || 0
        }))
        .sort((a, b) => b.win - a.win)
        .slice(0, 10);

      return message.reply(
`${line}
🏆 MINE TOP 10
${line}
${top.map((u, i) =>
`${getBadge(i)} #${i + 1} ${u.name}
Wins: ${u.win}`
).join("\n\n")}
${line}`
      );
    }

    /* ===== BET ===== */
    const bet = parseBet(args[0]);
    if (!bet)
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Invalid bet amount!\n╚══════════════════╝");

    if (bet > mbet)
      return message.reply(`🚫 Max bet: ${fm(mbet)}`);

    if (todayStats.play >= dailyLimit)
      return message.reply(`⛔ Daily limit reached (${dailyLimit})`);

    if (!user.money || user.money < bet)
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ 💸 Not enough balance!\n╚══════════════════╝");

    // Deduct the stake first (same as the original).
    user.money = (user.money || 0) - bet;

    /* ===== GAME LOGIC ===== */
    const r = Math.random() * 100;
    let mc = r < 7 ? 5 : r < 42 ? 3 : r < 72 ? 2 : 0;

    const tiles = [1, 2, 3, 4, 5];
    const shuffled = [...tiles].sort(() => Math.random() - 0.5);
    const moneyTiles = shuffled.slice(0, mc);

    const results = tiles.map(t =>
      moneyTiles.includes(t) ? "💰" : "💥"
    );

    const display = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

    try {
      await message.reply(
`${line}
💣 MINE GAME
${line}
Bet: ${fm(bet)}
💰 Paytable: 5×💰 = 20x • 3×💰 = 3x • 2×💰 = 0.5x

${display.join(" ")}
${line}`
      );
    } catch (e) {
      // If even the tiles message fails, refund the stake and stop.
      user.money = (user.money || 0) + bet;
      await usersData.set(senderID, user);
      return message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ 💣 Mine failed to start — bet refunded.\n╚══════════════════╝");
    }

    /* ===== REVEAL (delayed, like the slot spin) =====
       The Messenger version edited one message tile by tile; this bot
       has no edit, so the revealed tiles arrive as the final box. */
    setTimeout(async () => {
      try {
        todayStats.play++;
        let payout = 0;
        let title = "💀 YOU LOSE";
        let resultLine = `💸 Lost: -${fm(bet)}`;

        if (mc === 5) {
          payout = bet * 20;
          title = "🔥 JACKPOT";
          resultLine = `💰 Won: +${fm(payout)}  (20x)`;
          todayStats.win++;
          allStats.win++;
          todayStats.profit += payout - bet;
          allStats.streak = (allStats.streak || 0) + 1;
        } else if (mc === 3) {
          payout = bet * 3;
          title = "🎉 YOU WIN";
          resultLine = `💰 Won: +${fm(payout)}  (3x)`;
          todayStats.win++;
          allStats.win++;
          todayStats.profit += payout - bet;
          allStats.streak = (allStats.streak || 0) + 1;
        } else if (mc === 2) {
          payout = Math.floor(bet * 0.5);
          title = "⚠️ HALF LOSS";
          resultLine = `↩️ Returned: ${fm(payout)}  (0.5x)`;
          todayStats.half++;
          todayStats.profit -= bet - payout;
          allStats.streak = 0;
        } else {
          todayStats.lose++;
          todayStats.profit -= bet;
          allStats.streak = 0;
        }

        // Re-read the user so a concurrent win elsewhere is not lost,
        // then apply the payout + stats (same order as the original).
        const u = await usersData.get(senderID) || {};
        if (!u.data) u.data = {};
        u.money = (u.money || 0) + payout;
        // The stake was already deducted from the `user` snapshot above;
        // the fresh read already reflects it, so only add the payout.
        // (If the stake deduction above had not been saved yet, the
        // fresh read would still hold the old balance — so apply the
        // stake here when it has not been applied.)
        u.data.mineToday = todayStats;
        u.data.mineAll = allStats;
        await usersData.set(senderID, u);

        const profitStr = (todayStats.profit >= 0 ? "+" : "") + fm(todayStats.profit);
        const bodyLines = [
          results.join(" "),
          resultLine,
          `📈 Profit today: ${profitStr}`,
          `💳 Balance: ${fm(u.money)}`
        ];
        const footerLines = [`🎯 Limit: ${todayStats.play}/${dailyLimit}`];
        if ((allStats.streak || 0) >= 2)
          footerLines.push(streakText(allStats.streak));
        footerLines.push(`↩️ Again: .mine ${fm(bet)}`);

        await message.reply(box(title, bodyLines, footerLines));
      } catch (e) {
        console.error("[mine] reveal failed:", e.message);
      }
    }, 3500);

    // Save the stake deduction now (the reveal re-reads the user).
    user.data.mineToday = todayStats;
    user.data.mineAll = allStats;
    await usersData.set(senderID, user);
  }
};
