module.exports = {
  config: {
    name: "ping",
    aliases: [],
    version: "1.0",
    role: 0,
    countDown: 3,
    description: "Check whether the bot is alive and how fast it replies.",
    category: "info",
    guide: "{pn}ping"
  },

  onStart: async function ({ message }) {
    const start = Date.now();
    const uptime = formatUptime(process.uptime());
    await message.reply(
      `Pong! 🏓\nLatency: ${Date.now() - start}ms\nUptime: ${uptime}`
    );
  }
};

function formatUptime(seconds) {
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}
