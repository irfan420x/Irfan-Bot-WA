# CARD-STYLE-REPORT — WhatsApp bot gets real ORION cards

Date: 2026-11-27 ~17:45 SGT (09:45 UTC). Working copy only — **NOT pushed to GitHub, live bot NOT restarted** (it still serves the old text replies until its next restart; the card code loads then).

## 1. What was installed

- **`canvas` 3.2.3** — `npm install canvas` in `~/workspace/whatsapp-bot/` (34 packages, prebuilt binary, exit 0). Only `package.json` + `package-lock.json` changed for this. System libs (libcairo, libpango, libjpeg) were already present, so no build was needed.
- Verified: `require('canvas')` works, `createCanvas` produces a valid PNG (magic bytes `89 50 4E 47`).
- **Balance card check (pre-existing lazy-canvas path):** `scripts/cmds/economy/balance.js` already lazy-required canvas inside try/catch. With canvas now installed it renders — **81,769 bytes, valid PNG**. No bug fix was needed there.

## 2. Shared helper — `scripts/cmds/_card.js` (new, 10,483 bytes)

One place for the ORION brand so no command copy-pastes canvas code. Style matches the Messenger bot's balance card: dark slate gradient (`#0F172A` → `#1E293B`), purple (`#8B5CF6`) glow, rounded inner panel, `ORION • DD/MM/YYYY` footer.

Exports: `BRAND` (palette), `getCanvas()` (lazy require, null when absent), `newCard(w,h,opts)`, `roundedRect`, `title`, `pill`, `pillTextColor`, `bar` (usage bar with % label), `statRow`, `truncate`, `isImageBuffer`, `fetchAvatar(sock, jid)` (via `sock.profilePictureUrl`, 10s timeout, null when no picture), `loadImageSafe(buf)`, `drawAvatar` (circle image, or gradient + first-letter fallback), `drawStar` (⭐ is invisible as canvas text — drawn as a path), `footer`, `botName`, `toPng`.

Font rule: `"sans-serif"` only. Emoji note (verified on this host with a render test): fruit emoji (🍒🍋🍇🍉) render monochrome white, `7️⃣` renders as a white keycap box with "7", but ⭐/✨/💰 are **invisible** in canvas text — cards use plain text labels and `drawStar()` instead.

## 3. Commands / events converted (text → card)

Every converted command keeps its existing text message as the message `body` with the card attached (`{ body, attachment: { buffer, mimetype: "image/png", fileName } }`), and falls back to text-only inside try/catch if rendering fails. Names, aliases, roles, cooldowns, DB keys, payout logic and reply chains are unchanged.

| File | Card | Before → After |
|---|---|---|
| `info/userinfo.js` | 1000×520 USER INFO: avatar (purple ring) left, name/ID, Money/Level/Exp rows, Group Admin/Nickname/Messages on the right (group only) | Text block + raw avatar photo → text + rendered card (avatar inside the card). Removed now-unused `https`/`fetchBuffer` helpers; kept `toBold`. |
| `utility/time.js` | 1000×420: big HH:MM:SS (~90px), date line, 12h time + Asia/Dhaka | Plain text time → text + card. Wait-message + unsend flow kept. |
| `utility/system.js` | 1000×580 SYSTEM INFO: RAM/CPU/Disk usage bars, Sys/Bot Uptime, Cores, Node.js, Date, Time | Text box → text + card. Same stat gathering. |
| `utility/uptime.js` | 1000×540 SYSTEM STATUS: big uptime, CPU/RAM/Disk bars, Users/Groups, Speed ms | Text box → text + card. Speed captured once so text and card agree. |
| `utility/calendar.js` | 1000×640: month title, Mo–Su header, 7-column grid, today = purple-filled cell | Text calendar → text + card. Reuses the file's own grid math (`getMonthData()` extracted, output unchanged). |
| `game/coinflip.js` | 900×480 COIN FLIP: pick vs result, green WIN / red LOSE banner, old → new balance, won/lost amount | Text result → text + card. Payout logic untouched. |
| `game/slot.js` | 1000×580 SLOT MACHINE: 3 reel boxes (fruit emoji as text, ⭐ via `drawStar`, 7-keycap as text), JACKPOT (gold) / YOU WIN (green) / YOU LOSE (red) banner, won/lost, near-miss, balance, Today play/limit, streak | Text result → text + card, **on the result message only** (spin frame stays text). Card buffer is rendered before the spin frame is sent; the 1.8s `setTimeout` callback still uses it (or text only). Paytable/limits/stats and the info/top text replies untouched. |
| `events/welcome.js` | Batch welcome card (already existed) | **No change needed.** Its canvas path + `sock.profilePictureUrl` avatars already worked; with canvas installed it renders. Verified: fallback (initial letters) 117,176 bytes; with a real avatar 124,908 bytes. Visually checked — clean. |
| `economy/balance.js` | 1000×500 balance card (already existed) | **No change needed.** Lazy-canvas path now renders (81,769 bytes). |

