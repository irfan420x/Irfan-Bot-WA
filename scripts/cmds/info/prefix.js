module.exports = {
  config: {
    name: "prefix",
    aliases: [],
    version: "1.0",
    role: 0,
    countDown: 3,
    description: "Show the bot's command prefix.",
    category: "info",
    guide: "{pn}prefix"
  },

  onStart: async function ({ event, message }) {
    const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || ".";
    const botName = (global.wabot && global.wabot.config && global.wabot.config.nickNameBot) || "WABOT";
    const getLang = (event && typeof event.getLang === 'function') ? event.getLang : null;
    await message.reply(getLang
      ? getLang('cmds.prefix.text.reply', botName, prefix)
      : `${botName} prefix: ${prefix}\nUse ${prefix}help to see all commands.`);
  }
};
