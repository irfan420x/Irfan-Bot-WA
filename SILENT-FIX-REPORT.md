# Silent-response fix — verification note (research run, 2026-11-27 ~18:25 SGT)

User complaint (WhatsApp side chat, 2026-11-27 18:18–18:19 SGT): the bot stayed
silent on a bare prefix, on unknown/mistyped commands, on commands that error,
and on group commands typed in a DM — "তুমাকে সব কিছু বিলে বলে দিতে হয় কেন".

## What is in the working copy now

`core/handler/handlerMessage.js` (edited 10:23 UTC, i.e. after the complaint):

- Bare prefix (`.` alone) → replies `wabot.prefixHint` ("Hi! I'm WABOT. Type
  .help…", Bengali version in bn.lang).
- Unknown command → replies `wabot.unknownCommand` + `wabot.didYouMean`
  suggestion from `findClosestCommand` (Levenshtein, e.g. `.slto` → `.slots`).
- Reply-flow (`onReply`) errors → now replies `wabot.replyError` (previously
  the catch only logged — silent).
- Denials (bot-admin / group-only / group-admin / cooldown) now go through
  `safeReply`; role-1 group commands in a DM already replied
  `wabot.onlyGroup` — verified in code, so the DM silence the user saw was
  most likely the unknown-command / bare-prefix cases above.
- New lang keys added to both `core/languages/en.lang` and `bn.lang`:
  `wabot.replyError`, `wabot.prefixHint`, `wabot.unknownCommand`,
  `wabot.didYouMean`.

## Verified in this run (read-only checks, 10:24 UTC)

- `node --check core/handler/handlerMessage.js` — OK.
- All six new/used `wabot.*` keys resolve in both `en` and `bn` via
  `createGetLang` (no "Can't find text").
- `node tests/adapter.test.js` — 16 passed, 0 failed.

## Still owed (NOT done here — do not mistake this note for the live fix)

1. **Restart** — the live bot (PID 8541, started 10:16 UTC) is still running
   the pre-fix code; the 10:23 handler edit is not live until restart.
2. **Live test** after restart: `.` alone, `.slto`, `.kick @x` in a DM,
   and one command that errors — each must produce a reply.
3. **Cleanup** — this research run added a duplicate `levenshtein` +
   `suggestCommand` block (~lines 355–405) before noticing the main agent
   was editing the same file live; the main agent's `findClosestCommand` /
   `levenshtein` (~lines 416+) is the one actually used. Remove the duplicate
   block in a quiet moment. It is harmless (duplicate function declarations,
   last wins, same algorithm) and `node --check` passes — do not edit the
   file while the main agent is working on it.
4. **Push** — cards, API-smart, MongoDB, and now this fix are all still
   working-copy-only; the public repo is at ca85868f. Push only on Irfan's
   "push করো".
