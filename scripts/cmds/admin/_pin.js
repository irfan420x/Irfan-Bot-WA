"use strict";

// Shared pin/unpin helper for admin/pin.js and admin/unpin.js.
// (The handler does NOT pass commandName to onStart, so pin and unpin
// are two modules sharing this helper instead of one module branching
// on the invoked name.)
//
// Baileys pin shape — verified in Baileys 6.7.24 source:
//   Types/Message.d.ts:162-170: { pin: WAMessageKey,
//     type: proto.PinInChat.Type, time?: 86400 | 604800 | 2592000 }
//   Utils/messages.js:351-357: builds pinInChatMessage { key: message.pin,
//     type: message.type, senderTimestampMs: Date.now() }; the duration
//     applies only when type === 1.
//   Runtime enum (node: proto.Message.PinInChatMessage.Type):
//     UNKNOWN_TYPE 0, PIN_FOR_ALL 1, UNPIN_FOR_ALL 2.
//   Socket/messages-send.js:665 + 681-683: pin sends go out with
//     additionalAttributes.edit = '2'.
// Pin duration used here: 86400 (24 hours, the WhatsApp default).
//
// Target key: built from event.messageReply (messageID + senderID).
// - Bot's own message: fromMe true, no participant.
// - Another member's message: fromMe false, participant = sender's full
//   JID (bare senderID + @s.whatsapp.net). Caveat: the adapter's
//   messageReply stores only the bare senderID, so if WhatsApp hid that
//   sender behind a LID, the participant JID is wrong and WhatsApp
//   rejects the pin — the command then replies with a plain-text
//   failure instead of crashing. Pinning the bot's own messages always
//   works, since it needs no participant.

function bareId(jid) {
  if (!jid) return "";
  return String(jid).split("@")[0].split(":")[0];
}

function groupJidOf(event) {
  if (event.threadIDFull) return event.threadIDFull;
  if (event.threadID) return String(event.threadID).replace(/\D/g, "") + "@g.us";
  return null;
}

function botBareId(sock) {
  const raw = (sock && sock.user && sock.user.id)
    || (global.wabot && global.wabot.sock && global.wabot.sock.user && global.wabot.sock.user.id)
    || "";
  return bareId(raw);
}

async function doPin({ message, event, sock, unpin }) {
  if (!event.isGroup) {
    return message.reply("⚠️ Pin only works in a group chat.\nReply to a message with .pin / .unpin inside a group.");
  }
  const reply = event.messageReply;
  if (!reply || !reply.messageID) {
    return message.reply(
      "⚠️ Reply to the message you want to " + (unpin ? "unpin" : "pin") + ".\n" +
      "Usage: reply to a message, then send " + (unpin ? ".unpin" : ".pin")
    );
  }
  const groupJid = groupJidOf(event);
  if (!groupJid) return message.reply("❌ Could not work out which group this is.");

  const targetBare = bareId(reply.senderID);
  const isBotMsg = Boolean(targetBare) && botBareId(sock) && targetBare === botBareId(sock);
  const key = { remoteJid: groupJid, fromMe: isBotMsg, id: reply.messageID };
  if (!isBotMsg) {
    // A member's message: participant must be their full JID.
    if (!targetBare) return message.reply("❌ Could not work out who sent the replied message.");
    key.participant = targetBare + "@s.whatsapp.net";
  }

  try {
    if (unpin) {
      await message.send({ pin: key, type: 2 });
    } else {
      await message.send({ pin: key, type: 1, time: 86400 });
    }
    return message.reply((unpin ? "📌 Message unpinned." : "📌 Message pinned for 24 hours."));
  } catch (e) {
    console.error("[pin] failed:", (e && e.message) || e);
    return message.reply(
      "❌ Could not " + (unpin ? "unpin" : "pin") + " that message. " +
      "The bot may need to be a group admin, or the message may be too old.\n" +
      "Note: pinning is UNVERIFIED LIVE — it was mock-tested only (see _audit-work/commands-section.md)."
    );
  }
}

module.exports = { doPin, bareId, groupJidOf };
