# Changelog

## v0.1.0 — 2026-11-27

Initial build of the WhatsApp bot (Baileys), structured like
Irfan-Bot-V4 so commands port between the two bots.

- **Core** — `WABOT.js` entry (exports `start()`, does not auto-connect
  on require), `index.js` supervisor (restart on any exit, backoff,
  crash-loop guard), `core/connection/connect.js` (Baileys socket, QR /
  pairing code, reconnect), `core/connection/auth.js` (auth state in
  `data/auth/`), `core/handler/handlerEvents.js` and
  `core/handler/handlerMessage.js` (prefix, role check, reply map),
  `core/database/db.js` (MongoDB, DB `whatsapp`).
- **Adapter** — `scripts/cmds/_wa.js` translates Baileys messages into
  the Messenger-style event shape (`body`, `threadID`, `senderID`,
  `mentions`, `messageReply`) so ported commands work unchanged.
- **Commands** — info (`help`, `ping`, `prefix`, `info`, `userinfo`),
  group admin (`settitle`, `kick`, `add`, `promote`, `demote`,
  `groupinfo`), AI (`irfan`), utility (`prayer`), AI image (`tart`),
  image (`pinterest`), economy (`balance`, `daily`, `bank`), games
  (`coinflip`, `slot`).
- **Groups** — `scripts/events/welcome.js` (batch welcome on join) and
  `scripts/events/groupUpdate.js` (join/leave/promote/demote).
- **Features** — economy, games, AI chat via the shared ORION API
  helper, TensorArt image generation, prayer automation (Dhaka times,
  20-minute break announcement, per-group on/off), send guard with
  human-like delays.
- **Docs** — README, setup guide (QR scan + pairing code + Render),
  full command list, honest ban-risks doc.
- **Tests** — `tests/adapter.test.js` (mock adapter + ping test, no
  network, no Baileys import) and `tests/live-smoke.js` (Phase 0 proof
  script, no live connection).

**Not yet done:** live WhatsApp connection testing is pending the
owner's spare number. Phase 0 (QR scan, send/receive one message, group
message, media send) has not been run against a real number yet.
