// .quiz — Quiz questions, earn rewards (WhatsApp port).
// Rewards / rules are UNCHANGED from the Messenger original:
//   correct answer: +300 coins, +100 EXP; 3 chances per question;
//   60 seconds per question. Questions come from Open Trivia DB
//   (keyless), HTML entities decoded, correct + 3 incorrect shuffled
//   into A–D options.
//
// WhatsApp port notes (vs the Messenger original):
// - The NoobCore /api/quiz fallback is SKIPPED (no free replacement
//   needed — OpenTDB is the primary source; if it fails the command
//   errors instead of calling NoobCore).
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
const TIME_LIMIT = 60000;

// Named HTML entities seen in Open Trivia DB strings (&quot; &#039; &eacute; …).
// Numeric entities (&#039; / &#x27;) are decoded by regex below; &amp; is
// decoded last so a double-encoded "&amp;#039;" does not get decoded twice.
const NAMED_ENTITIES = {
  "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " ",
  "&eacute;": "é", "&egrave;": "è", "&ecirc;": "ê", "&euml;": "ë",
  "&Eacute;": "É", "&Egrave;": "È", "&Ecirc;": "Ê", "&Euml;": "Ë",
  "&aacute;": "á", "&agrave;": "à", "&acirc;": "â", "&auml;": "ä", "&aring;": "å", "&aelig;": "æ",
  "&Aacute;": "Á", "&Agrave;": "À", "&Acirc;": "Â", "&Auml;": "Ä", "&Aring;": "Å", "&AElig;": "Æ",
  "&iacute;": "í", "&igrave;": "ì", "&icirc;": "î", "&iuml;": "ï",
  "&Iacute;": "Í", "&Igrave;": "Ì", "&Icirc;": "Î", "&Iuml;": "Ï",
  "&oacute;": "ó", "&ograve;": "ò", "&ocirc;": "ô", "&ouml;": "ö", "&oslash;": "ø",
  "&Oacute;": "Ó", "&Ograve;": "Ò", "&Ocirc;": "Ô", "&Ouml;": "Ö", "&Oslash;": "Ø",
  "&uacute;": "ú", "&ugrave;": "ù", "&ucirc;": "û", "&uuml;": "ü",
  "&Uacute;": "Ú", "&Ugrave;": "Ù", "&Ucirc;": "Û", "&Uuml;": "Ü",
  "&yacute;": "ý", "&yuml;": "ÿ", "&Yacute;": "Ý",
  "&ccedil;": "ç", "&Ccedil;": "Ç", "&ntilde;": "ñ", "&Ntilde;": "Ñ",
  "&szlig;": "ß", "&hellip;": "…", "&mdash;": "—", "&ndash;": "–",
  "&lsquo;": "‘", "&rsquo;": "’", "&ldquo;": "“", "&rdquo;": "”",
  "&copy;": "©", "&reg;": "®", "&trade;": "™", "&deg;": "°",
  "&plusmn;": "±", "&times;": "×", "&divide;": "÷",
  "&pound;": "£", "&euro;": "€", "&yen;": "¥", "&cent;": "¢",
  "&iexcl;": "¡", "&iquest;": "¿", "&sup2;": "²", "&sup3;": "³",
  "&frac12;": "½", "&frac14;": "¼", "&frac34;": "¾",
  "&alpha;": "α", "&beta;": "β", "&gamma;": "γ", "&delta;": "δ",
  "&pi;": "π", "&omega;": "ω", "&Omega;": "Ω",
  "&oelig;": "œ", "&Oelig;": "Œ", "&scaron;": "š", "&Scaron;": "Š",
  "&zcaron;": "ž", "&Zcaron;": "Ž", "&ccaron;": "č", "&Ccaron;": "Č",
  "&middot;": "·", "&bull;": "•", "&prime;": "′", "&Prime;": "″",
  "&larr;": "←", "&uarr;": "↑", "&rarr;": "→", "&darr;": "↓", "&harr;": "↔"
};

