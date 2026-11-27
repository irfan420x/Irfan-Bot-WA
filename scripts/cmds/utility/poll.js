"use strict";

// .poll — create a native WhatsApp poll (Baileys 6.7.24).
//
//   .poll "question" "option 1" "option 2" ["option 3" ...]
//   .poll question | option 1 | option 2
//
// 2-10 options, single choice (selectableCount 1). Sent via the adapter
// (message.send -> toBaileysContent poll passthrough -> guarded send ->
// sock.sendMessage { poll: { name, values, selectableCount } }).
// Baileys auto-generates the 32-byte messageSecret
// (Utils/messages.js:407) and defaults selectableCount when omitted.
//
// NOTE — vote counting is NOT wired yet: poll votes arrive as
// poll-update messages, which need handler support (another worker owns
// core/handler/). This command ships creation only; results must be
// read from the poll message itself in WhatsApp for now.

function parseQuoted(raw) {
  const out = [];
  const re = /"([^"]*)"/g;
  let m;
  while ((m = re.exec(raw)) !== null) out.push(m[1]);
  return out;
}

function parseArgs(args) {
  const raw = (args || []).join(" ").trim();
  if (!raw) return null;
  // Quoted form first: "q" "a" "b" ... (2+ parts so a 1-option poll
  // reaches the "at least 2 options" error instead of the usage text).
  const quoted = parseQuoted(raw);
  if (quoted.length >= 2) return { question: quoted[0], options: quoted.slice(1) };
  // Pipe-separated fallback: q | a | b
  if (raw.includes("|")) {
    const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { question: parts[0], options: parts.slice(1) };
  }
  return null;
}

module.exports = {
  config: {
    name: "poll",
    aliases: ["vote"],
    version: "1.0",
    role: 0,
    countDown: 5,
    description: "Create a native WhatsApp poll (vote counting not wired yet — read results in the poll itself)",
    category: "utility",
    guide:
      "{pn} \"question\" \"option 1\" \"option 2\" [\"option 3\"...] (2-10 options)\n" +
      "{pn} question | option 1 | option 2\n" +
      "Note: live vote counting is not wired yet — see the poll message in WhatsApp for results."
  },

  onStart: async function ({ message, args }) {
    const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || ".";
    const parsed = parseArgs(args);
    if (!parsed) {
      return message.reply(
        "⚠️ Usage:\n" +
        prefix + "poll \"question\" \"option 1\" \"option 2\" [\"option 3\"...]\n" +
        "or: " + prefix + "poll question | option 1 | option 2\n" +
        "Give a question and 2-10 options."
      );
    }
    const question = parsed.question.trim();
    const options = parsed.options.map((o) => String(o).trim()).filter(Boolean);
    if (!question || question.length > 300) {
      return message.reply("⚠️ The question must be 1-300 characters.");
    }
    if (options.length < 2) {
      return message.reply("⚠️ A poll needs at least 2 options.");
    }
    if (options.length > 10) {
      return message.reply("⚠️ A poll can have at most 10 options.");
    }
    if (options.some((o) => o.length > 100)) {
      return message.reply("⚠️ Each option must be at most 100 characters.");
    }
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      return message.reply("⚠️ Poll options must all be different.");
    }
    try {
      await message.send({ poll: { name: question, values: options, selectableCount: 1 } });
    } catch (e) {
      console.error("[poll] send failed:", (e && e.message) || e);
      return message.reply("❌ Could not create the poll. Please try again later.");
    }
  },

  // Exported for tests / verification only.
  _parseArgs: parseArgs
};
