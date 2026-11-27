// .diamond — view, add, delete, transfer diamonds (WhatsApp port).
// Logic and wording are UNCHANGED from the Messenger original:
//   view own / mentioned / UID diamonds; transfer between users;
//   add/delete are bot-admin only.
//
// WhatsApp port notes (vs the Messenger original):
// - The Messenger bot stores diamonds via usersData.getDiamond /
//   addDiamond / subtractDiamond — those methods do NOT exist in this
//   bot's usersData. Diamonds live in the top-level `diamond` field of
//   the user document (the same field account.js reads), changed with
//   get + set of the whole user object.
// - Admin check reads global.wabot.config (adminBot + owner) instead of
//   global.irfbot's config.
// - Names come from api.getUserInfo (best-effort, falls back to the ID):
//   this bot's usersData has no stored name and no getName().
// - Messenger UIDs are 15+ digits; WhatsApp IDs are phone numbers, so
//   a bare-number argument counts as a UID at 8+ digits, not 15+.

const { fm, parseBet } = require("../game/_gameUI.js");

function isBotAdmin(senderID) {
	const cfg = (global.wabot && global.wabot.config) || {};
	const admins = Array.isArray(cfg.adminBot) ? cfg.adminBot : [cfg.adminBot].filter(Boolean);
	return admins.map(String).includes(String(senderID)) || String(cfg.owner) === String(senderID);
}

// A bare-number argument is a user ID (WhatsApp phone numbers are 8+ digits).
function isUidArg(s) {
	return typeof s === "string" && /^\d+$/.test(s) && s.length >= 8;
}

