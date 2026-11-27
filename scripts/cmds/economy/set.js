// .set — set user money or exp (bot-admin only) (WhatsApp port).
// Logic and numbers are UNCHANGED from the Messenger original:
//   set money|exp <amount> [@user / reply / self];
//   @everyone sets it only for members whose money/exp is below 1000.
//
// WhatsApp port notes (vs the Messenger original):
// - role: 2 — the handler enforces bot-admin (config.adminBot + owner)
//   before onStart runs. The Messenger original was owner-only
//   (global.irfbot.orionsetting.creator); the in-command check below
//   mirrors the handler (adminBot + owner) so the guard holds even if
//   onStart is called directly.
// - Replies go through message.reply, not api.sendMessage(threadID).
// - Names come from api.getUserInfo (best-effort, falls back to the ID):
//   this bot's usersData has no getName().
// - @everyone member list comes from threadsData (members) with fallback
//   to api.getThreadInfo (participantIDs), as in the original.
// - usersData.set takes the whole updated user object (the original set
//   a partial { money, exp, data } object; whole-object keeps the name
//   and other fields intact).

function isBotAdmin(senderID) {
	const cfg = (global.wabot && global.wabot.config) || {};
	const admins = Array.isArray(cfg.adminBot) ? cfg.adminBot : [cfg.adminBot].filter(Boolean);
	return admins.map(String).includes(String(senderID)) || String(cfg.owner) === String(senderID);
}

async function displayName(api, usersData, uid) {
	try {
		if (api && typeof api.getUserInfo === "function") {
			const info = await api.getUserInfo(uid);
			if (info && info.name && info.name !== String(uid)) return info.name;
		}
	} catch { /* fall through */ }
	try {
		const u = await usersData.get(uid);
		if (u && u.name) return u.name;
	} catch { /* fall through */ }
	return String(uid);
}

