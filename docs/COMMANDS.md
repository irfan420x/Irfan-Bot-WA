# Command List

Default prefix is `.` (set in `config.json`). Usage below shows the
prefix; if the prefix was changed, use that instead.

Roles: **0** = everyone, **1** = group admin, **2** = bot admin (a
number listed in `adminBot` in `config.json`).

**Ported** means the command was ported from the Messenger bot
(Irfan-Bot-V4) — same logic, only the message adapter changed. New
commands (none in v0.1.0) would be marked **New**.

## Info

| Command | Role | Usage | Description | Origin |
|---|---|---|---|---|
| `help` | 0 | `.help` or `.help <command>` | Lists all commands by category; with a name, shows that command's usage and description. | Ported |
| `ping` | 0 | `.ping` | Replies `Pong` — the fastest way to check the bot is alive and answering. | Ported |
| `prefix` | 0 | `.prefix` | Shows the current command prefix. | Ported |
| `info` | 0 | `.info` | Shows bot info: name, version, prefix, uptime, and connection status. | Ported |
| `userinfo` | 0 | `.userinfo` or `.userinfo @user` or reply to a message with `.userinfo` | Shows a user's card: name, user ID, money, level, exp, group-admin status, nickname, and message count in this group. With a mention or a reply it shows that user; without one it shows you. | Ported |

## Admin (group)

These work in groups only. Role 1 means the sender must be a group
admin. The bot itself must also be a group admin for `kick`, `add`,
`promote`, and `demote` to work — WhatsApp does not let a non-admin
member change group membership.

| Command | Role | Usage | Description | Origin |
|---|---|---|---|---|
| `settitle` | 1 | `.settitle <new title>` | Changes the group's subject (title) to the given text. | Ported |
| `kick` | 1 | `.kick @user` or reply to a message with `.kick` | Removes the mentioned (or replied-to) member from the group. | Ported |
| `add` | 1 | `.add <phone number>` | Adds a member to the group by phone number (bare digits, international format without `+`). The number must have WhatsApp and allow being added. | Ported |
| `promote` | 1 | `.promote @user` or reply to a message with `.promote` | Makes the mentioned (or replied-to) member a group admin. | Ported |
| `demote` | 1 | `.demote @user` or reply to a message with `.demote` | Removes group-admin status from the mentioned (or replied-to) member. | Ported |
| `groupinfo` | 0 | `.groupinfo` | Shows group info: name, group ID, member count, admin list, and creation info where available. | Ported |

## AI

| Command | Role | Usage | Description | Origin |
|---|---|---|---|---|
| `irfan` | 0 | `.irfan <message>` | Chats with the ORION Gemini AI — short, funny, Bengali-first replies, same personality as the Messenger bot's `irfan` command. Uses the shared `_orionApi.js` helper; the API call is identical, only the send/receive wrapper differs. | Ported |

## Utility

| Command | Role | Usage | Description | Origin |
|---|---|---|---|---|
| `prayer` | 0 | `.prayer` or `.prayer on` / `.prayer off` | `.prayer` shows today's five Dhaka prayer times (Fajr, Dhuhr, Asr, Maghrib, Isha) via Aladhan. `.prayer on` / `.prayer off` turns the automatic 20-minute break announcement on or off for this group (group admin only for on/off). | Ported |

## AI image

| Command | Role | Usage | Description | Origin |
|---|---|---|---|---|
| `tart` | 0 | `.tart <prompt>` | Generates an image from a text prompt with TensorArt (via the ORION APIs). Limited to 1 use per user per day; TensorArt credits apply. | Ported |

## Image

| Command | Role | Usage | Description | Origin |
|---|---|---|---|---|
| `pinterest` | 0 | `.pinterest <search>` | Searches Pinterest for images. Sends the first 10 results; reply `next` for the next 10, up to 3 pages. | Ported |

## Economy

Balances and money are per-user, stored in the `whatsapp` MongoDB
database (in-memory only if no database is configured — balances reset
on restart in that case).

| Command | Role | Usage | Description | Origin |
|---|---|---|---|---|
| `balance` | 0 | `.balance` or `.bal` | Shows your current money balance and level/exp. | Ported |
| `daily` | 0 | `.daily` | Claims your daily reward (once per day). | Ported |

## Games

Games use the economy balance — winnings and losses change your money.
Play in a throwaway test group first; economy state is real.

| Command | Role | Usage | Description | Origin |
|---|---|---|---|---|
| `coinflip` | 0 | `.coinflip <heads/tails> <amount>` | Bets an amount on a coin flip; win doubles the bet, lose forfeits it. | Ported |
| `slot` | 0 | `.slot <amount>` | Spins the slot machine for the bet amount; payout depends on the symbols. | Ported |

## Reply flow

Some commands use replies: `pinterest` (reply `next` for more results)
and any command that accepts a reply as its target (`kick`, `promote`,
`demote`, `userinfo`). The reply map works the same as the Messenger
bot's `orionReply` — the bot remembers which message it sent and routes
your reply back to the right command.
