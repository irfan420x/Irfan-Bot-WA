# Baileys 6.7.24 vs WhatsApp Bot — API Capability Audit

- **Date:** 2026-11-27
- **Baileys version:** 6.7.24 (confirmed from `node_modules/@whiskeysockets/baileys/package.json`)
- **Bot working copy:** `~/workspace/whatsapp-bot/` (Node v24.22.1, `engines: node >= 20`)
- **Scope:** read-only audit. No bot code was modified, the bot was not restarted, `data/auth/` and `config.json` were not touched, nothing was pushed.
- **Method:** read the Baileys type declarations and socket sources under `node_modules/@whiskeysockets/baileys/lib/` (`Types/*.d.ts`, `Socket/*.d.ts`, `Socket/*.js`, `Utils/*.d.ts`/`*.js`), then grepped the bot (`core/`, `scripts/`, `WABOT.js`, `index.js`) for every socket method, content shape, and event subscription. A capability is listed as available only if it was found in the 6.7.24 source read here; each row cites the file + line/type.
- **Result: 38 unused capabilities** (table below), plus a mapping to the planned items and a list of what is already used.

## Corrections to the task brief (found during the audit)

1. **Group invite code IS used — the brief was wrong.** `scripts/cmds/admin/groupinfo.js:115-116` calls `sock.groupInviteCode(groupJid)` (best-effort, needs the bot to be a group admin) and shows the link. What is genuinely unused is a dedicated `.invite` command and `groupRevokeInvite` (row 11).
2. **Link previews ARE active — not unused.** `core/connection/connect.js` sets `generateHighQualityLinkPreview: true`, and `lib/Socket/messages-send.js:646-656` passes a `getUrlInfo` fetcher into every send; `lib/Utils/messages.js:265-267` auto-generates a preview when sent text contains a URL. No command needs to do anything for this.
3. **`sock.getName()` does NOT exist in Baileys 6.7.24.** Zero occurrences in `lib/`. `scripts/events/welcome.js:81` and `scripts/events/groupUpdate.js:52` call it only behind a `typeof sock.getName === "function"` guard, so it is harmless dead code — names actually come from `pushName` and the DB. Any future contact-name work should use the `contacts.upsert` / `messaging-history.set` events (row 37), not `getName`.

## Unused capabilities

Status is `unused` for every row. Effort: **S** = a few lines via the existing adapter/guarded send, **M** = a new command plus some state, **L** = a new subsystem or an account-type change.

