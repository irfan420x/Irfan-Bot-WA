// .dhbc — Catch the word (đuổi hình bắt chữ) (WhatsApp port).
// Rules are UNCHANGED from the Messenger original:
//   reward 1000 coins for the right word; 3 wrong tries, then game
//   over; after 2 wrong tries one letter is revealed as a hint;
//   60 seconds to answer. The word comes from the goatbotserver API,
//   with the local Vietnamese picture-word list as fallback when the
//   API is unreachable.
//
// WhatsApp port notes (vs the Messenger original):
// - getLang/envCommands do not exist here — English strings are used
//   (the original's `en` lang block, verbatim).
// - getStreamFromURL does not exist here — hint pictures are fetched
//   with axios as arraybuffers and sent as separate image messages
//   (this bot's send supports one attachment per message).
// - The WA handler passes no usersData to onReply, so onReply resolves
//   it from global.wabot.db or core/database/db.js (same store the
//   handler itself falls back to).

const axios = require("axios");
const { box, fm } = require("./_gameUI.js");
const { usersData: dbUsersData } = require("../../../core/database/db.js");

// Fallback word list (used only when the third-party API is unreachable,
// so a dead server does not kill the command). Words are Vietnamese
// picture-word puzzles, the same kind the API serves.
const FALLBACK_WORDS = [
	{ word: "TÌNH YÊU", category: "💗 Tình cảm (Love)" },
	{ word: "MẶT TRỜI", category: "☀️ Thiên nhiên (Nature)" },
	{ word: "CON MÈO", category: "🐱 Động vật (Animal)" },
	{ word: "BÁNH MÌ", category: "🍞 Ẩm thực (Food)" },
	{ word: "XE ĐẠP", category: "🚲 Phương tiện (Vehicle)" },
	{ word: "TRƯỜNG HỌC", category: "🏫 Địa điểm (Place)" },
	{ word: "BÓNG ĐÁ", category: "⚽ Thể thao (Sport)" },
	{ word: "MƯA RÀO", category: "🌧️ Thiên nhiên (Nature)" },
	{ word: "CON CHÓ", category: "🐶 Động vật (Animal)" },
	{ word: "CÀ PHÊ", category: "☕ Ẩm thực (Food)" },
	{ word: "MÁY BAY", category: "✈️ Phương tiện (Vehicle)" },
	{ word: "BỆNH VIỆN", category: "🏥 Địa điểm (Place)" }
];

const REWARD = 1000;
const MAX_WRONG = 3;
const TIME_LIMIT_MS = 60_000;

// English strings (the original's `en` lang block).
const L = {
	reply: "💬 Reply to this message with your answer",
	isSong: "This is the name of the song of the singer %1",
	notPlayer: "⚠️ You are not the player of this question",
	correct: "🎉 Congratulations! You answered correctly and received %1",
	wrong: "❌ Wrong (%1/%2)",
	questionTitle: "🧩 CATCH THE WORD",
	wordLine: "🔤 Word: %1",
	categoryLine: "📂 Category: %1",
	lengthLine: "🔢 Letters: %1",
	rewardLine: "💰 Reward: %1",
	timeLine: "⏰ You have 60 seconds to answer",
	offlineNote: "📴 Pictures unavailable (offline mode) — guess from the category!",
	categorySong: "🎵 Song",
	categoryPicture: "🖼️ Picture puzzle",
	correctTitle: "🎉 CORRECT!",
	wrongTitle: "❌ WRONG",
	hint: "💡 Hint: %1",
	timeoutTitle: "⏰ TIME'S UP",
	timeoutWord: "The word was: %1",
	timeoutFooter: "💰 You missed %1",
	gameOverTitle: "💀 GAME OVER"
};

function t(key, ...vals) {
	let s = L[key] || key;
	vals.forEach((v, i) => { s = s.replace(`%${i + 1}`, v); });
	return s;
}

// Render the masked word, revealing the letters whose indexes are in
// `revealed` (a Set of character indexes). Unrevealed letters show as █.
function maskWord(word, revealed) {
	return word.split("").map((ch, i) => {
		if (ch === " ")
			return "  ";
		return revealed.has(i) ? ch + " " : "█ ";
	}).join("").trimEnd();
}

function formatText(text) {
	return String(text || "").normalize("NFD")
		.toLowerCase()
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[đ|Đ]/g, (x) => x == "đ" ? "d" : "D");
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

async function fetchImageBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
  const contentType = (res.headers && res.headers["content-type"]) || "";
  if (!contentType.startsWith("image/")) return null;
  return { buffer: Buffer.from(res.data), mimetype: contentType.split(";")[0] || "image/jpeg" };
}