function decodeHtmlEntities(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-zA-Z]+;/g, (e) => NAMED_ENTITIES[e] || e)
    .replace(/&amp;/g, "&");
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

async function fetchQuestion() {
  // Public API: Open Trivia DB (keyless) returns
  // { response_code, results: [{ question, correct_answer, incorrect_answers }] }
  // with HTML entities in the strings — decoded, then shuffled into A–D.
  const { data } = await axios.get("https://opentdb.com/api.php?amount=1&type=multiple", { timeout: 15000 });
  const item = data && data.response_code === 0 && data.results && data.results[0];
  if (!item || !item.question || !item.correct_answer ||
      !Array.isArray(item.incorrect_answers) || item.incorrect_answers.length !== 3)
    throw new Error("OpenTDB returned an invalid question");

  const correct = decodeHtmlEntities(item.correct_answer);
  const all = shuffle([correct, ...item.incorrect_answers.map(decodeHtmlEntities)]);
  const letters = ["a", "b", "c", "d"];
  const options = {};
  all.forEach((text, i) => { options[letters[i]] = text; });
  return { question: decodeHtmlEntities(item.question), options, answer: correct };
}

async function getStats(usersData, userID) {
  try {
    const userData = await usersData.get(userID) || {};
    const data = userData.data || {};
    return { streak: data.quizStreak || 0, wins: data.quizWins || 0 };
  } catch {
    return { streak: 0, wins: 0 };
  }
}