| # | Capability | What it does (1 line) | Where it would help in this bot | User value | Effort | Status |
|---|------------|----------------------|--------------------------------|------------|--------|--------|
| 1 | Typing / recording presence — `sendPresenceUpdate(type, toJid)` (`lib/Socket/messages-send.d.ts:85`, `WAPresence = 'unavailable' \| 'available' \| 'composing' \| 'recording' \| 'paused'` in `lib/Types/Chat.d.ts`) | Shows "typing…" / "recording…" in the chat while the bot works. | Before every slow command (AI, image gen, `.tart` polling): send `composing`, then the reply. The bot currently answers after a silent delay. | High | S | unused |
| 2 | Read receipts — `readMessages(keys)` / `sendReceipt(jid, participant, ids, type)` / `sendReceipts(keys, type)` (`lib/Socket/messages-send.d.ts:10-12`; `MessageReceiptType` includes `'read'`, `'played'` in `lib/Types/Message.d.ts`) | Marks incoming messages read (blue ticks) and sends played receipts for voice notes. | Mark a command read as soon as the handler picks it up, so users see the bot saw it even before the (guarded, delayed) reply arrives. | High | S | unused |
| 3 | Native polls — `{ poll: PollMessageOptions }` (`lib/Types/Message.d.ts:145`, `PollMessageOptions` with `name`/`values`/`selectableCount`) + `getAggregateVotesInPollMessage()` (`lib/Utils/messages.d.ts`) | Sends a real WhatsApp poll and tallies votes per option. | New `.poll "Question?" opt1 opt2` command; also `.quiz` could become a poll. Inbound votes currently only surface as a bare name string via `pollUpdateMessage` parsing in `scripts/cmds/_wa.js:101`. | High | M | unused |
| 4 | Reactions as feedback (inbound) — `'messages.reaction'` event (`lib/Types/Events.d.ts:72`) | Fires when anyone reacts to any message, with key + reaction. | Games/quiz/pinterest "next" via emoji instead of typing: react ✅/❤️ to a result card to confirm, or ❌ to cancel. Outbound `react` is already used; the inbound half is not subscribed anywhere. | High | S | unused |
| 5 | Sticker send — `{ sticker: WAMediaUpload, isAnimated? }` (`lib/Types/Message.d.ts`, `AnyMediaMessageContent`) | Sends a WebP sticker (static or animated). | New `.sticker` command (image → sticker) and sticker replies in fun commands. The adapter already maps sticker attachments (`scripts/cmds/_wa.js:235-236`) but no command ever produces one; inbound stickers are only detected, never answered. | High | S | unused |
| 6 | Voice-note send — `{ audio, ptt: true, seconds? }` (`lib/Types/Message.d.ts:112`) | Sends audio as a voice note (play-in-chat bubble) instead of an audio file. | `.say` (`scripts/cmds/utility/say.js:79`) already generates Bangla TTS but sends it as a plain `audio/mpeg` file; one flag turns it into a real voice note. | High | S | unused |
| 7 | Group settings — `groupSettingUpdate(jid, 'announcement' \| 'not_announcement' \| 'locked' \| 'unlocked')` (`lib/Socket/groups.d.ts:40`) | Admins-only messaging on/off; admins-only group-info edits on/off. | `.groupclose` / `.groupopen` and `.grouplock` admin commands. `groupinfo` already reads `meta.announce` but nothing can change it. | Med | S | unused |
| 8 | Group description — `groupUpdateDescription(jid, description?)` (`lib/Socket/groups.d.ts:21`) | Sets the group "About" text. | `.setdesc <text>` admin command, next to the existing `.settitle` (`groupUpdateSubject`, already used). | Med | S | unused |
| 9 | Group membership controls — `groupJoinApprovalMode(jid, 'on' \| 'off')`, `groupRequestParticipantsList(jid)`, `groupRequestParticipantsUpdate(jid, participants, 'approve' \| 'reject')`, `groupMemberAddMode(jid, 'admin_add' \| 'all_member_add')` (`lib/Socket/groups.d.ts:9-16,41-42`) + `'group.join-request'` event (`lib/Types/Events.d.ts:86`) | Require admin approval for joins, list/approve/reject pending requests, restrict who may add members. | `.joinapproval on/off`, `.pending` list, `.approve @user` — lets group admins run the bot's groups without leaving WhatsApp. Needs the bot to be group admin. | Med | M | unused |
| 10 | Pin message in chat — `{ pin: WAMessageKey, type, time?: 86400 \| 604800 \| 2592000 }` (`lib/Types/Message.d.ts:163`) | Pins a message in the chat for 24h / 7d / 30d. | `.pin` (reply to a message) for rules, prayer times, or the daily result; `.unpin`. Distinct from chat-pinning in row 21. | Med | S | unused |
| 11 | Dedicated invite-link command + revoke — `groupRevokeInvite(jid)` (`lib/Socket/groups.d.ts:23`); `groupInviteCode` already used read-only in `groupinfo.js:115` | Fetches/revokes the group's invite link on demand. | `.invite` command (link as its own message, not buried in `.groupinfo` output) and `.revokeinvite` after abuse. Revoke is the unused half. | Med | S | unused |
| 12 | Message edit in wait-flows — `{ text, edit: WAMessageKey }` (`Editable` in `lib/Types/Message.d.ts`); `message.edit(id, text)` exists only in `scripts/cmds/_wa.js`, the `core/handler/handlerMessage.js` fallback `message` object has no `edit` | Edits a bot-sent text message in place. | Quiz/guess/pinterest `onReply` wait-flows (`core/handler/handlerMessage.js:422-439`, replyMap) currently send a new message per answer; editing the question message in place (like `.slots` already does for its spin frame) would cut spam in long games. | Med | S | unused |
| 13 | Block / unblock + blocklist — `updateBlockStatus(jid, 'block' \| 'unblock')`, `fetchBlocklist()` (`lib/Socket/messages-send.d.ts:93,103`); `'blocklist.set'` / `'blocklist.update'` events (`lib/Types/Events.d.ts:93`) | Blocks/unblocks a user at the WhatsApp-account level and reads the blocklist. | `.block @spammer` admin command as a stronger step than `.kick` (kick only removes from one group); `.unblock`. Account-level, so restrict to bot admins and log it. | Med | S | unused |
| 14 | Location send — `{ location: WALocationMessage }` (`lib/Types/Message.d.ts:152`) | Sends a map pin with latitude/longitude. | `.prayer` could attach the mosque/venue location; `.location <place>` utility. Inbound locations are not parsed at all today (`getBody` returns `""`). | Med | S | unused |
| 15 | Contact send — `{ contacts: { displayName?, contacts: IContactMessage[] } }` (`lib/Types/Message.d.ts:147`) | Sends one or more contacts as a vCard. | `.contact` / share-the-admin's-number command; `.userinfo` could offer "send my contact". Inbound contacts are not parsed today. | Med | S | unused |
| 16 | Disappearing messages — `{ disappearingMessagesInChat: boolean \| number }` and `ephemeralExpiration` send option (`lib/Types/Message.d.ts:182`, `MiscMessageGenerationOptions`), `groupToggleEphemeral(jid, seconds)` (`lib/Socket/groups.d.ts:39`), `updateDefaultDisappearingMode(duration)` (`lib/Socket/messages-send.d.ts:113`), `fetchDisappearingDuration(...)` (`:95`) | Turns disappearing messages on/off per chat or group, and sets the account default timer. | `.disappear 7d` / `.disappear off` per group (privacy-minded groups); `.say`-style one-off sensitive replies. Note the adapter already unwraps inbound ephemeral messages (`_wa.js` `unwrapMessage`). | Med | S | unused |
| 17 | Presence subscribe / who's typing — `presenceSubscribe(toJid)` (`lib/Socket/messages-send.d.ts:86`) + `'presence.update'` event (`lib/Types/Events.d.ts:38`) | Subscribes to and receives live typing/online presence for a chat. | Anti-spam/UX nicety only (e.g. don't send a prayer announcement while an admin is typing). Low practical payoff for a command bot; listed for completeness. | Low | S | unused |
| 18 | Video note + GIF — `{ video, ptv: true }` / `{ video, gifPlayback: true }` (`lib/Types/Message.d.ts:105,108`) | Sends a round video-note bubble, or a looping GIF. | `.animevideo` / fun image commands could send GIF results as real GIFs instead of video files; video notes for short reactions. | Low | S | unused |
| 19 | View-once send — `viewOnce: true` on any message content (`lib/Types/Message.d.ts:74`, `ViewOnce`; applied in `lib/Utils/messages.js:440`) | Sends a photo/video that can be opened once. | `.userinfo` card or a one-time code/QR image. Inbound view-once is already unwrapped by the adapter; outbound is never used. | Low | S | unused |
| 20 | Forward message — `{ forward: WAMessage, force? }` (`lib/Types/Message.d.ts:176`) + `generateForwardMessageContent()` (`lib/Utils/messages.d.ts`) | Forwards an existing message with WhatsApp's "Forwarded" marker. | `.forward` (reply to a message + target group) for announcements across the bot's groups; cheaper than re-uploading media. | Low | S | unused |
| 21 | Chat management — `chatModify(mod, jid)` (`lib/Socket/messages-send.d.ts:116`; `ChatModification` in `lib/Types/Chat.d.ts`: archive / mute / markRead / clear / delete / pin-chat / star) and `star(jid, messages, star)` (`:125`) | Archives, mutes, marks read, clears, or stars chats/messages on the bot's own account. | Housekeeping: mute noisy groups, star important messages (e.g. Irfan's orders) for later review. Account-level side effects — owner-only, and muting changes what the phone shows. | Low | M | unused |
| 22 | Bot profile — `updateProfileName(name)`, `updateProfileStatus(status)`, `updateProfilePicture(jid, content)` (`lib/Socket/messages-send.d.ts:96,101-102`) | Changes the bot account's own name, About text, and avatar. | `.setbotname` / `.setbotabout` owner commands; avatar could be set once from the Social Spark logo instead of by hand on the phone. | Low | S | unused |
| 23 | Fetch user status/about — `fetchStatus(...jids)` (`lib/Socket/messages-send.d.ts:94`) | Reads a user's About/status text. | Enrich `.userinfo` with the person's About line (currently name + avatar only). Cheap, read-only. | Low | S | unused |
| 24 | Group create / leave / list-all — `groupCreate(subject, participants)`, `groupLeave(id)`, `groupFetchAllParticipating()` (`lib/Socket/groups.d.ts:6-7,43`) | Creates a group, leaves one, lists every group the bot is in. | `.groups` (owner-only list of where the bot lives) for ops; `.leave` to exit a group on command. `groupCreate` is high-risk for spam-flagging — owner-only if ever built. | Low | M | unused |
| 25 | Accept invite / invite info — `groupAcceptInvite(code)`, `groupGetInviteInfo(code)`, `groupAcceptInviteV4` / `groupRevokeInviteV4` (`lib/Socket/groups.d.ts:24,31-38`) | Joins a group from an invite link/code and previews a group's info before joining. | `.join <invite-link>` owner command so Irfan can add the bot to a group without adding the number manually. Joining groups by link is a known ban-risk behaviour — owner-only, rare use. | Low | S | unused |
| 26 | Status / stories post — `sendMessage('status@broadcast', content, { statusJidList, backgroundColor, font })` (`lib/Socket/messages-send.js:341`, `MiscMessageGenerationOptions` in `lib/Types/Message.d.ts`) | Posts a text/image/video Status visible to chosen contacts. | Cross-post the daily prayer-time card or a Social Spark announcement as the bot number's Status. Note the handler deliberately ignores inbound `status@broadcast` (`handlerMessage.js:320`) — outbound posting is the unused half. | Low | M | unused |
| 27 | Group-invite message send — `{ groupInvite: GroupInviteInfo }` (`lib/Types/Message.d.ts:159`; built in `lib/Utils/messages.js`) | Sends a rich group-invite card (name + code + expiry) inside a chat. | `.invite` could send the card instead of a bare link; welcome messages in DMs could invite the user to the ORION group. | Low | S | unused |
| 28 | Labels — `addLabel`, `addChatLabel`, `removeChatLabel`, `addMessageLabel`, `removeMessageLabel` (`lib/Socket/messages-send.d.ts:120-124`) | WhatsApp Business-style labels on chats/messages. | Tagging chats (e.g. "vip", "spam") for owner review. Needs a Business-style workflow the bot doesn't have; lowest priority. | Low | S | unused |
| 29 | Contacts address book — `addOrEditContact(jid, contact)`, `removeContact(jid)` (`lib/Socket/messages-send.d.ts:118-119`) | Adds/edits/removes entries in the bot account's contact store. | Save a user's chosen display name as a real contact so future `getUserInfo` calls resolve it (would fix the `sock.getName` gap properly). Depends on row 37's sync events to be useful. | Low | M | unused |
| 30 | Newsletter suite — `newsletterCreate/Update/Follow/Unfollow/Mute/ReactMessage/FetchMessages/Delete/ChangeOwner/Demote/...` (`lib/Socket/messages-send.d.ts:26-46`, `lib/Socket/newsletter.d.ts`) | Creates and manages a WhatsApp Channel (newsletter). | A bot-run announcements channel (prayer times, Social Spark posts) that users follow instead of joining a group. Needs a channel strategy decision first; not a command. | Low | L | unused |
| 31 | Communities suite — `communityCreate/Metadata/ParticipantsUpdate/InviteCode/SettingUpdate/...` (`lib/Socket/communities.d.ts`) | Creates and manages a WhatsApp Community (group of groups). | Grouping the bot's groups under one community. No community exists today and the bot's groups are independent; strategic, not a feature. | Low | L | unused |
| 32 | Business catalog / products — `getCatalog`, `getCollections`, `productCreate/Update/Delete`, `getOrderDetails` (`lib/Socket/business.d.ts:5-17`) + `{ product: WASendableProduct }` message (`lib/Types/Message.d.ts:170`) | Serves a product catalog and product cards from a Business account. | Not applicable: the bot number is a personal account, not a WhatsApp Business account, and the bot sells nothing. Listed only so the table is complete. | Low | L | unused |
| 33 | Call handling — `rejectCall(callId, callFrom)` (`lib/Socket/messages-recv.d.ts`) + `'call'` event (`lib/Types/Events.d.ts`, `WACallEvent` in `lib/Types/Call.d.ts`) | Observes incoming calls and rejects them. | Auto-reject voice/video calls to the bot number with a text reply ("I can't take calls, type .help"). Note: Baileys exposes **no** place-call API — the bot can never dial out. | Low | S | unused |
| 34 | Message-history fetch — `fetchMessageHistory(count, oldestMsgKey, oldestMsgTimestamp)`, `requestPlaceholderResend(messageKey)` (`lib/Socket/messages-recv.d.ts`) | Pulls older messages / re-requests a placeholder ( undecryptable ) message from the phone. | Debugging undecryptable-message gaps; backfilling context for `.irfan` AI replies. Internal tooling, not a user command. | Low | M | unused |
| 35 | Privacy-settings updates — `updateLastSeenPrivacy`, `updateOnlinePrivacy`, `updateProfilePicturePrivacy`, `updateStatusPrivacy`, `updateReadReceiptsPrivacy`, `updateGroupsAddPrivacy`, `updateMessagesPrivacy`, `updateCallPrivacy`, `updateDisableLinkPreviewsPrivacy` (`lib/Socket/messages-send.d.ts:104-112`) | Changes who can see the bot's last-seen/online/picture/status and who may add it to groups. | Hardening: set groups-add to contacts-only to stop strangers adding the bot to spam groups. Account-level and one-way-risky — owner decision, not a command. | Low | S | unused |
| 36 | Request / share phone number — `{ requestPhoneNumber: true }` / `{ sharePhoneNumber: true }` (`lib/Types/Message.d.ts:92,95`) | Asks the user to share their number, or shares the bot's. | `.verify`-style flows that need a confirmed number. Marginal: the bot already knows the sender's JID. | Low | S | unused |
| 37 | Inbound update / delete / sync events — `'messages.update'`, `'messages.delete'` (`lib/Types/Events.d.ts:46,52`), `'messaging-history.set'`, `'chats.upsert'/'chats.update'`, `'contacts.upsert'/'contacts.update'`, `'groups.upsert'/'groups.update'` (`:18,30`) | Notifies when a user edits/deletes a message, and syncs chats/contacts/groups state. | Detect "user deleted their command" (cleanup bot reply), build a real contact-name cache (fixes the `getName` gap in the corrections above), and notice group renames without polling `groupMetadata`. Only `messages.upsert` (notify), `group-participants.update`, `connection.update`, `creds.update` are subscribed today. | Low | M | unused |
| 38 | Media-message refresh — `updateMediaMessage(message)` (`lib/Socket/messages-send.d.ts:24`) | Re-uploads / refreshes an expired media message so it can be downloaded again. | Retry path when `downloadMediaMessage` fails on an old quoted image (`.qrcode` scan, `.geminigen`). Internal reliability helper. | Low | S | unused |

