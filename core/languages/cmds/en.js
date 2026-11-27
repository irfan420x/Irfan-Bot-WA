module.exports = {
  help: {
    description: "List all commands, or show details for one command.",
    guide: "{pn}help [command]",
    text: {
      commandNotFound: 'No command named "%1". Try %2help to see all commands.',
      noCommands: "No commands loaded.",
      listHeader: "%1 — Commands (prefix: %2)",
      listFooter: "Type %1help <command> for details about one command.",
      roleText0: "everyone",
      roleText1: "group admin",
      roleText2: "bot admin"
    }
  },
  prefix: {
    description: "Show the bot's command prefix.",
    guide: "{pn}prefix",
    text: {
      reply: "%1 prefix: %2\nUse %2help to see all commands."
    }
  },
  language: {
    description: "Show or change the bot language for this chat.",
    guide: "{pn}language [en | bn]",
    text: {
      current: "Current language for this chat: %1",
      set: "Language set to %1 for this chat.",
      invalid: "Invalid language. Use %1language en or %1language bn.",
      onlyAdmin: "Only group admins can change the language.",
      langNameEn: "English",
      langNameBn: "বাংলা"
    }
  }
};
