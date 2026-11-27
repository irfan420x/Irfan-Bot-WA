// .guessnumber — Guess number game (WhatsApp port).
// Rules are UNCHANGED from the Messenger original:
//   4 digits → 10 guesses, 1 reward point
//   5 digits → 12 guesses, 2 reward points
//   6 digits → 15 guesses, 3 reward points
//   The number uses digits 0–9, each digit once, and may start with 0.
//   After each guess you get the count of correct digits and the count
//   of correct digits in the correct position. Subcommands: rank,
//   info, reset (bot admin only).
//
// WhatsApp port notes (vs the Messenger original):
// - No canvas is installed here, so the board image is replaced by a
//   TEXT board: the guess history (with both hint counts) is shown
//   under every board message, exactly as the original already did in
//   text under its image.
// - globalData (the Messenger global rank store) does not exist here —
//   ranks live per-user in user.data.guessNumberRank { points, wins,
//   losses } and the leaderboard is built from usersData.getAll(),
//   same shape, same points.
// - usersData.getName does not exist here — names come from the stored
//   user doc or api.getUserInfo.
// - Multi mode: the reply entry carries NO author (the WA handler
//   only lets the recorded author trigger onReply); single mode
//   records the author, same as the original's single-player check.
// - The WA handler passes no usersData to onReply, so onReply resolves
//   it from global.wabot.db or core/database/db.js (same store the
//   handler itself falls back to).

const { medal } = require("./_gameUI.js");
const { usersData: dbUsersData } = require("../../../core/database/db.js");

const rows = [
	{ col: 4, row: 10, rewardPoint: 1 },
	{ col: 5, row: 12, rewardPoint: 2 },
	{ col: 6, row: 15, rewardPoint: 3 }
];

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

// Unique-digit answer, e.g. "0417" for col 4 (may start with 0).
function randomAnswer(col) {
  const digits = "0123456789".split("");
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, col).join("");
}

