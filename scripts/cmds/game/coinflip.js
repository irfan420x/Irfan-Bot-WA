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

      return message.reply(msg);

    } catch (err) {
      console.error(err);
      message.reply("❌ Coinflip error occurred.");
    }
  },
};
