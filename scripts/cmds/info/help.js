module.exports = {
  config: {
    name: "help",
    aliases: ["h", "commands"],
    version: "1.0",
    role: 0,
    countDown: 3,
    description: "List all commands, or show details for one command.",
    category: "info",
    guide: "{pn}help [command]"
  },

  onStart: async function ({ api, event, args, message }) {
    const getLang = (event && typeof event.getLang === 'function') ? event.getLang : null;
    // Fall back to the current English strings if the handler never attached getLang.
    const t = (path, ...a) => {
      if (getLang) return getLang(path, ...a);
      return null;
    };
    const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || ".";
    const botName = (global.wabot && global.wabot.config && global.wabot.config.nickNameBot) || "WABOT";
    const commands = (global.wabot && global.wabot.commands) || new Map();

    // Single-command view: .help <name>
    if (args.length > 0) {
      const query = String(args[0]).trim().toLowerCase();
      const cmd = commands.get(query);
      if (!cmd || !cmd.config) {
        return message.reply(t('cmds.help.text.commandNotFound', query, prefix)
          || `No command named "${query}". Try ${prefix}help to see all commands.`);
      }
      const cfg = cmd.config;
      const lines = [
        `Command: ${prefix}${cfg.name}`,
        `Description: ${cfg.description || "—"}`,
        `Category: ${cfg.category || "—"}`,
        `Version: ${cfg.version || "—"}`,
        `Role: ${roleName(cfg.role, getLang)}`,
        `Aliases: ${(cfg.aliases && cfg.aliases.length > 0) ? cfg.aliases.join(", ") : "—"}`,
        `Usage: ${(cfg.guide || "{pn}" + cfg.name).replace(/\{pn\}/g, prefix)}`
      ];
      return message.reply(lines.join("\n"));
    }

    // Full list, grouped by category. The loader registers name + aliases in
    // one Map, so de-duplicate by module identity first.
    const seen = new Set();
    const byCategory = new Map();
    for (const cmd of commands.values()) {
      if (!cmd || !cmd.config || seen.has(cmd)) continue;
      seen.add(cmd);
      const cat = cmd.config.category || "other";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(cmd.config.name);
    }

    if (byCategory.size === 0) {
      return message.reply(t('cmds.help.text.noCommands') || "No commands loaded.");
    }

    const lines = [t('cmds.help.text.listHeader', botName, prefix) || `${botName} — Commands (prefix: ${prefix})`, ""];
    const categories = [...byCategory.keys()].sort();
    for (const cat of categories) {
      lines.push(`— ${cat} —`);
      lines.push(byCategory.get(cat).sort().map((n) => `${prefix}${n}`).join("  "));
      lines.push("");
    }
    lines.push(t('cmds.help.text.listFooter', prefix) || `Type ${prefix}help <command> for details about one command.`);
    return message.reply(lines.join("\n").trim());
  }
};

function roleName(role, getLang) {
  if (getLang) {
    if (role === 2) return getLang('cmds.help.text.roleText2');
    if (role === 1) return getLang('cmds.help.text.roleText1');
    return getLang('cmds.help.text.roleText0');
  }
  if (role === 2) return "bot admin";
  if (role === 1) return "group admin";
  return "everyone";
}