module.exports = {
	config: {
		name: "dhbc",
		version: "1.3",
		countDown: 5,
		role: 0,
		description: "Play game catch the word",
		category: "game",
		guide: "{pn}"
	},

	onStart: async function ({ message, event, usersData }) {
		usersData = resolveUsersData(usersData);
		let wordcomplete, casi = null, image1 = null, image2 = null;
		let category = null;
		let isOffline = false;

		// The word comes from a third-party API — if it is down (or slow),
		// fall back to the local word list instead of dying silently.
		try {
			const datagame = (await axios.get("https://goatbotserver.onrender.com/api/duoihinhbatchu", { timeout: 10000 })).data;
			({ wordcomplete, casi, image1, image2 } = datagame.data);
			if (!wordcomplete)
				throw new Error("empty word from API");
		}
		catch (e) {
			const fallback = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
			wordcomplete = fallback.word;
			category = fallback.category;
			isOffline = true;
		}

		if (!category)
			category = casi ? t("categorySong") : t("categoryPicture");

		const letterCount = wordcomplete.replace(/\s/g, "").length;
		const bodyLines = [
			t("wordLine", maskWord(wordcomplete, new Set())),
			t("categoryLine", category),
			t("lengthLine", letterCount),
			t("rewardLine", fm(REWARD))
		];
		if (casi)
			bodyLines.push(t("isSong", casi));
		if (isOffline)
			bodyLines.push(t("offlineNote"));

		const questionText = box(
			t("questionTitle"),
			bodyLines,
			[t("reply"), t("timeLine")]
		);

		const msgID = await replyWithId(message, questionText);
		if (!msgID) {
			return message.reply(box("❌ ERROR", [
				`❌ Game failed`
			]));
		}

		// Fetch the two hint pictures — a broken image is skipped, it
		// never kills the question. Sent as separate messages (one
		// attachment per message on this bot).
		for (const url of [image1, image2]) {
			if (!url)
				continue;
			try {
				const img = await fetchImageBuffer(url);
				if (img)
					await message.send({ body: "", attachment: { buffer: img.buffer, mimetype: img.mimetype, fileName: "dhbc-hint.jpg" } });
			}
			catch (e) { /* skip broken image */ }
		}

		const registration = {
			name: "dhbc",
			messageID: msgID,
			author: event.senderID,
			wordcomplete,
			wrongCount: 0,
			revealed: new Set(),
			reward: REWARD
		};

		// 60s timer — on timeout, reveal the word and free the question.
		registration.timer = setTimeout(async () => {
			if (!global.wabot || !global.wabot.replyMap || !global.wabot.replyMap.has(msgID))
				return;
			dropReply(msgID);
			try {
				await message.reply(box(
					t("timeoutTitle"),
					[t("timeoutWord", wordcomplete)],
					[t("timeoutFooter", fm(REWARD))]
				));
			}
			catch (e) { /* thread may be gone */ }
		}, TIME_LIMIT_MS);

		registerReply(msgID, registration);
	},

	onReply: async ({ message, Reply, event, usersData }) => {
		usersData = resolveUsersData(usersData);
		if (!Reply) return;
		const { author, wordcomplete, messageID } = Reply;
		if (event.senderID != author)
			return message.reply(t("notPlayer"));

		if (formatText(event.body) == formatText(wordcomplete)) {
			if (Reply.timer)
				clearTimeout(Reply.timer);
			dropReply(messageID);
			const userData = await usersData.get(event.senderID) || {};
			userData.money = (userData.money || 0) + REWARD;
			await usersData.set(event.senderID, userData);
			return message.reply(box(
				t("correctTitle"),
				[t("correct", fm(REWARD))]
			));
		}

		const wrongCount = (Reply.wrongCount || 0) + 1;
		Reply.wrongCount = wrongCount;

		// Out of tries — reveal the word and free the question.
		if (wrongCount >= MAX_WRONG) {
			if (Reply.timer)
				clearTimeout(Reply.timer);
			dropReply(messageID);
			return message.reply(box(
				t("gameOverTitle"),
				[t("timeoutWord", wordcomplete)],
				[t("timeoutFooter", fm(Reply.reward || REWARD))]
			));
		}

		// After 2 wrong tries, reveal one letter as a hint.
		let hintLine = null;
		if (wrongCount >= 2) {
			const revealed = Reply.revealed || new Set();
			for (let i = 0; i < wordcomplete.length; i++) {
				if (wordcomplete[i] !== " " && !revealed.has(i)) {
					revealed.add(i);
					break;
				}
			}
			Reply.revealed = revealed;
			hintLine = t("hint", maskWord(wordcomplete, revealed));
		}

		const bodyLines = [t("wrong", wrongCount, MAX_WRONG)];
		if (hintLine)
			bodyLines.push(hintLine);
		return message.reply(box(t("wrongTitle"), bodyLines));
	}
};
