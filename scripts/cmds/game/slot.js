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
const card = require("../_card.js");

/**
 * Draw one reel symbol inside a reel box. Fruit emoji render monochrome
 * white in canvas text; the star glyph is invisible, so it is drawn
 * with card.drawStar instead. The 7-keycap renders as "7".
 */
function drawReelSymbol(ctx, symbol, cx, cy) {
  if (symbol === "⭐") {
    card.drawStar(ctx, cx, cy, 52, card.BRAND.gold);
    return;
  }
  ctx.save();
  ctx.fillStyle = card.BRAND.text;
  ctx.font = "96px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol, cx, cy + 4);
  ctx.restore();
}

/**
 * Render the ORION slots result card (1000x580) and return a PNG buffer.
 * Returns null when canvas is unavailable. Throws on render errors —
 * the caller falls back to the text message.
 */
function renderSlotsCard({ s1, s2, s3, win, mult, bet, newBalance, nearMiss, todayPlay, dl, streak }) {
  const c = card.newCard(1000, 580);
  if (!c) return null;
  const { ctx, W, H } = c;
  const symbols = [s1, s2, s3];

  card.title(ctx, W, "SLOT MACHINE", 72, 44);

  // Three reel boxes.
  const reelSize = 180;
  const gap = 40;
  const totalW = reelSize * 3 + gap * 2;
  const startX = (W - totalW) / 2;
  const reelY = 118;
  for (let i = 0; i < 3; i++) {
    const x = startX + i * (reelSize + gap);
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    card.roundedRect(ctx, x, reelY, reelSize, reelSize, 24);
    ctx.fill();
    ctx.strokeStyle = card.BRAND.panelBorder;
    ctx.lineWidth = 1.5;
    card.roundedRect(ctx, x, reelY, reelSize, reelSize, 24);
    ctx.stroke();
    drawReelSymbol(ctx, symbols[i], x + reelSize / 2, reelY + reelSize / 2);
  }

  // Result banner.
  const isJackpot = win > 0 && mult === 10;
  const banner = isJackpot ? "JACKPOT" : win > 0 ? "YOU WIN" : "YOU LOSE";
  const bannerBg = isJackpot ? card.BRAND.gold : win > 0 ? card.BRAND.green : card.BRAND.red;
  ctx.font = "bold 30px sans-serif";
  const pillW = ctx.measureText(banner).width + 64;
  card.pill(ctx, (W - pillW) / 2, 330, banner, {
    bg: bannerBg,
    color: card.pillTextColor(bannerBg),
    font: "bold 30px sans-serif",
    h: 56,
  });

  // Won / lost line.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = win > 0 ? card.BRAND.green : card.BRAND.red;
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(
    win > 0 ? `Won: +${fm(win)}  (${mult}x)` : `Lost: -${fm(bet)}`,
    W / 2, 430
  );

  // Balance + today line.
  ctx.fillStyle = card.BRAND.subtle;
  ctx.font = "26px sans-serif";
  ctx.fillText(`Balance: ${fm(newBalance)}   •   Today: ${todayPlay}/${dl}`, W / 2, 468);

  // Near-miss / streak line, when present.
  const extras = [];
  if (nearMiss) extras.push("So close — two 7s!");
  if ((streak || 0) >= 2) extras.push(`Streak: ${streak} wins in a row`);
  if (extras.length) {
    ctx.fillStyle = card.BRAND.purpleLight;
    ctx.font = "24px sans-serif";
    ctx.fillText(extras.join("   •   "), W / 2, 502);
  }

  card.footer(ctx, W, H);
  return card.toPng(c.canvas);
}

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

    /* ===== CARD =====
       Render the result card BEFORE the spin frame goes out, so the
       setTimeout callback below can use the pre-rendered buffer
       (null on failure -> text only). */
    let cardBuf = null;
    try {
      cardBuf = renderSlotsCard({
        s1, s2, s3, win, mult, bet, newBalance, nearMiss,
        todayPlay: todayStats.play, dl, streak: allStats.streak || 0,
      });
    } catch (cardErr) {
      console.error("Slots card render failed:", cardErr.message);
    }

    /* ===== SPIN ANIMATION =====
       Like the Messenger version, the spin frame animates in place — but
       WhatsApp cannot edit a text message into an image, so instead the
       spin frame is UNSENT and the result card goes out as a fresh message.
       The user ends up with ONE message (the result), not two. */
    const spinFrame = () => {
      const r1 = roll(), r2 = roll(), r3 = roll();
      return box("🎰 SLOT MACHINE", [
        `🎰  ${r1}  ║  ${r2}  ║  ${r3}  🎰`,
        "🌀 Spinning..."
      ]);
    };

    let spinId = null;
    try {
      const sent = await message.reply(spinFrame());
      spinId = sent && sent.messageID;
    } catch (e) {
      // If even the spin frame fails, still deliver the result.
      return message.reply(finalMsg);
    }
    // Animate in place like the Messenger bot: edit the spin frame twice
    // with fresh reels (600ms apart). The edits queue behind the send
    // guard, so they arrive a little slower than Messenger's, but in order.
    if (spinId && typeof message.edit === "function") {
      for (let i = 0; i < 2; i++) {
        setTimeout(() => {
          try {
            const p = message.edit(spinId, spinFrame());
            if (p && typeof p.catch === "function") p.catch(() => {});
          } catch (_) { /* animation is cosmetic */ }
        }, (i + 1) * 600);
      }
    }
    setTimeout(() => {
      // Fallback: if anything in here throws before the result goes out
      // (caption build, send failure), the user would be left staring at
      // "Spinning..." forever — send the plain-text result instead.
      const sendFallback = () => {
        try {
          const q = message.reply(finalMsg);
          if (q && typeof q.catch === "function") q.catch(() => {});
        } catch (_) { /* last resort — the handler already logged */ }
      };
      try {
        // Remove the spin frame so only the result remains (best-effort —
        // if the unsend fails, the result still goes out below).
        if (spinId && typeof message.unsend === "function") {
          try {
            const p = message.unsend(spinId);
            if (p && typeof p.catch === "function") p.catch(() => {});
          } catch (_) { /* keep going */ }
        }
        // Short caption with the card — the card already shows the reels,
        // result and balance. The full text box only when there is no card.
        if (cardBuf) {
          const captionLines = [];
          if ((allStats.streak || 0) >= 2) captionLines.push(streakText(allStats.streak));
          captionLines.push(`↩️ Again: .slots ${fm(bet)}`);
          const p = message.reply({ body: captionLines.join("\n"), attachment: { buffer: cardBuf, mimetype: "image/png", fileName: "slots.png" } });
          if (p && typeof p.catch === "function") p.catch(() => sendFallback());
        } else {
          const p = message.reply(finalMsg);
          if (p && typeof p.catch === "function") p.catch(() => sendFallback());
        }
      } catch (e) {
        console.error("[slots] result failed:", e.message);
        sendFallback();
      }
    }, 1800);
  },

  // Exported for tests / verification only.
  _renderSlotsCard: renderSlotsCard,
};
