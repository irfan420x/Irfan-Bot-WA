// .irfan — Irfan AI, smart memory bot (WhatsApp port).
// ORION Gemini (model "flash") via scripts/cmds/_orionApi.js.
// Short-reply personality (max 1-2 lines) + shortenReply() safety net.
// Per-user memory (name / age / favourites + last 10 turns) in
// data/irfan/userinfo/<senderID>.json. Replying to the bot's message
// continues the same conversation (replyMap, registered from the
// message.reply callback's info.messageID).
//
// WhatsApp port notes (vs the Messenger original):
// - api.setMessageReaction -> message.react("⏳").
// - api.getUserInfo returns { name } (not a map) in this bot's api shim.
// - global.irfbot.orionReply -> global.wabot.replyMap.
// - onReply is the contract name for reply handlers (was orionReply).

const fs = require("fs");
const path = require("path");
const { orionGemini } = require("../_orionApi.js");

const API_TIMEOUT_MS = 180000; // Gemini can take a while (doc: 2.5-191s)

// ========== Memory System ==========

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data", "irfan", "userinfo");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getUserFile(senderID) {
  return path.join(DATA_DIR, `${senderID}.json`);
}

function loadUser(senderID) {
  ensureDir();
  const f = getUserFile(senderID);

  if (!fs.existsSync(f)) {
    return { permanent: { name: null, age: null, favorites: [] }, history: [] };
  }

  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    return { permanent: { name: null, age: null, favorites: [] }, history: [] };
  }
}

function saveUser(senderID, data) {
  ensureDir();
  fs.writeFileSync(getUserFile(senderID), JSON.stringify(data, null, 2), "utf8");
}

function addHistory(senderID, userMsg, botReply) {
  const data = loadUser(senderID);

  data.history.push({ role: "user", content: userMsg });
  data.history.push({ role: "assistant", content: botReply });

  if (data.history.length > 20) {
    data.history = data.history.slice(data.history.length - 20);
  }

  saveUser(senderID, data);
}

