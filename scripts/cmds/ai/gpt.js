// .gpt — GPT chat via ORION Gemini (WhatsApp port of Messenger ai/gpt5.js).
// ORION is the ONLY source on WhatsApp — no Aryan / sandipbaruwal fallback.
// askGPT strips "*" exactly as the Messenger original did.
// Replying to the bot's answer continues the conversation (replyMap,
// registered from the message.reply callback's info.messageID).
//
// WhatsApp port notes (vs the Messenger original):
// - api.setMessageReaction -> message.react("⏳" / "✅" / "❌").
// - global.irfbot.orionReply -> global.wabot.replyMap.
// - onReply is the contract name for reply handlers (was orionReply).
// - replyMap entries carry both `name` and `commandName`: the WA handler
//   (core/handler/handlerMessage.js) routes reply chains on entry.name.

const { orionGemini } = require("../_orionApi.js");

async function askGPT(Q) {
  const reply = await orionGemini([{ role: "user", content: Q }], { timeout: 180000 });
  return reply.replace(/\*/g, "");
}

async function handleMessage(message, event, question) {
  if (!question || !question.trim()) {
    return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ Please ask a question 🍌\n╚══════════════════╝");
  }

  try { if (message.react) await message.react("⏳"); } catch (e) {}

  try {
    const Ans = await askGPT(question);

    if (!Ans) throw new Error("No response");

    message.reply(Ans, (err, info) => {
      try { if (message.react) message.react("✅").catch(() => {}); } catch (e) {}
      if (err || !info || !info.messageID) return;
      if (global.wabot && global.wabot.replyMap) {
        global.wabot.replyMap.set(info.messageID, {
          name: "gpt",
          commandName: "gpt",
          author: event.senderID
        });
      }
    });
  } catch (e) {
    console.error("[gpt] error:", (e && e.message) || e);
    try { if (message.react) await message.react("❌"); } catch (_) {}
    message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ API error 😈\n╚══════════════════╝");
  }
}

async function onStart(ctx) {
  await handleMessage(ctx.message, ctx.event, ctx.args.join(" "));
}

async function onReply(ctx) {
  if (ctx.event.senderID !== ctx.Reply.author) return;
  await handleMessage(ctx.message, ctx.event, ctx.event.body);
}

module.exports = {
  config: {
    name: "gpt",
    aliases: ["chatgpt", "gpt5"],
    version: "0.0.1",
    role: 0,
    countDown: 5,
    description: "Ask GPT anything",
    category: "ai",
    guide: "{pn} <question> — ask GPT anything; reply to its message to keep chatting"
  },
  onStart,
  onReply
};
