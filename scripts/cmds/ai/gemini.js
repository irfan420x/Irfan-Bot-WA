// .gemini — Gemini AI chat via ORION Gemini (WhatsApp port of Messenger ai/gemini.js).
// Text path only, routed through orionGemini (same backend .gpt/.irfan use).
// The Messenger original called a keyed Aryan API (/gemini text, /gemini-pro
// vision) via a GitHub-hosted config — that API is NOT used on WhatsApp.
//
// WhatsApp port notes (vs the Messenger original):
// - Vision (reply to an image / attach an image) is NOT available: ORION has
//   no vision endpoint, and the WhatsApp adapter exposes no URL for a
//   replied-to image (event.messageReply carries only senderID/body/
//   messageID). Sending an image with the command gets a clear notice;
//   a quoted image cannot be detected, so it is answered as text.
// - api.setMessageReaction -> message.react("⏳" / "✅" / "❌").
// - global.irfbot.orionReply -> global.wabot.replyMap.
// - onReply is the contract name for reply handlers (was orionReply).
// - replyMap entries carry both `name` and `commandName`: the WA handler
//   (core/handler/handlerMessage.js) routes reply chains on entry.name.

const { orionGemini } = require("../_orionApi.js");

function hasImageAttachment(event) {
  return Array.isArray(event.attachments) &&
    event.attachments.some((a) => a && (a.type === "image" || a.type === "photo"));
}

function registerReply(message, event, info) {
  if (!info || !info.messageID) return;
  if (global.wabot && global.wabot.replyMap) {
    global.wabot.replyMap.set(info.messageID, {
      name: "gemini",
      commandName: "gemini",
      author: event.senderID
    });
  }
}

async function handleMessage(message, event, question, errorText) {
  if (!question || !question.trim()) {
    return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Please provide a question or prompt.\n╚══════════════════╝");
  }

  if (hasImageAttachment(event)) {
    return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⚠️ Image questions aren't available on WhatsApp yet — send text only.\n╚══════════════════╝");
  }

  try { if (message.react) await message.react("⏳"); } catch (e) {}

  try {
    const reply = await orionGemini([{ role: "user", content: question }], { timeout: 180000 });
    if (!reply) throw new Error("No response from Gemini API.");

    try { if (message.react) await message.react("✅"); } catch (e) {}

    message.reply(reply, (err, info) => {
      if (!err) registerReply(message, event, info);
    });
  } catch (e) {
    console.error("[gemini] error:", (e && e.message) || e);
    try { if (message.react) await message.react("❌"); } catch (_) {}
    message.reply(errorText);
  }
}

async function onStart(ctx) {
  await handleMessage(
    ctx.message,
    ctx.event,
    ctx.args.join(" "),
    "╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⚠ Gemini API a somossa hoyeche.\n╚══════════════════╝"
  );
}

async function onReply(ctx) {
  if (ctx.event.senderID !== ctx.Reply.author) return;
  const p = ctx.event.body;
  if (!p) return;
  await handleMessage(
    ctx.message,
    ctx.event,
    p,
    "╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⚠ Gemini API er response dite somossa hocchhe.\n╚══════════════════╝"
  );
}

module.exports = {
  config: {
    name: "gemini",
    aliases: ["ai", "chat"],
    version: "0.0.1",
    countDown: 3,
    role: 0,
    description: "Ask Gemini AI (Text or Image)",
    category: "ai",
    guide: "/gemini [your question] (Reply to an image to use Vision)"
  },
  onStart,
  onReply
};
