# WhatsApp Bot (Baileys)

An advanced WhatsApp bot built on the [Baileys](https://github.com/WhiskeySockets/Baileys)
library (`@whiskeysockets/baileys`), structured exactly like
**Irfan-Bot-V4** — the Facebook Messenger bot — so commands can be ported
between the two bots with only a message-adapter change.

Baileys is an unofficial library that implements the WhatsApp Web
multi-device protocol directly over WebSocket (no browser). The bot logs in
as a WhatsApp account (a phone number) by scanning a QR code or pairing
code, just like WhatsApp Web. It can send and receive messages and media,
react, and manage groups. It is **not** affiliated with WhatsApp.

> **Warning: use a spare number only.** WhatsApp bans numbers that use
> unofficial clients, and it is stricter than Facebook — a ban can be
> permanent. Never run this bot on your main number. See
> [docs/BAN-RISKS.md](docs/BAN-RISKS.md) before you connect anything.

## Features

- **Same command system as Irfan-Bot-V4** — same loader, same categories,
  same `config` shape (`name`, `role`, `onStart`), same reply-map pattern.
  Commands port over with only the adapter (`scripts/cmds/_wa.js`) in
  between.
- **Info commands** — `.help`, `.ping`, `.prefix`, `.info`, `.userinfo`.
- **Group admin commands** — `.settitle`, `.kick`, `.add`, `.promote`,
  `.demote`, `.groupinfo`, plus a batch welcome message on join.
- **AI chat** — `.irfan` (ORION Gemini, via the same API helper as the
  Messenger bot).
- **Utility** — `.prayer` (Dhaka five-daily prayer times via Aladhan, with a
  20-minute break announcement; per-group on/off).
- **Image** — `.tart` (TensorArt image generation) and `.pinterest`
  (image search with pagination).
- **Economy** — `.balance`, `.daily`.
- **Games** — `.coinflip`, `.slot`.
- **MongoDB state** — per-user and per-group data in a `whatsapp` database
  on the same Atlas cluster as the Messenger bot.
- **Anti-ban send guard** — every send goes through one rate-limit guard
  with human-like delays and jitter; no bursts, no mass messaging.
- **Supervisor** — `index.js` restarts the bot on any exit, with backoff
  and a crash-loop guard.

## Install

Prerequisites: **Node.js 20+** and npm, plus a spare phone number with
WhatsApp installed on a phone (needed to scan the QR code).

```bash
git clone <repo-url> whatsapp-bot
cd whatsapp-bot
npm install
cp config.example.json config.json
```

Then edit `config.json` and set your owner number (see
[Configuration](#configuration)).

## Configuration

Copy the example config and fill it in:

```bash
cp config.example.json config.json
```

`config.json` (never commit this file):

```json
{
  "prefix": ".",
  "botName": "WABot",
  "owner": ["8801XXXXXXXXX"],
  "adminBot": ["8801XXXXXXXXX"],
  "autoReconnect": true
}
```

- `prefix` — the command prefix (default `.`).
- `owner` / `adminBot` — bare phone numbers in international format
  **without** `+` (for example `8801XXXXXXXXX`), no real numbers are
  shipped in this repo.
- The bot name is shown by `.info`.

Optional: a MongoDB connection string for the `whatsapp` database. If it
is not set, the bot runs with in-memory state only and per-user/per-group
data (economy, prayer settings) does not persist across restarts.

## QR setup — linking a number

1. Run the bot: `node index.js`.
2. A QR code appears in the terminal on first run.
3. On the spare phone, open WhatsApp → **Settings → Linked Devices →
   Link a Device** and scan the QR code.
4. The bot logs in as that number. The session is saved in `data/auth/`
   (`creds.json` + keys), so the next start does not need a QR scan.
5. Alternative: pairing code — if QR scanning is not possible, the bot can
   request an 8-character pairing code to enter on the phone instead
   (see [docs/SETUP.md](docs/SETUP.md)).

If the session dies (logged out, auth state lost), delete `data/auth/` and
re-scan the QR code. Never commit `data/` — it holds the login session.

## How to run

```bash
node index.js
```

`index.js` is a supervisor: it starts `WABOT.js`, restarts it on any exit,
and backs off if it crashes repeatedly. `WABOT.js` itself only connects
when its `start()` function is called — requiring it does not connect.

## Command list (summary)

Default prefix is `.`. Full list with roles and usage:
[docs/COMMANDS.md](docs/COMMANDS.md).

| Category | Commands |
|---|---|
| Info | `help`, `ping`, `prefix`, `info`, `userinfo` |
| Admin | `settitle`, `kick`, `add`, `promote`, `demote`, `groupinfo` |
| AI | `irfan` |
| Utility | `prayer` |
| AI image | `tart` |
| Image | `pinterest` |
| Economy | `balance`, `daily` |
| Games | `coinflip`, `slot` |

## Repo layout

```
whatsapp-bot/
├── README.md
├── CHANGELOG.md
├── package.json
├── index.js                  # supervisor (restart on exit, backoff)
├── WABOT.js                  # core entry — connect + handler -> sock
├── config.json               # NEVER commit (copy from config.example.json)
├── config.example.json
├── core/
│   ├── connection/           # connect.js (makeWASocket, QR), auth.js (data/auth/)
│   ├── handler/              # handlerEvents.js, handlerMessage.js
│   └── database/             # db.js (MongoDB, DB: whatsapp)
├── scripts/
│   ├── cmds/
│   │   ├── _wa.js            # ADAPTER: Baileys msg -> Messenger-style event
│   │   ├── _orionApi.js      # ORION Gemini / TensorArt helper
│   │   ├── _prayerTimes.js   # prayer times helper
│   │   ├── ai/ info/ admin/ utility/ economy/ game/ media/
│   │   └── ...
│   └── events/               # welcome.js, groupUpdate.js
├── data/                     # RUNTIME ONLY — never push (auth session lives here)
├── docs/
│   ├── SETUP.md              # QR scan + pairing code, Render, troubleshooting
│   ├── COMMANDS.md           # full command list
│   └── BAN-RISKS.md          # honest ban risks + mitigations
└── tests/
    ├── adapter.test.js       # _wa.js translation tests (no network, no Baileys)
    └── live-smoke.js         # Phase 0 proof script (no live connection)
```

## Warnings

- **Spare number only.** WhatsApp bans unofficial-client numbers, and a
  ban can be permanent. Your main number must never touch this bot.
- **Unofficial.** Baileys is not affiliated with WhatsApp. WhatsApp
  changes its protocol; Baileys must be updated to match. The Baileys
  version is pinned — update deliberately, never automatically.
- **No official group bot exists.** The official WhatsApp Business API is
  1:1 customer messaging only — it cannot do group bots. Baileys is the
  only way to have a group bot, the same way FCA is the only way for
  Messenger.
- **Never commit `data/` or `config.json`.** `data/auth/` is the login
  session (the equivalent of the Messenger bot's `fbstate.json`); anyone
  with it can act as the bot's number.
- **No mass messaging.** Bursts of messages, especially to many people,
  trigger bans. The send guard exists for a reason — do not bypass it.
- **Orion stays Telegram-only.** This WhatsApp bot is a separate project,
  like Irfan-Bot-V4 is separate from Orion — not a change to Orion.

## Status

v0.1.0 (2026-11-27) — initial build. Live WhatsApp connection testing is
pending the owner's spare number; see [CHANGELOG.md](CHANGELOG.md) and
run `node tests/live-smoke.js` for the Phase 0 checklist.
