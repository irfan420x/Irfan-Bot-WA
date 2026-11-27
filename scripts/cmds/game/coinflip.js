// .coinflip — flip a coin and win coins (WhatsApp port).
// Bet coins on a coin flip: Heads (🪙) or Tails (⚡).
// Payout logic is UNCHANGED from the Messenger original:
//   stake is deducted FIRST, then bet*2 is paid on a win
//   (net +bet on win, -bet on loss).
// Amounts accept k/m/b/t suffixes via parseBet from ../game/_gameUI.js.
//
// WhatsApp port notes (vs the Messenger original):
// - api.sendMessage -> message.reply.
// - usersData has no addMoney(): balances change with get + set of the
//   whole user object.

const { parseBet } = require("./_gameUI.js");
const card = require("../_card.js");

/**
 * Render the ORION coin-flip card (900x480) and return a PNG buffer.
 * Returns null when canvas is unavailable. Throws on render errors —
 * the caller falls back to the text message.
 */
function renderCoinflipCard({ pick, result, win, bet, oldBalance, newBalance }) {
  const c = card.newCard(900, 480);
  if (!c) return null;
  const { ctx, W, H } = c;

  card.title(ctx, W, "COIN FLIP", 78, 44);

  // "Your pick" vs "Result" — two columns.
  const leftX = W / 4;
  const rightX = (W / 4) * 3;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = card.BRAND.muted;
  ctx.font = "26px sans-serif";
  ctx.fillText("Your pick", leftX, 150);
  ctx.fillText("Result", rightX, 150);
  ctx.fillStyle = card.BRAND.text;
  ctx.font = "bold 40px sans-serif";
  ctx.fillText(pick, leftX, 205);
  ctx.fillText(result, rightX, 205);

  // WIN / LOSE banner pill, centered.
  const banner = win ? "YOU WIN" : "YOU LOSE";
  const bannerBg = win ? card.BRAND.green : card.BRAND.red;
  ctx.font = "bold 30px sans-serif";
  const pillW = ctx.measureText(banner).width + 64;
  card.pill(ctx, (W - pillW) / 2, 252, banner, { bg: bannerBg, font: "bold 30px sans-serif", h: 56 });

  // Balance line.
  ctx.fillStyle = card.BRAND.subtle;
  ctx.font = "28px sans-serif";
  ctx.fillText(`Old balance: ${oldBalance}  →  Current balance: ${newBalance}`, W / 2, 368);

  // Won / lost amount.
  ctx.fillStyle = win ? card.BRAND.green : card.BRAND.red;
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(win ? `You won: +${bet * 2}` : `You lost: -${bet}`, W / 2, 410);

  card.footer(ctx, W, H);
  return card.toPng(c.canvas);
}


module.exports = {
  config: {
    name: "coinflip",
    aliases: ["cf"],
    version: "1.2",
    countDown: 3,
    role: 0,
    description: "Flip a coin and win coins",
    category: "game",
    guide: "{pn} <bet amount> [h/t]"
  },

  onStart: async function ({ event, args, message, usersData }) {
    try {
      const bet = parseBet(args[0]);
      if (!bet || bet <= 0)
        return message.reply("❌ Enter a valid bet amount.");

      const user = await usersData.get(event.senderID);
      if ((user.money || 0) < bet)
        return message.reply("❌ Not enough balance.");

      let choice = args[1] && args[1].toLowerCase();
      if (!choice || !["h", "t", "heads", "tails"].includes(choice)) {
        choice = Math.random() < 0.5 ? "h" : "t";
      }

      const pick =
        choice === "h" || choice === "heads"
          ? "Heads 🪙"
          : "Tails ⚡";

      const outcomes = ["Heads 🪙", "Tails ⚡"];
      const result = outcomes[Math.floor(Math.random() * 2)];

      const oldBalance = user.money || 0;
      let newBalance;
      let win = false;

      // Deduct the stake first, then pay out on a win (net +bet on win, -bet on loss)
      user.money = oldBalance - bet;
      if (pick === result) {
        user.money = oldBalance - bet + bet * 2;
        newBalance = oldBalance + bet;
        win = true;
      } else {
        newBalance = oldBalance - bet;
        if (newBalance < 0) newBalance = 0;
        user.money = newBalance;
      }
      await usersData.set(event.senderID, user);

      const line = "";
      const msg =
`${line}
🎲  𝗖𝗢𝗜𝗡 𝗙𝗟𝗜𝗣
${line}
Your pick   : ${pick}
Result      : ${result}
${line}
Old balance : ${oldBalance}
${win ? `You won 💰 : ${bet * 2}` : `You lost 💵 : ${bet}`}
Current bal : ${newBalance} 💸
${line}`;

      // Send the visual card; fall back to the text message if rendering fails.
      // No caption with the card — the card already shows pick, result and
      // balances, so the full text below it would just duplicate it.
      try {
        const buf = renderCoinflipCard({ pick, result, win, bet, oldBalance, newBalance });
        if (buf) {
          return message.reply({
            body: "",
            attachment: { buffer: buf, mimetype: "image/png", fileName: "coinflip.png" },
          });
        }
      } catch (cardErr) {
        console.error("Coinflip card render failed:", cardErr.message);
      }
      return message.reply(msg);

    } catch (err) {
      console.error(err);
      message.reply("❌ Coinflip error occurred.");
    }
  },

  // Exported for tests / verification only.
  _renderCoinflipCard: renderCoinflipCard,
};