module.exports = {
	config: {
		name: "set",
		aliases: ["st"],
		version: "1.3",
		author: "Irfan Ahmmed",
		role: 2,
		countDown: 3,
		description: "Set user money or exp (Bot admin only)",
		category: "economy",
		guide:
			"{pn} money 1000 @user\n" +
			"{pn} exp 500 (reply)\n" +
			"{pn} money 300\n" +
			"{pn} money 5000 @everyone (only balance < 1000)\n" +
			"{pn} exp 500 @everyone (only exp < 1000)"
	},

	onStart: async function ({ args, event, api, usersData, threadsData, message }) {
		const { senderID, threadID, mentions, messageReply } = event;

		if (!isBotAdmin(senderID)) {
			return message.reply(
				"🚫 𝗔𝗰𝗰𝗲𝘀𝘀 𝗗𝗲𝗻𝗶𝗲𝗱!\n𝗢𝗻𝗹𝘆 𝗯𝗼𝘁 𝗮𝗱𝗺𝗶𝗻 𝗰𝗮𝗻 𝘂𝘀𝗲 𝘁𝗵𝗶𝘀 𝗰𝗼𝗺𝗺𝗮𝗻𝗱."
			);
		}

		const type = args[0]?.toLowerCase();
		const amount = parseInt(args[1]);

		if (!["money", "exp"].includes(type) || isNaN(amount) || amount < 0) {
			return message.reply(
				"❌ 𝗜𝗻𝘃𝗮𝗹𝗶𝗱 𝗖𝗼𝗺𝗺𝗮𝗻𝗱 𝗙𝗼𝗿𝗺𝗮𝘁!\n\n" +
				"📌 𝗨𝘀𝗮𝗴𝗲:\n" +
				"➤ set money 1000 @user\n" +
				"➤ set exp 500 (reply)\n" +
				"➤ set money 300\n" +
				"➤ set money 5000 @everyone\n" +
				"➤ set exp 500 @everyone"
			);
		}

		// @everyone mode: only members whose balance (money / exp) is below 1000 get it.
		const body = event.body || "";
		const isEveryone =
			/@everyone/i.test(body) ||
			Object.keys(mentions || {}).includes(threadID) ||
			Object.keys(mentions || {}).includes("0");

		if (isEveryone) {
			const LIMIT = 1000;
			let memberIDs = [];
			try {
				const threadData = threadsData ? await threadsData.get(threadID) : null;
				if (threadData && Array.isArray(threadData.members) && threadData.members.length > 0)
					memberIDs = threadData.members.map(m => m.userID || m.id).filter(Boolean);
			} catch (e) { /* fall through to getThreadInfo */ }
			if (memberIDs.length === 0) {
				try {
					const info = await api.getThreadInfo(threadID);
					memberIDs = info.participantIDs || [];
				} catch (e) {
					return message.reply(
						"⚠️ 𝗖𝗼𝘂𝗹𝗱 𝗻𝗼𝘁 𝗹𝗼𝗮𝗱 𝗴𝗿𝗼𝘂𝗽 𝗺𝗲𝗺𝗯𝗲𝗿𝘀.\n𝗧𝗿𝘆 𝗮𝗴𝗮𝗶𝗻 𝗶𝗻 𝗮 𝗺𝗼𝗺𝗲𝗻𝘁."
					);
				}
			}

			let updated = 0;
			let skipped = 0;
			const updatedNames = [];

			for (const uid of memberIDs) {
				const u = await usersData.get(uid);
				if (!u) { skipped++; continue; }
				const current = type === "money" ? (u.money || 0) : (u.exp || 0);
				if (current >= LIMIT) { skipped++; continue; }
				if (type === "money") u.money = amount;
				else u.exp = amount;
				await usersData.set(uid, u);
				updated++;
				if (updatedNames.length < 8)
					updatedNames.push(await displayName(api, usersData, uid));
			}

			const label = type === "money" ? "𝗖𝗼𝗶𝗻𝘀" : "𝗘𝗫𝗣";
			const unit = type === "money" ? "💰" : "⭐";
			let msg =
				`✅ ${label} 𝗨𝗽𝗱𝗮𝘁𝗲𝗱 (𝗘𝘃𝗲𝗿𝘆𝗼𝗻𝗲)!\n\n` +
				`${unit} 𝗔𝗺𝗼𝘂𝗻𝘁 : ${amount}\n` +
				`🎯 𝗢𝗻𝗹𝘆 𝘄𝗵𝗼𝘀𝗲 ${type} < ${LIMIT}\n` +
				`👥 𝗨𝗽𝗱𝗮𝘁𝗲𝗱 : ${updated} user${updated === 1 ? "" : "s"}\n` +
				`⏭️ 𝗦𝗸𝗶𝗽𝗽𝗲𝗱 : ${skipped} (already ≥ ${LIMIT} or no data)`;
			if (updatedNames.length > 0) {
				msg += `\n👤 ${updatedNames.join(", ")}`;
				if (updated > updatedNames.length)
					msg += ` +${updated - updatedNames.length} more`;
			}
			return message.reply(msg);
		}

		let targetID;
		if (messageReply) {
			targetID = messageReply.senderID;
		} else if (Object.keys(mentions || {}).length > 0) {
			targetID = Object.keys(mentions)[0];
		} else {
			targetID = senderID;
		}

		const userData = await usersData.get(targetID);
		if (!userData) {
			return message.reply(
				"⚠️ 𝗨𝘀𝗲𝗿 𝗗𝗮𝘁𝗮 𝗡𝗼𝘁 𝗙𝗼𝘂𝗻𝗱!\n𝗧𝗵𝗶𝘀 𝘂𝘀𝗲𝗿 𝗺𝗮𝘆 𝗻𝗼𝘁 𝗯𝗲 𝗿𝗲𝗴𝗶𝘀𝘁𝗲𝗿𝗲𝗱."
			);
		}

		const name = await displayName(api, usersData, targetID);

		if (type === "money") {
			userData.money = amount;
			await usersData.set(targetID, userData);

			return message.reply(
				"✅ 𝗖𝗼𝗶𝗻𝘀 𝗨𝗽𝗱𝗮𝘁𝗲𝗱 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹𝗹𝘆!\n\n" +
				`👤 𝗨𝘀𝗲𝗿 : ${name}\n` +
				`💰 𝗖𝗼𝗶𝗻𝘀 : ${amount}`
			);
		}

		if (type === "exp") {
			userData.exp = amount;
			await usersData.set(targetID, userData);

			return message.reply(
				"✅ 𝗘𝗫𝗣 𝗨𝗽𝗱𝗮𝘁𝗲𝗱 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹𝗹𝘆!\n\n" +
				`👤 𝗨𝘀𝗲𝗿 : ${name}\n` +
				`⭐ 𝗘𝗫𝗣  : ${amount}`
			);
		}
	}
};
