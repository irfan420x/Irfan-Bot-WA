// .slots — Ultra Premium Stylish Slot Machine (WhatsApp port).
// Paytable is UNCHANGED from the Messenger original:
//   7️⃣7️⃣7️⃣ — 10x
//   Any 3 same — 5x
//   Any pair — 2x
// The stake is deducted first, then the payout is added on a win
// (net on a win = +payout - bet, net on a loss = -bet).
// Daily limit: 20 spins (30 for premium users), max bet 6,000,000.
//
// WhatsApp port notes (vs the Messenger original):
// - The api.editMessage spin animation does not exist in this bot's api
//   shim, so the spin frame is sent once and the final result follows as
//   a second message ~1.8s later.
// - usersData.set takes the whole updated user object (the original set
//   a partial object with "data.slotsToday" / "data.slotsAll" dot-paths).

const { box, fm, parseBet, streakText } = require("./_gameUI.js");

const dn = 20;
const dp = 30;
const mbet = 6_000_000;

const em = [
  { emoji: "🍒", weight: 30 },
  { emoji: "🍋", weight: 25 },
  { emoji: "🍇", weight: 20 },
  { emoji: "🍉", weight: 15 },
  { emoji: "⭐", weight: 7 },
  { emoji: "7️⃣", weight: 3 }
];

/* ===== BD DATE ===== */
const bdDate = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

/* ===== ROLL ===== */
const roll = () => {
  const total = em.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const s of em) {
    if (r < s.weight) return s.emoji;
    r -= s.weight;
  }
  return em[0].emoji;
};

