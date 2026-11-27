# WhatsApp Bot (Baileys) — Plan & File Structure

**Goal:** Build an advanced WhatsApp bot using the **Baileys** library
(`@whiskeysockets/baileys`), structured exactly like **Irfan-Bot-V4** (Messenger bot)
— same command loader, same categories, same events, same database pattern — so
commands can be ported between the two bots.

**Note:** the TikTok API plan is SET ASIDE for now (saved at
`~/workspace/tiktok-api/PLAN.md`). This document is the WhatsApp bot plan.

**What Baileys is:** an unofficial TypeScript library that implements the WhatsApp
Web multi-device protocol directly over WebSocket (no browser). The bot logs in as
a WhatsApp account (a phone number) by scanning a QR code or pairing code — like
WhatsApp Web. It can send/receive messages, media, polls, reactions, and manage
groups. It is NOT affiliated with WhatsApp.

---

## Tech decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Language | Node.js 20, plain JS | Same as the Messenger bot; Baileys is used from JS the same way |
| Library | `@whiskeysockets/baileys` (npm, stable) | The standard Baileys package; NOT vendored (unlike FCA) — install from npm, pin the version |
| Entry | `makeWASocket` | Baileys' single entry point; returns an event-driven socket |
| Auth | QR code or pairing code; auth state in `data/auth/` (`creds.json` + keys) via `useMultiFileAuthState` | Same role as `fbstate.json` — NEVER committed; re-scan QR only when the session dies |
| Number | A SPARE phone number (not the main number) | WhatsApp bans numbers that use unofficial clients. A ban on the main number would kill real WhatsApp use |
| Config | `config.json` (prefix, owner, roles, bot name) | Same pattern as the Messenger bot |
| Database | MongoDB (same Atlas cluster, new DB `whatsapp`) | Same as the Messenger bot; commands need per-user/per-group state |
| Entry files | `index.js` supervisor + `WABOT.js` core | Same as the bot's `index.js` + `IRFBOT.js` |
| Commands | Same loader + same categories as the Messenger bot | Commands port over with only a message-adapter change |

---

## How Baileys maps to the Messenger bot

| Messenger bot (FCA) | WhatsApp bot (Baileys) |
|---|---|
| `IRFBOT.js` | `WABOT.js` |
| `fbstate.json` (session) | `data/auth/creds.json` + keys (session) |
| `api.sendMessage` | `sock.sendMessage(jid, content)` |
| `event.body` / `event.threadID` | `msg.message.conversation` / `msg.key.remoteJid` |
| `event.mentions` | `msg.message.extendedTextMessage.contextInfo.mentionedJid` |
| `event.messageReply` | `msg.message.extendedTextMessage.contextInfo.quotedMessage` |
| `api.getThreadInfo` | `sock.groupMetadata(jid)` |
| `log:subscribe` (welcome) | `group-participants.update` event |
| `core/handler/handlerEvents.js` | `core/handler/handlerEvents.js` (same name, Baileys events) |
| `scripts/cmds/` (193 commands) | `scripts/cmds/` (same loader, ported commands) |
| `scripts/events/welcome.js` | `scripts/events/welcome.js` (same idea) |
| MongoDB `orion` | MongoDB `whatsapp` |

**The big win:** the command files are ~80% portable. The logic (games, economy,
AI calls, prayer times) is identical — only the message send/receive wrapper
changes. A thin adapter (`scripts/cmds/_wa.js`) translates Baileys messages into
the same `{ body, threadID, senderID, mentions, messageReply }` shape the
Messenger commands already expect.

---

## Phase plan

### Phase 0 — Setup & proof (first)
- Install Baileys, connect with a SPARE number via QR, send one message and
  receive one. Prove the connection works before building anything.
- Confirm: group messages arrive, `groupMetadata` works, media send works.
- If the number gets flagged at this stage, stop and rethink — do not build on
  a banned number.

### Phase 1 — Core (the FCA equivalent)
- `core/connection/connect.js` — `makeWASocket`, QR/pairing, reconnect with
  backoff, `connection.update` handling.
