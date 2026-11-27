// .wheel — Wheel of Fortune (WhatsApp port).
// Segments, probabilities, special events, jackpot rules, limits and
// payouts are UNCHANGED from the Messenger original:
//   JACKPOT 25x (1.5%) • DIAMOND 10x (2.5%) • MEGA WIN 7x (4%)
//   GOLD 5x (6%) • SILVER 3x (10%) • BRONZE 2x (15%)
//   LUCKY 1.5x (21%) • BREAK EVEN 1x (15%) • HALF LOSS 0.5x (10%)
//   TOTAL LOSS 0x (8%) • BANKRUPT 0x + 15% fee (7%)
//   Special events: DOUBLE TROUBLE 2% (x2), TRIPLE THREAT 0.5% (x3),
//   LUCKY CLOVER 3% (+0.5x), GOLDEN SPIN 1% (x1.5).
//   Jackpot: 2% of every bet feeds the player's progressive pool;
//   landing JACKPOT pays 50–150% of the pool, then resets it.
//   Streak bonus: from 3 wins in a row, +bet × (streak−2) × 0.25.
//   Limits: 25 spins per 12h. Min bet 1,000, max bet 10,000,000.
//   NOTE (inherited from the original): a BANKRUPT fee is shown in the
//   result but the payout is clamped at 0, so the fee itself is never
//   actually deducted — a bankrupt spin costs only the stake.
//
// WhatsApp port notes (vs the Messenger original):
// - api.editMessage does not exist here, so the spin animation is
//   replaced: a "spinning" message goes out first and the final
//   result follows as a second message ~1.9s later (same pattern
//   as slots). No countDown in the Messenger original.

const { fm, parseBet, box, streakText, medal } = require("./_gameUI.js");

const LIMIT_INTERVAL_HOURS = 12;
const MAX_PLAYS = 25;
const MAX_BET = 10_000_000;
const MIN_BET = 1000;

// Probabilities MUST sum to exactly 1.00 — if they sum to less,
// Math.random() can land past the last segment and leave `result`
// undefined (bet already deducted). The safety net below falls back
// to the last segment, same as the original.
const WHEEL_SEGMENTS = [
  { label: "🏆 JACKPOT", multiplier: 25, probability: 0.015, type: "jackpot", emoji: "🏆", color: "#FFD700" },
  { label: "💎 DIAMOND", multiplier: 10, probability: 0.025, type: "premium", emoji: "💎", color: "#B9F2FF" },
  { label: "🔥 MEGA WIN", multiplier: 7, probability: 0.04, type: "big", emoji: "🔥", color: "#FF7F00" },
  { label: "⭐ GOLD", multiplier: 5, probability: 0.06, type: "medium", emoji: "⭐", color: "#FFD700" },
  { label: "💰 SILVER", multiplier: 3, probability: 0.10, type: "small", emoji: "💰", color: "#C0C0C0" },
  { label: "🔔 BRONZE", multiplier: 2, probability: 0.15, type: "tiny", emoji: "🔔", color: "#CD7F32" },
  { label: "🍀 LUCKY", multiplier: 1.5, probability: 0.21, type: "mini", emoji: "🍀", color: "#00FF00" },
  { label: "➖ BREAK EVEN", multiplier: 1, probability: 0.15, type: "even", emoji: "➖", color: "#808080" },
  { label: "😢 HALF LOSS", multiplier: 0.5, probability: 0.10, type: "loss", emoji: "😢", color: "#FF6B6B" },
  { label: "💸 TOTAL LOSS", multiplier: 0, probability: 0.08, type: "loss", emoji: "💸", color: "#FF0000" },
  { label: "⚡ BANKRUPT", multiplier: 0, probability: 0.07, type: "bankrupt", emoji: "⚡", color: "#800080", fee: 0.15 }
];

