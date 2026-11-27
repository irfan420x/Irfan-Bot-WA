// .bank — bank system with wallet, bank, loan, top (WhatsApp port).
// Logic, limits and numbers are UNCHANGED from the Messenger original:
//   loan limit 1,000,000, no interest, no deadline; deposit/withdraw
//   accept amount | all | half; repay defaults to the full loan;
//   top lists the 10 richest bank balances.
//
// WhatsApp port notes (vs the Messenger original):
// - The original's `this.brand()` / `this.row()` style helpers are plain
//   module-level functions here (same output, no `this` dependence).
// - usersData.set takes the whole updated user object (the original set
//   a partial { money, data } object; whole-object keeps name/exp and
//   other fields intact). Default users have no .data — it is created.

const { fm, parseAmount, box, medal } = require("../game/_gameUI.js");

const LOAN_LIMIT = 1000000;

function brand() {
	return "🦋 ɴᴏᴏʙ ᴄᴏʀᴇ 𝗕𝗮𝗻𝗸";
}

function line() {
	return "──────────────────────";
}

function row(label, value, icon = "") {
	// aligned row like: "💰 Wallet         12.3K"
	const lbl = `${icon ? icon + " " : ""}${label}`.padEnd(16, " ");
	return `${lbl} ${value}`;
}

function progressBar(current, max, width = 16) {
	if (!max || max <= 0) max = current || 1;
	const ratio = Math.max(0, Math.min(1, current / max));
	const filled = Math.round(ratio * width);
	const empty = width - filled;
	return `📊 Progress     [${"█".repeat(filled)}${"░".repeat(empty)}] ${Math.round(ratio * 100)}%`;
}

async function getOrInitUser(usersData, uid) {
	const user = await usersData.get(uid);
	if (!user.data) user.data = {};
	if (!user.data.ypbbankdata) user.data.ypbbankdata = { bank: 0, loan: 0, loanLimit: 0 };
	if (typeof user.money !== "number") user.money = 0;
	return user;
}

async function saveUser(usersData, uid, user) {
	return usersData.set(uid, user);
}