Each of `calendar.js`, `coinflip.js`, `slot.js` also exports its render function (`_renderCalendarCard`, `_renderCoinflipCard`, `_renderSlotsCard`) for testing only.

## 4. Verification (independent re-run by me, not the workers' numbers)

- `node --check` on all 8 changed files (`_card.js`, `userinfo.js`, `time.js`, `system.js`, `uptime.js`, `calendar.js`, `coinflip.js`, `slot.js`): **0 failures**.
- Real loader run: `loader.loadCommands()` → **136 commands, 0 failed** (same count as before the change). All converted commands present, `profile` alias maps correctly.
- Every card rendered to `/tmp/verify-*.png` and checked for PNG magic bytes + size — **13/13 PASS**:

| Card | Size |
|---|---|
| userinfo-fallback (no picture → initial "V") | 105,087 bytes |
| userinfo-avatar (real picture) | 81,240 bytes |
| time | 68,586 bytes |
| system | 81,441 bytes |
| uptime | 72,705 bytes |
| calendar (Nov 2026, today 27 highlighted) | 89,044 bytes |
| coinflip-win | 81,759 bytes |
| coinflip-lose | 80,624 bytes |
| slots-jackpot (7/7/7, 10×) | 76,281 bytes |
| slots-win (🍒🍒🍒, 5×) | 78,843 bytes |
| slots-lose (mixed) | 76,388 bytes |
| slots-star (⭐⭐⭐ via drawStar) | 81,175 bytes |
| slots-e2e (live onStart flow: spin frame + result card) | 76,762 bytes |

- **Avatar-fallback mock test: PASS.** `sock.profilePictureUrl` throwing (no picture) still produces a valid card with the initial-letter circle — no crash, no text-only fallback. The with-avatar mock also renders correctly.
- **Slot live flow verified end-to-end:** `onStart` sends 2 messages (spin frame text, then result with card attached); the result body shows the correct `Today: 1/20`.
- Visually inspected: userinfo, slots-jackpot (corrected), calendar, welcome-fallback — layouts clean, no overlap or clipping. Calendar grid is correct (1 Nov 2026 is a Sunday; today 27 highlighted purple).
- Live bot untouched: supervisor PID 2306 + worker PID 2314 still running, connected as 6586721081:54 (log: "Bot is online"). A transient Baileys 408 "init queries" error appears in the log at 09:36 UTC — non-fatal, process did not crash or restart.

## 5. Deliberately left text-only (and why)

- **`boxchat/count` / rank — does not exist in this bot.** There is no `boxchat/` folder and no command named `count`, `rank`, or `top` in the WA bot (only a `top` subcommand inside `slot.js`, which stays text). Nothing to convert.
- **`slot.js` info/top subcommands** — text leaderboards/stats, left as-is per scope (card is for the spin result only).
- **All other commands** (help, prefix, irfan, tart, pinterest, bank, daily, games, fun/love, image, prayer, admin, etc.) — out of scope for this task; they keep their existing text replies. The `_card.js` helper is ready for them whenever wanted.
- **The 7-keycap reel** renders as a white box with "7" plus a tiny keycap artifact at the top-left corner — readable, cosmetic only, left as-is.

## 6. Notes / gotchas found during verification

- One "FAIL" in my first harness run (`slots-e2e: null bytes`) was a bug in **my test script** (the check line read `slotAtt.buffer` instead of `slotAtt.attachment.buffer`); the saved file was a valid 76,762-byte PNG. Likewise the "Today: undefined/20" seen on one test render came from **my test passing the wrong arg shape** (`todayStats: {play}` instead of the `todayPlay` the render function takes); the real `onStart` path passes `todayPlay` correctly and the live-flow card shows `Today: 1/20`. Neither was a bug in the shipped code — both re-verified with correct inputs.
- The live bot started at 09:35 UTC, before these edits landed (~09:41–09:42 UTC), so it serves the old text replies until it is next restarted. Restart is the parent agent's / Irfan's call — **I did not restart it**.
- `package.json` now lists `"canvas": "^3.2.3"` (the only dependency change). No other `package.json` changes.
