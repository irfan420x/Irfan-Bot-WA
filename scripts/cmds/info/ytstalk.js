// .ytstalk — fetch YouTube channel info (WhatsApp port).
//   .ytstalk <channelName>
// ORION: GET /youtube/v1/channel?channel=<name> ->
// {"name","subscribers","avatar","description","url"}.
// ORION has no country / join-date / views / videos fields, so those
// lines are shown only when the data has them (they never do on ORION).
//
// WhatsApp port notes (vs the Messenger original):
// - NoobCore fallback dropped — ORION only.
// - The fancy-font map is still fetched from the public NC-STORE
//   ncsfont.json (static JSON, no key); on failure the text is sent
//   unstyled, exactly as the original did.
// - No temp files: the avatar is downloaded to a buffer with fetch.

const { orionGet } = require("../_orionApi.js");

const FONT_MAP_URL = "https://raw.githubusercontent.com/noobcore404/NC-STORE/main/ncsfont.json";

// Format a raw subscriber count ("528000000") with thousands separators
// so it stays readable; non-numeric values pass through untouched.
function formatCount(v) {
  const s = String(v == null ? "" : v);
  return /^\d+$/.test(s) ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : s;
}

async function downloadImage(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length ? { buffer: buf, mimetype: ct.split(";")[0].trim() || "image/jpeg" } : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  config: {
    name: "ytstalk",
    aliases: ["ytinfo"],
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Fetch YouTube channel info including subscribers, views, join date, description, thumbnail.",
    category: "info",
    guide: "{pn} <channelName>",
  },

  onStart: async function ({ event, args, message }) {
    const channelName = args.join(" ").trim();

    let fontMap = {};
    const applyFont = (text) => text.split("").map((c) => {
      if ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || (c >= "0" && c <= "9")) return fontMap[c] || c;
      return c;
    }).join("");

    if (!channelName) {
      return message.reply(
        "⚠️ Please provide a YouTube channel name.\nUsage: .ytstalk MrBeast"
      );
    }

    try {
      try {
        const fontRes = await fetch(FONT_MAP_URL, { signal: AbortSignal.timeout(10000) });
        if (fontRes.ok) fontMap = (await fontRes.json()) || {};
      } catch (e) {
        console.warn("[ytstalk] font map failed, continuing without it:", e.message);
        fontMap = {};
      }

      // ORION only (NoobCore fallback dropped).
      let info = null;
      try {
        const orionRes = await orionGet(`/youtube/v1/channel?channel=${encodeURIComponent(channelName)}`, { timeout: 20000 });
        if (orionRes && orionRes.name && orionRes.subscribers != null) {
          info = {
            title: orionRes.name,
            subscribers: formatCount(orionRes.subscribers),
            description: orionRes.description || "",
            thumbnail: orionRes.avatar || "",
            url: orionRes.url || "",
          };
        }
      } catch (e) {
        console.warn("[orion] ytstalk failed:", e.message);
      }

      if (!info) {
        return message.reply(
          applyFont(`❌ Failed to fetch info for channel: ${channelName}`)
        );
      }

      const description = (info && typeof info.description === "string") ? info.description : "";

      const lines = [
        `╔══════════════════╗`,
        `║  📺  ${applyFont("ＹＴ  ＳＴＡＬＫ")}  ║`,
        `╠══════════════════╣`,
        `║ 🏷️ Channel: ${applyFont(info.title)}`,
      ];
      if (info.country) lines.push(`║ 🌍 Country: ${info.country}`);
      if (info.publishedAt) lines.push(`║ 📅 Joined: ${info.publishedAt}`);
      lines.push(`║ 👥 Subs: ${applyFont(formatCount(info.subscribers))}`);
      if (info.views) lines.push(`║ 👁️ Views: ${applyFont(formatCount(info.views))}`);
      if (info.videos) lines.push(`║ 🎬 Videos: ${applyFont(formatCount(info.videos))}`);
      if (info.url) lines.push(`║ 🔗 ${info.url}`);
      lines.push(
        `╠══════════════════╣`,
        `║      ${applyFont("ＤＥＳＣＲＩＰＴＩＯＮ")}      ║`,
        `╠══════════════════╣`,
        `║ ${applyFont(description.substring(0, 200))}${description.length > 200 ? "..." : ""}`,
        `╚══════════════════╝`
      );
      const text = lines.join("\n");

      if (info.thumbnail) {
        const img = await downloadImage(info.thumbnail);
        if (img) {
          return message.reply({
            body: text,
            attachment: { buffer: img.buffer, mimetype: img.mimetype, fileName: "yt.jpg" },
          });
        }
      }
      return message.reply(text);
    } catch (err) {
      console.error(err);
      message.reply(
        applyFont("❌ Error occurred while fetching channel info. Please check the channel name or try again later.")
      );
    }
  },
};
