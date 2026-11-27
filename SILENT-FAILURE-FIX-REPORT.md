# Silent-Failure Fix Report — WhatsApp Bot

**Date:** 2026-11-27 ~18:20 SGT
**Trigger:** Irfan — the bot stays silent when it should answer: prefix-only, wrong command, command errors, group command in a DM. ("তুমাকে সব কিছু বিলে বলে দিতে হয় কেন / একজন প্রফেশনাল সিনিয়র ডেভেলপার হিসাবে কাজ করতে পারো না")
**Scope:** whole handler path audited (`core/handler/handlerMessage.js`, `core/handler/handlerEvents.js`, the `_wa.js` adapter, the loader, and every command's arg/error branches). Working copy only — live bot NOT restarted, nothing pushed.

## 1. Audit — every path where the bot receives a message and replies nothing

Probed with the REAL handler + REAL loader + REAL adapter and a mock socket (baseline run, before any fix). Results:

| # | Case | Baseline | Verdict |
|---|------|----------|---------|
| 1 | Prefix-only (`.` / `.   `) | NO reply | **SILENT — fixed** |
| 2 | Unknown command (`.slto`, `.asdfgh`) | NO reply | **SILENT — fixed** |
| 3 | `onStart` throws/rejects | "Something went wrong…" + ❌ + typing cleared | Already fine |
| 4 | `onReply` throws/rejects | ❌ reaction + log only, NO text | **SILENT — fixed** |
| 5 | Group-only (role 1) command in a DM | "This command only works in groups." | Already fine |
| 6 | Group-only command, non-admin sender | "This command is for group admins only." | Already fine |
| 7 | Bot-admin-only (role 2), non-admin sender | "This command is for bot admins only." | Already fine |
| 8 | Cooldown hit | "Slow down — wait …s" | Already fine |
| 9 | Bad/missing args (`.slots`, `.coinflip`, `.dice`, `.wheel`, `.bank`, `.balance transfer`, `.account`, `.lottery`, `.poll`, `.help <bad>`, `.language <bad>`, `.translate` fail) | Every one replies with usage / invalid-arg / error text | Already fine (verified by code audit + mock for slot/coinflip/bank) |
| 10 | `message.reply` inside a command fails (transport) | Unhandled promise rejection if un-awaited; handler catch if awaited | Mitigated — see §2.4 |
| 11 | Delayed results (slot/mine setTimeout callbacks) | `slot.js` final timeout had an EMPTY `catch {}` — a throw there left the user staring at "Spinning…" forever; `mine.js` reveal catch only logged | **SILENT — fixed** |
| 12 | Plain chatter (no prefix) | NO reply | Correct — by design, unchanged |
| 13 | Reply to a game message by the WRONG user (`entry.author` mismatch) | NO reply | Correct — by design (prevents group spam), unchanged |
| 14 | DM-only command used in a group | No DM-only command exists; the role system has no DM-only flag | Nothing to fix (noted) |
| 15 | Commands' own `catch` blocks | Audited all 79 commands: error branches reply (AI, image, fun, love, admin, economy all reply on failure). Remaining `catch {}` are best-effort helpers (avatar/name lookup, unsend cleanup) that fall through to a reply later | Already fine |
| 16 | Handler's own denial replies (`return message.reply(...)`) | If that send itself threw, the rejection escaped the handler (caught+logged by `handlerEvents.js`, user got nothing) | Mitigated — see §2.4 |

**Why Irfan hit silence in practice:** cases 1 and 2 are the ones a user hits constantly (a lone "." and any typo). Case 4 bites on reply-games (quiz/flag/guessnumber) when the reply handler errors. Case 11 bites when a delayed result fails. Cases 5–9 already replied — his "group command in inbox" report was most likely the prefix-only/typo silence happening right next to a group-command attempt, or a command whose send failed (case 10/16).

## 2. Fixes

### 2.1 Prefix-only → hint (`core/handler/handlerMessage.js`)
`.` or `.   ` now replies (thread language): `👋 Hi! I'm ORION. Type .help to see my commands.` / bn: `👋 হাই! আমি ORION। কমান্ড দেখতে .help লিখো।` — new key `wabot.prefixHint`.

### 2.2 Unknown command → reply + did-you-mean (`core/handler/handlerMessage.js`)
`.slto` now replies: `❓ Unknown command "slto". Type .help to see all commands. Did you mean ".slots"?` — new keys `wabot.unknownCommand`, `wabot.didYouMean`. Matching is Damerau-Levenshtein (adjacent transposition costs 1) over all command names + aliases, distance ≤ 2, token length ≥ 3, ties break toward the longer shared prefix, suggestion is the canonical name. Plain Levenshtein was tried first and suggested the WRONG command (".slto" → ".set", both distance 2) — the transposition-aware distance fixes it. Gibberish (`.asdfgh`) gets the unknown reply with no suggestion. Non-command chatter (no prefix) still gets no reply.

### 2.3 `onReply` errors → user-facing reply (`core/handler/handlerMessage.js`)
The reply-path catch now replies `wabot.replyError` ("Something went wrong with that reply. Please try again." / bn equivalent) in addition to logging; the finally still reacts ❌ and clears typing (`paused`).

### 2.4 Handler replies can never crash the handler (`core/handler/handlerMessage.js`)
New `safeReply(message, text)` helper: every reply the handler itself sends (prefix hint, unknown command, role denials, cooldown, command error, reply error) goes through it — a failed send is logged (`[WABOT] handler reply failed: …`) and never throws out of the handler. No behaviour change on success.

### 2.5 Delayed-result fallbacks (`scripts/cmds/game/slot.js`, `scripts/cmds/game/mine.js`)
- `slot.js`: the final result timer had an empty `catch {}`. Now a synchronous failure sends the plain-text result as a fallback, and a rejected result send also falls back to the text result (the spin frame is already unsent by then, so the user still gets exactly one answer).
- `mine.js`: the reveal timer's catch only logged. Now it also sends `❌ Couldn't reveal the mines — check your balance with .bal and try again.` (the stake was already deducted, so the user is told where to check).
- `wheel.js` needed no fix: its result is computed inside the awaited `onStart` (the `sleep(1900)` is awaited), so a throw there is already caught by the handler.

### 2.6 New language keys (`core/languages/en.lang`, `core/languages/bn.lang`)
`wabot.prefixHint`, `wabot.unknownCommand`, `wabot.didYouMean`, `wabot.replyError` — all four resolve in both languages (verified via `getLang`).

### Not changed
No command's successful behaviour, names, aliases, roles, or DB keys. No new dependencies. All new replies go through `message.reply` (guarded send path). Reply-game author-mismatch silence and plain-chatter silence are intentional and unchanged.

## 3. Verification (mock harness, real handler/loader/adapter, mock socket)

- `node --check` on all 3 changed JS files — **0 failures**.
- Real loader: **150 entries, 0 failed** (unchanged).
- Language keys: all 4 resolve in en + bn.
- Mock end-to-end: **17 PASS, 0 FAIL** —
  1. prefix-only → hint; 2. `.slto` → unknown + did-you-mean `.slots`; 3. `.asdfgh` → unknown, no suggestion; 4. throwing command → error + ❌; 5. role-1 in DM → group-only; 6. non-admin → reason; 7. role-2 non-admin → reason; 8. cooldown → reason; 9. bad args (`.slots`, `.coinflip`, `.bank`) → usage/invalid; 10. onReply throws → error reply + ❌; 11. plain chatter → stays silent; 12. prefix-only + unknown in a bn thread → Bengali replies with did-you-mean; 13. slot flow still **[TEXT, EDIT, EDIT, DELETE, IMAGE]** with short caption ("↩️ Again: .slots 100").
- The slot/mine fallback paths are code-verified (they only run when the primary result send fails); the normal flows are covered by the mock run above.

## 4. Still needs a live test (after the next restart)
- Send `.` alone, `.slto`, and a gibberish `.xyz` in a real group — expect the hint / unknown + suggestion replies.
- Reply-game error path and the slot/mine fallbacks only show under real failure conditions; normal play is already verified by mock.
