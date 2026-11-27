// .bmdp — random Boys Matching DP (WhatsApp port).
// Sakura API: GET <base>/api/bmdp -> { boy, boy2 } (image URLs).
// The base URL is read from the public ApiUrl.json (key "saimx69x"),
// cached 10 minutes — the same lookup the Messenger original's
// getApiBase() did, inlined here with fetch (no _apiBase.js on WhatsApp).
//
// WhatsApp port notes (vs the Messenger original):
// - The adapter sends one attachment per message, so the two DPs go out
//   as two separate replies instead of one two-image message.
// - No temp files: image bytes are downloaded to a buffer with fetch.

const API_JSON_URL = "https://raw.githubusercontent.com/Saim-x69x/sakura/main/ApiUrl.json";
const API_KEY = "saimx69x";
const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedBase = null;
let cachedAt = 0;

async function getApiBase() {
  const now = Date.now();
  if (cachedBase && now - cachedAt < CACHE_TTL_MS) return cachedBase;
  const res = await fetch(API_JSON_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("ApiUrl.json HTTP " + res.status);
  const data = await res.json();
  const value = data && data[API_KEY];
  if (!value) throw new Error("API base missing key: " + API_KEY);
  cachedBase = value;
  cachedAt = now;
  return value;
}

async function downloadImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length ? { buffer: buf, mimetype: ct.split(";")[0].trim() || "image/jpeg" } : null;
}

module.exports = {
  config: {
    name: "bmdp",
    aliases: ["boysmatchingdp"],
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Random Boys Matching DP",
    category: "image",
    guide: "{pn}",
  },

  onStart: async function ({ message }) {
    try {
      const baseUrl = await getApiBase();
      const res = await fetch(`${baseUrl}/api/bmdp`, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error("bmdp API HTTP " + res.status);
      const { boy, boy2 } = (await res.json()) || {};
      if (!boy || !boy2) {
        throw new Error("Invalid API response: missing boy/boy2 image URLs");
      }

      const img1 = await downloadImage(boy);
      const img2 = await downloadImage(boy2);
      if (!img1 || !img2) {
        throw new Error("Failed to download DP images");
      }

      await message.reply({
        body: "𝐇𝐞𝐫𝐞'𝐬 𝐲𝐨𝐮𝐫 𝐛𝐦𝐝𝐩! 🥰✨️",
        attachment: { buffer: img1.buffer, mimetype: img1.mimetype, fileName: "bmdp-1.jpg" },
      });
      await message.send({
        body: "",
        attachment: { buffer: img2.buffer, mimetype: img2.mimetype, fileName: "bmdp-2.jpg" },
      });
    } catch (e) {
      await message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ 𝐎𝐩𝐩𝐬! 𝐒𝐨𝐦𝐞𝐭𝐡𝐢𝐧𝐠 𝐰𝐞𝐧𝐭 𝐰𝐫𝐨𝐧𝐠. 𝐏𝐥𝐞𝐚𝐬𝐞 𝐭𝐫𝐲 𝐚𝐠𝐚𝐢𝐧 𝐥𝐚𝐭𝐞𝐫.\n╚══════════════════╝");
      console.error(e.message);
    }
  },
};
