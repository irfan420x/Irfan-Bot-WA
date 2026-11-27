// .translate — translate text (WhatsApp port).
//   .translate <text>            -> translate to the thread language (default en)
//   .translate <text> -> <code>  -> translate to that ISO 639-1 language
//   Reply to a message with .translate [-> <code>] to translate it.
// Free Google endpoint (translate.googleapis.com), no key — same as the
// Messenger original.
//
// WhatsApp port notes (vs the Messenger original):
// - The "-r" reaction auto-translate mode is NOT ported: WhatsApp has no
//   reaction-event pipeline (no onReaction routing), and the Messenger
//   threadsData "data.translate.*" paths do not exist here.
// - The thread language is read from threadsData settings.lang (default
//   "en", the Messenger bot's configured language); getLang is not passed
//   by the WhatsApp handler, so the English strings are inlined.

const DEFAULT_LANG = "en";

async function translate(text, langCode) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${langCode}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("Translate HTTP " + res.status);
  const data = await res.json();
  return {
    text: data[0].map((item) => item[0]).join(""),
    lang: data[2],
  };
}

async function translateAndSendMessage(content, langCodeTrans, message) {
  try {
    const { text, lang } = await translate(content.trim(), langCodeTrans.trim());
    return message.reply(`${text}\n\n🌐 Translate from ${lang} to ${langCodeTrans}`);
  } catch (e) {
    console.error("translate error:", e);
    return message.reply("❌ Translation failed. Please try again later.");
  }
}

module.exports = {
  config: {
    name: "translate",
    aliases: ["trans"],
    version: "1.5",
    countDown: 5,
    role: 0,
    description: "Translate text to the desired language",
    category: "utility",
    guide: "{pn} <text>\n{pn} <text> -> <ISO 639-1>\nExample: {pn} hello -> vi\nOr reply to a message to translate it.",
  },

  onStart: async function ({ message, event, args, threadsData }) {
    if (["-r", "-react", "-reaction"].includes(args[0])) {
      return message.reply(
        "❌ Reaction auto-translate is not available on WhatsApp.\nUse: .translate <text> -> <language code>"
      );
    }

    let langOfThread = DEFAULT_LANG;
    try {
      const thread = threadsData ? await threadsData.get(event.threadID) : null;
      if (thread && thread.settings && thread.settings.lang) {
        langOfThread = thread.settings.lang;
      }
    } catch (e) { /* default language */ }

    // Text to translate and target language, derived from args
    // (not from the raw body, so the ".translate" prefix is never
    // translated). "->"/"=>" followed by a 2-3 letter code at the
    // end selects the target language, e.g. "hello -> eng".
    const argsText = args.join(" ").trim();
    const sepLangMatch = argsText.match(/(?:->|=>)\s*([a-z]{2,3})\s*$/i);
    const sepLang = sepLangMatch ? sepLangMatch[1].toLowerCase() : null;

    let content;
    let langCodeTrans;
    if (event.messageReply) {
      content = event.messageReply.body;

      if (sepLang)
        langCodeTrans = sepLang;
      else if (/^[a-z]{2,3}$/.test((args[0] || "").toLowerCase()))
        langCodeTrans = args[0].toLowerCase();
      else
        langCodeTrans = langOfThread;
    } else {
      if (sepLang) {
        langCodeTrans = sepLang;
        content = argsText.slice(0, sepLangMatch.index).trim();
      } else {
        langCodeTrans = langOfThread;
        content = argsText;
      }
    }

    if (!content)
      return message.reply(
        "❌ Please provide text to translate.\nExample: .translate hello -> vi"
      );
    translateAndSendMessage(content, langCodeTrans, message);
  },
};
