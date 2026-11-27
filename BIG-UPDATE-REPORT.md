# WhatsApp Bot — BIG UPDATE Report (2026-11-27)

**Order:** Irfan — port the Messenger bot's breadth of features to WhatsApp, "like our Messenger bot".
**Status:** CODE DONE, working copy only. **NOT pushed to GitHub.** No live-bot test run (the live bot was not restarted; see "Not verified").
**Working copy:** `/home/hatch/workspace/whatsapp-bot/`
**Coordinator:** 5 parallel workers (economy / games / fun+love / image+utility / AI), verified independently by the coordinator.

## Headline numbers

| Check | Result |
|---|---|
| Commands before | 19 distinct |
| Commands after | **71 distinct** (52 ported) |
| Loader entries (names + aliases) | **134** |
| Loader failures | **0** |
| `node --check` (all 88 JS files: cmds + core + events + entry) | **88 PASS, 0 FAIL** |
| New dependencies | **0** (package.json unchanged) |
| Live session / config touched | **No** (data/auth/, config.json untouched) |

## Commands ported (52)

### Economy (5) — `scripts/cmds/economy/`
| Command | Source | Notes |
|---|---|---|
| `.bank` (alias `wallet`) | Messenger `economy/bank.js` | balance / deposit / withdraw / loan / repay / top. Loan limit 1,000,000, no interest/deadline — unchanged. |
| `.diamond` (aliases `dm`, `dia`) | Messenger `economy/diamond.js` | view / add / delete / transfer. Diamonds now in top-level `diamond` field (no `getDiamond` helper on WA). |
| `.lottery` (aliases `lotto`, `jackpotgame`) | Messenger `economy/lottery.js` | Prize grid intact (0 / 10,000 / 20,000 / 100,000). |
| `.account` (alias `acc`) | Messenger `economy/account.js` | info / shop / premium buy / convert. |
| `.set` (alias `st`) | Messenger `economy/set.js` | Set money/exp, incl. `@everyone` (only members below 1000). **Role changed: Messenger was owner-only; WA port is role 2 (adminBot + owner).** |

### Games (11) — `scripts/cmds/game/`
All payouts, odds, limits, and cooldowns unchanged from the Messenger originals.

| Command | Source | Notes |
|---|---|---|
| `.candycrush` (`.cc`) | Messenger `game/candycrush.js` | State in module Map (was `global.irfbotCandy`). |
| `.colorpick` (`.cp`) | Messenger `game/colourpick.js` | Reply entry deleted after first valid pick (original could be answered twice). |
| `.dhbc` | Messenger `game/dhbc.js` | Hint pictures via axios; English strings hardcoded. |
| `.dice` (`.dg`, `.dicegame`, `.rolldice`, `.dicebet`) | Messenger `game/dice.js` | |
| `.flagquiz` (`.flag`, `.fqz`, `.flagguess`) | Messenger `game/flag.js` | Local `data/flagCountries.json` (197 countries, copied) + flagcdn. NoobCore fallback skipped. Bold-font headers dropped (no ncsfont on WA). |
| `.guess` | Messenger `game/guess.js` | |
| `.guessnumber` (`.guessnum`) | Messenger `game/guessnumber.js` | Canvas board → text board. Ranks per-user in `user.data.guessNumberRank`; leaderboard from `usersData.getAll()`. |
| `.mine` | Messenger `game/mine.js` | Tile reveal is a separate message (no `api.editMessage` on WA). |
| `.quiz` (`.qz`) | Messenger `game/quiz.js` | OpenTDB only (entity decoding + A–D shuffle kept). NoobCore fallback skipped. |
| `.scramble` (`.ws`, `.wordgame`) | Messenger `game/scramble.js` | Open to anyone (first right answer wins). |
| `.wheel` | Messenger `game/wheel.js` | **BANKRUPT-fee quirk kept exactly:** fee shown but payout clamped at 0, so it is never actually deducted. Segments, probabilities, 2% jackpot contribution, 50–150% jackpot payout, streak bonus, 25-spins/12h limit unchanged. |

### Fun (6) + Love (3) — `scripts/cmds/fun/`, `scripts/cmds/love/`
Shared helper: `fun/_funImage.js` (ORION fun-image POST, NoobCore fallback, avatar fetch, target resolvers). Avatars via `sock.profilePictureUrl(bareId + "@s.whatsapp.net")` with try/catch.

