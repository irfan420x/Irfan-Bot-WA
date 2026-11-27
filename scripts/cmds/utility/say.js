// .say — convert text to Bangla voice (WhatsApp port).
//   .say <your Bangla text>  e.g. .say আমি ভালো আছি
//
// The Messenger original used the google-tts-api npm package, which is
// NOT installed on WhatsApp. That package only builds a URL for Google's
// free translate_tts endpoint (client=tw-ob, no key, no token) and fetches
// it — the same URL is built directly here with fetch, and the MP3 bytes
// are sent as an audio attachment. No key, no new package.

const TTS_HOST = "https://translate.google.com";
const MAX_CHUNK = 200; // translate_tts accepts ~200 chars per request

function ttsUrl(text) {
  return `${TTS_HOST}/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=bn&client=tw-ob`;
}

// Split long text into <=200-char chunks at word boundaries, the way
// google-tts-api does for a single getAudioUrl call.
function splitChunks(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if ((cur + " " + w).length <= MAX_CHUNK) {
      cur += " " + w;
    } else {
      chunks.push(cur);
      cur = w;
    }
  }
  if (cur) chunks.push(cur);
  // A single over-long word still exceeds the limit — hard-split it.
  const out = [];
  for (const c of chunks) {
    for (let i = 0; i < c.length; i += MAX_CHUNK) out.push(c.slice(i, i + MAX_CHUNK));
  }
  return out;
}

async function fetchChunkAudio(chunk) {
  const res = await fetch(ttsUrl(chunk), {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error("TTS HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error("Empty TTS audio");
  return buf;
}

module.exports = {
  config: {
    name: "say",
    aliases: ["speak"],
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Convert text to Bangla voice",
    category: "utility",
    guide: "{pn} <your Bangla text> → e.g. {pn} আমি ভালো আছি",
  },

  onStart: async function ({ args, message }) {
    const text = args.join(" ").trim();
    if (!text) return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⚠️ Please provide some Bangla text to speak!\n╚══════════════════╝");

    try {
      const chunks = splitChunks(text);
      const parts = [];
      for (const chunk of chunks) {
        parts.push(await fetchChunkAudio(chunk));
      }
      const audio = Buffer.concat(parts);

      await message.reply({
        body: `🔊 Voice Output: ${text}`,
        attachment: { buffer: audio, mimetype: "audio/mpeg", fileName: "voice.mp3" },
      });
    } catch (err) {
      console.error("❌ Say command error:", err);
      message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ Failed to generate voice!\n╚══════════════════╝");
    }
  },
};
