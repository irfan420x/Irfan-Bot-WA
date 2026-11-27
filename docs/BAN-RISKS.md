# Ban Risks — Read This First

This is the honest version. Baileys is an **unofficial** client: it is
not made by, affiliated with, or approved by WhatsApp. Using it carries
a real risk of losing the number it runs on. That risk cannot be
removed, only reduced.

## What the risk actually is

- **WhatsApp bans numbers that use unofficial clients.** Detection is
  automated and opaque — there is no warning, no appeal form that
  reliably works, and no way to know exactly which behaviour triggered
  it.
- **WhatsApp is stricter than Facebook.** The Messenger bot's FCA login
  also gets flagged (sessions die, accounts get checkpointed), but a
  Messenger account can usually be recovered or replaced. A WhatsApp
  number ban can be **permanent**: the number can no longer register on
  WhatsApp at all, including for normal personal use.
- **A ban kills the number, not just the bot.** If the bot runs on your
  main number and that number is banned, you lose your real WhatsApp —
  chats, groups, contacts — on that number.
- **Bans can be delayed.** A number can run fine for weeks and then get
  banned in one sweep. "It worked for a month" is not proof it is safe.

## What makes a ban more likely

- Running on a **main number** (the loss is total, and a heavily-used
  personal number looks different to detection than a fresh one).
- **Bursts and mass messaging** — many messages in a short time, the
  same message to many people or groups, broadcast-style behaviour.
  This is the single biggest trigger.
- **Datacentre IPs** — logging in and operating from a VPS / cloud IP
  range looks automated. Residential IPs look more normal.
- **Repeated fresh logins** — every QR re-scan / re-login is a signal.
  A bot that is restarted often, or whose session keeps dying, logs in
  far more often than a human ever would.
- **High-volume group activity** — joining many groups, being added to
  groups rapidly, or messaging in many groups at once.
- **Spam-like content** — links, promotions, or identical replies sent
  repeatedly.
- **A brand-new number** — a number with no history, no contacts, and no
  normal usage that suddenly starts behaving like a bot is the easiest
  pattern to flag. (A spare number that has some normal human use first
  is safer than a SIM bought yesterday and immediately bot-logged-in.)

## Mitigations (what this bot does, and what you must do)

- **Spare number only, never the main number.** This is the one rule
  that matters most. Accept before you start that the spare number can
  be lost.
- **Human-like delays via the send guard.** Every send goes through one
  rate-limit guard with human-like delays and jitter. No bursts, no
  parallel mass sends. Do not bypass the guard, and do not add a
  broadcast / mass-message feature — this repo deliberately has none.
- **No bursts / mass messaging.** Do not use the bot to message many
  people or groups at once, and do not add anyone to groups in bulk.
- **Residential IP where possible.** Prefer running the bot from a home
  connection over a datacentre VPS for the login, at least at first.
- **Warm-up.** After linking the spare number, let it sit with light,
  human-like use before turning the bot on fully: a few normal chats,
  a small number of groups, low volume for the first days. Do not go
  from zero to a busy group bot on day one.
- **Session rotation, done rarely and deliberately.** Keep the session
  in `data/auth/` stable — do not delete and re-scan casually. If the
  session dies, re-scan once (see [docs/SETUP.md](SETUP.md)) and then
  leave it alone. Repeated re-logins are themselves a flag.
- **Low volume in testing.** Phase 0 testing is one DM and one test
  group only — never test in a real group first, and never test with
  bursts.
- **Keep the bot's behaviour boring.** Answer when spoken to, run the
  commands in [docs/COMMANDS.md](COMMANDS.md), announce prayer breaks
  in groups that opted in. Nothing that looks like spam.
- **Pin the Baileys version.** Update deliberately and test after every
  upgrade; a broken protocol version can cause reconnect storms, and
  reconnect storms look automated.

## What to do if the number is banned

1. **Stop the bot immediately.** Do not keep retrying, re-logging in,
   or re-scanning — that makes it worse and can flag anything else
   associated with the device/IP.
2. Check what WhatsApp shows on the phone: a temporary restriction
   (with a time) is different from a permanent ban. A temporary
   restriction sometimes lifts on its own; wait it out, do not try to
   work around it.
3. Use WhatsApp's in-app review/appeal option if one is offered. It
   rarely reverses an unofficial-client ban, but it is the only official
   route — do not pay anyone who offers to "unban" a number, and do not
   share verification codes or passwords.
4. If the ban is permanent, the number is lost for WhatsApp. Do not try
   to re-register it repeatedly from the same device/IP — that can flag
   the device too. Use a different spare number if the bot is to
   continue at all, and re-read the mitigations above first.
5. If the banned number was somehow your main number (it should never
   have been — see above), move your real WhatsApp use to another number
   and treat the banned one as gone.

## What the official API can and cannot do

The **official WhatsApp Business API** is 1:1 customer messaging only
— it **cannot do group bots**. There is no official way to have a bot
that lives in a WhatsApp group and answers commands there. Baileys
(unofficial) is the only way to have a group bot, the same way FCA is
the only way for Messenger. That is the trade-off this whole project
accepts: group-bot features in exchange for ban risk on a spare number.
If the ban risk is unacceptable, do not run this bot — use the official
API for 1:1 messaging instead, and give up the group features.