| Command | Source | Notes |
|---|---|---|
| `.wanted` | Messenger `fun/wanted.js` | ORION C1 `wanted {avatars:[url]}`, NoobCore fallback. |
| `.kicked` | Messenger `fun/kicked.js` | ORION C1 `kicked {avatars:[kicker, kicked]}`, NoobCore fallback. |
| `.mistake` | Messenger `fun/mistake.js` | ORION C1 `mistake {uid}` — **UID is now a WhatsApp phone number, not a Facebook UID; the rendered avatar will likely be wrong/a silhouette until an avatars-based mistake template exists.** |
| `.emojimix` (alias `mix`) | Messenger `fun/emojimix.js` | ORION C1 `emojimix {emojis:[e1,e2]}`, NoobCore fallback. |
| `.mnm` | Messenger `fun/mnm.js` | azad public API `/api/mnm?image=<WA avatar URL>`. |
| `.nokia` | Messenger `fun/nokia.js` | azad public API `/api/nokia?image=<WA avatar URL>`. |
| `.hug` | Messenger `love/hug.js` | ORION C1 `hug {avatars:[a1,a2]}`, NoobCore fallback. |
| `.kiss` | Messenger `love/kiss.js` | ORION C1 `kiss {avatars:[a1,a2]}`, NoobCore fallback. |
| `.pair2` (aliases `lovepair2`, `match2`) | Messenger `love/pair2.js` | ORION C1 `pair2 {avatars:[a1,a2]}`, NoobCore fallback. **Gender filter dropped** (WhatsApp exposes no gender) — match is a random other group member. Group-only. |

### Image (7) — `scripts/cmds/image/`
| Command | Source | Notes |
|---|---|---|
| `.googleimage` | Messenger `image/googleimage.js` | ORION C2 `/image/v1/search`, count default 5 / max 25. Multi-image sends one captioned reply + plain sends (1 attachment/message). NoobCore fallback dropped. |
| `.cat` | Messenger `image/cat.js` | TheCatAPI. NoobCore fallback dropped. |
| `.dog` | Messenger `image/dog.js` | dog.ceo. NoobCore fallback dropped. |
| `.duck` | Messenger `image/duck.js` | random-d.uk (GIF). NoobCore fallback dropped. |
| `.fox` | Messenger `image/fox.js` | randomfox.ca. NoobCore fallback dropped. |
| `.bmdp` | Messenger `image/bmdp.js` | sakura `/api/bmdp` (`{boy, boy2}`); base URL from public ApiUrl.json (`saimx69x` key), 10-min cache. Two images = two messages. |
| `.cdp` | Messenger `image/cdp.js` | sakura `/api/cdp2` (`{boy, girl}`). Two images = two messages. |

### Utility (11) — `scripts/cmds/utility/`
| Command | Source | Notes |
|---|---|---|
| `.translate` | Messenger `utility/translate.js` | Free `translate.googleapis.com` (no key). `-r` reaction auto-translate NOT ported (no reaction-event pipeline on WA). **Live caveat: translate.googleapis.com returned HTTP 429 from the VM IP (Google rate-limits datacentre IPs); the command handles it with a "Translation failed" message.** |
| `.time` | Messenger `utility/time.js` | Text-only Dhaka time via `Intl` (no canvas). |
| `.calendar` | Messenger `utility/calendar.js` | Text calendar, Monday-first, today in `[ ]`, via `Intl` Dhaka parts. |
| `.age` | Messenger `utility/age.js` | Native-Date rewrite of the moment math (strict DD-MM-YYYY). |
| `.system` | Messenger `utility/system.js` | Text-only (no canvas/systeminformation). Disk via `fs.statfsSync`, CPU via `os.cpus()` sampling. |
| `.qrcode` | Messenger `utility/qrcode.js` | goqr.me make (GET PNG) + scan (GET `fileurl=` for URL args; POST multipart for an image attached with the command). Scan of a *replied-to* image not possible (no URL for quoted media). |
| `.uid` | Messenger `utility/uid.js` | Self / reply sender / mentions / bare number / `wa.me/<number>` link. Cannot resolve Facebook profile links. |
| `.uptime` | Messenger `utility/uptime.js` | `process.memoryUsage()` (was pidusage), `fs.statfsSync` (was `df`), `os.cpus()` sampling (was `top`). RAM is the bot process RSS. |
| `.imgur` | Messenger `utility/imgur.js` | ORION C6 `POST /imgur/v1/upload` only. **URL-arg only** — reply-to-media upload impossible (ORION needs a URL; WA media has none). |
| `.caption` | Messenger `media/caption.js` | Local list only; `scripts/cmds/data/captions.json` copied (15 categories × 6 captions). |
| `.say` | Messenger `media/say.js` | Google TTS via direct `translate_tts?client=tw-ob` URL (package not installed); ≤200-char word-boundary chunking, MP3 as audio. |