async function setStreak(usersData, userID, streak) {
  try {
    const userData = await usersData.get(userID) || {};
    userData.data = userData.data || {};
    userData.data.quizStreak = streak;
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

async function askQuestion(message, event, usersData) {
  const { question, options, answer } = await fetchQuestion();
  const { streak } = await getStats(usersData, event.senderID);
  const streakLine = streakText(streak);

  const body = [
    `📜 প্রশ্ন: ${question}`,
    ``,
    `🅐 ${options.a}`,
    `🅑 ${options.b}`,
    `🅒 ${options.c}`,
    `🅓 ${options.d}`,
    ``,
    `💡 ৩ বার চেষ্টা করতে পারবে!`,
    `(Reply দাও A, B, C বা D — অথবা SKIP লিখে নতুন প্রশ্ন নাও)`
  ];
  const footer = streakLine ? [streakLine] : undefined;

  const msgID = await replyWithId(message, box("❓ 𝐐𝐔𝐈𝐙", body, footer));
  if (!msgID)
    throw new Error("could not send quiz question");

  registerReply(msgID, {
    name: "quiz",
    messageID: msgID,
    author: event.senderID,
    correctAnswer: answer.trim(),
    chances: MAX_CHANCES,
    answered: false,
    options
  });

  // 60s timeout: reveal the answer and free the reply registration
  setTimeout(async () => {
    const game = global.wabot && global.wabot.replyMap
      ? global.wabot.replyMap.get(msgID)
      : null;
    if (!game || game.answered)
      return;
    dropReply(msgID);
    try { await message.unsend(msgID); } catch {}
    await setStreak(usersData, event.senderID, 0);
    try {
      await message.reply(box("⏰ TIME'S UP", [
        `😢 সময় শেষ!`,
        `✅ সঠিক উত্তর ছিল: ${game.correctAnswer}`
      ]));
    } catch {}
  }, TIME_LIMIT);
}

async function showLeaderboard(message, event, usersData) {
  try {
    const all = await usersData.getAll();
    const rows = all
      .map(u => ({ uid: u.id, name: u.name || null, wins: (u.data && u.data.quizWins) || 0 }))
      .filter(r => r.wins > 0)
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 5);

    if (!rows.length)
      return message.reply(box("🏆 QUIZ LEADERBOARD", [
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
    return message.reply(box("🏆 QUIZ LEADERBOARD", lines, [
      `👤 Your wins: ${myWins}`
    ]));
  } catch (err) {
    console.error(err);
    return message.reply(box("🏆 QUIZ LEADERBOARD", [
      `Couldn't load the leaderboard right now.`
    ]));
  }
}

module.exports = {
  config: {
    name: "quiz",
    aliases: ["qz"],
    version: "1.0",
    countDown: 10,
    role: 0,
    description: "Answer quiz questions and earn rewards!",
    category: "game",
    guide: "{pn} — Answer quiz questions and earn rewards!\n{pn} lb — Show the quiz wins leaderboard"
  },

  onStart: async function ({ event, args, usersData, message }) {
    usersData = resolveUsersData(usersData);
    const sub = (args[0] || "").toLowerCase();
    if (sub === "lb" || sub === "leaderboard")
      return showLeaderboard(message, event, usersData);

    try {
      await askQuestion(message, event, usersData);
    } catch (err) {
      console.error(err);
      message.reply(box("ℹ️ INFO", [
        `❌ কুইজ ডাটা আনতে সমস্যা হয়েছে!`
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
        `⚠️ এটা তোমার কুইজ না!`
      ]));

    if (reply === "SKIP") {
      dropReply(messageID);
      try { await message.unsend(messageID); } catch {}
      try {
        await askQuestion(message, event, usersData);
      } catch (err) {
        console.error(err);
        return message.reply(box("ℹ️ INFO", [
          `❌ নতুন প্রশ্ন আনতে সমস্যা হয়েছে! আবার চেষ্টা করো।`
        ]));
      }
      return;
    }

    if (!reply || !["A", "B", "C", "D"].includes(reply))
      return message.reply(box("ℹ️ INFO", [
        `❌ Reply দাও শুধু A, B, C বা D দিয়ে!`
      ]));

    const selectedText =
      reply === "A" ? options.a :
      reply === "B" ? options.b :
      reply === "C" ? options.c :
      reply === "D" ? options.d : "";

    if (selectedText.trim() === correctAnswer.trim()) {
      Reply.answered = true;
      try { await message.unsend(messageID); } catch {}

      const userData = await usersData.get(event.senderID) || {};
      userData.money = (userData.money || 0) + REWARD_COIN;
      userData.exp = (userData.exp || 0) + REWARD_EXP;
      userData.data = userData.data || {};
      const streak = (userData.data.quizStreak || 0) + 1;
      const wins = (userData.data.quizWins || 0) + 1;
      userData.data.quizStreak = streak;
      userData.data.quizWins = wins;
      await usersData.set(event.senderID, userData);

      const streakLine = streakText(streak);
      const winMsg = box("🏆 YOU WIN", [
        `✅ সঠিক উত্তর: ${correctAnswer}`,
        `💰 পুরস্কার: +${fm(REWARD_COIN)} Coin`,
        `🌟 অভিজ্ঞতা: +${fm(REWARD_EXP)} EXP`,
        `🏆 মোট জয়: ${wins}`,
        `💰 ব্যালেন্স: ${fm(userData.money)}`,
        `🏆 তুমি দুর্দান্ত করেছো!`
      ], streakLine ? [streakLine] : undefined);

      dropReply(messageID);
      return message.reply(winMsg);
    } else {
      chances--;

      if (chances > 0) {
        Reply.chances = chances;
        return message.reply(box("❌ WRONG ANSWER", [
          `❌ ভুল উত্তর!`,
          `🔁 তোমার হাতে আছে ${chances} বার সুযোগ! আবার চেষ্টা করো!`,
          `(SKIP লিখে নতুন প্রশ্ন নিতে পারো)`
        ]));
      } else {
        Reply.answered = true;
        try { await message.unsend(messageID); } catch {}
        dropReply(messageID);
        await setStreak(usersData, event.senderID, 0);
        return message.reply(box("💀 YOU LOSE", [
          `😢 সব সুযোগ শেষ!`,
          `✅ সঠিক উত্তর ছিল: ${correctAnswer}`
        ]));
      }
    }
  }
};
