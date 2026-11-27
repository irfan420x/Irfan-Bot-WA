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

  onStart: async function ({ message }) {
    const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || ".";
    const botName = (global.wabot && global.wabot.config && global.wabot.config.nickNameBot) || "WABOT";
    await message.reply(`${botName} prefix: ${prefix}\nUse ${prefix}help to see all commands.`);
  }
};