module.exports = {
  config: {
    name: "slots",
    aliases: ["slot"],
    version: "2.2.0",
    role: 0,
    countDown: 5,
    description: "🎰 Ultra Premium Stylish Slot Machine",
    category: "game",
    guide: "   {pn} <amount>: Spin the slot\n   {pn} info: View your stats\n   {pn} top: View leaderboard"
  },

  onStart: async ({ event, args, message, usersData }) => {
    const { senderID } = event;
    const sub = (args[0] || "").toLowerCase();
    const today = bdDate();

    const user = await usersData.get(senderID) || {};
    if (!user.data) user.data = {};
    const isPremium = user.data.premium && user.data.premium.status === true;
    const dl = isPremium ? dp : dn;

    /* ===== INIT STATS ===== */
    let todayStats = user.data.slotsToday || {};
    if (todayStats.date !== today) {
      todayStats = { date: today, play: 0, win: 0, lose: 0, winMoney: 0 };
    }

    let allStats = user.data.slotsAll || { play: 0, win: 0 };

    /* ===== INFO ===== */
    if (sub === "info") {
      const rate = todayStats.play
        ? ((todayStats.win / todayStats.play) * 100).toFixed(1)
        : "0";

      return message.reply(box("🎰 SLOT INFO", [
        `👤 User: ${user.name || "User"}`,
        `👑 Premium: ${isPremium ? "✅" : "❌"}`,
        `🎯 Daily limit: ${dl}`,
        "",
        "💰 PAYTABLE",
        "7️⃣7️⃣7️⃣ — 10x",
        "Any 3 same — 5x",
        "Any pair — 2x"
      ], [
        `📅 Today: ${todayStats.play} played • ${todayStats.win} wins`,
        `📈 Win rate: ${rate}%`,
        `💰 Profit today: ${fm(todayStats.winMoney)}`
      ]));
    }

    /* ===== TOP ===== */
    if (sub === "top") {
      const all = await usersData.getAll();
      const top = Object.values(all)
        .map(u => ({
          name: u.name || "Unknown",
          win: (u.data && u.data.slotsAll && u.data.slotsAll.win) || 0
        }))
        .sort((a, b) => b.win - a.win)
        .slice(0, 5);

      let msg = `╔═══ 𝐒𝐋𝐎𝐓 𝐓𝐎𝐏 ═══╗\n`;
      top.forEach((u, i) => {
        msg += `║ #${i + 1} ${u.name}: ${u.win} 🏆\n`;
      });
      msg += `╚══════════════════╝`;
      return message.reply(msg);
    }

    /* ===== BET ===== */
    const bet = parseBet(args[0]);
    if (!bet)
      return message.reply("╔═══ 𝐒𝐘𝐒𝐓𝐄𝐌 ═══╗\n║ ⚠️ Invalid bet amount\n╚══════════════════╝");

    if (bet > mbet)
      return message.reply(`╔═══ 𝐒𝐘𝐒𝐓𝐄𝐌 ═══╗\n║ 🚫 Max Bet: ${fm(mbet)}\n╚══════════════════╝`);

    if (todayStats.play >= dl)
      return message.reply(`╔═══ 𝐒𝐘𝐒𝐓𝐄𝐌 ═══╗\n║ ⛔ Daily limit reached\n╚══════════════════╝`);

    if ((user.money || 0) < bet)
      return message.reply(`╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ 💸 Need ${fm(bet - (user.money || 0))} more\n╚══════════════════╝`);

    /* ===== SPIN ===== */
    const s1 = roll();
    const s2 = roll();
    const s3 = roll();

    // `win` is the GROSS payout (0 on a loss). The stake is deducted
    // separately in the balance update below — previously a win kept
    // the stake AND added the payout.
    let win = 0;
    let mult = 0;
    let resultTitle = "💀 YOU LOSE";

    if (s1 === s2 && s2 === s3 && s1 === "7️⃣") {
      win = bet * 10;
      mult = 10;
      resultTitle = "🔥 JACKPOT";
    } else if (s1 === s2 && s2 === s3) {
      win = bet * 5;
      mult = 5;
      resultTitle = "🏆 YOU WIN";
    } else if (s1 === s2 || s2 === s3 || s1 === s3) {
      win = bet * 2;
      mult = 2;
      resultTitle = "🏆 YOU WIN";
    }

    // Two 7️⃣ = one reel away from the jackpot (always a pair win)
    const sevens = [s1, s2, s3].filter(s => s === "7️⃣").length;
    const nearMiss = sevens === 2;

    /* ===== UPDATE ===== */
    todayStats.play++;
    allStats.play++;

    if (win > 0) {
      todayStats.win++;
      todayStats.winMoney += win;
      allStats.win++;
      allStats.streak = (allStats.streak || 0) + 1;
    } else {
      todayStats.lose++;
      allStats.streak = 0;
    }

    // Deduct the stake first, then add the payout on a win:
    // net on a win = +payout - bet, net on a loss = -bet.
    const newBalance = (user.money || 0) - bet + win;

    user.money = newBalance;
    user.data.slotsToday = todayStats;
    user.data.slotsAll = allStats;
    await usersData.set(senderID, user);

    /* ===== RESULT BOX ===== */
    const bodyLines = [`🎰  ${s1}  ║  ${s2}  ║  ${s3}  🎰`];
    if (win > 0)
      bodyLines.push(`💰 Won: +${fm(win)}  (${mult}x)`);
    else
      bodyLines.push(`💸 Lost: -${fm(bet)}`);
    if (nearMiss)
      bodyLines.push("😮 So close — two 7️⃣!");
    bodyLines.push(`💳 Balance: ${fm(newBalance)}`);

    const footerLines = [`🎯 Today: ${todayStats.play}/${dl}`];
    if ((allStats.streak || 0) >= 2)
      footerLines.push(streakText(allStats.streak));
    footerLines.push(`↩️ Again: .slots ${fm(bet)}`);

    const finalMsg = box(resultTitle, bodyLines, footerLines);

    /* ===== SPIN ANIMATION =====
       The Messenger version edited one message through api.editMessage;
       this bot's api shim has no edit, so the spin frame goes out first
       and the final result follows as a second message. */
    const spinFrame = () => {
      const r1 = roll(), r2 = roll(), r3 = roll();
      return box("🎰 SLOT MACHINE", [
        `🎰  ${r1}  ║  ${r2}  ║  ${r3}  🎰`,
        "🌀 Spinning..."
      ]);
    };

    try {
      await message.reply(spinFrame());
    } catch (e) {
      // If even the spin frame fails, still deliver the result.
      return message.reply(finalMsg);
    }
    setTimeout(() => {
      try {
        const p = message.reply(finalMsg);
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (e) {}
    }, 1800);
  }
};