### Info / Anime (2)
| Command | File | Source | Notes |
|---|---|---|---|
| `.ytstalk` | `scripts/cmds/info/ytstalk.js` | Messenger `info/ytstalk.js` | ORION C5 `/youtube/v1/channel` only. Fancy-font map from public NC-STORE `ncsfont.json` (falls back to plain text). |
| `.animevideo` | `scripts/cmds/anime/animevideo.js` | Messenger `anime/animevideo.js` | ORION C7 `/anime/v1/random-video` — **text reply (title + YouTube watch link), not a video attachment** (endpoint returns a trailer page). |

### AI (4) — `scripts/cmds/ai/`
| Command | Source | Notes |
|---|---|---|
| `.gpt` (aliases `chatgpt`, `gpt5`) | Messenger `ai/gpt5.js` | `orionGemini`; `*` stripped exactly as the original; reply-chaining `onReply` kept; reactions ⏳/✅/❌. No Aryan/sandipbaruwal fallback (ORION-only). |
| `.gemini` (aliases `ai`, `chat`) | Messenger `ai/gemini.js` | `orionGemini`; text only. Image attached → "Image questions aren't available on WhatsApp yet" notice. |
| `.deepseek` (alias `ds`) | Messenger `ai/deepseek.js` | Backend changed: sandipbaruwal deepseek endpoint → `orionGemini`. Name, guide, Bengali reply/error texts unchanged. |
| `.geminigen` | Messenger `ai/geminigen.js` | Text-to-image via `orionTensorArt`. **Image-edit path skipped** (Kay, keyed/paid; no ORION equivalent) — edit attempt gets "🖌️ Image edit is not available on WhatsApp yet." |

### AI-image (3) — `scripts/cmds/ai-image/`
All via `orionTensorArt` with the **shared 1/day/user limit** (same `data/tart/limits.json` as `.tart`). `TENSORART_LIMIT` → the exact Bengali limit message, no fallback. No Renz fallback (ORION-only).

| Command | Source | Notes |
|---|---|---|
| `.lumin` | Messenger `ai-image/lumin.js` | |
| `.imagen3` | Messenger `ai-image/imagen3.js` | |
| `.fluxproultra` (alias `fpu`, `premium: true` kept) | Messenger `ai-image/fluxproultra.js` | |

## Commands skipped (17)

| Command | Reason |
|---|---|
| `fun/slap`, `fun/gay`, `fun/jail`, `fun/wanted2` | Built on `discord-image-generation` (not installed); no ORION template. |
| `fun/punch`, `fun/bro`, `fun/spank` | Built on `canvas` + local Messenger-repo assets; canvas not installed on WA, no ORION template. |
| `fun/sanda`, `fun/murgi`, `fun/goru` | Need `jimp`/`canvas` compositing + local assets + hardcoded Facebook Graph token avatar URLs — all Facebook-only / uninstalled. |
| `fun/hack` | Mahmud API resolves the avatar by Facebook ID; no Facebook ID exists on WhatsApp. |
| `entertainment/art` | Both ORION and NoobCore need a **public image URL**; a WhatsApp quoted/attached image has no public URL and the bot has no image-upload step. |
| `image/4k` | Fahim API needs a public image URL; same limitation as `art`. No ORION 4k endpoint. |
| `image/pixel` | Dead on Messenger too: its API base key `"Pixel"` does not exist in `NCApiUrl.json` (verified — the original throws on every call). |
| `ai/prompt` | Image-to-prompt via third-party `azadx69x` API; no ORION vision equivalent, and the adapter exposes no URL for a replied-to image. |
| `ai-image/edit` | Image edit via Kay (keyed/paid); no ORION equivalent. |
| `ai-image/midjourney` | NoobCore `mj` `/imagine` + U1–U4 upscale grid; no ORION equivalent; already deferred on Messenger. |

## Coordinator fixes applied during verification

1. **`ai/irfan.js` reply-chain fix (one line):** the handler routes reply chains on `entry.name`, but `irfan.js` registered only `commandName` — so `.irfan` follow-up replies never fired. Added `name: "irfan"` alongside `commandName`. (All newly ported chat/game commands already register both keys.)
2. **No other existing file was changed.** The 19 original commands are untouched.

## Verification (coordinator, independent)

