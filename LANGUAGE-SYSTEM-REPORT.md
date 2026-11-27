# WhatsApp Bot — Advanced Language (i18n) System — Report

**Date:** 2026-11-27 ~14:47 SGT. **Status:** Built + verified in the working copy only. **NOT pushed.** The live bot was NOT restarted (per the task), so these changes take effect on its next restart.

**⚠️ Live-bot status at verification time:** the bot process is NOT running right now (no node processes on the VM; `/tmp/wabot*.log` files are gone — the VM appears to have been replaced, which wipes `/tmp` and kills processes). The session is intact on disk (`data/auth/creds.json`, `registered: True`), so a restart should reconnect automatically with NO new QR scan. To start it: `cd ~/workspace/whatsapp-bot && setsid nohup node index.js > /tmp/wabot-run8.log 2>&1 < /dev/null &`.

## What was built

A language system MORE advanced than the Messenger bot's. The Messenger bot has ONE global language from config (`"language": "en"`, `core/languages/en.lang` + `vi.lang`, loaded once into `global.language`). The WhatsApp system has:
- **Per-group language** (not one global language) — each group/chat has its own setting.
- **Full Bengali** — every string exists in both English and Bengali.
- **A `.language` command** to switch it.

## Files created

All under `~/workspace/whatsapp-bot/core/languages/`:

| File | Contents |
|---|---|
| `en.lang` | 15 system keys (English), same `head.key=value` format as Messenger, `%1` placeholders, `\n` escapes |
| `bn.lang` | Same 15 keys, real Bengali translations, placeholders in the same positions |
| `makeFuncGetLangs.js` | Loader (builtin `fs` + `path` only; no Messenger globals). Exports `loadLanguage(code)`, `loadLanguages()`, `getLang(lang, path, ...args)`, `createGetLang(lang)`, `SUPPORTED = ['en','bn']`, `DEFAULT_LANG = 'bn'` |
| `cmds/en.js` | Per-command strings: `help`, `prefix`, `language` |
| `cmds/bn.js` | Same structure, Bengali translations |
| `events/en.js` | Per-event strings: `welcome`, `leave` (session names, leave types, welcome message) |
| `events/bn.js` | Same structure, Bengali translations |

New command: `scripts/cmds/utility/language.js` — `.language` / `.lang`.

## The key lists (en vs bn)

**`.lang` files — 15 keys each (identical sets):**
- `handlerEvents.commandNotFound`, `commandNotFound2`, `commandSyntaxError`, `onlyAdmin`, `onlyAdminBot2`, `onlyCreator`, `waitingForCommand`, `errorOccurred`, `cannotFindCommandName`, `cannotFindCommand`
- `wabot.onlyBotAdmin`, `wabot.onlyGroup`, `wabot.onlyGroupAdmin`, `wabot.cooldown`, `wabot.commandError`

Facebook-only Messenger keys were skipped (login.*, Goat version, fbstate/GBAN, socketIO, dashboard, updater). No premium keys (the WhatsApp bot has no premium system).

**`cmds` — help / prefix / language** (description, guide, text strings). ** `events` — welcome / leave** (session1–4, multiple1–2, welcomeMessage, leaveType1–2). These mirror the Messenger `cmds/en.js` + `events/en.js` shapes but only the keys the WhatsApp bot uses.

**Total leaf keys: 48 in en, 48 in bn — zero missing in either direction.**

## How per-group language works

