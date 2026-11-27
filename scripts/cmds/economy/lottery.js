// .lottery — buy a lottery ticket (WhatsApp port).
// Numbers are UNCHANGED from the Messenger original:
//   ticket 5000; jackpot (3 matching) 100000; double match 20000;
//   lucky seven (any 7, no match) 10000.
//
// WhatsApp port notes (vs the Messenger original):
// - usersData.set takes the whole updated user object (the original set
//   a partial { money } object; whole-object keeps name/exp and other
//   fields intact). The original's own formatMoney (1.0K / 1.0M) is kept.

module.exports = {
	config: {
		name: "lottery",
		aliases: ["lotto", "jackpotgame"],
		version: "1.2.1",
		author: "Irfan Ahmmed",
		role: 0,
		countDown: 10,
		category: "economy",
		description: "🎰 Buy a lottery ticket",
		guide: "{pn}lottery"
	},

	onStart: async function ({ event, message, usersData }) {
		const { senderID } = event;

		const TICKET_COST = 5000;
		const JACKPOT = 100000;

		const formatMoney = (n) =>
			n >= 1000000 ? (n / 1000000).toFixed(1) + "M" :
			n >= 1000 ? (n / 1000).toFixed(1) + "K" :
			n;

		const userData = await usersData.get(senderID);
		const balance = userData?.money || 0;

		if (balance < TICKET_COST) {
			return message.reply(
				`🎰 LOTTERY\n\n` +
				`❌ Not enough money\n` +
				`🎟 Ticket : ${formatMoney(TICKET_COST)}\n` +
				`💰 Balance: ${formatMoney(balance)}`
			);
		}

		const numbers = Array.from({ length: 3 }, () =>
			Math.floor(Math.random() * 10)
		);

		let prize = 0;
		let resultText = "❌ No luck";

		if (numbers[0] === numbers[1] && numbers[1] === numbers[2]) {
			prize = JACKPOT;
			resultText = "🎰 JACKPOT!";
		} else if (
			numbers[0] === numbers[1] ||
			numbers[1] === numbers[2] ||
			numbers[0] === numbers[2]
		) {
			prize = 20000;
			resultText = "🔁 Double Match";
		} else if (numbers.includes(7)) {
			prize = 10000;
			resultText = "🍀 Lucky Seven";
		}

		const finalBalance = balance - TICKET_COST + prize;

		userData.money = finalBalance;
		await usersData.set(senderID, userData);

		return message.reply(
			`🎰 LOTTERY RESULT\n\n` +
			`🔢 ${numbers.join(" | ")}\n\n` +
			`${resultText}\n` +
			(prize > 0 ? `💸 Won : ${formatMoney(prize)}\n` : ``) +
			`🎟 Cost: ${formatMoney(TICKET_COST)}\n` +
			`💰 Bal : ${formatMoney(finalBalance)}`
		);
	}
};
