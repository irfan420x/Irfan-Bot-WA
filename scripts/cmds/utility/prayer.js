// .prayer — Bangladesh 5-daily prayer-break automation (Asia/Dhaka).
//   .prayer on  — enable the break announcement in this group (group admin+)
//   .prayer off — disable it
//   .prayer     — show today's prayer times + this group's status
// The scheduler (core/prayerScheduler.js, started from WABOT.js)
// posts the announcement at each prayer time to every enabled group.
// Times come from the free Aladhan API (Dhaka, method 1); cached to a file.
//
// WhatsApp port note: moment-timezone is not a dependency of this repo,
// so today's date is formatted with Intl instead. Behaviour is identical.

const {
	PRAYERS, TIMEZONE,
	fetchPrayerTimes, loadCachedTimes, saveCachedTimes,
	formatBengaliTime, toBengaliDigits
} = require("../_prayerTimes.js");

function todayDhakaDDMMYYYY() {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric"
	}).format(new Date());
	return parts.replace(/\//g, "-"); // "27-11-2026"
}

module.exports = {
	config: {
		name: "prayer",
		aliases: ["namaz"],
		version: "1.0",
		countDown: 5,
		role: 0,
		description: "Bangladesh 5-daily prayer break announcements (Dhaka time)",
		category: "utility",
		guide: "{pn} [on | off] — enable/disable the prayer-break auto message in this group (group admin only); {pn} — today's prayer times"
	},

	onStart: async function ({ args, event, message, threadsData, role }) {
		const { threadID } = event;
		const sub = (args[0] || "").toLowerCase();

		if (sub === "on" || sub === "off") {
			if (role < 1)
				return message.reply("❌ শুধু গ্রুপ অ্যাডমিনই নামাজের বিরতি চালু/বন্ধ করতে পারবে।");
			const on = sub === "on";
			await threadsData.set(threadID, on, "settings.sendPrayerBreak");
			return message.reply(on
				? "✅ নামাজের বিরতি চালু হয়েছে। প্রতিদিন ৫ ওয়াক্ত নামাজের সময় এই গ্রুপে বিরতির ঘোষণা আসবে (ঢাকার সময়)।"
				: "❌ নামাজের বিরতি বন্ধ হয়েছে। এই গ্রুপে আর ঘোষণা আসবে না।");
		}

		// Status + today's times.
		let times = await fetchPrayerTimes();
		if (times) saveCachedTimes(times);
		else times = loadCachedTimes();
		const threadData = await threadsData.get(threadID).catch(() => null);
		const enabled = !!(threadData && threadData.settings && threadData.settings.sendPrayerBreak);
		const groupName = (threadData && threadData.threadName) || "এই গ্রুপ";

		if (!times) {
			return message.reply(
				`🕌 নামাজের বিরতি — ${groupName}\n\n` +
				`⚠️ আজকের নামাজের সময় এখনো আনা যায়নি (ইন্টারনেট/সার্ভার সমস্যা)। একটু পরে আবার চেষ্টা করো।\n\n` +
				`স্থিতি: ${enabled ? "✅ চালু" : "❌ বন্ধ"} — চালু করতে (অ্যাডমিন): .prayer on`
			);
		}

		const lines = PRAYERS.map(p => `🕌 ${p.bn}: ${formatBengaliTime(times.times[p.key])}`).join("\n");
		const todayBn = toBengaliDigits(todayDhakaDDMMYYYY());
		return message.reply(
			`🕌 আজকের নামাজের সময় (ঢাকা) — ${todayBn}\n\n` +
			`${lines}\n\n` +
			`স্থিতি: ${enabled ? "✅ বিরতির ঘোষণা চালু" : "❌ বিরতির ঘোষণা বন্ধ"}\n` +
			`চালু করতে (অ্যাডমিন): .prayer on`
		);
	}
};
