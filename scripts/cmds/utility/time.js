// .time — current time for Asia/Dhaka (WhatsApp port).
//
// WhatsApp port notes (vs the Messenger original):
// - The Messenger original drew a canvas time card (canvas is NOT
//   installed here) and fell back to a NoobCore API image. Both are
//   unavailable on WhatsApp, so the command sends the plain-text time —
//   the same text the original used as its last-resort fallback.
// - moment-timezone is not installed; Dhaka time comes from Intl with
//   timeZone "Asia/Dhaka".
// - The ORION-brand time card is rendered with the shared _card.js
//   helper; any render failure falls back to the text reply.

const card = require("../_card.js");

const TIMEZONE = "Asia/Dhaka";

function dhakaParts(date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return parts;
}

module.exports = {
  config: {
    name: "time",
    version: "1.0",
    countDown: 3,
    role: 0,
    description: "Shows current time (Asia/Dhaka)",
    category: "utility",
    guide: "{pn} - Get current time",
  },

  onStart: async function ({ message }) {
    let wait = null;
    try {
      wait = await message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⚡ Fetching time card...\n╚══════════════════╝");

      const now = new Date();
      const p = dhakaParts(now);
      const time12 = new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now);

      if (wait && wait.messageID && message.unsend) {
        try { await message.unsend(wait.messageID); } catch (e) { /* already gone — ignore */ }
      }

      const textMsg =
        `🕒 ${p.hour}:${p.minute}:${p.second}\n📅 ${p.weekday}, ${p.day} ${p.month} ${p.year} (${TIMEZONE})\n🕐 ${time12}`;

      // Send the ORION time card; fall back to the text reply if the
      // render fails (canvas not installed is the expected case).
      try {
        const buf = renderTimeCard({
          time24: `${p.hour}:${p.minute}:${p.second}`,
          dateLine: `${p.weekday}, ${p.day} ${p.month} ${p.year}`,
          time12,
        });
        if (buf) {
          // No caption with the card — the card already shows the time.
          return await message.reply({
            body: "",
            attachment: { buffer: buf, mimetype: "image/png", fileName: "time.png" },
          });
        }
      } catch (e) {
        console.error("Time card render failed:", e.message);
      }

      return await message.reply(textMsg);
    } catch (err) {
      console.error("Time command error:", err.message);
      return message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ Failed to fetch time. Please try again later\n╚══════════════════╝");
    }
  },
};

/**
 * Render the 1000x420 time card and return a PNG buffer, or null when
 * canvas is unavailable. Synchronous — no avatar or network involved.
 */
function renderTimeCard({ time24, dateLine, time12 }) {
  const c = card.newCard(1000, 420);
  if (!c) return null;
  const { canvas, ctx, W, H } = c;

  // Big digital time, centered.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = card.BRAND.text;
  ctx.font = "bold 90px sans-serif";
  ctx.fillText(time24, W / 2, 150);

  // Purple accent rule under the time.
  ctx.fillStyle = card.BRAND.purple;
  ctx.fillRect(W / 2 - 120, 210, 240, 4);

  // Date line.
  ctx.fillStyle = card.BRAND.subtle;
  ctx.font = "30px sans-serif";
  ctx.fillText(dateLine, W / 2, 262);

  // 12-hour time + timezone.
  ctx.fillStyle = card.BRAND.purpleLight;
  ctx.font = "26px sans-serif";
  ctx.fillText(`${time12}  •  ${TIMEZONE}`, W / 2, 312);

  card.footer(ctx, W, H);
  return card.toPng(canvas);
}
