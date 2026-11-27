// .uptime — all uptime information of the bot including system stats
// (WhatsApp port).
//
// WhatsApp port notes (vs the Messenger original):
// - pidusage is NOT installed on WhatsApp, so bot RAM comes from
//   process.memoryUsage() instead of pidusage(process.pid).
// - The original shelled out to `df` / `top` / `wmic`; disk and CPU here
//   use fs.statfsSync("/") and os.cpus() sampling (no child_process).
// - usersData.getAll() / threadsData.getAll() exist on WhatsApp, so the
//   Users / Groups counts are unchanged.

const os = require("os");
const fs = require("fs");

function byte2mb(bytes) {
  if (bytes === 0 || bytes === undefined) return "0 Bytes";
  const units = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let l = 0;
  let n = parseInt(bytes, 10) || 0;
  while (n >= 1024 && ++l) n /= 1024;
  return `${n.toFixed(n < 10 && l > 0 ? 1 : 0)} ${units[l]}`;
}

function getUptime(seconds) {
  if (!seconds || seconds <= 0) return "0s";
  const months = Math.floor(seconds / 2592000);
  const days = Math.floor((seconds % 2592000) / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (months > 0) parts.push(`${months}M`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

function getDiskSpaceInfo() {
  try {
    const s = fs.statfsSync("/");
    const total = s.blocks * s.bsize;
    const free = s.bfree * s.bsize;
    const used = total - free;
    return {
      total: byte2mb(total),
      used: byte2mb(used),
      free: byte2mb(free),
      percent: total > 0 ? ((used / total) * 100).toFixed(1) : "0",
    };
  } catch {
    return { total: "N/A", used: "N/A", free: "N/A", percent: "N/A" };
  }
}

async function getCpuUsage() {
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
      resolve(Math.max(0, Math.min(100, usage)));
    }, 100);
  });
}

module.exports = {
  config: {
    name: "uptime",
    aliases: ["uptimeinfo", "upt"],
    version: "1.2",
    countDown: 5,
    role: 0,
    description: "Show all Information of Uptime",
    category: "utility",
    guide: "{pn}",
  },

  onStart: async function ({ message, usersData, threadsData }) {
    try {
      const startTime = Date.now();

      const [allUsers, allThreads, diskSpaceInfo, cpuUsage] = await Promise.all([
        usersData.getAll().catch(() => []),
        threadsData.getAll().catch(() => []),
        Promise.resolve(getDiskSpaceInfo()),
        getCpuUsage(),
      ]);

      const uptimeSeconds = Math.floor(process.uptime());
      const totalMemory = byte2mb(os.totalmem());
      const usedMemory = byte2mb(process.memoryUsage().rss);
      const memoryPercent = ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(1);

      const msg = `╔══════════════════╗
║  🖥️  ${"ＳＹＳＴＥＭ  ＳＴＡＴＵＳ"}  ║
╠══════════════════╣
║ 📅 Date: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" })}
║ ⏱️ Uptime: ${getUptime(uptimeSeconds)}
║ 💻 CPU: ${cpuUsage.toFixed(1)}%
║ 🎯 RAM: ${usedMemory} / ${totalMemory}
║ 💾 Disk: ${diskSpaceInfo.used} / ${diskSpaceInfo.total}
║ 📊 Users: ${allUsers.length} | Groups: ${allThreads.length}
║ ⚡ Speed: ${Date.now() - startTime}ms
╚══════════════════╝`.trim();

      return message.reply(msg);
    } catch (e) {
      return message.reply(`Error: ${e.message}`);
    }
  },
};
