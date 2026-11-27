// .daily — daily gifts with streak system, bonuses (WhatsApp port).
// Reward numbers are UNCHANGED from the Messenger original:
//   day 1: 1500 coin + 450 exp (grows ~1.33%/day across the week)
//   weekly bonus (every 7th streak day): +3500 coin + 630 exp
//   streak multiplier: x1.0–x1.2 (days 1–7), x1.3–x1.5 (8–14), up to x2.0 (30)
//   timezone: Asia/Singapore
//
// WhatsApp port notes (vs the Messenger original):
// - No envCommands / getLang in this bot's contract: the env config and
//   the English strings are inlined below (same values, same wording).
// - No moment-timezone dependency: Singapore dates come from Intl.
// - usersData.set takes the whole updated user object (the original set
//   a partial { money, exp, data } object; whole-object keeps name and
//   other fields intact). Default users have no .data — it is created.

const TIMEZONE = "Asia/Singapore";
const REWARD_FIRST_DAY = { coin: 1500, exp: 450 };
const WEEKLY_BONUS = { coin: 3500, exp: 630 };

const LANG = {
	monday: "Monday",
	tuesday: "Tuesday",
	wednesday: "Wednesday",
	thursday: "Thursday",
	friday: "Friday",
	saturday: "Saturday",
	sunday: "Sunday",
	alreadyReceived: "You have already received today's gift!",
	received: "🎁 You have received %1 coin and %2 exp!",
	streakInfo: "🔥 Streak: %1 consecutive days\n📊 Current bonus: x%2",
	streakReward: "✨ +%1 coin and +%2 exp from streak bonus!",
	weeklyBonus: "🎉 CONGRATULATIONS! You received weekly bonus: %1 coin and %2 exp!",
	streakLost: "⚠️ Your streak has been reset for claiming late!",
	newStreak: "🆕 Starting new streak!",
	leaderboard: "🏆 STREAK LEADERBOARD 🏆\n\n%1\n",
	lbEntry: "%1. %2 - %3 days 🔥",
	noStreakData: "No streak data yet!",
	yourPosition: "Your position: #%1",
	multiLogin: "⚠️ Multiple login detected, streak maintained.",
	streakMilestone: "🎊 NEW MILESTONE! %1 days streak!",
	totalReceived: "📈 Total received: %1 coin, %2 exp",
	nextRewardIn: "⏰ Next reward in: %1 hours %2 minutes"
};

function getLang(key, ...params) {
	let text = LANG[key] || key;
	params.forEach((p, i) => { text = text.replace("%" + (i + 1), String(p)); });
	return text;
}

// ---- Singapore date helpers (Intl, no moment) ----

function sgParts(date) {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: TIMEZONE,
		year: "numeric", month: "2-digit", day: "2-digit",
		hour: "2-digit", minute: "2-digit",
		hour12: false
	}).formatToParts(date || new Date());
	const out = {};
	for (const p of parts) out[p.type] = p.value;
	if (out.hour === "24") out.hour = "00";
	return out;
}

function sgDateStr(date) {
	const p = sgParts(date);
	return `${p.year}-${p.month}-${p.day}`; // "YYYY-MM-DD"
}

