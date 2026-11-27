module.exports = {
  config: {
    name: "info",
    aliases: ["botinfo", "about"],
    version: "1.0",
    role: 0,
    countDown: 3,
    description: "Show information about this bot.",
    category: "info",
    guide: "{pn}info"
  },

  onStart: async function ({ message }) {
    const cfg = (global.wabot && global.wabot.config) || {};
    const botName = cfg.nickNameBot || "WABOT";
    const prefix = cfg.prefix || ".";
    const commands = (global.wabot && global.wabot.commands) || new Map();

    let baileysVersion = "not installed";
    try {
      baileysVersion = require("@whiskeysockets/baileys/package.json").version;
    } catch (_e) {
      baileysVersion = "not installed";
    }

    let dbStatus = "unknown";
    try {
      if (global.wabot && global.wabot.db) {
        dbStatus = global.wabot.db.mode || "connected";
      }
    } catch (_e) {
      dbStatus = "unknown";
    }

    // Count distinct commands (the loader map holds name + aliases).
    const seen = new Set();
    for (const cmd of commands.values()) {
      if (cmd && cmd.config) seen.add(cmd);
    }

    const lines = [
      `${botName} — Bot Info`,
      `Prefix: ${prefix}`,
      `Version: 0.1.0`,
      `Uptime: ${formatUptime(process.uptime())}`,
      `Commands loaded: ${seen.size}`,
      `Baileys: ${baileysVersion}`,
      `Node: ${process.version}`,
      `Database: ${dbStatus}`
    ];
    await message.reply(lines.join("\n"));
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