function extractPermanent(senderID, msg) {
  const data = loadUser(senderID);

  // Only explicit name statements ("আমার নাম X" / "my name is X" / "call me X").
  // The old pattern also matched "I'm ..." and saved adjectives as names ("I'm happy" -> name "happy").
  const nameM = msg.match(/(?:আমার নাম|my name is|call me)\s+([a-zA-Z\u0980-\u09FF]{2,20})/i);
  if (nameM) data.permanent.name = nameM[1];

  const ageM = msg.match(/(?:আমার বয়স|i(?:'m| am))\s+(\d{1,3})\s*(?:বছর|years?|yr)?/i);
  if (ageM) data.permanent.age = parseInt(ageM[1]);

  const favM = msg.match(/(?:আমি|i)\s+(?:পছন্দ করি|like|love|ভালোবাসি|enjoy)\s+(.+?)(?:[।.!?]|$)/i);

  if (favM) {
    const fav = favM[1].trim();

    if (fav && !data.permanent.favorites.includes(fav)) {
      data.permanent.favorites.push(fav);

      if (data.permanent.favorites.length > 10) {
        data.permanent.favorites.shift();
      }
    }
  }

  saveUser(senderID, data);
}

// ========== Messages Builder ==========

function buildMessages(gender, name, permanent, history, userMessage) {

  const facts = [];

  if (name) facts.push("নাম: " + name);
  if (permanent.age) facts.push("বয়স: " + permanent.age + " বছর");

  if (permanent.favorites && permanent.favorites.length) {
    facts.push("পছন্দ: " + permanent.favorites.join(", "));
  }

  const memoryBlock = facts.length
    ? "[ইউজার সম্পর্কে তুমি জানো: " + facts.join(" | ") + "] এই তথ্য naturally use করো।\n\n"
    : "";

  let persona = "";

  // HARD RULE for every persona: SHORT replies only — max 1-2 lines.
  // No long paragraphs, no lectures. Funny, witty, natural.
  const shortRule = "উত্তর সবসময় SHORT রাখো — সর্বোচ্চ ১-২ লাইন। লম্বা প্যারাগ্রাফ কখনো লিখো না। মজার witty ভাবে বলো।";

  if (gender === "Female") {
    persona = "তুমি Irfan — charming মজার ছেলে। মেয়েদের সাথে হালকা flirt করো: sweet, playful, respectful, মাঝে মাঝে একটা emoji। " + shortRule;
  }

  else if (gender === "Male") {
    persona = "তুমি Irfan — chill best friend। বাংলিশ mix, ভাই/ব্রো/মামা tone, মজার। " + shortRule;
  }

  else {
    persona = "তুমি Irfan, friendly মজার AI। " + shortRule;
  }

  const messages = [{ role: "system", content: persona + "\n\n" + memoryBlock }];

  const recent = (history || []).slice(-10);
  for (let i = 0; i < recent.length; i++) {
    messages.push({ role: recent[i].role, content: recent[i].content });
  }

  messages.push({ role: "user", content: userMessage });

  return messages;
}

// ========== Helpers ==========

function genConvert(gender) {
  if (gender === 2 || gender === "MALE") return "Male";
  if (gender === 1 || gender === "FEMALE") return "Female";
  if (gender === "Male" || gender === "Female") return gender;
  return "Unknown";
}

// Safety net: keep replies short even if the model rambles.
// Cuts at the last sentence end (। . ! ? or newline) within MAX chars,
// otherwise at the last space before MAX. Never cuts mid-word.
const REPLY_MAX = 280;

function shortenReply(reply) {
  const text = String(reply || "").trim();
  if (text.length <= REPLY_MAX) return text;

  const head = text.slice(0, REPLY_MAX);
  const ends = ["।", ".", "!", "?", "\n"];
  let cut = -1;
  for (const e of ends) {
    const i = head.lastIndexOf(e);
    if (i > cut) cut = i;
  }
  if (cut > 40) return head.slice(0, cut + 1).trim();

  const sp = head.lastIndexOf(" ");
  if (sp > 40) return head.slice(0, sp).trim() + "…";

  return head.trim() + "…";
}

// ========== AI Call ==========

async function askAI(senderID, userMessage, gender, displayName, permanent) {
  const userData = loadUser(senderID);

  const messages = buildMessages(
    gender,
    displayName,
    permanent,
    userData.history,
    userMessage
  );

  return orionGemini(messages, { timeout: API_TIMEOUT_MS });
}

// ========== Core Handler ==========

async function handleMessage(message, event, usersData, api, question) {

  if (!question || !question.trim()) {
    return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ কিছু জিজ্ঞেস করো আমাকে 😊\n╚══════════════════╝");
  }

  // Let the user know we are thinking (Gemini can take a while).
  try { if (message.react) await message.react("⏳"); } catch (e) {}

  // Wait message, edited in place with the answer when it arrives
  // (one message, not wait + result). The edited message keeps its ID,
  // so the reply-chain registration below uses the wait message's ID.
  let waitId = null;
  try {
    const wait = await message.reply("⏳ ভাবছি… একটু অপেক্ষা করো।");
    waitId = wait && wait.messageID;
  } catch (e) { /* wait message is best-effort */ }

  const registerReply = (id) => {
    if (!id) return;
    if (global.wabot && global.wabot.replyMap) {
      global.wabot.replyMap.set(id, {
        name: "irfan",
        commandName: "irfan",
        author: event.senderID
      });
    }
  };

  const deliver = async (text) => {
    if (waitId && typeof message.edit === "function") {
      try {
        await message.edit(waitId, text);
        registerReply(waitId);
        return;
      } catch (_) { /* fall through to a fresh reply */ }
    }
    if (waitId && message.unsend) {
      try { await message.unsend(waitId); } catch (e) {}
    }
    message.reply(text, (err, info) => {
      if (err || !info || !info.messageID) return;
      registerReply(info.messageID);
    });
  };

  try {

    const user = await usersData.get(event.senderID).catch(() => null);
    const fb = await api.getUserInfo(event.senderID).catch(() => null);

    // WhatsApp api shim: getUserInfo(userID) -> { name } (single object).
    const fbName = (fb && fb.name) || "Friend";

    const gender = genConvert(user && user.gender);

    const userData = loadUser(event.senderID);

    if (!userData.permanent.name && fbName !== "Friend") {
      userData.permanent.name = fbName;
      saveUser(event.senderID, userData);
    }

    extractPermanent(event.senderID, question);

    const fresh = loadUser(event.senderID);

    const displayName = fresh.permanent.name || fbName;

    const reply = shortenReply(await askAI(
      event.senderID,
      question,
      gender,
      displayName,
      fresh.permanent
    ));

    addHistory(event.senderID, question, reply);

    await deliver(reply);

  } catch (e) {

    console.error("[Irfan Error]", e.message);

    await deliver("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ AI এখন ঘুমাচ্ছে 😴 একটু পরে try করো।\n╚══════════════════╝");

  }

}

// ========== Exports ==========

async function onStart(ctx) {
  const question = ctx.args.join(" ");
  await handleMessage(ctx.message, ctx.event, ctx.usersData, ctx.api, question);
}

async function onReply(ctx) {
  if (ctx.event.senderID !== ctx.Reply.author) return;
  await handleMessage(ctx.message, ctx.event, ctx.usersData, ctx.api, ctx.event.body);
}

module.exports = {
  config: {
    name: "irfan",
    aliases: [],
    version: "3.3",
    role: 0,
    countDown: 5,
    description: "Irfan AI - Smart Memory Bot",
    category: "ai",
    guide: "{pn} <question> — ask Irfan AI anything; reply to its message to keep chatting"
  },
  onStart,
  onReply
};