module.exports = {
	config: {
		name: "bank",
		aliases: ["wallet"],
		version: "2.2",
		author: "Irfan Ahmmed",
		countDown: 5,
		role: 0,
		description: "Bank system with wallet, bank, loan, etc.",
		category: "economy",
		guide:
			"{pn} balance\n" +
			"{pn} deposit <amount|all|half>\n" +
			"{pn} withdraw <amount|all|half>\n" +
			"{pn} loan\n" +
			"{pn} repay [amount|all|half]\n" +
			"{pn} top"
	},

	onStart: async function ({ message, args, event, usersData }) {
		try {
			const senderID = event.senderID;
			const sub = (args[0] || "").toLowerCase();

			if (!sub) {
				return message.reply(box("🏦 Bank Commands", [
					brand(),
					line(),
					"𝘊𝘰𝘮𝘮𝘢𝘯𝘥𝘴",
					"• balance",
					"• deposit <amount|all|half>",
					"• withdraw <amount|all|half>",
					"• loan",
					"• repay [amount|all|half]  (alias: preloan)",
					"• top"
				], ["Use the guide above."]));
			}

			// Load user
			const user = await getOrInitUser(usersData, senderID);
			const bank = user.data.ypbbankdata;
			const userName = user.name || "Unknown";
			let wallet = user.money;

			/* -------- balance -------- */
			if (sub === "balance" || sub === "bal") {
				const body = [
					brand(),
					line(),
					row("Wallet", fm(wallet), "💰"),
					row("Bank", fm(bank.bank), "🏦"),
					row("Loan", fm(bank.loan), "💳"),
					...(bank.loan > 0
						? [progressBar((bank.loanLimit || bank.loanLimit === 0) ? (bank.loanLimit - bank.loan) : 0,
							bank.loanLimit || bank.loan)]
						: [])
				];
				return message.reply(box("📋 Account Summary", body, [`👤 ${userName}`]));
			}

			/* -------- deposit -------- */
			if (sub === "deposit" || sub === "dep" || sub === "d") {
				const amount = parseAmount(args[1], wallet);
				if (!Number.isFinite(amount) || amount <= 0)
					return message.reply(box("❌ Invalid Input", ["Enter a valid amount (e.g., 500, 2k, all, half)."]));

				if (wallet < amount)
					return message.reply(box("❌ Not Enough Wallet", [`You have ${fm(wallet)}.`]));

				user.money = wallet - amount;
				bank.bank += amount;
				await saveUser(usersData, senderID, user);

				return message.reply(box("💸 Deposit Successful", [
					brand(),
					line(),
					row("Deposited", fm(amount), "✅"),
					row("Bank", fm(bank.bank), "🏦"),
					row("Wallet", fm(user.money), "💰")
				]));
			}

			/* -------- withdraw -------- */
			if (sub === "withdraw" || sub === "with" || sub === "w") {
				const amount = parseAmount(args[1], bank.bank);
				if (!Number.isFinite(amount) || amount <= 0)
					return message.reply(box("❌ Invalid Input", ["Enter a valid amount (e.g., 500, 2k, all, half)."]));

				if (bank.bank < amount)
					return message.reply(box("❌ Not Enough Bank", [`You have ${fm(bank.bank)} in bank.`]));

				bank.bank -= amount;
				user.money = wallet + amount;
				await saveUser(usersData, senderID, user);

				return message.reply(box("🏧 Withdraw Successful", [
					brand(),
					line(),
					row("Withdrew", fm(amount), "✅"),
					row("Wallet", fm(user.money), "💰"),
					row("Bank", fm(bank.bank), "🏦")
				]));
			}

			/* -------- loan -------- */
			if (sub === "loan") {
				if (bank.loan > 0) {
					return message.reply(box("⛔ Loan Exists", [
						`Existing loan: ${fm(bank.loan)}.`,
						"Repay it before taking a new one."
					]));
				}

				bank.loan = LOAN_LIMIT;
				bank.loanLimit = LOAN_LIMIT;
				user.money = wallet + LOAN_LIMIT;
				await saveUser(usersData, senderID, user);

				return message.reply(box("📝 Loan Approved", [
					brand(),
					line(),
					row("Approved", fm(LOAN_LIMIT), "✅"),
					row("Wallet", fm(user.money), "💰"),
					row("Loan", fm(bank.loan), "💳"),
					progressBar(0, LOAN_LIMIT)
				], ["Remember to repay on time."]));
			}

			/* -------- repay (alias preloan) -------- */
			if (sub === "repay" || sub === "preloan") {
				if (bank.loan <= 0) {
					return message.reply(box("✅ No Active Loan", ["You're debt-free. Nice!"]));
				}

				const raw = args[1];
				const pay = raw ? parseAmount(raw, wallet) : bank.loan;

				if (!Number.isFinite(pay) || pay <= 0)
					return message.reply(box("❌ Invalid Input", ["Enter a valid amount (e.g., 500, 2k, all, half)."]));

				if (pay > wallet)
					return message.reply(box("❌ Not Enough Wallet", [`You have ${fm(wallet)}.`]));

				const actual = Math.min(pay, bank.loan);
				user.money = wallet - actual;
				bank.loan -= actual;

				await saveUser(usersData, senderID, user);

				const cleared = bank.loan === 0;

				return message.reply(box(cleared ? "🎉 Loan Cleared" : "📉 Repayment Successful", [
					brand(),
					line(),
					row("Repaid", fm(actual), "✅"),
					row("Remaining", fm(bank.loan), "💳"),
					row("Wallet", fm(user.money), "💰"),
					progressBar((bank.loanLimit || 0) - bank.loan, bank.loanLimit || (actual + bank.loan))
				]));
			}

			/* -------- top -------- */
			if (sub === "top" || sub === "leaderboard" || sub === "lb") {
				const all = await usersData.getAll();
				const ranked = all
					.filter(u => u?.data?.ypbbankdata && typeof u.data.ypbbankdata.bank === "number")
					.map(u => ({
						name: u.name || "Unknown",
						bank: u.data.ypbbankdata.bank
					}))
					.sort((a, b) => b.bank - a.bank)
					.slice(0, 10);

				if (ranked.length === 0)
					return message.reply(box("❌ No Data", ["No users found with money in bank."]));

				const lines = ranked.map((u, i) => `${medal(i)} ${u.name} — ${fm(u.bank)}`);

				return message.reply(box("🏆 Top 10 — Bank Balance", [
					brand(),
					line(),
					...lines
				]));
			}

			// Unknown subcommand
			return message.reply(box("❓ Invalid Command", ["Try: balance, deposit, withdraw, loan, repay, top"]));

		} catch (err) {
			console.error("Bank command error:", err);
			return message.reply(box("❌ Error", ["An unexpected error occurred. Please try again."]));
		}
	}
};
