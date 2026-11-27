// .flagquiz — Flag guessing quiz (WhatsApp port).
// Rewards / rules are UNCHANGED from the Messenger original:
//   correct answer: +300 coins, +100 EXP; 3 chances per flag;
//   90 seconds per flag; streak + total wins tracked.
//   Flag images come from flagcdn (https://flagcdn.com/w320/<iso2>.png)
//   with the local country list in ../data/flagCountries.json.
//
// WhatsApp port notes (vs the Messenger original):
// - The bold-font headers used the local ncsfont.json map on Messenger;
//   this port uses plain titles (no font file is shipped on WA).
// - The NoobCore /api/flag fallback is SKIPPED (no free replacement
//   needed — flagcdn is the primary source; if it fails the command
//   errors instead of calling NoobCore).
// - http.get / isImageResponse helpers do not exist here — axios
//   fetches the flag as an arraybuffer and the content-type is checked
//   for image/* before sending.
// - api.unsendMessage does not exist here — message.unsend(id) is used.
// - The WA handler passes no usersData to onReply, so onReply resolves
//   it from global.wabot.db or core/database/db.js (same store the
//   handler itself falls back to).

const axios = require("axios");
const { box, fm, streakText, medal } = require("./_gameUI.js");
const { usersData: dbUsersData } = require("../../../core/database/db.js");

const REWARD_COIN = 300;
const REWARD_EXP = 100;
const MAX_CHANCES = 3;
const TIME_LIMIT = 90000;

// Local country list (name + ISO 3166-1 alpha-2 code) for the flag game.
const COUNTRIES = require("../data/flagCountries.json");

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

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pick a random answer country + 3 random distractors, shuffled into A–D.
function pickFlagRound() {
  const answer = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  const distractors = new Set();
  while (distractors.size < 3) {
    const c = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
    if (c.name !== answer.name) distractors.add(c.name);
  }
  const names = shuffle([answer.name, ...distractors]);
  const letters = ["A", "B", "C", "D"];
  const options = {};
  let correctLetter = "A";
  names.forEach((name, i) => {
    options[letters[i]] = name;
    if (name === answer.name) correctLetter = letters[i];
  });
  return { country: answer, options, correctLetter };
}