// Special events with low probability
const SPECIAL_EVENTS = [
  { name: "DOUBLE TROUBLE", trigger: 0.02, effect: (multiplier) => multiplier * 2 },
  { name: "TRIPLE THREAT", trigger: 0.005, effect: (multiplier) => multiplier * 3 },
  { name: "LUCKY CLOVER", trigger: 0.03, effect: (multiplier) => multiplier + 0.5 },
  { name: "GOLDEN SPIN", trigger: 0.01, effect: (multiplier) => multiplier * 1.5 }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  config: {
    name: "wheel",
    version: "5.0",
    role: 0,
    description: "🎡 Wheel of Fortune",
    category: "game",
    guide: "{pn} <bet> | {pn} info | {pn} stats | {pn} leaderboard | {pn} jackpot"
  },

  onStart: async function ({ event, args, usersData, message }) {
    const { senderID } = event;
    const command = (args[0] || "").toLowerCase();

    // ========== INFO COMMAND ==========
    if (command === 'info') {
      const infoMessage = `
🎡  🎡
       WHEEL OF FORTUNE
           v5.0 PREMIUM
🎡  🎡

💰 BET RANGE: ${fm(MIN_BET)} - ${fm(MAX_BET)}
🎯 MAX SPINS: ${MAX_PLAYS} every ${LIMIT_INTERVAL_HOURS} hours
🎊 PROGRESSIVE JACKPOT: Grows with every spin!

══════════════════════════════ WHEEL SEGMENTS
${WHEEL_SEGMENTS.map(seg =>
  `• ${seg.emoji} ${seg.label.padEnd(15)} x${seg.multiplier} (${(seg.probability * 100).toFixed(1)}%)`
).join('\n')}

══════════════════════════════ SPECIAL FEATURES
• 🎰 Random Multipliers (2x-3x)
• 🔥 Win Streak Bonuses
• 🏆 Progressive Jackpot Pool

══════════════════════════════ COMMANDS
• .wheel <amount>   - Spin the wheel
• .wheel info       - Show this info
• .wheel stats      - Your statistics
• .wheel leaderboard - Top players
• .wheel jackpot    - Current jackpot

🎯 TIP: Higher bets increase jackpot contribution!
      `.trim();
      return message.reply(infoMessage);
    }

    // ========== STATS COMMAND ==========
    if (command === 'stats') {
      const user = await usersData.get(senderID) || {};
      const stats = (user.data && user.data.wheelStats) || {
        totalSpins: 0,
        totalWon: 0,
        totalWagered: 0,
        biggestWin: 0,
        currentStreak: 0,
        highestStreak: 0,
        jackpotsWon: 0
      };

      const winRate = stats.totalSpins > 0
        ? ((stats.totalWon / stats.totalWagered) * 100).toFixed(2)
        : 0;

      const statsMessage = `
📊  YOUR WHEEL STATS  📊

🎡 TOTAL SPINS: ${stats.totalSpins}
💰 TOTAL WON: ${fm(stats.totalWon)}
🎯 TOTAL WAGERED: ${fm(stats.totalWagered)}
📈 WIN RATE: ${winRate}%
🏆 BIGGEST WIN: ${fm(stats.biggestWin)}
🔥 CURRENT STREAK: ${stats.currentStreak}
⚡ HIGHEST STREAK: ${stats.highestStreak}
🎰 JACKPOTS WON: ${stats.jackpotsWon || 0}

══════════════════════════════ RECENT ACTIVITY
${stats.lastSpinHistory && stats.lastSpinHistory.slice(-5).map((spin, i) =>
  `• Spin ${i + 1}: ${spin.result || "N/A"}`
).join('\n') || "No recent spins"}
      `.trim();

      return message.reply(statsMessage);
    }

    // ========== LEADERBOARD COMMAND ==========
    if (command === 'leaderboard') {
      const allUsers = await usersData.getAll();
      const leaderboardData = allUsers
        .filter(user => user.data && user.data.wheelStats && user.data.wheelStats.totalSpins > 0)
        .map(user => {
          const stats = user.data.wheelStats;
          const netProfit = stats.totalWon - (stats.totalWagered || 0);
          return {
            name: user.name || user.id || "Unknown",
            uid: user.id,
            netProfit: netProfit,
            totalWon: stats.totalWon || 0,
            totalSpins: stats.totalSpins || 0,
            jackpots: stats.jackpotsWon || 0
          };
        })
        .sort((a, b) => b.netProfit - a.netProfit)
        .slice(0, 10);

      let leaderboardMsg = "🏆  WHEEL LEADERBOARD  🏆\n\n";
      leaderboardData.forEach((user, index) => {
        const rankMedal = medal(index);
        const profitIcon = user.netProfit >= 0 ? "💰" : "📉";

        leaderboardMsg += `${rankMedal} ${user.name}\n`;
        leaderboardMsg += `   ${profitIcon} Net Profit: ${fm(user.netProfit)}\n`;
        leaderboardMsg += `   🎡 Spins: ${user.totalSpins}\n`;
        leaderboardMsg += `   🏅 Jackpots: ${user.jackpots}\n`;
        leaderboardMsg += `   📊 Total Won: ${fm(user.totalWon)}\n\n`;
      });

      if (leaderboardData.length === 0) {
        leaderboardMsg = "No players have spun the wheel yet! Be the first! 🎡";
      }

      return message.reply(leaderboardMsg);
    }

    // ========== JACKPOT COMMAND ==========
    if (command === 'jackpot') {
      const allUsers = await usersData.getAll();
      let totalJackpot = 0;
      allUsers.forEach(user => {
        totalJackpot += (user.data && user.data.progressiveJackpot) || 0;
      });

      const jackpotMessage = `
🎰  PROGRESSIVE JACKPOT  🎰

🏆 CURRENT JACKPOT: ${fm(totalJackpot)}
💰 MINIMUM WIN: ${fm(totalJackpot * 0.5)}
💎 MAXIMUM WIN: ${fm(totalJackpot * 2)}

══════════════════════════════ HOW TO WIN
• Land on 🏆 JACKPOT segment
• Win the entire progressive pool
• Jackpot resets after win
• 1% of every bet contributes

🎯 Next Spin Could Be Yours!
      `.trim();

      return message.reply(jackpotMessage);
    }

    // ========== SPIN COMMAND ==========
    if (!args[0]) {
      return message.reply(
        `🎡 WHEEL OF FORTUNE\n\n` +
        `Usage: .wheel <bet amount>\n` +
        `Minimum: ${fm(MIN_BET)}\n` +
        `Maximum: ${fm(MAX_BET)}\n\n` +
        `Other commands:\n` +
        `• .wheel info\n` +
        `• .wheel stats\n` +
        `• .wheel leaderboard\n` +
        `• .wheel jackpot`
      );
    }

    const bet = parseBet(args[0]);
    if (bet === null || bet < MIN_BET) {
      return message.reply(`❌ Minimum bet is ${fm(MIN_BET)} coins.`);
    }

    if (bet > MAX_BET) {
      return message.reply(`❌ Maximum bet is ${fm(MAX_BET)} coins.`);
    }

    // Load user data
    const user = await usersData.get(senderID) || {};
    if (!user.data) user.data = {};
    const now = Date.now();

    // Initialize wheel stats if not exists
    const wheelStats = user.data.wheelStats || {
      totalSpins: 0,
      totalWon: 0,
      totalWagered: 0,
      biggestWin: 0,
      currentStreak: 0,
      highestStreak: 0,
      jackpotsWon: 0,
      lastSpins: [], // PURE timestamp array (ms) — drives the 12h/25-spin limit
      lastSpinHistory: [] // spin records {time, bet, result, winnings} — display only
    };

    // Check spin limits
    const validSpins = wheelStats.lastSpins.filter(time =>
      now - time < LIMIT_INTERVAL_HOURS * 3600 * 1000
    );

    if (validSpins.length >= MAX_PLAYS) {
      const nextSpinTime = new Date(validSpins[0] + LIMIT_INTERVAL_HOURS * 3600 * 1000);
      return message.reply(
        `⏰ SPIN LIMIT REACHED!\n\n` +
        `You've used ${MAX_PLAYS} spins in ${LIMIT_INTERVAL_HOURS} hours.\n` +
        `Next spin available: ${nextSpinTime.toLocaleTimeString()}\n` +
        `Use ".wheel stats" to check your usage.`
      );
    }

    // Check balance
    if ((user.money || 0) < bet) {
      const needed = bet - (user.money || 0);
      return message.reply(
        `💸 INSUFFICIENT FUNDS!\n\n` +
        `Current Balance: ${fm(user.money || 0)}\n` +
        `Bet Amount: ${fm(bet)}\n` +
        `Needed: ${fm(needed)} more coins`
      );
    }

    // Deduct bet
    user.money = (user.money || 0) - bet;
    wheelStats.totalWagered = (wheelStats.totalWagered || 0) + bet;

    // Update spin tracking
    validSpins.push(now);

    // Progressive jackpot contribution (2%)
    const jackpotContribution = Math.floor(bet * 0.02);
    const currentJackpot = ((user.data && user.data.progressiveJackpot) || 0) + jackpotContribution;

    user.data.progressiveJackpot = currentJackpot;
    wheelStats.lastSpins = validSpins.slice(-MAX_PLAYS);
    wheelStats.totalSpins = wheelStats.totalSpins + 1;
    user.data.wheelStats = wheelStats;
    await usersData.set(senderID, user);

    // ========== SPIN ANIMATION ==========
    // The Messenger version edited one message through the spin; this
    // bot has no edit, so the spin frame goes out first and the final
    // result follows as a second message.
    try {
      await message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ 🎡 Spinning the wheel...\n╚══════════════════╝");
    } catch (e) {
      console.error("Failed to send spin message:", e.message);
    }
    await sleep(1900);

    // ========== DETERMINE RESULT ==========
    const random = Math.random();
    let cumulativeProb = 0;
    let result;

    for (const segment of WHEEL_SEGMENTS) {
      cumulativeProb += segment.probability;
      if (random < cumulativeProb) {
        result = { ...segment };
        break;
      }
    }

    // Safety net: if floating-point rounding ever leaves `result` unset
    // (random landing past the final cumulative probability), fall back
    // to the last segment instead of crashing on result.multiplier
    // with the bet already deducted.
    if (!result) result = { ...WHEEL_SEGMENTS[WHEEL_SEGMENTS.length - 1] };

    // Check for special event
    let specialEvent = null;
    for (const ev of SPECIAL_EVENTS) {
      if (Math.random() < ev.trigger) {
        specialEvent = ev;
        result.multiplier = ev.effect(result.multiplier);
        result.label += ` ✨ ${ev.name}`;
        break;
      }
    }

    // Calculate base winnings
    let baseWinnings = Math.floor(bet * result.multiplier);
    let jackpotWin = 0;
    let specialBonus = 0;

    // Jackpot win
    if (result.type === "jackpot") {
      jackpotWin = currentJackpot * (0.5 + Math.random()); // 50-150% of jackpot
      jackpotWin = Math.floor(jackpotWin);
      user.data.progressiveJackpot = 0;
      wheelStats.jackpotsWon = (wheelStats.jackpotsWon || 0) + 1;
    }

    // Bankrupt fee
    if (result.type === "bankrupt") {
      const fee = Math.floor(bet * result.fee);
      baseWinnings = -fee;
    }

    // Streak bonus
    let newStreak = result.multiplier > 1 ? wheelStats.currentStreak + 1 : 0;
    if (newStreak >= 3) {
      specialBonus = Math.floor(bet * (newStreak - 2) * 0.25);
    }

    // Update highest streak
    const highestStreak = Math.max(wheelStats.highestStreak || 0, newStreak);

    // Calculate total winnings
    const totalWinnings = Math.max(0, baseWinnings) + jackpotWin + specialBonus;
    const finalBalance = (user.money || 0) + totalWinnings;

    // Update user data
    const updatedStats = {
      totalSpins: wheelStats.totalSpins,
      totalWon: (wheelStats.totalWon || 0) + totalWinnings,
      totalWagered: wheelStats.totalWagered,
      biggestWin: Math.max(wheelStats.biggestWin || 0, totalWinnings),
      currentStreak: newStreak,
      highestStreak: highestStreak,
      // lastSpins stays a PURE timestamp array so the 12h/25-spin limit
      // can actually reach 25; spin records live in lastSpinHistory.
      lastSpins: validSpins.slice(-MAX_PLAYS),
      lastSpinHistory: [...(wheelStats.lastSpinHistory || []).slice(-4), {
        time: now,
        bet: bet,
        result: result.label,
        winnings: totalWinnings
      }]
    };

    if (result.type === "jackpot") {
      updatedStats.jackpotsWon = (wheelStats.jackpotsWon || 0) + 1;
    }

    user.money = finalBalance;
    user.data.wheelStats = updatedStats;
    await usersData.set(senderID, user);

    // ========== RESULT MESSAGE ==========
    // Visual wheel strip — the landed segment is bracketed so the spin feels visual
    const wheelStrip = "🎡 " + WHEEL_SEGMENTS.map(seg => seg.emoji === result.emoji ? `[${seg.emoji}]` : seg.emoji).join(" ");
    const resultTitle =
      result.type === "jackpot" ? "🔥 JACKPOT" :
      totalWinnings > bet ? "🏆 YOU WIN" :
      totalWinnings === bet ? "🎡 WHEEL OF FORTUNE" :
      "💀 YOU LOSE";

    const resultBody = [
      wheelStrip,
      `🎯 SEGMENT: ${result.emoji} ${result.label}`,
      `💰 BET: ${fm(bet)}`,
      `📈 MULTIPLIER: ${result.multiplier.toFixed(2)}x`
    ];

    if (baseWinnings > 0) {
      resultBody.push(`🎉 BASE WINNINGS: +${fm(baseWinnings)}`);
    }

    if (jackpotWin > 0) {
      resultBody.push(`🏆 JACKPOT BONUS: +${fm(jackpotWin)}!`);
    }

    if (specialEvent) {
      resultBody.push(`✨ SPECIAL EVENT: ${specialEvent.name}!`);
    }

    if (specialBonus > 0) {
      resultBody.push(`🔥 STREAK BONUS (${newStreak}): +${fm(specialBonus)}`);
    }

    if (result.type === "bankrupt") {
      resultBody.push(`💸 BANKRUPT FEE: -${fm(Math.floor(bet * result.fee))}`);
    }

    const resultFooter = [
      `💵 TOTAL WINNINGS: ${totalWinnings > 0 ? '+' : ''}${fm(totalWinnings)}`,
      `💰 NEW BALANCE: ${fm(finalBalance)}`,
      `🎡 SPINS LEFT: ${MAX_PLAYS - validSpins.length}/${MAX_PLAYS}`
    ];
    const streakLine = newStreak > 1 ? streakText(newStreak) : "";
    if (streakLine)
      resultFooter.push(streakLine);

    const resultText = box(resultTitle, resultBody, resultFooter);

    // Send result
    await message.reply(resultText);

    // Special celebration messages
    if (result.type === "jackpot") {
      await sleep(1500);
      await message.reply(
        `🎊 🎊 🎊 MASSIVE JACKPOT WIN! 🎊 🎊 🎊\n` +
        `Congratulations! You won ${fm(jackpotWin)} coins!`
      );
    } else if (totalWinnings > bet * 3) {
      await sleep(1000);
      await message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ 🎉 INCREDIBLE WIN! THE WHEEL FAVORS YOU! 🎉\n╚══════════════════╝");
    }
  }
};
