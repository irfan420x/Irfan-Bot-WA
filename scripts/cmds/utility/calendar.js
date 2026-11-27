// .calendar — English calendar for Asia/Dhaka (WhatsApp port).
//
// WhatsApp port notes (vs the Messenger original):
// - The Messenger original drew a canvas calendar card (canvas is NOT
//   installed here) and fell back to a NoobCore API image. Both are
//   unavailable on WhatsApp, so the command sends a plain-text calendar
//   for the current month — same month, Monday-first week, today
//   highlighted — instead of an image.
// - moment-timezone is not installed; Dhaka date parts come from Intl
//   with timeZone "Asia/Dhaka".
// - Card: the ORION-brand calendar card (1000x640) is rendered with the
//   shared _card.js helper and attached to the text calendar; any render
//   failure falls back to text only.

const card = require("../_card.js");

const TIMEZONE = "Asia/Dhaka";
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function dhakaDateParts(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = Number(p.value);
  return parts; // { year, month (1-12), day }
}

// Shared month math (text calendar and card use the same numbers).
function getMonthData(date) {
  const now = date || new Date();
  const { year, month, day: today } = dhakaDateParts(now);

  const monthName = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    month: "long",
  }).format(now);

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Day of week of the 1st (UTC math, Monday = 0).
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sun
  const firstOffset = (firstDow + 6) % 7;

  return { year, month, today, monthName, daysInMonth, firstOffset };
}

function buildTextCalendar() {
  const { year, monthName, today, daysInMonth, firstOffset } = getMonthData();

  const lines = [];
  lines.push(`🗓️ ${monthName} ${year} (${TIMEZONE})`);
  lines.push(WEEKDAYS.join("  "));

  let row = [];
  for (let i = 0; i < firstOffset; i++) row.push("  ");
  for (let d = 1; d <= daysInMonth; d++) {
    const label = d === today ? `[${String(d).padStart(2, " ")}]` : ` ${String(d).padStart(2, " ")} `;
    row.push(label);
    if (row.length === 7) {
      lines.push(row.join(" ").trimEnd());
      row = [];
    }
  }
  if (row.length) lines.push(row.join(" ").trimEnd());

  lines.push(`\n📅 Today: ${today} ${monthName} ${year}`);
  return lines.join("\n");
}

/**
 * Render the ORION calendar card (1000x640) and return a PNG buffer.
 * Returns null when canvas is unavailable. Throws on render errors —
 * the caller falls back to the text calendar.
 */
function renderCalendarCard(data) {
  const c = card.newCard(1000, 640);
  if (!c) return null;
  const { ctx, W, H } = c;
  const { monthName, year, today, daysInMonth, firstOffset } = data;

  // Month title, centered.
  card.title(ctx, W, `${monthName} ${year}`, 82, 46);

  // Grid geometry: 7 columns across the inner panel.
  const gridX = 60;
  const gridW = W - 120;
  const cellW = gridW / 7;
  const headerY = 148;
  const gridTop = 178;
  const cellH = 64;

  // Weekday header row.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = card.BRAND.purpleLight;
  ctx.font = "bold 28px sans-serif";
  for (let i = 0; i < 7; i++) {
    ctx.fillText(WEEKDAYS[i], gridX + cellW * (i + 0.5), headerY);
  }

  // Day cells.
  for (let d = 1; d <= daysInMonth; d++) {
    const idx = firstOffset + d - 1;
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    const cx = gridX + cellW * col;
    const cy = gridTop + cellH * row;
    if (d === today) {
      ctx.fillStyle = card.BRAND.purple;
      card.roundedRect(ctx, cx + 8, cy + 6, cellW - 16, cellH - 12, 14);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 30px sans-serif";
    } else {
      ctx.fillStyle = card.BRAND.muted;
      ctx.font = "28px sans-serif";
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(d), cx + cellW / 2, cy + cellH / 2 + 1);
  }

  card.footer(ctx, W, H, `Today: ${today} ${monthName} ${year}`);
  return card.toPng(c.canvas);
}

module.exports = {
  config: {
    name: "calendar",
    version: "1.0",
    countDown: 3,
    role: 0,
    description: "🗓️ English Calendar",
    category: "utility",
    guide: "{pn}",
  },

  onStart: async function ({ message }) {
    try {
      const textMsg = buildTextCalendar();
      try {
        const buf = renderCalendarCard(getMonthData());
        if (buf) {
          // No caption with the card — the card already shows the calendar.
          return message.reply({
            body: "",
            attachment: { buffer: buf, mimetype: "image/png", fileName: "calendar.png" },
          });
        }
      } catch (cardErr) {
        console.error("Calendar card render failed:", cardErr.message);
      }
      await message.reply(textMsg);
    } catch (err) {
      console.error("Calendar command error:", err.message);
      message.reply(
        "❌ Failed to fetch calendar. Please try again later. "
      );
    }
  },

  // Exported for tests / verification only.
  _renderCalendarCard: renderCalendarCard,
  _getMonthData: getMonthData,
};
