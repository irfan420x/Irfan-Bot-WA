// .scramble — Unscramble the word to win coins (WhatsApp port).
// Rules are UNCHANGED from the Messenger original:
//   100+ words across 4 categories (Tech / Animals / Food / Places);
//   reward +500 coins for the right word, same for every word;
//   30 seconds per word. ANYONE can reply and play (no author check
//   in the original — the first right answer wins).
//
// WhatsApp port notes (vs the Messenger original):
// - The replyMap entry carries NO author: the WA handler only lets
//   the recorded author trigger onReply, and this game is open to
//   everyone — so author is left unset on purpose.
// - usersData.getName does not exist here — the winner name comes from
//   api.getUserInfo, falling back to the stored user name / id.
// - The WA handler passes no usersData to onReply, so onReply resolves
//   it from global.wabot.db or core/database/db.js (same store the
//   handler itself falls back to).

const { box, fm } = require("./_gameUI.js");
const { usersData: dbUsersData } = require("../../../core/database/db.js");

const REWARD = 500;
const TIME_LIMIT = 30000;

// 100+ words across 4 categories. Reward is the same (+500) for every word.
const WORDS = {
	TECH: [
		"FACEBOOK", "MESSENGER", "JAVASCRIPT", "NODEJS", "COMPUTER",
		"INTERNET", "PROGRAMMING", "SOFTWARE", "HARDWARE", "DATABASE",
		"ALGORITHM", "NETWORK", "SECURITY", "BROWSER", "KEYBOARD",
		"MONITOR", "PROCESSOR", "MEMORY", "STORAGE", "GRAPHICS",
		"MOBILE", "APPLICATION", "WEBSITE", "SERVER", "CLIENT",
		"PYTHON", "GITHUB", "REACTION", "MESSAGE", "FRIEND",
		"ROBOT", "DRONE", "LAPTOP", "TABLET", "ROUTER",
		"MODEM", "PIXEL", "CURSOR", "WIDGET", "CLOUD"
	],
	ANIMALS: [
		"ELEPHANT", "GIRAFFE", "DOLPHIN", "PENGUIN", "CROCODILE",
		"BUTTERFLY", "KANGAROO", "OCTOPUS", "LEOPARD", "BUFFALO",
		"HAMSTER", "JAGUAR", "OSTRICH", "PELICAN", "RACCOON",
		"TURTLE", "CHEETAH", "FALCON", "GORILLA", "PANTHER",
		"ANTELOPE", "WALRUS", "ZEBRA", "COYOTE", "BADGER",
		"MONKEY", "TIGER", "LION", "BEAR", "WOLF"
	],
	FOOD: [
		"PIZZA", "BURGER", "CHOCOLATE", "SANDWICH", "SPAGHETTI",
		"PANCAKE", "POPCORN", "NOODLES", "CHEESE", "BANANA",
		"ORANGE", "POTATO", "TOMATO", "CARROT", "BROCCOLI",
		"AVOCADO", "MANGO", "PINEAPPLE", "STRAWBERRY", "BISCUIT",
		"CUPCAKE", "ICECREAM", "WAFFLE", "CURRY", "SALAD",
		"BREAD", "BUTTER", "HONEY", "APPLE", "GRAPE"
	],
	PLACES: [
		"PARIS", "LONDON", "TOKYO", "SYDNEY", "BERLIN",
		"CAIRO", "MUMBAI", "BANGKOK", "TORONTO", "MADRID",
		"ROME", "DUBAI", "MOSCOW", "BEIJING", "SEOUL",
		"JAKARTA", "MANILA", "DHAKA", "DELHI", "VIENNA",
		"ATHENS", "LISBON", "OSLO", "HANOI", "KABUL",
		"NEPAL", "BHUTAN", "PERU", "CHILE", "EGYPT"
	]
};

const CATEGORY_LABEL = {
	TECH: "Tech",
	ANIMALS: "Animals",
	FOOD: "Food",
	PLACES: "Places"
};

function shuffle(word) {
	return word.split("").sort(() => Math.random() - 0.5).join("");
}

function resolveUsersData(usersData) {
  return usersData
    || (global.wabot && global.wabot.db && global.wabot.db.usersData)
    || dbUsersData;
}

