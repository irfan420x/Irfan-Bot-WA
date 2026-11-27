// .system — dynamic system and bot information (WhatsApp port).
//
// WhatsApp port notes (vs the Messenger original):
// - The Messenger original drew a canvas system card (canvas and
//   systeminformation are NOT installed here). The card is dropped; the
//   complete text message is sent on its own — same stats, same text.
// - Disk usage comes from fs.statfsSync("/") instead of systeminformation.
// - moment-timezone is not installed; Dhaka date/time come from Intl.

const os = require("os");
const fs = require("fs");

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

      await message.reply(textMessage);
    } catch (err) {
      console.error("SYSTEM COMMAND ERROR:", err);
      return message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ Something went wrong\n╚══════════════════╝");
    }
  },
};
