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

function buildTextCalendar() {
  const now = new Date();
  const { year, month, day: today } = dhakaDateParts(now);

  const monthName = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    month: "long",
  }).format(now);

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Day of week of the 1st (UTC math, Monday = 0).
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sun
  const firstOffset = (firstDow + 6) % 7;

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
      await message.reply(buildTextCalendar());
    } catch (err) {
      console.error("Calendar command error:", err.message);
      message.reply(
        "❌ Failed to fetch calendar. Please try again later. "
      );
    }
  },
};