function replyWithId(message, content) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (id) => { if (!done) { done = true; resolve(id || null); } };
    try {
      const p = message.reply(content, (err, info) => finish(!err && info && info.messageID));
      if (p && typeof p.then === "function")
        p.then((info) => finish(info && info.messageID)).catch(() => finish(null));
      else
        setTimeout(() => finish(null), 5000);
    } catch (e) { finish(null); }
  });
}

function registerReply(messageID, entry) {
  if (!messageID || !global.wabot || !global.wabot.replyMap) return false;
  global.wabot.replyMap.set(messageID, { name: entry.name, commandName: entry.name, ...entry });
  return true;
}

function dropReply(messageID) {
  try {
    if (global.wabot && global.wabot.replyMap) global.wabot.replyMap.delete(messageID);
  } catch {}
}

module.exports = {
	config: {
		name: "scramble",
		aliases: ["wordgame", "ws"],
		version: "1.1",
		countDown: 5,
		role: 0,
		description: "Unscramble the word to win coins!",
		category: "game",
		guide: "{pn}: Start a new word scramble game."
	},

	onStart: async function ({ event, message }) {
		try {
			const categories = Object.keys(WORDS);
			const category = categories[Math.floor(Math.random() * categories.length)];
			const list = WORDS[category];
			const originalWord = list[Math.floor(Math.random() * list.length)];

			let scrambledWord = shuffle(originalWord);
			while (scrambledWord === originalWord) {
				scrambledWord = shuffle(originalWord);
			}

			const body = box("🔠 SCRAMBLE", [
				`🔠 Word: ${scrambledWord}`,
				`💡 Hint: ${CATEGORY_LABEL[category]}`,
				`💰 Reward: ${fm(REWARD)} Coins`,
				`⏱️ Time: 30 Seconds`,
				`💬 Reply with your guess — anyone can play!`
			]);

			const msgID = await replyWithId(message, body);
			if (!msgID) {
				return message.reply(box("❌ ERROR", [
					`❌ Game failed`
				]));
			}

			const entry = {
				name: "scramble",
				messageID: msgID,
				// NOTE: no `author` on purpose — anyone may guess (the
				// handler only lets the recorded author trigger onReply).
				correctWord: originalWord,
				scrambledWord,
				category,
				isEnded: false
			};

			entry.timer = setTimeout(async () => {
				const gameState = global.wabot && global.wabot.replyMap
					? global.wabot.replyMap.get(msgID)
					: null;
				if (gameState && !gameState.isEnded) {
					gameState.isEnded = true;
					try {
						await message.reply(box("⏰ TIME'S UP", [
							`⏰ Game Over!`,
							`✅ Word: ${originalWord}`
						]));
					} catch {}
					dropReply(msgID);
				}
			}, TIME_LIMIT);

			registerReply(msgID, entry);

		} catch (error) {
			console.error(error);
			message.reply(box("❌ ERROR", [
				`❌ Game failed`
			]));
		}
	},

	onReply: async function ({ api, event, Reply, usersData, message }) {
		usersData = resolveUsersData(usersData);
		if (!Reply) return;
		const { correctWord, scrambledWord, messageID, isEnded } = Reply;
		const userGuess = (event.body || "").trim().toUpperCase();

		if (isEnded) return;

		if (userGuess === correctWord) {
			Reply.isEnded = true;

			try {
				const userData = await usersData.get(event.senderID) || {};
				userData.money = (userData.money || 0) + REWARD;
				await usersData.set(event.senderID, userData);

				let winnerName = userData.name || "Player";
				try {
					if (api && typeof api.getUserInfo === "function") {
						const info = await api.getUserInfo(event.senderID);
						if (info && info.name) winnerName = info.name;
					}
				} catch {}

				const successMsg = box("🏆 WINNER", [
					`🎉 Correct: ${correctWord}`,
					`👤 Winner: ${winnerName}`,
					`💰 Reward: +${fm(REWARD)} Coins`,
					`💰 Balance: ${fm(userData.money)}`
				]);

				await message.reply(successMsg);
				dropReply(messageID);
			} catch (error) {
				console.error(error);
				await message.reply(box("🏆 WINNER", [
					`✅ Correct: ${correctWord}`
				]));
			}
		} else if (userGuess) {
			// Wrong guess: reply instead of silence, with the word as a reminder.
			await message.reply(box("❌ WRONG GUESS", [
				`❌ Not that one — try again!`,
				`🔠 Word: ${scrambledWord}`
			]));
		}
	}
};