// Weekday (0 = Sunday) of a "YYYY-MM-DD" date.
function weekdayOf(dateStr) {
	return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

// Whole days between two "YYYY-MM-DD" dates (b - a).
function daysBetween(aStr, bStr) {
	const a = Date.parse(aStr + "T00:00:00Z");
	const b = Date.parse(bStr + "T00:00:00Z");
	return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

// Hours/minutes until the next Singapore midnight.
function timeUntilMidnight() {
	const p = sgParts();
	const minsLeft = (24 * 60) - (parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10));
	return { hours: Math.floor(minsLeft / 60), minutes: minsLeft % 60 };
}

function calculateStreakBonus(streakDays) {
	if (streakDays <= 7) {
		return 1 + (streakDays - 1) * 0.2 / 6; // 1.0 to 1.2
	} else if (streakDays <= 14) {
		return 1.2 + (streakDays - 7) * 0.3 / 7; // 1.3 to 1.5
	} else {
		const maxBonus = 2.0;
		const additionalDays = Math.min(streakDays - 14, 16); // Cap at 30 days
		return 1.5 + additionalDays * 0.5 / 16; // 1.6 to 2.0
	}
}

module.exports = {
	config: {
		name: "daily",
		version: "2.0",
		countDown: 5,
		role: 0,
		description: "Receive daily gifts with streak system, bonuses and new features",
		category: "economy",
		guide: "{pn}: Claim daily gift\n{pn} info: View gift information and streak\n{pn} streak: View current streak info\n{pn} leaderboard: Daily streak leaderboard"
	},

	onStart: async function ({ args, message, event, usersData }) {
		const reward = REWARD_FIRST_DAY;
		const timezone = TIMEZONE;

		if (args[0] == "info") {
			let msg = "📅 DAILY REWARD SCHEDULE 📅\n\n";
			for (let i = 1; i <= 7; i++) {
				const getCoin = Math.floor(reward.coin * (1 + 20 / 1500) ** ((i == 7 ? 0 : i) - 1));
				const getExp = Math.floor(reward.exp * (1 + 20 / 1500) ** ((i == 7 ? 0 : i) - 1));
				const day = i == 7 ? getLang("sunday") :
					i == 6 ? getLang("saturday") :
						i == 5 ? getLang("friday") :
							i == 4 ? getLang("thursday") :
								i == 3 ? getLang("wednesday") :
									i == 2 ? getLang("tuesday") :
										getLang("monday");
				msg += `${day}: ${getCoin} coin, ${getExp} exp\n`;
			}
			msg += "\n\n";
			msg += "🌟 STREAK BONUS SYSTEM 🌟\n";
			msg += "1-7 days: x1.0 - x1.2 bonus\n";
			msg += "8-14 days: x1.3 - x1.5 bonus\n";
			msg += "15-30 days: x1.6 - x2.0 bonus\n";
			msg += "Weekly bonus every 7 days!\n";
			msg += "";
			return message.reply(msg);
		}

		if (args[0] == "streak") {
			const { senderID } = event;
			const userData = await usersData.get(senderID);
			const streakData = (userData.data && userData.data.dailyStreak) || { current: 0, lastClaim: null };
			const bonusMultiplier = calculateStreakBonus(streakData.current);

			let msg = getLang("streakInfo", streakData.current, bonusMultiplier.toFixed(1));

			if (streakData.lastClaim) {
				const left = timeUntilMidnight();
				msg += `\n⏰ ${getLang("nextRewardIn", left.hours, left.minutes)}`;
			}

			// Total stats
			msg += `\n${getLang("totalReceived", (userData.data && userData.data.totalCoinReceived) || 0, (userData.data && userData.data.totalExpReceived) || 0)}`;
			return message.reply(msg);
		}

		if (args[0] == "leaderboard") {
			const allUsers = await usersData.getAll();
			const streakList = [];

			for (const user of allUsers) {
				if (user.data && user.data.dailyStreak && user.data.dailyStreak.current > 0) {
					streakList.push({
						name: user.name,
						streak: user.data.dailyStreak.current,
						id: user.id
					});
				}
			}

			streakList.sort((a, b) => b.streak - a.streak);

			let leaderboardMsg = "";
			const top10 = streakList.slice(0, 10);

			if (top10.length === 0) {
				leaderboardMsg = getLang("noStreakData");
			} else {
				top10.forEach((user, index) => {
					leaderboardMsg += getLang("lbEntry", index + 1, user.name, user.streak) + "\n";
				});
			}

			// Add user's position
			const senderID = event.senderID;
			const userIndex = streakList.findIndex(u => u.id === senderID);
			if (userIndex !== -1) {
				leaderboardMsg += `\n${getLang("yourPosition", userIndex + 1)}`;
			}

			return message.reply(getLang("leaderboard", leaderboardMsg));
		}

		// Main daily claim function
		const dateTime = sgDateStr();
		const currentDay = weekdayOf(dateTime); // 0: sunday, 1: monday, etc.
		const { senderID } = event;

		const userData = await usersData.get(senderID);
		if (!userData.data) userData.data = {};

		// Initialize streak data if not exists
		if (!userData.data.dailyStreak) {
			userData.data.dailyStreak = {
				current: 0,
				lastClaim: null,
				longestStreak: 0
			};
		}

		if (!userData.data.totalCoinReceived) userData.data.totalCoinReceived = 0;
		if (!userData.data.totalExpReceived) userData.data.totalExpReceived = 0;

		const streakData = userData.data.dailyStreak;
		const lastClaimDate = streakData.lastClaim || null;

		// Check if already claimed today
		if (lastClaimDate && lastClaimDate === dateTime) {
			const left = timeUntilMidnight();
			let msg = getLang("alreadyReceived");
			msg += `\n⏰ ${getLang("nextRewardIn", left.hours, left.minutes)}`;
			return message.reply(msg);
		}

		// Calculate streak
		let isStreakContinued = false;
		if (lastClaimDate) {
			const daysDiff = daysBetween(lastClaimDate, dateTime);
			if (daysDiff === 1) {
				// Perfect streak
				streakData.current++;
				isStreakContinued = true;
			} else if (daysDiff <= 3 && daysDiff >= 0) {
				// Grace period: 3 days max
				message.reply(getLang("multiLogin"));
				isStreakContinued = true;
			} else {
				// Streak broken
				message.reply(getLang("streakLost"));
				streakData.current = 1;
				message.reply(getLang("newStreak"));
			}
		} else {
			// First time claim
			streakData.current = 1;
			message.reply(getLang("newStreak"));
		}
		void isStreakContinued;

		// Update longest streak
		if (streakData.current > streakData.longestStreak) {
			streakData.longestStreak = streakData.current;
			if (streakData.current % 7 === 0) {
				message.reply(getLang("streakMilestone", streakData.current));
			}
		}

		// Calculate base reward
		let getCoin = Math.floor(reward.coin * (1 + 20 / 1500) ** ((currentDay == 0 ? 7 : currentDay) - 1));
		let getExp = Math.floor(reward.exp * (1 + 20 / 1500) ** ((currentDay == 0 ? 7 : currentDay) - 1));

		// Apply streak bonus
		const streakMultiplier = calculateStreakBonus(streakData.current);
		const streakBonusCoin = Math.floor(getCoin * (streakMultiplier - 1));
		const streakBonusExp = Math.floor(getExp * (streakMultiplier - 1));

		getCoin += streakBonusCoin;
		getExp += streakBonusExp;

		// Weekly bonus (every 7 days)
		let weeklyBonusMsg = "";
		if (streakData.current % 7 === 0) {
			const weeklyBonus = WEEKLY_BONUS;
			getCoin += weeklyBonus.coin;
			getExp += weeklyBonus.exp;
			weeklyBonusMsg = `\n${getLang("weeklyBonus", weeklyBonus.coin, weeklyBonus.exp)}`;
		}

		// Update user data
		streakData.lastClaim = dateTime;
		userData.money = (userData.money || 0) + getCoin;
		userData.exp = (userData.exp || 0) + getExp;
		userData.data.dailyStreak = streakData;
		userData.data.totalCoinReceived = (userData.data.totalCoinReceived || 0) + getCoin;
		userData.data.totalExpReceived = (userData.data.totalExpReceived || 0) + getExp;
		userData.data.lastTimeGetReward = dateTime;

		await usersData.set(senderID, userData);

		// Prepare response message
		let responseMsg = getLang("received", getCoin, getExp);

		if (streakBonusCoin > 0 || streakBonusExp > 0) {
			responseMsg += `\n${getLang("streakReward", streakBonusCoin, streakBonusExp)}`;
		}

		if (weeklyBonusMsg) {
			responseMsg += weeklyBonusMsg;
		}

		responseMsg += `\n${getLang("streakInfo", streakData.current, streakMultiplier.toFixed(1))}`;

		message.reply(responseMsg);
	}
};
