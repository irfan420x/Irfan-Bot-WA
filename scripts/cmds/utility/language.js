'use strict';
/**
 * scripts/cmds/utility/language.js — .language / .lang
 *
 * Show or change the bot language for this chat ('en' | 'bn').
 * The language is stored per thread in the DB at settings.language
 * (default 'en') and resolved per message by core/handler/handlerMessage.js,
 * which attaches event.language and event.getLang.
 *
 * In a group, changing the language needs a group admin or a bot admin.
 * In a 1:1 DM anyone may change their own chat's language.
 */

function fallbackGetLang(lang) {
  try {
    // NOTE: language.js lives in scripts/cmds/utility/, so the loader is
    // three levels up (../../../core/...), not two.
    return require('../../../core/languages/makeFuncGetLangs').createGetLang(lang || 'en');
  } catch (_) {
    // Loader not available yet — minimal English/Bengali fallback so the
    // command never crashes.
    return (path) => `Can't find text: "${path}"`;
  }
}

function isBotAdmin(config, senderID) {
  if (!config) return false;
  const admins = (config.adminBot || []).map(String);
  return admins.includes(String(senderID)) || String(config.owner) === String(senderID);
}

module.exports = {
  config: {
    name: "language",
    aliases: ["lang"],
    version: "1.0",
    role: 0,
    countDown: 3,
    description: "Show or change the bot language for this chat.",
    category: "utility",
    guide: "{pn}language [en | bn]"
  },

  onStart: async function ({ api, event, args, message, threadsData }) {
    const getLang = (event && typeof event.getLang === 'function')
      ? event.getLang
      : fallbackGetLang('en');
    const prefix = (global.wabot && global.wabot.config && global.wabot.config.prefix) || '.';
    const current = (event && event.language) || 'en';

    const displayName = (code) => code === 'en'
      ? getLang('cmds.language.text.langNameEn')
      : getLang('cmds.language.text.langNameBn');

    // No args: show the current language.
    if (!args || args.length === 0) {
      return message.reply(getLang('cmds.language.text.current', displayName(current)));
    }

    const code = String(args[0] || '').trim().toLowerCase();
    if (code !== 'en' && code !== 'bn') {
      return message.reply(getLang('cmds.language.text.invalid', prefix));
    }

    // Changing the language in a group needs a group admin or a bot admin.
    if (event.isGroup) {
      let allowed = false;
      try {
        const info = await api.getThreadInfo(event.threadID);
        allowed = (info.adminIDs || []).includes(String(event.senderID));
      } catch (_) {
        allowed = false;
      }
      if (!allowed && global.wabot && global.wabot.config && isBotAdmin(global.wabot.config, event.senderID)) {
        allowed = true;
      }
      if (!allowed) {
        return message.reply(getLang('cmds.language.text.onlyAdmin'));
      }
    }

    await threadsData.set(event.threadID, code, 'settings.language');

    // Confirm in the NEW language.
    const newGetLang = fallbackGetLang(code);
    return message.reply(newGetLang(
      'cmds.language.text.set',
      newGetLang('cmds.language.text.' + (code === 'en' ? 'langNameEn' : 'langNameBn'))
    ));
  }
};