- `core/connection/auth.js` — auth-state save/load (`data/auth/`), session
  refresh, re-QR flow when the session dies.
- `core/handler/handlerEvents.js` — Baileys event dispatcher
  (`messages.upsert`, `group-participants.update`, `connection.update`).
- `core/handler/handlerMessage.js` — message routing: prefix, role check,
  reply map (the Baileys version of `orionReply`).
- `WABOT.js` — wires connection + handler into one `sock` object.
- `index.js` — supervisor (restart on any exit code, backoff, crash-loop guard).
- Deliverable: bot online, `.ping` answers, reconnects after a drop.

### Phase 2 — Command loader + core commands (port from Messenger bot)
- Port the command loader (same `config` shape: `name`, `role`, `onStart`).
- Port first: `help`, `ping`, `prefix`, `info` (bot info), `userinfo`.
- Adapter `scripts/cmds/_wa.js` — translates Baileys message -> Messenger-style
  event object so ported commands work unchanged.
- Deliverable: `.help` lists commands, `.ping` replies, in DM and in a group.

### Phase 3 — Groups
- `scripts/events/welcome.js` — new-member welcome (same idea as the Messenger
  bot's batch welcome: one message + one card for a batch).
- Group admin commands: `settitle` equivalent (group subject), `kick`, `add`,
  `promote`/`demote`, group info.
- `group-participants.update` handling (join/leave/promote/demote).
- Deliverable: welcome fires on join; admin commands work in a test group.

### Phase 4 — Features (port from Messenger bot)
- Economy (balance, daily, bank), games (coinflip, slot, etc.), AI chat
  (ORION Gemini via `_orionApi.js` — same helper, it is API-based, not
  Messenger-specific), media (image gen via TensorArt), prayer automation
  (same `_prayerTimes.js` + scheduler — it only needs a send function).
- Port order: AI + utility first (safest), economy + games after (they touch
  money state — test on a throwaway group).
- Deliverable: `.irfan`, `.tiktok`-style media, `.prayer`, games work.

### Phase 5 — Hardening & anti-ban
- Rate-limit guard on all sends (human-like delays, jitter, no bursts).
- Reconnect + session-death handling (QR re-scan notice to owner).
- Do-not-touch list (auth state, connection, handler) + backup rule (same as
  the Messenger bot: one backup, delete old ones, before any big change).
- Deliverable: bot survives a reconnect, a restart, and a 24h soak test.

### Phase 6 — Release
- README, command list, setup guide (QR scan steps), versioning.
- Repo decision: public or private (Messenger bot repo is private; auth state
  must never be committed either way).

---

## File structure

```
whatsapp-bot/
├── README.md                    # what it is, install, QR setup, warnings
├── CHANGELOG.md
├── package.json                 # node 20, @whiskeysockets/baileys, mongodb, axios
├── index.js                     # supervisor (restart on any exit, backoff)
├── WABOT.js                     # core entry — connect + handler -> sock
├── config.json                  # prefix, owner, roles, bot name (NEVER push secrets)
├── config.example.json
│
├── core/
│   ├── connection/
│   │   ├── connect.js           # makeWASocket, QR/pairing, reconnect
│   │   └── auth.js              # auth-state save/load (data/auth/)
│   ├── handler/
│   │   ├── handlerEvents.js     # Baileys events -> dispatcher
│   │   └── handlerMessage.js    # prefix, role, reply map (orionReply equivalent)
│   └── database/
│       └── db.js                # MongoDB connect (DB: whatsapp)
│
├── scripts/
│   ├── cmds/
│   │   ├── _wa.js               # ADAPTER: Baileys msg -> Messenger-style event
│   │   ├── _orionApi.js         # ORION Gemini/TensorArt (same as Messenger bot)
│   │   ├── _prayerTimes.js      # prayer times (same as Messenger bot)
│   │   ├── ai/
│   │   │   └── irfan.js         # AI chat (ported)
│   │   ├── economy/
│   │   │   ├── balance.js
│   │   │   ├── daily.js
│   │   │   └── bank.js
│   │   ├── game/
│   │   │   ├── coinflip.js
│   │   │   ├── slot.js
│   │   │   └── ...
│   │   ├── fun/
│   │   ├── info/
│   │   │   ├── help.js
│   │   │   ├── ping.js
│   │   │   └── userinfo.js
│   │   ├── utility/
│   │   │   ├── prayer.js        # .prayer (ported)
│   │   │   └── ...
│   │   └── media/
│   │       ├── tart.js          # TensorArt image gen (ported)
│   │       └── pinterest.js
│   └── events/
│       ├── welcome.js           # group join welcome (batch card, like v2.4)
│       └── groupUpdate.js       # join/leave/promote/demote
│
├── data/                        # RUNTIME ONLY — never push
│   ├── auth/                    # Baileys creds.json + keys (like fbstate.json)
│   └── ...
│
├── docs/
│   ├── SETUP.md                 # QR scan + pairing code steps
│   ├── COMMANDS.md              # command list (ported from Messenger bot)
│   └── BAN-RISKS.md             # honest ban risks + mitigations
│
└── tests/
    ├── adapter.test.js          # _wa.js translation tests
    └── live-smoke.js            # Phase 0 proof script
```

**Naming note:** `WABOT.js` mirrors `IRFBOT.js`; `data/auth/` mirrors `fbstate.json`;
`scripts/cmds/` and `scripts/events/` mirror the Messenger bot exactly — so the
two bots share one mental model and commands port over.

---

## What each core file does (one line each)

- `WABOT.js` — boots connection, builds the `sock` object, exposes it globally.
- `core/connection/connect.js` — creates the Baileys socket, QR/pairing, reconnect.
- `core/connection/auth.js` — saves/loads auth state; re-QR when the session dies.
- `core/handler/handlerEvents.js` — the dispatcher (Baileys event -> command/event).
- `core/handler/handlerMessage.js` — prefix + role + reply-map routing.
- `scripts/cmds/_wa.js` — the adapter; the single file that makes Messenger-bot
  commands run on WhatsApp.

---

## Honest risks (do not skip)

1. **Number bans.** WhatsApp bans numbers that use unofficial clients, and it is
   stricter than Facebook. A banned number can be permanent. NEVER use the main
   number — spare number only, and accept that it can be lost.
2. **No official group bot.** The official WhatsApp Business API is 1:1 customer
   messaging only — it does NOT do group bots. Baileys (unofficial) is the only
   way to have a group bot, same as FCA for Messenger.
3. **Baileys breaks.** WhatsApp changes its protocol; Baileys must be updated to
   match. Pin a Baileys version, update deliberately (never auto-update).
4. **Session death.** If the auth state dies, the bot goes offline until someone
   scans a new QR code. There is no password fallback.
5. **Rate limits.** Bursts of messages (especially to many people) trigger bans.
   Every send goes through one rate-limit guard with human-like delays.
6. **Orion rule stands.** Orion itself stays Telegram-only. This WhatsApp bot is
   a SEPARATE project (like Irfan-Bot-V4 is separate from Orion), not a change
   to Orion.

---

## Decisions needed from Irfan (before Phase 1)

1. **Spare number?** Which phone number will the bot use (must NOT be the main
   number)? Needed before Phase 0.
2. **Port or fresh?** Port the Messenger bot's commands (fast, same features) or
   build a smaller fresh set first (safer, slower)? Recommended: port.
3. **Repo?** Public or private (Messenger bot repo is private).
4. **Which group for testing?** A throwaway WhatsApp test group (like the ORION
   test group on Messenger) — never test in a real group first.
5. **Prayer + economy on WhatsApp too?** Port them (Phase 4) or keep WhatsApp
   bot simpler (chat + media + utility only)?

---

## What is NOT in this plan

- No WhatsApp Business API (official) — it cannot do group bots.
- No Orion changes — Orion stays Telegram-only; this is a separate bot.
- No mass-messaging / broadcast spam tooling (ban magnet).
- No main-number use, ever.
