// Language loader for the WhatsApp bot (WABOT).
// Loads .lang files (head.key=value, %1 placeholders, \n escape) plus the
// per-command / per-event JS string modules, into a store per language.
// English + Bengali only — no Vietnamese anywhere.
//
// Store shape:
//   {
//     handlerEvents: { commandNotFound: "...", ... },
//     wabot: { ... },
//     cmds: { help: { description, guide, text: {...} }, ... },
//     events: { welcome: { text: {...} }, ... }
//   }
//
// getLang(lang, path, ...args) resolves a dotted path in the requested
// language, falls back to English when the key is missing there, and never
// throws — a missing key in both languages returns: Can't find text: "path"

const fs = require('fs');
const path = require('path');

const SUPPORTED = ['en', 'bn'];
const DEFAULT_LANG = 'en';

const LANG_DIR = __dirname;

// In-memory cache: { en: store|null, bn: store|null }
const cache = { en: null, bn: null };

/**
 * Parse one .lang file into { head: { key: value } }.
 * Rules (mirrors the Messenger bot loader):
 *  - skip empty lines and lines starting with '#' or '//'
 *  - split on the FIRST '='
 *  - head = part before the first '.', key = the rest
 *  - '\n' escape in the value becomes a real newline
 * A missing/unreadable file yields an empty object (never throws).
 */
function parseLangFile(filePath) {
  const store = {};
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return store;
  }
  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('//')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const fullKey = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).replace(/\\n/gi, '\n');
    const dotIdx = fullKey.indexOf('.');
    if (dotIdx === -1) continue;
    const head = fullKey.slice(0, dotIdx);
    const key = fullKey.slice(dotIdx + 1);
    if (!head || !key) continue;
    if (!store[head]) store[head] = {};
    store[head][key] = value;
  }
  return store;
}

/**
 * Load one JS string module (cmds/<code>.js or events/<code>.js).
 * A missing/broken module yields an empty object (never throws).
 */
function loadJsModule(filePath) {
  try {
    const mod = require(filePath);
    if (mod && typeof mod === 'object') return mod;
  } catch (_) {
    // fall through
  }
  return {};
}

/**
 * Load + cache the store for one language code ('en' | 'bn').
 * Unknown codes fall back to the default store build for that code
 * (an empty store, so getLang falls back to English).
 * Returns the store object.
 */
function loadLanguage(code) {
  if (!SUPPORTED.includes(code)) code = DEFAULT_LANG;
  if (cache[code]) return cache[code];

  const store = parseLangFile(path.join(LANG_DIR, `${code}.lang`));
  store.cmds = loadJsModule(path.join(LANG_DIR, 'cmds', `${code}.js`));
  store.events = loadJsModule(path.join(LANG_DIR, 'events', `${code}.js`));

  cache[code] = store;
  return store;
}

/**
 * Load both 'en' and 'bn' once (cached) and return { en, bn }.
 */
function loadLanguages() {
  return {
    en: loadLanguage('en'),
    bn: loadLanguage('bn')
  };
}

/**
 * Walk a dotted path through a store object.
 * Returns the string value, or undefined if any segment is missing
 * or the final value is not a string.
 */
function resolvePath(store, dottedPath) {
  try {
    if (!store || typeof dottedPath !== 'string' || !dottedPath) return undefined;
    const parts = dottedPath.split('.');
    let cur = store;
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[part];
    }
    return typeof cur === 'string' ? cur : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Substitute %1, %2, ... (1-based) with the given args, all occurrences.
 * An arg that is undefined/null becomes an empty string.
 */
function substitute(text, args) {
  return text.replace(/%(\d+)/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    if (idx >= 0 && idx < args.length && args[idx] !== undefined && args[idx] !== null) {
      return String(args[idx]);
    }
    return match;
  });
}

/**
 * Resolve a dotted path in the requested language's store.
 * Falls back to the 'en' store when the key is missing there.
 * Never throws; missing in both languages -> Can't find text: "path"
 */
function getLang(lang, dottedPath, ...args) {
  try {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;

    let text = resolvePath(loadLanguage(lang), dottedPath);
    if (text === undefined && lang !== 'en') {
      text = resolvePath(loadLanguage('en'), dottedPath);
    }
    if (text === undefined) {
      return `Can't find text: "${dottedPath}"`;
    }
    return substitute(text, args);
  } catch (_) {
    return `Can't find text: "${dottedPath}"`;
  }
}

/**
 * Returns a bound getter for one language:
 *   const t = createGetLang('bn'); t('handlerEvents.commandNotFound', 'foo', '.')
 */
function createGetLang(lang) {
  if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
  return (dottedPath, ...args) => getLang(lang, dottedPath, ...args);
}

module.exports = {
  loadLanguage,
  loadLanguages,
  getLang,
  createGetLang,
  SUPPORTED,
  DEFAULT_LANG
};
