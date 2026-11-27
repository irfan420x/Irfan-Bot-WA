# Setup Guide

Step-by-step setup for the WhatsApp bot (Baileys). Read
[docs/BAN-RISKS.md](BAN-RISKS.md) first — the short version is: use a
**spare number only**, never your main number.

## Prerequisites

- **Node.js 20+** and npm. Check with `node --version` (must be v20 or
  newer) and `npm --version`.
- A **spare phone number** with WhatsApp installed on a phone. That phone
  is needed once to scan the QR code (or enter a pairing code). The bot
  then runs on its own; the phone does not need to stay online, but the
  number must stay registered to WhatsApp.
- A terminal / server to run the bot on (your own machine, a VPS, or
  Render — see [Render deployment](#render-deployment) below).
- Optional: a MongoDB connection string if you want per-user/per-group
  data (economy balances, prayer settings) to persist across restarts.
  Without it the bot runs with in-memory state only.

## 1. Clone and install

```bash
git clone <repo-url> whatsapp-bot
cd whatsapp-bot
npm install
```

`npm install` pulls `@whiskeysockets/baileys` (pinned version — see
`package.json`), `mongodb`, `axios`, and the other dependencies. Do not
upgrade Baileys casually: WhatsApp changes its protocol and Baileys must
match it, so update deliberately and test after every upgrade.

## 2. Configure

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "prefix": ".",
  "botName": "WABot",
  "owner": ["8801XXXXXXXXX"],
  "adminBot": ["8801XXXXXXXXX"],
  "autoReconnect": true
}
```

- `prefix` — the command prefix, default `.`.
- `owner` / `adminBot` — bare phone numbers in international format
  **without** `+` (for example `8801XXXXXXXXX`). Put the spare number's
  owner (your own number, for admin commands) here — placeholders only in
  the example file, never a real number.
- `botName` — shown by `.info`.

If you use MongoDB, set the connection string as described in
`config.example.json` (optional — the bot starts without it, with
in-memory state only). **Never commit `config.json`.** It is gitignored,
and it must stay that way.

## 3. First run + QR scan

```bash
node index.js
```

On the first run there is no saved session, so the bot prints a QR code
in the terminal:

1. On the **spare phone**, open WhatsApp.
2. Go to **Settings → Linked Devices → Link a Device**.
3. Point the phone's camera at the QR code in the terminal.
4. The bot logs in as that number. You will see a "connection open"
   message in the terminal.

The session is saved in `data/auth/` (`creds.json` + keys). The next
start reuses it and does **not** need a QR scan. **Never commit `data/`.**
Anyone with those files can act as the bot's number — it is the exact
equivalent of the Messenger bot's `fbstate.json`.

Test the connection: from another phone, send `.ping` to the bot number
in a DM, or in a test group the bot is in. It should reply `Pong`. Then
try `.help` and `.info`.

## 4. Pairing-code alternative

If you cannot scan a QR code (for example the bot runs on a remote server
and the terminal QR is hard to scan), use a pairing code instead:

1. Start the bot with pairing-code mode enabled (see
   `core/connection/connect.js` for the flag — the socket is created with
   a phone number and requests a code instead of a QR).
2. The terminal prints an 8-character code (for example `ABCD-1234`).
3. On the spare phone, open WhatsApp → **Settings → Linked Devices →
   Link a Device → Link with phone number instead**, enter the bot's
   number, then enter the 8-character code.
4. The bot logs in and saves the session in `data/auth/` exactly as with
   a QR scan.

Pairing code and QR are the same login — use whichever is practical. The
code expires after a short time; request a fresh one if it lapses.

## 5. What to do when the session dies

Symptoms: the bot logs `logged out` / `connection closed (401)` /
`session expired`, or it keeps failing to connect after a restart.

1. Stop the bot.
2. Delete the saved session: `rm -rf data/auth/` (only that folder —
   never delete anything else in `data/` blindly).
3. Start the bot again: `node index.js`.
4. Scan a fresh QR code (or use a pairing code) as in step 3.

There is no password fallback — a dead session always means a fresh QR
scan. If sessions die repeatedly within days, the number may be flagged;
stop, read [docs/BAN-RISKS.md](BAN-RISKS.md), and do not keep re-logging
in on the same number.

## Render deployment

The bot can run on Render (same pattern as Irfan-Bot-V4):

- **Service type:** Web Service (or Background Worker), Node 20.
- **Build command:** `npm install`
- **Start command:** `node index.js`
- **Environment variables:** no secrets are needed in env for the bot
  itself. The only optional variable is the MongoDB connection string
  (for the `whatsapp` database) if you want persistent state; without it
  the bot runs with in-memory state only.
- **Session on Render:** the first login must happen where you can see
  the QR code. Options: run the bot once locally, scan the QR, then copy
  the resulting `data/auth/` folder to the Render service's persistent
  disk — or use a pairing code and enter it on the phone while Render
  prints the code in its logs. `data/auth/` must live on a persistent
  disk on Render, or every deploy/restart loses the session and needs a
  fresh scan.
- **Free-tier note:** Render's free tier spins a web service down after
  15 minutes without HTTP traffic. A Background Worker does not have
  that problem; if you use a Web Service, point a free uptime pinger at
  the service URL so the process is not spun down (a spin-down forces a
  fresh login, and repeated fresh logins feed WhatsApp's suspicious-
  activity detection).

## Troubleshooting

### QR code not showing

- Make sure you are looking at the terminal where `node index.js` is
  running — the QR prints there, not in any dashboard.
- If the terminal is too narrow, the QR may render broken. Widen the
  terminal (at least 80 columns) and restart the bot.
- If the QR appears but the phone will not scan it, use the pairing-code
  alternative above.
- If the bot prints no QR and no error, check that the port / process is
  actually running and that `data/auth/` does not already hold a stale
  session — a stale session can make the bot try (and fail) to resume
  instead of showing a QR. Delete `data/auth/` and restart.

### Logged out / session expired

Follow [step 5](#5-what-to-do-when-the-session-dies): stop the bot,
delete `data/auth/`, restart, re-scan. If it happens again quickly, see
the ban-risks doc before re-logging in.

### Reconnect loop (bot keeps connecting and dropping)

- Check the network: Baileys needs a stable WebSocket to WhatsApp's
  servers. A datacentre IP that drops connections will loop forever —
  try from a residential connection first.
- Check the Baileys version: if WhatsApp changed its protocol, the
  pinned version may be outdated. Check the Baileys releases, update
  deliberately, and test.
- Check the logs for the disconnect reason. A `401` means the session is
  dead (re-scan). A `403` / `405` can mean the number is restricted.
  Repeated restarts in a tight loop make things worse — `index.js`
  backs off between restarts, so let it breathe instead of hammering
  restarts manually.

### Bot is online but does not reply

- Check the prefix: commands start with the prefix in `config.json`
  (default `.`). `.ping` works; `ping` without the prefix does not.
- Check the bot is actually in the group (for group commands) and that
  the message was sent after the bot connected — messages sent while
  the bot was offline are not delivered to it.
- Check the sender's role: admin commands (role 1) need group-admin,
  bot-admin commands (role 2) need the number to be in `adminBot`.
- Check the terminal logs for handler errors — a command that throws is
  logged, not silently swallowed.

### Messages send but the phone shows them as not delivered

- The number may be rate-limited or flagged. Stop the bot, wait, and
  read [docs/BAN-RISKS.md](BAN-RISKS.md). Do not send bursts to "test"
  whether it recovers — bursts are what trigger the flag.
