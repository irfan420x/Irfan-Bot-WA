// .system — dynamic system and bot information (WhatsApp port).
//
// WhatsApp port notes (vs the Messenger original):
// - The Messenger original drew a canvas system card (canvas and
//   systeminformation are NOT installed here). The card is rendered
//   here with the shared _card.js helper (canvas is lazy-required and
//   the text message is sent on its own if rendering fails).
// - Disk usage comes from fs.statfsSync("/") instead of systeminformation.
// - moment-timezone is not installed; Dhaka date/time come from Intl.

const os = require("os");
const fs = require("fs");
const card = require("../_card.js");

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

async function getCurrentCPUUsage() {
  return new Promise((resolve) => {
    const startCores = os.cpus();
    setTimeout(() => {
      const endCores = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (let i = 0; i < endCores.length; i++) {
        const start = startCores[i].times;
        const end = endCores[i].times;
        totalTick += (end.user - start.user) + (end.nice - start.nice) + (end.sys - start.sys) + (end.irq - start.irq) + (end.idle - start.idle);
        totalIdle += (end.idle - start.idle);
      }
      const usage = totalTick > 0 ? ((totalTick - totalIdle) / totalTick) * 100 : 0;
      resolve(Math.max(0, Math.min(100, usage)).toFixed(2));
    }, 100);
  });
}

function getDiskUsage() {
  try {
    const s = fs.statfsSync("/");
    if (!s.bsize || !s.blocks) return "0";
    return (((s.blocks - s.bfree) / s.blocks) * 100).toFixed(1);
  } catch (e) {
    console.error("Disk Info Fetch Error:", e);
    return "0";
  }
}

/**
 * Render the SYSTEM INFO card (1000x580) and return a PNG buffer.
 * Returns null when canvas is unavailable; throws on render failure
 * and the caller falls back to the text message.
 */
function renderSystemCard(stats) {
  const c = card.newCard(1000, 580);
  if (!c) return null;
  const { canvas, ctx, W, H } = c;

  card.title(ctx, W, "SYSTEM INFO", 72, 44);

  // Usage bars: label on the left, bar to the right.
  const bars = [
    { label: "RAM", pct: stats.ramLoad, color: card.BRAND.purple },
    { label: "CPU", pct: stats.cpuLoad, color: card.BRAND.pink },
    { label: "Disk", pct: stats.diskLoad, color: card.BRAND.green },
  ];
  bars.forEach((b, i) => {
    const y = 128 + i * 62;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = card.BRAND.subtle;
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(b.label, 80, y + 14);
    card.bar(ctx, 200, y, 720, 28, b.pct, { color: b.color });
  });

  // Stat rows, two columns.
  const left = [
    ["Sys Uptime:", stats.sysUptime],
    ["CPU Cores:", String(stats.cpuCores)],
    ["Date:", stats.date],
  ];
  const right = [
    ["Bot Uptime:", stats.botUptime],
    ["Node.js:", stats.nodeVersion],
    ["Time:", stats.time],
  ];
  left.forEach((row, i) => card.statRow(ctx, 80, 352 + i * 52, row[0], row[1]));
  right.forEach((row, i) => card.statRow(ctx, 540, 352 + i * 52, row[0], row[1]));

  card.footer(ctx, W, H);
  return card.toPng(canvas);
}

module.exports = {
  config: {
    name: "system",
    version: "1.1",
    countDown: 10,
    role: 0,
    description: "Shows dynamic system and bot information.",
    category: "utility",
    guide: "{pn}",
  },

  onStart: async function ({ message }) {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const ramLoad = ((totalMem - freeMem) / totalMem * 100).toFixed(1);
      const cpuLoad = await getCurrentCPUUsage();
      const diskLoad = getDiskUsage();
      const sysUptime = formatUptime(os.uptime());
      const botUptime = formatUptime(process.uptime());
      const cpuCores = os.cpus().length;
      const nodeVersion = process.version;

      const now = new Date();
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now);

      const textMessage = `╔═══ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐈𝐍𝐅𝐎 ═══╗\n` +
        `║ 📊 RAM Usage : ${ramLoad}%\n` +
        `║ ⚡ CPU Usage : ${cpuLoad}%\n` +
        `║ 💾 Disk Usage : ${diskLoad}%\n` +
        `╠══════════════════╣\n` +
        `║ 🕒 Sys Uptime : ${sysUptime}\n` +
        `║ 🤖 Bot Uptime : ${botUptime}\n` +
        `║ 🧠 CPU Cores : ${cpuCores}\n` +
        `║ 📦 Node.js : ${nodeVersion}\n` +
        `╠══════════════════╣\n` +
        `║ 📅 Date: ${date}\n` +
        `║ ⏰ Time: ${time}\n` +
        `╚══════════════════╝`;

      // Send the visual card; fall back to the text box if rendering fails
      // (canvas not installed is the expected case on some hosts).
      try {
        const buf = renderSystemCard({
          ramLoad, cpuLoad, diskLoad, sysUptime, botUptime,
          cpuCores, nodeVersion, date, time,
        });
        if (buf) {
          // No caption with the card — the card already shows the stats.
          return message.reply({
            body: "",
            attachment: { buffer: buf, mimetype: "image/png", fileName: "system.png" },
          });
        }
        return message.reply(textMessage);
      } catch (cardErr) {
        console.error("System card render failed:", cardErr.message);
        return message.reply(textMessage);
      }
    } catch (err) {
      console.error("SYSTEM COMMAND ERROR:", err);
      return message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ Something went wrong\n╚══════════════════╝");
    }
  },
};