## Mapping to the planned items

**(a) Typing presence** — row 1. One call: `sock.sendPresenceUpdate('composing', jid)` before slow work, `sendPresenceUpdate('paused', jid)` after. Put it in the guarded-send path or at the top of `handlerMessage` for commands with `countDown`/API calls. Caveat: presence updates are extra account activity; keep them only around genuinely slow commands, not every reply, or the bot looks like it is typing constantly. Source: `lib/Socket/messages-send.d.ts:85`.

**(b) Read receipts** — row 2. `sock.readMessages([msg.key])` right after `translateMessage` succeeds in `handlerMessage`, so the sender sees blue ticks immediately. `sendReceipts(keys, 'read')` is the bulk form (`lib/Utils/messages.d.ts`, `aggregateMessageKeysNotFromMe`). No new command needed; it is a handler one-liner. Note: marking read also tells WhatsApp the account is actively attended — fine for a bot, but it is a behaviour change users will notice.

**(c) Native polls** — row 3. Send shape is `{ poll: { name, values: [...], selectableCount: 1 } }` via the existing guarded send; votes arrive as `pollUpdateMessage` (already parsed as text in `_wa.js:101`, which is why a poll vote today looks like a stray message). To count votes properly, subscribe to poll updates on the creation message and use `getAggregateVotesInPollMessage()` (`lib/Utils/messages.js:671`). Suggested first use: `.poll` command, then optionally rebuild `.quiz` on polls.