module.exports = {
	config: {
		name: "diamond",
		aliases: ["dm", "dia"],
		version: "1.8.0",
		author: "Irfan Ahmmed",
		role: 0,
		countDown: 3,
		category: "game",
		description: "View, add, delete, transfer diamonds",
		guide:
			"{pn}: View your diamonds\n" +
			"{pn} <@tag>: View user's diamonds\n" +
			"{pn} transfer <@tag/reply/uid> <amount>\n" +
			"(Admin)\n" +
			"{pn} add <@tag/reply/uid> <amount>\n" +
			"{pn} delete <@tag/reply/uid> <amount>"
	},

	onStart: async function ({ message, usersData, event, args, api }) {
		const senderID = event.senderID;

		const formatDiamond = (n) => `${fm(n)}💎`;

		// Diamonds live in the top-level `diamond` field (same store
		// account.js uses). 0 for new/unknown users.
		const getDiamond = async (uid) => {
			try {
				const u = await usersData.get(uid);
				return Number(u?.diamond) || 0;
			} catch {
				return 0;
			}
		};

		const setDiamond = async (uid, value) => {
			const u = await usersData.get(uid);
			u.diamond = value;
			await usersData.set(uid, u);
		};

		// Get user name (best-effort, never throws).
		const getUserName = async (uid) => {
			try {
				if (api && typeof api.getUserInfo === "function") {
					const info = await api.getUserInfo(uid);
					if (info && info.name && info.name !== String(uid)) return info.name;
				}
			} catch { /* fall through */ }
			try {
				const userData = await usersData.get(uid);
				if (userData?.name) return userData.name;
			} catch { /* fall through */ }
			return "User";
		};

		// Function to determine target UID and amount
		const getTargetAndAmount = () => {
			let targetUID = null;
			let amount = null;

			// Case 1: Reply to a message
			if (event.messageReply) {
				targetUID = event.messageReply.senderID;
				// Find amount in args (should be args[1] if command is .dm add amount)
				for (let i = 1; i < args.length; i++) {
					const parsed = parseBet(args[i]);
					if (parsed !== null) {
						amount = parsed;
						break;
					}
				}
			}
			// Case 2: Mentioned users
			else if (Object.keys(event.mentions || {}).length > 0) {
				targetUID = Object.keys(event.mentions)[0];
				// Find amount in args (should be args[1])
				if (args[1])
					amount = parseBet(args[1]);
			}
			// Case 3: UID provided as argument
			else if (args[1] && isUidArg(args[1])) {
				targetUID = args[1];
				if (args[2])
					amount = parseBet(args[2]);
			}
			// Case 4: Only amount provided (add to self)
			else if (args[1]) {
				const parsed = parseBet(args[1]);
				if (parsed !== null) {
					targetUID = senderID;
					amount = parsed;
				}
			}

			return { targetUID, amount };
		};

		const sub = (args[0] || "").toLowerCase();

		// Subcommands are checked BEFORE the view branch: the old order ran the
		// view branch first whenever a mention was present, so `.dm add @user 5`
		// and `.dm transfer @user 5` only showed the user's diamonds instead of
		// doing the add/transfer the guide documents.

		// ➕ ADD COMMAND (ADMIN ONLY)
		if (sub === "add") {
			if (!isBotAdmin(senderID))
				return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Permission denied.\n╚══════════════════╝");

			const { targetUID, amount } = getTargetAndAmount();

			if (!targetUID || !amount || amount <= 0) {
				return message.reply(
					"❌ Invalid format.\n" +
					"Usage:\n" +
					"• .dm add amount (adds to yourself)\n" +
					"• .dm add @mention amount\n" +
					"• .dm add uid amount\n" +
					"• Reply to a message: .dm add amount"
				);
			}

			await setDiamond(targetUID, (await getDiamond(targetUID)) + amount);
			const newDiamond = await getDiamond(targetUID);

			let userName = await getUserName(targetUID);
			if (targetUID === senderID) {
				userName = "yourself";
			}

			return message.reply(
				`✅ Added ${formatDiamond(amount)} diamonds to ${userName}.\n` +
				`New total: ${formatDiamond(newDiamond)}`
			);
		}

		// ➖ DELETE COMMAND (ADMIN ONLY)
		if (sub === "delete") {
			if (!isBotAdmin(senderID))
				return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Permission denied.\n╚══════════════════╝");

			const { targetUID, amount } = getTargetAndAmount();

			if (!targetUID || !amount || amount <= 0)
				return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Invalid user or amount.\n╚══════════════════╝");

			const currentDiamond = await getDiamond(targetUID);

			if (currentDiamond < amount)
				return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Not enough diamonds.\n╚══════════════════╝");

			await setDiamond(targetUID, currentDiamond - amount);
			const newDiamond = await getDiamond(targetUID);

			let userName = await getUserName(targetUID);
			if (targetUID === senderID) {
				userName = "yourself";
			}

			return message.reply(
				`✅ Deleted ${formatDiamond(amount)} diamonds from ${userName}.\n` +
				`New total: ${formatDiamond(newDiamond)}`
			);
		}

		// 🔁 TRANSFER COMMAND
		if (sub === "transfer") {
			const { targetUID, amount } = getTargetAndAmount();

			if (!targetUID || !amount || amount <= 0)
				return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Invalid user or amount.\n╚══════════════════╝");

			if (targetUID === senderID)
				return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Can't transfer to yourself.\n╚══════════════════╝");

			const senderDiamond = await getDiamond(senderID);
			if (senderDiamond < amount)
				return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Not enough diamonds.\n╚══════════════════╝");

			// Update sender
			await setDiamond(senderID, senderDiamond - amount);
			// Update receiver
			await setDiamond(targetUID, (await getDiamond(targetUID)) + amount);

			const receiverName = await getUserName(targetUID);
			const newSenderDiamond = await getDiamond(senderID);

			return message.reply(
				`💎 Transferred ${formatDiamond(amount)} to ${receiverName} successfully.\n` +
				`Your new balance: ${formatDiamond(newSenderDiamond)}`
			);
		}

		// 🔍 VIEW COMMAND
		if (!args[0] || Object.keys(event.mentions || {}).length > 0) {
			// If there are mentions, show mentioned users' diamonds
			if (Object.keys(event.mentions || {}).length > 0) {
				const uids = Object.keys(event.mentions);
				let msg = "";
				for (const uid of uids) {
					const diamondCount = await getDiamond(uid);
					const userName = await getUserName(uid);
					msg += `💎 ${userName}'s Diamonds: ${formatDiamond(diamondCount)}\n`;
				}
				return message.reply(msg);
			}

			// Otherwise show sender's diamonds
			const diamondCount = await getDiamond(senderID);
			const userName = await getUserName(senderID);

			return message.reply(`💎 ${userName}'s Diamonds: ${formatDiamond(diamondCount)}`);
		}

		// If first argument is a UID (long number), show that user's diamonds
		if (isUidArg(args[0])) {
			const targetUID = args[0];
			const diamondCount = await getDiamond(targetUID);
			const userName = await getUserName(targetUID);

			return message.reply(`💎 ${userName}'s Diamonds: ${formatDiamond(diamondCount)}`);
		}

		// If no valid command, show help
		return message.reply(
			"💎 Diamond System Commands:\n" +
			"• .dm - View your diamonds\n" +
			"• .dm @mention - View mentioned user's diamonds\n" +
			"• .dm transfer @mention/reply/uid amount - Transfer diamonds\n" +
			"(Admin Only)\n" +
			"• .dm add amount - Add diamonds to yourself\n" +
			"• .dm add @mention/reply/uid amount - Add diamonds to user"
		);
	}
};