- `node --check` on **all 88 JS files** (scripts/cmds + scripts/events + core + WABOT.js + index.js): **88 PASS, 0 FAIL**.
- Real loader (`core/loader.js` `loadCommands()`): **134 entries (names + aliases), 0 failed, 71 distinct commands.**
- Forbidden-require grep: **no new forbidden requires.** Only pre-existing lazy canvas requires remain (`scripts/events/welcome.js:37`, `scripts/cmds/economy/balance.js:228` — both inside try/catch, canvas not installed, text fallback). No `crypto`, no `_http`/`_apiBase`/`_tmp`/`_img`/`_reply`, no `moment`/`systeminformation`/`pidusage`/`google-tts-api`/`discord-image-generation`/`jimp` in new code.
- `package.json` dependencies unchanged: baileys 6.7.24, axios 1.21.1, mongodb 7.9.1, qrcode ^1.5.4, qrcode-terminal 0.12.0.
- Forbidden files untouched: `data/auth/` (live session), `config.json`, `package.json`, `core/`, `WABOT.js`, `index.js` — mtimes confirm no worker edits (only the live bot's own `creds.json` refresh).
- Worker-level smoke tests (mock usersData): economy (bank loan exactly 1,000,000; lottery prize grid; `@everyone` set only below-1000 members), games (loader 99 entries at that time, 0 failed), AI (`require()` load), image/utility (17 mock replies, no errors; `.googleimage cat - 2` ran end-to-end via ORION from the VM — 2 JPEG buffers, 313 KB + 144 KB).
- New data files: `scripts/cmds/data/flagCountries.json` (197 countries), `scripts/cmds/data/captions.json` (15 categories × 6 captions).

## Behaviour differences vs the Messenger bot (summary)

- **No NoobCore/Renz/Kay/Aryan fallbacks** on the new WhatsApp commands (except fun-image, which keeps its NoobCore fallback via an inlined base-URL fetch in `fun/_funImage.js`). If ORION is down, ORION-backed commands fail with a clean error instead of falling back. This matches the existing WA `.pinterest` pattern.
- **No canvas cards anywhere** (canvas not installed): balance/bank/game cards that were images on Messenger are text boxes on WhatsApp; `time`/`calendar`/`system`/`guessnumber` board are text.
- **One attachment per message** (adapter limit): multi-image commands send one captioned reply + plain sends.
- **Avatars via `sock.profilePictureUrl`** instead of Facebook graph URLs; commands fail cleanly when a user has no (or a private) profile picture.
- **Names may show as bare IDs** (WA `usersData` stores no name; `api.getUserInfo` returns the bare ID unless a contacts cache supplies better data).
- **Multi-turn games** rely on `global.wabot.replyMap` + the user replying to the bot's question message; `onReply` resolves `usersData` from `global.wabot.db` / `core/database/db.js` (the handler does not pass it to `onReply`).
- **`set.js` is role 2 (adminBot + owner)**, not owner-only as on Messenger.
- **`mistake` avatar will likely be wrong/silhouette** (ORION/NoobCore resolve avatars by Facebook UID; WhatsApp passes a phone number).
- **`translate` may be rate-limited from datacentre IPs** (HTTP 429 seen from the VM); it should work from a residential IP.
- **Wheel BANKRUPT-fee quirk kept exactly** (fee shown, never deducted — payout clamped at 0).

## NOT verified (needs a live test window)

- **No live bot run was done.** The live bot was deliberately not restarted (it is online with the old command set). The new commands load, but none have been exercised against the live WhatsApp connection.
- **Live checks still owed:** one reply game (e.g. `.quiz`) end-to-end; one fun-image command with a real profile picture (`.wanted`); one image-gen command + the 1/day limit message (`.lumin`); `.bank` deposit/withdraw/loan round-trip; `.translate` from a non-datacentre IP.
- **`.mistake` avatar correctness** needs a live look (expected silhouette — see above).
- **TensorArt credits:** the shared pool is 50/day; image-gen commands share the 1/day/user limit, but the pool itself can still run dry (`.lumin` failed on Messenger at 5.96 credits).

## Files changed (working copy only)

- 52 new command files under `scripts/cmds/` (economy 5, game 11, fun 6, love 3, image 7, utility 11, info 1, anime 1, ai 4, ai-image 3) + 1 shared helper (`scripts/cmds/fun/_funImage.js`) + 2 data files (`scripts/cmds/data/flagCountries.json`, `scripts/cmds/data/captions.json`).
- 1 one-line fix in `scripts/cmds/ai/irfan.js` (replyMap `name` key).
- Nothing else. **Not pushed to GitHub** — awaiting Irfan's word.