**(d) Pin** — row 10. Send shape is `{ pin: <WAMessageKey of the target message>, type: 1, time: 86400 | 604800 | 2592000 }` (`lib/Types/Message.d.ts:163`; `PinInChat.Type`). Implement as `.pin` replying to a message (needs the quoted message's key, which the adapter already captures as `messageReply.messageID`) plus `.unpin` (`type: 0`). Unpin semantics are the one unclear point — verify against a live group before shipping.

**(e) Group invite link** — row 11 (and row 27 for the rich card form). `groupInviteCode` is already proven working from `.groupinfo`; a `.invite` command is just that call plus a formatted link (`https://chat.whatsapp.com/<code>`). Add `groupRevokeInvite` as `.revokeinvite`. Both require the bot to be a group admin — fail with a clear message otherwise, as `groupinfo` already does silently.

**(f) Message edit in wait-flows** — row 12. The edit primitive works (`.slots` proves it live). Two gaps: (1) the fallback `message` object built in `core/handler/handlerMessage.js` `buildContextFallback` has `reply/send/react/unsend` but **no `edit`** — add it there for parity with `_wa.js`; (2) `onReply` handlers (quiz, guess, pinterest "next") should edit the original question/result message instead of sending a fresh one each turn. WhatsApp cannot edit a text message into an image, so the `.slots` pattern (edit text → unsend → send card) stays the right model for card results.

**(g) Group settings** — rows 7, 8, 9. All three are single socket calls with no new state: `groupSettingUpdate` (announcement/locked), `groupUpdateDescription`, and the join-approval/member-add trio. Natural commands: `.groupclose/.groupopen`, `.grouplock/.groupunlock`, `.setdesc`, `.joinapproval on/off`, `.pending`, `.approve/.reject`. All require bot-admin; reuse the existing `isGroupAdmin` check in `handlerMessage.js`.

**(h) Reactions as feedback** — row 4 (inbound) — outbound `react` is already used. Subscribe to `'messages.reaction'` in `core/handler/handlerEvents.js` next to the existing `messages.upsert` / `group-participants.update` subscriptions, and route reactions on bot-sent messages (match `reaction.key.id` against IDs the bot sent, e.g. via the existing `replyMap` pattern) to the owning command's handler. First use: pagination (`.pinterest` "next" via ➡️ reaction) and quiz answers (1️⃣–4️⃣).

**(i) Extras**
- **Sticker** — row 5. Adapter-ready; needs a command that produces a sticker attachment (image → WebP; `canvas` is already installed, or fetch a sticker API).
- **Voice note** — row 6. One flag (`ptt: true`) on the `.say` send path; also add `seconds` so the bubble shows the right length.
- **Contact / location** — rows 14–15. New send shapes only; also parse them inbound (today `getBody` returns `""` and `detectMedia` ignores them, so a sent contact/location is invisible to the bot).
- **Disappearing timer** — row 16. `groupToggleEphemeral(jid, seconds)` for groups; `{ disappearingMessagesInChat }` or `ephemeralExpiration` for DMs. Read the current value first with `fetchDisappearingDuration`.
- **Block / unblock** — row 13. `updateBlockStatus(jid, 'block'|'unblock')`; read the list with `fetchBlocklist()`. Owner/admin-only, logged, because it is account-level and hard to undo blindly.

## Capabilities already used (brief, for completeness)

| Capability | Where in the bot |
|---|---|
| Text / image / video / audio / document send (+ captions, quoted replies, mentions) | `scripts/cmds/_wa.js` `toBaileysContent` + `deliver`, `core/sendGuard.js` guarded send, `scripts/events/welcome.js:256-258` |
| Link-preview auto-generation | `core/connection/connect.js` (`generateHighQualityLinkPreview: true`) + Baileys `getUrlInfo` (`lib/Socket/messages-send.js:646`) |
| Outbound reactions | `_wa.js` `message.react`, `handlerMessage.js` fallback `react` |
| Delete / unsend own messages | `_wa.js` `message.unsend` (`{ delete: key }`), `handlerMessage.js` fallback `unsend` |
| Edit own text messages | `_wa.js` `message.edit` (`{ text, edit: key }`) — used live by `.slots` (unsend spin frame, send card) |
| Group metadata read | `sock.groupMetadata` — `_wa.js` `getThreadInfo`, admin commands, `groupinfo`, welcome, prayer scheduler |
| Group participants add/remove/promote/demote | `sock.groupParticipantsUpdate` — `scripts/cmds/admin/add.js`, `kick.js`, `promote.js`, `demote.js` |
| Group subject change | `sock.groupUpdateSubject` — `scripts/cmds/admin/settitle.js:92` |
| Group invite code (read) | `sock.groupInviteCode` — `scripts/cmds/admin/groupinfo.js:115` |
| Profile picture fetch (live avatar) | `sock.profilePictureUrl(jid, "image")` — `scripts/cmds/_card.js` path, `welcome.js:93`, balance/userinfo avatar fetch |
| Number-exists + notify-name check | `sock.onWhatsApp(jid)` — `_wa.js` `getUserInfo` |
| Inbound media download | `sock.downloadMediaMessage(msg)` — `_wa.js` `translateMessage` (image/video/audio/document/sticker, best-effort) |
| Canvas image cards | `scripts/cmds/_card.js` (7 commands) — sent as `{ image, caption }` |
| Inbound unwrap: ephemeral / view-once / captioned-doc | `_wa.js` `unwrapMessage` |
| Inbound parsing: buttons/list responses, poll-update name | `_wa.js` `getBody` (`buttonsResponseMessage`, `listResponseMessage`, `pollUpdateMessage`) |
| LID → phone-JID sender resolution + push-name saving | `_wa.js` `translateMessage` (`participantPn`/`senderPn`), `handlerMessage.js` name save |
| Events subscribed | `messages.upsert` (notify only), `group-participants.update`, `connection.update`, `creds.update` (`core/handler/handlerEvents.js`, `core/connection/connect.js`) |
| Mentions in sends | `welcome.js` (`mentions: mentionJids`), adapter passes `mentionedJid` through |

## Checked but NOT available as a sendable capability in 6.7.24

- **Buttons / list / interactive menus (sending).** `AnyRegularMessageContent` (`lib/Types/Message.d.ts:143-174`) contains only `buttonReply` / `listReply` (replies to a menu someone else sent). There is no `buttonsMessage` / `listMessage` / `interactiveMessage` send shape in 6.7.24, although inbound parsing exists (`lib/Utils/messages.js:611`, `extractFromTemplateMessage`) and the adapter already reads button/list responses. Do not plan a `.menu` command on Baileys 6.7.24 without a version upgrade or a raw-node workaround; native polls (row 3) are the supported interactive alternative.
- **Live-location send.** `liveLocationMessage` is a receivable `MessageType` (`lib/Types/Message.d.ts:40`, `lib/Socket/messages-send.js:516`) but is not in `AnyRegularMessageContent`; treat send support as unconfirmed/version-dependent.
- **Placing calls.** No dial API exists; only `rejectCall` + the `'call'` event (row 33).
- **`sock.getName()`.** Does not exist in 6.7.24 (see correction 3 above).
- **Poll result snapshots / album / sticker-pack messages.** Receivable types only (`MessageWithContextInfo`, `lib/Types/Message.d.ts:40`); no send path in this version.

## Caveats for implementers

- **Anti-ban posture.** The bot's main defence is the guarded send queue (`core/sendGuard.js`: serialised, 800–1500 ms + jitter). Presence updates, read receipts, and rapid pin/edit/block calls are extra account activity; keep them tied to real user actions, never on a timer.
- **Admin-gated calls fail silently without bot-admin.** `groupSettingUpdate`, `groupUpdateDescription`, `groupToggleEphemeral`, `groupInviteCode`, `groupRequestParticipantsUpdate`, and `groupMemberAddMode` all require the bot to be a group admin. Reuse the existing admin checks and return a clear error instead of swallowing the failure (note `groupinfo` currently swallows invite-code errors with `catch {}`).
- **Account-type limits.** Newsletter (row 30), communities (row 31), and catalog/products (row 32) exist on the socket because the default `makeWASocket` composes every layer (`lib/Socket/index.js` → `communities` → `business` → `messages-recv` → `messages-send` → `groups` → `chats`), but channels need a channel strategy and catalog needs a Business account — neither is a code-only change.
- **Edit limits.** WhatsApp edits only change text, and only for a limited window after sending; the `.slots` unsend-then-send-card pattern is the correct model for card results.
- **Version note.** All citations are against the installed 6.7.24 tree. If Baileys is upgraded, re-check the "not available" section first — interactive-menu sending is the most likely thing to have changed.

---

# Part 2 — Implemented: handler smart features (2026-11-27)

Owner file only: `core/handler/handlerMessage.js`. No other file touched. No restart, no push, no new dependencies. Takes effect on the next bot restart.

## (a) Typing presence

- `sock.sendPresenceUpdate('composing', event.threadIDFull)` when a command/reply starts; `'paused'` in a `finally` (success AND error), on both the command path and the reply path (`orionReply` follow-ups). Never sent for ignored messages. Every call wrapped in try/catch.

## (b) Read receipts

- `sock.readMessages([msg.key])` for known commands and reply-path invocations. Status/broadcast, protocol-only, and own messages are filtered out above, so only real incoming messages the bot responds to are marked read. Blue ticks appear as soon as the handler picks the message up.

## (c) Reactions as feedback

- ⏳ at start, then ✅ on success / ❌ on error — skipped for commands on the already-reacts list so their emoji is never overwritten.
- **Order decision:** role/cooldown checks run *before* any typing or reaction, so a rejected command never shows "typing..." and never leaves a stale ⏳ — no `react("")` cleanup needed. The read receipt is the one exception (sent before the role check, because the bot does act on a rejected command by replying with the denial).
- **Already-reacts list** (grep of all command files for `.react(`): irfan (⏳), gemini (+ai, chat), gpt (+chatgpt, gpt5), deepseek (+ds), tart (+tensorart), imagen3 (🎨), fluxproultra (+fpu), lumin (🎨), imgur (⏳/✅/""). All names + aliases in `SELF_REACT_COMMANDS`.

## Handler verification

- `node --check core/handler/handlerMessage.js` — 0 failures.
- Mock test `/tmp/test-handler-smart.js` — **13/13 PASS**: composing before run + paused after, ⏳→✅ on success, ⏳→❌ on throw (error reply still sent), `readMessages` with the exact message key, self-react command (`gemini` reacting 🎨) keeps its own emoji, role-rejected command leaves no stale ⏳/no typing (but is still marked read), unknown command fully silent, `status@broadcast` never marked read, reply path gets the full treatment.
- Baileys methods confirmed present in 6.7.24: `sendPresenceUpdate` (`lib/Socket/chats.js:484`), `readMessages` (`lib/Socket/messages-send.js:105`).

---

# Part 3 — Implemented: new commands + edit-in-place wait flows (2026-11-27)

Working copy only. Bot not restarted, nothing pushed. No new dependencies.

## New commands (7 unique, +7 loader map entries)

| Command | File | Role | What it does |
|---|---|---|---|
| `.poll` | `scripts/cmds/utility/poll.js` | 0 | Native WhatsApp poll: `.poll "question" "opt1" "opt2"` or `q \| a \| b`, 2–10 options, single choice. Full validation, plain-text failures. **Vote counting NOT wired** (needs handler poll-update support) — stated in the guide. |
| `.pin` / `.unpin` | `scripts/cmds/admin/pin.js`, `unpin.js`, `_pin.js` | 1, group-only | Reply to a message to pin it (24h, type 1) / unpin (type 2). Key built from `event.messageReply`. **Mock-tested only, unverified live.** |
| `.grouplink` / `.invite` | `scripts/cmds/admin/grouplink.js` | 1, group-only | Returns `https://chat.whatsapp.com/<code>` via `sock.groupInviteCode`. |
| `.groupsettings` / `.gsettings` | `scripts/cmds/admin/groupsettings.js` | 1, group-only | View from `groupMetadata` (`announce`/`restrict`) **plus toggle** (`announce on\|off`, `edit lock\|unlock` → `groupSettingUpdate`). Mock-verified, not live-verified. |
| `.contact` | `scripts/cmds/utility/contact.js` | 0 | Sends a vCard 3.0 contact card. |
| `.location` | `scripts/cmds/utility/location.js` | 0 | Sends a location pin (lat/lng validated). |

- **Adapter:** minimal `toBaileysContent()` passthrough in `scripts/cmds/_wa.js` for `poll`, `pin` (+type/time), `contacts`, `location` — all sends still go through the guarded `deliver()` path. No new adapter method needed.
- **Collision found & fixed:** `pinterest` already owned the alias `"pin"`, so the loader failed to load one command. Removed the undocumented `"pin"` alias from `pinterest.js` (`.pinterest` still works; nothing in docs referenced `.pin`). Loader 0-failed after this.
- **Baileys verification (cited in code):** poll `Types/Message.d.ts:83-90,145`, `Utils/messages.js:394-410`; pin `Message.d.ts:162-170`, `Utils/messages.js:351-357`, runtime enum `proto.Message.PinInChatMessage.Type = { UNKNOWN 0, PIN_FOR_ALL 1, UNPIN_FOR_ALL 2 }` (confirmed via node); `groupSettingUpdate` `Socket/groups.d.ts:40`; `groupInviteCode` `:22`.

## Edit-in-place wait flows

- **Full edit-in-place (text result):** `animevideo.js` (wait → EDIT result/error); `ai/irfan.js` (new "⏳ ভাবছি…" wait message EDITED into the AI reply; replyMap now registers on the wait message's ID).
- **Error path only (image result — success already followed the slot pattern):** `tart.js`, `geminigen.js`, `imagen3.js`, `fluxproultra.js`, `lumin.js` — on error the wait is EDITED into the error text; only if the edit fails does it send a fresh error reply.
- **Already slot-pattern, left as-is:** `utility/time.js`. `gemini`/`gpt`/`deepseek` use only reactions, nothing to convert.

## Commands verification

- `node --check` on all 16 new/changed files — **0 failures**.
- Real loader: before 136 map entries / 72 unique names / 0 failed → after **150 map entries / 79 unique names / 0 failed**.
- Mock test `/tmp/test-new-commands.js` — **26 passed, 0 failed**: poll shape (quoted + pipe), pin/unpin key shapes (type 1/2, fromMe, participant), invite-code call + link, groupsettings view + toggles, contact vCard, location coords, animevideo `[TEXT, EDIT]`, tart error `[TEXT, EDIT]`, irfan `[TEXT, EDIT]` + replyMap on wait ID, slot still `[TEXT, EDIT, EDIT, DELETE, IMAGE]`.

---

# Part 4 — Independent verification (coordinator re-runs, 2026-11-27)

Re-ran everything the workers claimed, from scratch, without trusting their logs:

- `node --check` on all 18 new/changed files (handlerMessage.js, _wa.js, poll, pin, unpin, _pin, grouplink, groupsettings, contact, location, animevideo, irfan, tart, geminigen, imagen3, fluxproultra, lumin, pinterest) — **0 failures**.
- Real loader (`core/loader.js` `loadCommands()`): **150 map entries, 79 unique command names, 0 failed**. All 7 new commands present (poll, pin, unpin, grouplink, groupsettings, contact, location).
- Mock re-run `/tmp/test-handler-smart.js`: **ALL TESTS PASSED** (13/13).
- Mock re-run `/tmp/test-new-commands.js`: **26 passed, 0 failed**.
- Slot regression re-run: **`[TEXT, EDIT, EDIT, DELETE, IMAGE]`** — all checks PASS, no existing command regressed.
- Bot NOT restarted (all new features take effect on the next restart). Nothing pushed to GitHub. `data/auth/` and `config.json` untouched.

## What still needs a live test (after the next restart)

- `.poll` in a real group (creation should work; votes are read from the poll message itself, not tallied by the bot).
- `.pin` / `.unpin` by replying to a real message (mock only so far; a quoted sender hidden behind a LID may pin the wrong key — pinning the bot's own messages always works).
- `.groupsettings` toggles in a real group (mock only so far).
- Typing presence / blue ticks / ⏳→✅ reactions on a real command (mock only so far).
- `.contact` / `.location` delivery to a real chat.

---

# Part 5 — Deliberately left out + why

- **Poll vote counting** — votes arrive as poll-update messages; counting needs a handler subscription (`messages.upsert` poll-update handling + `getAggregateVotesInPollMessage()`). The handler worker did not add it (out of its assigned scope), so `.poll` is creation-only. The command says so in its guide.
- **`.pin`/`.unpin` + groupsettings toggle live verification** — need a real group and real messages; mock-tested only, marked "unverified live" in code and in Part 3.
- **Sticker from image** (audit row 5) — needs image→WebP conversion; no converter in the bot today. Adapter already maps sticker attachments, so the send side is ready.
- **Voice-note send** (audit row 6) — one `ptt: true` flag on the `.say` send path; not attempted (the two extra slots went to contact + location, which were fully mock-verifiable without new Baileys surface).
- **Disappearing-message timer** (audit row 16) — real Baileys calls (`groupToggleEphemeral`, `updateDefaultDisappearingMode`) but group-wide/account-level side effects; not attempted without a live-test plan.
- **Block / unblock** (audit row 13) — real Baileys calls (`updateBlockStatus`, `fetchBlocklist`) but account-level and hard to undo blindly; owner decision needed, not attempted.
- **Inbound reactions event** (audit row 4) — `'messages.reaction'` subscription for emoji-driven pagination/quiz answers; not implemented. Outbound react (handler ⏳→✅/❌) is done; inbound is a separate subsystem.
- **Group description, join-approval flow, member-add mode** (audit rows 8–9) — single socket calls each, but not built; same pattern as `.groupsettings` if wanted later.
- **Chat management, bot profile, status posting, newsletters, communities, catalog** (audit rows 21, 22, 26, 30–32) — account-level or strategic, not command-sized work.
- **Buttons / list / interactive-menu sending, live-location send, placing calls, `sock.getName()`** — NOT available in Baileys 6.7.24 (see "Checked but NOT available" in Part 1). Native polls are the supported interactive alternative.
- **DM pinning** — skipped deliberately; `.pin` is group-only by design.