// "1h 2m 3s" style play-time (the original's convertTime).
function convertTime(ms) {
  const totalSeconds = Math.floor((Number(ms) || 0) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function formatGuessHistory(history) {
  if (!history || !history.length)
    return "";
  const lines = history.map((item, index) =>
    `${index + 1}. ${item.guess} → ${item.right} correct, ${item.rightPosition} in place`);
  return `📋 Guess history:\n${lines.join("\n")}`;
}

function boardText(gameData) {
  const triesLeft = gameData.row - (gameData.history ? gameData.history.length : 0);
  let text =
    `🔢 GUESS NUMBER GAME\n` +
    `👤 ${gameData.playerName}  •  🎯 Tries left: ${triesLeft}\n\n` +
    `⏳ How to play:\n` +
    `You have ${gameData.row} guesses.\n` +
    `After each guess, you will get additional hints of the number of correct digits (shown on the left) and the number of correct digits in the correct position (shown on the right).\n\n` +
    `📄 Note:\n` +
    `The number is formed with digits from 0 to 9, each digit appears only once and the number can start with 0.\n\n`;
  const historyText = formatGuessHistory(gameData.history);
  if (historyText)
    text += `${historyText}\n\n`;
  text += `🎮 Reply to this message with the ${gameData.col} numbers you guess to play the game.`;
  return text;
}

function getRankDoc(user) {
  if (!user.data) user.data = {};
  if (!user.data.guessNumberRank)
    user.data.guessNumberRank = { points: 0, wins: [], losses: [] };
  return user.data.guessNumberRank;
}

async function displayName(api, usersData, id) {
  try {
    const u = await usersData.get(id);
    if (u && u.name) return u.name;
  } catch {}
  try {
    if (api && typeof api.getUserInfo === "function") {
      const info = await api.getUserInfo(id);
      if (info && info.name) return info.name;
    }
  } catch {}
  return String(id);
}

module.exports = {
	config: {
		name: "guessnumber",
		aliases: ["guessnum"],
		version: "1.1",
		countDown: 5,
		role: 0,
		description: "Guess number game",
		category: "game",
		guide: "{pn} [4 | 5 | 6] [single | multi] — create a new game (default 4, single)\n{pn} rank <page> — view the ranking\n{pn} info [uid] — view ranking info\n{pn} reset — reset the ranking (bot admin only)"
	},

	onStart: async function ({ message, event, args, usersData, role, api }) {
		usersData = resolveUsersData(usersData);

		if (args[0] == "rank") {
			const all = await usersData.getAll();
			const rankList = all
				.filter(u => u.data && u.data.guessNumberRank && (((u.data.guessNumberRank.wins || []).length) + ((u.data.guessNumberRank.losses || []).length) > 0))
				.map(u => ({
					id: u.id,
					name: u.name || null,
					points: u.data.guessNumberRank.points || 0,
					wins: u.data.guessNumberRank.wins || [],
					losses: u.data.guessNumberRank.losses || []
				}));
			if (!rankList.length)
				return message.reply("⭕ | There is no one who has scored.");

			const page = parseInt(args[1]) || 1;
			const maxUserOnePage = 30;

			const pageRows = rankList
				.sort((a, b) => (b.wins.length - a.wins.length))
				.slice((page - 1) * maxUserOnePage, page * maxUserOnePage);

			const lines = [];
			for (let i = 0; i < pageRows.length; i++) {
				const item = pageRows[i];
				const userName = item.name || await displayName(api, usersData, item.id);
				lines.push(`${medal(i)} ${userName} - ${item.wins.length} wins - ${item.losses.length} losses`);
			}

			return message.reply(
				`🏆 | Ranking:\n${lines.join("\n") || "⭕ | There is no one who has scored."}\n` +
				`Page ${page}/${Math.ceil(rankList.length / maxUserOnePage)}`
			);
		}
		else if (args[0] == "info") {
			let targetID;
			if (event.mentions && Object.keys(event.mentions).length)
				targetID = Object.keys(event.mentions)[0];
			else if (event.messageReply)
				targetID = event.messageReply.senderID;
			else if (!isNaN(args[1]))
				targetID = args[1];
			else
				targetID = event.senderID;

			const targetUser = await usersData.get(targetID) || {};
			const rankDoc = targetUser.data && targetUser.data.guessNumberRank;
			if (!rankDoc)
				return message.reply(`⚠️ | Could not find user with id ${targetID} in the ranking.`);

			const userName = await displayName(api, usersData, targetID);
			const pointsReceived = rankDoc.points || 0;
			const winNumber = (rankDoc.wins || []).length;
			const lossNumber = (rankDoc.losses || []).length;
			const playNumber = winNumber + lossNumber;
			const winRate = playNumber ? (winNumber / playNumber * 100).toFixed(2) : "0.00";
			const winInfo = {};
			for (const item of rankDoc.wins || [])
				winInfo[item.col] = winInfo[item.col] ? winInfo[item.col] + 1 : 1;
			const playTime = convertTime(
				(rankDoc.wins || []).reduce((a, b) => a + (b.timeSuccess || 0), 0) +
				(rankDoc.losses || []).reduce((a, b) => a + (b.timeSuccess || 0), 0)
			);
			return message.reply(
				`🏆 | Ranking information:\n` +
				`Name: ${userName}\n` +
				`Score: ${pointsReceived}\n` +
				`Number of games: ${playNumber}\n` +
				`Number of wins: ${winNumber}\n` +
				Object.keys(winInfo).map(item => `  + ${item} digits: ${winInfo[item]}`).join("\n") +
				(Object.keys(winInfo).length ? "\n" : "") +
				`Number of losses: ${lossNumber}\n` +
				`Win rate: ${winRate}%\n` +
				`Total play time: ${playTime}`
			);
		}
		else if (args[0] == "reset") {
			if ((role || 0) < 2)
				return message.reply("⚠️ | You do not have permission to reset the ranking.");
			const all = await usersData.getAll();
			for (const u of all) {
				if (u.data && u.data.guessNumberRank) {
					const fresh = await usersData.get(u.id);
					if (fresh.data) delete fresh.data.guessNumberRank;
					await usersData.set(u.id, fresh);
				}
			}
			return message.reply("✅ | Reset the ranking successfully.");
		}

		const col = parseInt(args.join(" ").match(/(\d+)/)?.[1] || 4);
		const levelOfDifficult = rows.find(item => item.col == col);
		if (!levelOfDifficult)
			return message.reply("⚠️ | Please enter the number of digits of the number to guess is 4, 5 or 6");
		const mode = args.join(" ").match(/(single|multi|-s|-m)/)?.[1] || "single";
		const row = levelOfDifficult.row || 10;

		let playerName = "Player";
		try {
			playerName = await displayName(api, usersData, event.senderID);
		}
		catch (e) { /* keep default name */ }

		const gameData = {
			col,
			row,
			timeStart: Date.now(),
			numbers: [],
			history: [],
			answer: randomAnswer(col),
			playerName,
			mode: (mode === "-m" || mode === "multi") ? "multi" : "single"
		};

		const msgID = await replyWithId(message,
			`✅ | Create game successfully.\n\n${boardText(gameData)}`
		);
		if (!msgID) {
			return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Couldn't start the game — please try again.\n╚══════════════════╝");
		}

		const entry = {
			name: "guessnumber",
			messageID: msgID,
			gameData
		};
		// Single mode: only the starter may guess. Multi mode: anyone
		// may guess, so no author is recorded (the handler only lets
		// the recorded author trigger onReply).
		if (gameData.mode === "single")
			entry.author = event.senderID;
		registerReply(msgID, entry);
	},

	onReply: async ({ message, Reply, event, usersData }) => {
		usersData = resolveUsersData(usersData);
		if (!Reply || !Reply.gameData) return;
		const oldGameData = Reply.gameData;
		if (event.senderID != Reply.author && oldGameData.mode == "single")
			return;

		const numbers = (event.body || "").split("").map(item => item.trim()).filter(item => item != "" && !isNaN(item));
		if (numbers.length != oldGameData.col)
			return message.reply(`⚠️ | Please enter ${oldGameData.col} numbers you want to guess`);

		const answer = oldGameData.answer;
		let numberRight = 0;
		let numberRightPosition = 0;
		answer.split("").forEach((item, index) => {
			if (numbers.includes(item))
				numberRight++;
			if (item == numbers[index])
				numberRightPosition++;
		});

		oldGameData.history = oldGameData.history || [];
		oldGameData.history.push({ guess: numbers.join(""), right: numberRight, rightPosition: numberRightPosition });
		const guessesUsed = oldGameData.history.length;

		const isWin = numberRight == answer.length && numberRightPosition == answer.length;
		const outOfTries = guessesUsed >= oldGameData.row;

		if (!isWin && !outOfTries) {
			// Game continues — new board message becomes the reply target.
			dropReply(Reply.messageID);
			try { await message.unsend(Reply.messageID); } catch {}
			const info2 = await replyWithId(message, boardText(oldGameData));
			if (info2) {
				const entry = { name: "guessnumber", messageID: info2, gameData: oldGameData };
				if (oldGameData.mode === "single")
					entry.author = Reply.author || event.senderID;
				registerReply(info2, entry);
			}
			return;
		}

		// Game over — win or loss.
		const rewardPoint = rows.find(item => item.col == oldGameData.col)?.rewardPoint || 0;
		const messageText = isWin
			? `🎉 | Congratulations you guessed the number ${answer} after ${guessesUsed} guesses and received ${rewardPoint} bonus points.`
			: `🤦‍♂️ | You lost, the correct number is ${answer}.`;
		dropReply(Reply.messageID);
		try { await message.unsend(Reply.messageID); } catch {}
		const historyText = formatGuessHistory(oldGameData.history);
		await message.reply(messageText + (historyText ? `\n\n${historyText}` : ""));

		// Record the result in the player's rank doc.
		const user = await usersData.get(event.senderID) || {};
		const rankDoc = getRankDoc(user);
		const data = {
			timeSuccess: Date.now() - oldGameData.timeStart,
			date: new Date().toISOString(),
			col: oldGameData.col
		};
		if (isWin) {
			data.tryNumber = guessesUsed;
			rankDoc.wins.push(data);
			rankDoc.points = (rankDoc.points || 0) + rewardPoint;
		} else {
			rankDoc.losses.push(data);
		}
		await usersData.set(event.senderID, user);
	}
};