- Stored per thread in the DB: `threadsData.set(threadID, code, 'settings.language')`, code `'en'` or `'bn'`. Default is `'bn'` (Irfan's users speak Bengali; the Messenger bot defaults to `'en'`).
- The handler (`core/handler/handlerMessage.js`) resolves the thread's language on EVERY message (right after the context is built, before the command path) and attaches `event.language` + `event.getLang` (a `createGetLang(threadLang)` bound function) to the event object. Commands call `event.getLang('path.to.key', arg1, arg2)`.
- Fallback chain: thread language → `'en'` (if a key is missing in bn, the English string is used) → `Can't find text: "path"` (never crashes, never shows a raw key). `getLang` never throws.
- The loader loads both languages once at startup (`loadLanguages()` in `WABOT.js` `start()`, after `db.init`) and caches them. It also lazy-loads on first use.
- The welcome event keeps its current (already Bengali) template — it was NOT rewired. The `events/*.js` files are the translation resource for when events are migrated.

## System messages now localized (handler)

These 5 previously hardcoded replies in `handlerMessage.js` now use `event.getLang`:
- `wabot.onlyBotAdmin` — role-2 denial
- `wabot.onlyGroup` — role-1 command used outside a group
- `wabot.onlyGroupAdmin` — role-1 command used by a non-admin
- `wabot.cooldown` — cooldown (`%1` = seconds, `%2` = `prefix+command`)
- `wabot.commandError` — command `onStart` threw

Unknown commands stay silent (no behaviour change). `help.js` (list header/footer, no-commands, single-command-not-found, role names) and `prefix.js` (reply) now use `cmds.help.*` / `cmds.prefix.*` via `event.getLang`, with the previous English strings as fallback if `getLang` is ever missing.

## How to use `.language`

- `.language` — shows the current language for this chat (in the current language).
- `.language en` / `.language bn` — sets it. In a GROUP, only a group admin (or bot admin) can change it; anyone can view. In a 1:1 DM, anyone can change their own chat's language.
- The confirmation is sent in the NEW language; errors (invalid code) are in the CURRENT language.
- Works in groups and 1:1 chats (per-thread setting either way).

## Verification (coordinator, independent — 14/14 passed)

- `node --check`: **10/10** (all 7 new files + `handlerMessage.js`, `help.js`, `prefix.js`, `WABOT.js`).
- Mock test (`/tmp/lang-verify-coord.js`, real loader + real loader, mock threadsData): **14 passed, 0 failed** — `loadLanguages()` returns both stores; en-vs-bn 48/48 keys, 0 missing; `getLang('bn','handlerEvents.commandNotFound','foo','.')` returns the Bengali text with both placeholders substituted; fallback verified by in-memory deletion (bn key removed → English string returned); nonsense path returns `Can't find text` without throwing; `createGetLang` binds correctly; the real loader loads **136 entries** (was 134; +2 = `language` + `lang` alias) with 0 failures; `.language` onStart view/set/invalid all pass (view shows বাংলা, set to `en` saves `settings.language === 'en'` and confirms in English, invalid code errors); handler/WABOT.js/help/prefix wiring strings all present in source.
- Worker A mock test: 14/14 passed (same coverage plus `\n` handling and null-input safety). Worker B mock test: 27/27 passed (full end-to-end handler run incl. group-admin gating and cooldown localization).
- **No Vietnamese anywhere:** no `vi.lang`, no Vietnamese strings (grep confirms). Only English + Bengali.
- **Not touched:** `data/auth/`, `config.json`, `package.json`, `core/connection/`, `core/database/db.js`. No new dependencies. No live-bot restart.

## One spec deviation (real bug in the task text, fixed by Worker B)

The task text gave `require('../../core/languages/makeFuncGetLangs')` for the language command, but `language.js` lives in `scripts/cmds/utility/` — that path resolves to the nonexistent `scripts/core/languages/...`, so the require threw. Worker B used the correct depth, `require('../../../core/languages/makeFuncGetLangs')`, in both places in `language.js` (with a comment noting why). The handler (`../languages/…`) and `WABOT.js` (`./core/languages/…`) paths in the spec were correct as given.

## What Irfan can test (after the next restart)

1. `.language` → shows `এই চ্যাটের বর্তমান ভাষা: বাংলা` (default is Bengali).
2. `.language en` (as a group admin) → confirms in English, then `.prefix` / `.help` / a cooldown or role error replies in English.
3. `.language bn` → confirms in Bengali, replies switch back to Bengali.
4. A non-admin running `.language en` in a group → gets the Bengali "only group admins" message and nothing is saved.
5. Restart the bot → the per-group language persists (it lives in the DB, not in memory) and the bot reconnects without a QR (session `registered: True`).

## Open items

- The live bot needs a restart for any of this to take effect (and, at verification time, it is not running at all — see the note at the top; the session on disk is intact).
- The `events/*.js` welcome/leave strings are not yet wired into `scripts/events/welcome.js` (kept its current template deliberately — a clean swap for a future pass).
- Push to GitHub is held (working copy only, per the standing order).