// Country -> continent, for the hint after 2 wrong tries.
const CONTINENT_MAP = (() => {
  const groups = {
    "Africa": ["Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon", "Cape Verde", "Central African Republic", "Chad", "Comoros", "Congo", "Democratic Republic of the Congo", "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Ivory Coast", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda", "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone", "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe"],
    "Asia": ["Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh", "Bhutan", "Brunei", "Cambodia", "China", "Cyprus", "Georgia", "India", "Indonesia", "Iran", "Iraq", "Israel", "Japan", "Jordan", "Kazakhstan", "Kuwait", "Kyrgyzstan", "Laos", "Lebanon", "Malaysia", "Maldives", "Mongolia", "Myanmar", "Nepal", "North Korea", "Oman", "Pakistan", "Palestine", "Philippines", "Qatar", "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Syria", "Taiwan", "Tajikistan", "Thailand", "Timor-Leste", "Turkey", "Turkmenistan", "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen"],
    "Europe": ["Albania", "Andorra", "Austria", "Belarus", "Belgium", "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Czech Republic", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy", "Kosovo", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova", "Monaco", "Montenegro", "Netherlands", "North Macedonia", "Norway", "Poland", "Portugal", "Romania", "Russia", "San Marino", "Serbia", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Ukraine", "United Kingdom", "Vatican City"],
    "North America": ["Antigua and Barbuda", "Bahamas", "Barbados", "Belize", "Canada", "Costa Rica", "Cuba", "Dominica", "Dominican Republic", "El Salvador", "Grenada", "Guatemala", "Haiti", "Honduras", "Jamaica", "Mexico", "Nicaragua", "Panama", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Trinidad and Tobago", "United States", "United States of America"],
    "South America": ["Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Peru", "Suriname", "Uruguay", "Venezuela"],
    "Oceania": ["Australia", "Fiji", "Kiribati", "Marshall Islands", "Micronesia", "Nauru", "New Zealand", "Palau", "Papua New Guinea", "Samoa", "Solomon Islands", "Tonga", "Tuvalu", "Vanuatu"]
  };
  const map = {};
  for (const [continent, list] of Object.entries(groups))
    for (const name of list)
      map[name.toLowerCase()] = continent;
  map["usa"] = "North America";
  map["us"] = "North America";
  map["uk"] = "Europe";
  map["england"] = "Europe";
  map["uae"] = "Asia";
  map["korea"] = "Asia";
  map["america"] = "North America";
  return map;
})();

function continentOf(country) {
  if (!country)
    return null;
  return CONTINENT_MAP[String(country).trim().toLowerCase()] || null;
}

async function getStats(usersData, userID) {
  try {
    const userData = await usersData.get(userID) || {};
    const data = userData.data || {};
    return { streak: data.flagStreak || 0, wins: data.flagWins || 0 };
  } catch {
    return { streak: 0, wins: 0 };
  }
}

async function setStreak(usersData, userID, streak) {
  try {
    const userData = await usersData.get(userID) || {};
    userData.data = userData.data || {};
    userData.data.flagStreak = streak;
    await usersData.set(userID, userData);
  } catch {}
}

async function displayName(api, usersData, id) {
  try {
    if (api && typeof api.getUserInfo === "function") {
      const info = await api.getUserInfo(id);
      if (info && info.name) return info.name;
    }
  } catch {}
  return String(id);
}

async function startFlag(message, event, usersData) {
  const round = pickFlagRound();
  const flagUrl = `https://flagcdn.com/w320/${round.country.code.toLowerCase()}.png`;
  const res = await axios.get(flagUrl, { responseType: "arraybuffer", timeout: 15000 });
  const contentType = (res.headers && res.headers["content-type"]) || "";
  if (!contentType.startsWith("image/"))
    throw new Error("flagcdn did not return an image");
  const imageBuffer = Buffer.from(res.data);

  const { streak } = await getStats(usersData, event.senderID);
  const streakLine = streakText(streak);

  const body = box("🚩 FLAG QUIZ", [
    `📸 Guess the country of this flag!`,
    `🅐 ${round.options.A}`,
    `🅑 ${round.options.B}`,
    `🅒 ${round.options.C}`,
    `🅓 ${round.options.D}`,
    ``,
    `⏳ You have 1 minute 30 seconds!`,
    `💡 You have 3 chances! Reply with A, B, C or D — or SKIP for a new flag.`
  ], streakLine ? [streakLine] : undefined);

  const msgID = await replyWithId(message, {
    body,
    attachment: { buffer: imageBuffer, mimetype: contentType.split(";")[0] || "image/png", fileName: `flag-${round.country.code.toLowerCase()}.png` }
  });
  if (!msgID)
    throw new Error("could not send flag question");

  registerReply(msgID, {
    name: "flagquiz",
    messageID: msgID,
    author: event.senderID,
    correctAnswer: round.correctLetter,
    chances: MAX_CHANCES,
    answered: false,
    options: round.options
  });

  setTimeout(async () => {
    const quizData = global.wabot && global.wabot.replyMap
      ? global.wabot.replyMap.get(msgID)
      : null;
    if (!quizData || quizData.answered)
      return;
    dropReply(msgID);
    try { await message.unsend(msgID); } catch {}
    await setStreak(usersData, event.senderID, 0);
    try {
      await message.reply(box("⏰ TIME'S UP", [
        `⏰ Time's up!`,
        `✅ The correct answer was: ${quizData.correctAnswer} — ${quizData.options[quizData.correctAnswer]}`
      ]));
    } catch {}
  }, TIME_LIMIT);
}

async function showLeaderboard(message, event, usersData) {
  try {
    const all = await usersData.getAll();
    const rows = all
      .map(u => ({ uid: u.id, name: u.name || null, wins: (u.data && u.data.flagWins) || 0 }))
      .filter(r => r.wins > 0)
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 5);

    if (!rows.length)
      return message.reply(box("🏆 FLAG LEADERBOARD", [
        `No wins yet — be the first to win!`
      ]));

    const lines = [];
    for (let i = 0; i < rows.length; i++) {
      let name = rows[i].name;
      if (!name)
        name = await displayName(null, usersData, rows[i].uid);
      lines.push(`${medal(i)} ${name} — ${rows[i].wins} win${rows[i].wins > 1 ? "s" : ""}`);
    }
    const { wins: myWins } = await getStats(usersData, event.senderID);
    return message.reply(box("🏆 FLAG LEADERBOARD", lines, [
      `👤 Your wins: ${myWins}`
    ]));
  } catch (err) {
    console.error(err);
    return message.reply(box("🏆 FLAG LEADERBOARD", [
      `Couldn't load the leaderboard right now.`
    ]));
  }
}

module.exports = {
  config: {
    name: "flagquiz",
    aliases: ["flag", "fqz", "flagguess"],
    version: "1.0",
    countDown: 10,
    role: 0,
    description: "Flag guessing quiz",
    category: "game",
    guide: "{pn} — Flag guessing quiz\n{pn} lb — Show the flag wins leaderboard"
  },

  onStart: async function ({ event, args, usersData, message }) {
    usersData = resolveUsersData(usersData);
    const sub = (args[0] || "").toLowerCase();
    if (sub === "lb" || sub === "leaderboard")
      return showLeaderboard(message, event, usersData);

    try {
      await startFlag(message, event, usersData);
    } catch (err) {
      console.error(err);
      message.reply(box("❌ ERROR", [
        `❌ Failed to fetch flag data.`
      ]));
    }
  },

  onReply: async function ({ event, Reply, usersData, message }) {
    usersData = resolveUsersData(usersData);
    if (!Reply) return;
    let { author, correctAnswer, messageID, chances, options } = Reply;
    const raw = (event.body || "").trim();
    const reply = raw ? raw.toUpperCase() : "";

    if (event.senderID !== author)
      return message.reply(box("ℹ️ INFO", [
        `⚠️ This is not your quiz!`
      ]));

    if (reply === "SKIP") {
      dropReply(messageID);
      try { await message.unsend(messageID); } catch {}
      try {
        await startFlag(message, event, usersData);
      } catch (err) {
        console.error(err);
        return message.reply(box("ℹ️ INFO", [
          `❌ Couldn't fetch a new flag! Try again.`
        ]));
      }
      return;
    }

    if (!reply || !["A", "B", "C", "D"].includes(reply))
      return message.reply(box("ℹ️ INFO", [
        `❌ Please reply with A, B, C or D.`
      ]));

    if (reply === correctAnswer) {
      Reply.answered = true;
      try { await message.unsend(messageID); } catch {}

      const userData = await usersData.get(event.senderID) || {};
      userData.money = (userData.money || 0) + REWARD_COIN;
      userData.exp = (userData.exp || 0) + REWARD_EXP;
      userData.data = userData.data || {};
      const streak = (userData.data.flagStreak || 0) + 1;
      const wins = (userData.data.flagWins || 0) + 1;
      userData.data.flagStreak = streak;
      userData.data.flagWins = wins;
      await usersData.set(event.senderID, userData);

      const country = options[correctAnswer];
      const streakLine = streakText(streak);
      const correctMsg = box("🏆 YOU WIN", [
        `🎉 Congratulations!`,
        `✅ Correct: ${correctAnswer} — ${country}`,
        `💰 You earned ${fm(REWARD_COIN)} Coins`,
        `🌟 You gained ${fm(REWARD_EXP)} EXP`,
        `🏆 Total wins: ${wins}`,
        `💰 Balance: ${fm(userData.money)}`,
        `🚩 You recognized the right flag, you are the true champion!`
      ], streakLine ? [streakLine] : undefined);

      dropReply(messageID);
      return message.reply(correctMsg);
    } else {
      chances--;

      if (chances > 0) {
        Reply.chances = chances;
        const lines = [
          `❌ Wrong answer!`,
          `⏳ You still have ${chances} chance${chances > 1 ? "s" : ""} left. Try again!`
        ];
        // Continent hint after 2 wrong tries (1 chance left)
        if (chances === 1) {
          const country = options[correctAnswer];
          const continent = continentOf(country);
          if (continent)
            lines.push(`🌍 Hint: This country is in ${continent}!`);
          else if (country)
            lines.push(`💡 Hint: The country starts with "${String(country).trim()[0]}"!`);
        }
        return message.reply(box("❌ WRONG ANSWER", lines));
      } else {
        Reply.answered = true;
        try { await message.unsend(messageID); } catch {}
        dropReply(messageID);
        await setStreak(usersData, event.senderID, 0);
        const country = options[correctAnswer];
        return message.reply(box("💀 OUT OF CHANCES", [
          `🥺 Out of chances!`,
          `✅ The correct answer was: ${correctAnswer} — ${country}`
        ]));
      }
    }
  }
};
