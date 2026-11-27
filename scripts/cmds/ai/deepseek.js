// .deepseek — DeepSeek AI chat via ORION Gemini (WhatsApp port of Messenger ai/deepseek.js).
// The Messenger original called the public sandipbaruwal.com/deepseek
// endpoint directly; on WhatsApp it is routed through orionGemini (the same
// backend .gpt/.irfan use) and keeps its own name, guide and reply style.
//
// WhatsApp port notes (vs the Messenger original):
// - api.setMessageReaction -> message.react("⏳" / "✅" / "❌").
// - global.irfbot.orionReply -> global.wabot.replyMap.
// - onReply is the contract name for reply handlers (was orionReply).
// - replyMap entries carry both `name` and `commandName`: the WA handler
//   (core/handler/handlerMessage.js) routes reply chains on entry.name.

const { orionGemini } = require("../_orionApi.js");

const ERROR_TEXT = "╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ DeepSeek API এখন কাজ করছে না। পরে চেষ্টা করো। 😴\n╚══════════════════╝";

function registerReply(event, info) {
  if (!info || !info.messageID) return;
  if (global.wabot && global.wabot.replyMap) {
    global.wabot.replyMap.set(info.messageID, {
      name: "deepseek",
      commandName: "deepseek",
      author: event.senderID
    });
  }
}

async function handleMessage(message, event, prompt) {
  if (!prompt || !prompt.trim()) {
    return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ দয়া করে একটি প্রশ্ন করুন। 😊\n╚══════════════════╝");
  }

  try { if (message.react) await message.react("⏳"); } catch (e) {}

  try {
    const reply = await orionGemini([{ role: "user", content: prompt }], { timeout: 180000 });
    if (!reply) throw new Error("No response from DeepSeek API.");

    try { if (message.react) await message.react("✅"); } catch (e) {}

    message.reply(reply, (err, info) => {
      if (!err) registerReply(event, info);
    });
  } catch (e) {
    console.error("[deepseek] error:", (e && e.message) || e);
    try { if (message.react) await message.react("❌"); } catch (_) {}
    message.reply(ERROR_TEXT);
  }
}

async function onStart(ctx) {
  await handleMessage(ctx.message, ctx.event, ctx.args.join(" "));
}

async function onReply(ctx) {
  if (ctx.event.senderID !== ctx.Reply.author) return;
  const prompt = ctx.event.body;
  if (!prompt) return;
  await handleMessage(ctx.message, ctx.event, prompt);
}

module.exports = {
  config: {
    name: "deepseek",
    aliases: ["ds"],
    version: "1.0.0",
    countDown: 5,
    role: 0,
    description: "DeepSeek AI এর সাথে কথা বলো",
    category: "ai",
    guide: "{pn} [প্রশ্ন]"
  },
  onStart,
  onReply
};
