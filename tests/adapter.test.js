'use strict';
/**
 * tests/adapter.test.js — mock test for the Baileys -> Messenger adapter.
 *
 * NO Baileys import, NO network. It requires ../scripts/cmds/_wa.js and
 * ../scripts/cmds/info/ping.js, translates fake Baileys message objects
 * with _wa.js, asserts the translated event shape, then runs ping.onStart
 * with a fake sock and asserts the reply contains "Pong".
 *
 * Run: node tests/adapter.test.js
 * Exit 0 only if every assertion passes, non-zero otherwise.
 *
 * NOTE on the adapter interface: _wa.js exports translateMessage(sock, msg),
 * an async function taking the socket FIRST and the Baileys message second
 * (see scripts/cmds/_wa.js). This test calls it that way, with a fake sock.
 * For robustness it also accepts a plain function export or an object with
 * one of: toEvent / translate / adapt / convert / baileysToEvent. If none
 * of those exist the test fails with a clear message naming the shape.
 */

const path = require('path');

let pass = 0;
let fail = 0;
const failures = [];

function assert(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Load the modules under test. If a parallel worker has not written them
// yet, report that plainly and exit non-zero (the coordinator re-runs).
// ---------------------------------------------------------------------------
let waModule = null;
let translate = null;
let ping = null;

try {
  waModule = require('../scripts/cmds/_wa.js');
  translate =
    typeof waModule === 'function'
      ? waModule
      : waModule.translateMessage ||
        waModule.toEvent ||
        waModule.translate ||
        waModule.adapt ||
        waModule.convert ||
        waModule.baileysToEvent ||
        null;
  if (!translate) {
    console.log(
      'FAIL: _wa.js loaded but exports no translator (expected a function ' +
        'export, or one of: translateMessage / toEvent / translate / adapt / ' +
        'convert / baileysToEvent). Export keys: ' +
        Object.keys(waModule || {}).join(', ')
    );
    fail++;
  }
} catch (err) {
  console.log(`FAIL: could not require ../scripts/cmds/_wa.js — ${err.message}`);
  fail++;
}

try {
  ping = require('../scripts/cmds/info/ping.js');
} catch (err) {
  console.log(`FAIL: could not require ../scripts/cmds/info/ping.js — ${err.message}`);
  fail++;
}

// Placeholder numbers only — no real phone numbers anywhere in this file.
const GROUP_JID = '120363020000001@g.us';
const GROUP_BARE = '120363020000001';
const SENDER_JID = '880100000001@s.whatsapp.net';
const SENDER_BARE = '880100000001';
const MENTIONED_JID = '880100000002@s.whatsapp.net';
const MENTIONED_BARE = '880100000002';
const DM_JID = '880100000003@s.whatsapp.net';
const DM_BARE = '880100000003';

// A group text message with a mention and a quoted reply.
const groupMsg = {
  key: {
    remoteJid: GROUP_JID,
    fromMe: false,
    id: 'GROUPMSG123',
    participant: SENDER_JID,
  },
  pushName: 'Test Sender',
  messageTimestamp: 1764240000,
  message: {
    extendedTextMessage: {
      text: '.ping @Test',
      contextInfo: {
        mentionedJid: [MENTIONED_JID],
        quotedMessage: { conversation: 'hello there' },
        quotedMessageId: 'QUOTED123',
        stanzaId: 'QUOTED123',
        participant: MENTIONED_JID,
      },
    },
  },
};

// A plain DM (no mention, no quote).
const dmMsg = {
  key: { remoteJid: DM_JID, fromMe: false, id: 'DMMSG123' },
  pushName: 'DM Sender',
  messageTimestamp: 1764240001,
  message: { conversation: '.ping' },
};

let groupEvent = null;
let dmEvent = null;

// Fake sock for the translator: translateMessage(sock, msg) only uses it
// for media downloads, which these text messages have none of — the stub
// exists so the call shape is honest.
const fakeSockForTranslate = {
  downloadMediaMessage: async () => null,
};

async function runTranslationTests() {
  if (translate) {
    try {
      groupEvent = await translate(fakeSockForTranslate, groupMsg);
    } catch (err) {
      console.log(`FAIL: _wa.js translator threw on the group message — ${err.message}`);
      fail++;
    }
    try {
      dmEvent = await translate(fakeSockForTranslate, dmMsg);
    } catch (err) {
      console.log(`FAIL: _wa.js translator threw on the DM message — ${err.message}`);
      fail++;
    }
  }


if (groupEvent) {
  assert(
    'group: body is the message text',
    typeof groupEvent.body === 'string' && groupEvent.body.includes('.ping'),
    `body=${JSON.stringify(groupEvent.body)}`
  );
  assert(
    'group: threadID is the bare group id',
    groupEvent.threadID === GROUP_BARE,
    `threadID=${JSON.stringify(groupEvent.threadID)}`
  );
  assert(
    'group: senderID is the bare participant id',
    groupEvent.senderID === SENDER_BARE,
    `senderID=${JSON.stringify(groupEvent.senderID)}`
  );
  assert('group: isGroup is true', groupEvent.isGroup === true, `isGroup=${groupEvent.isGroup}`);
  assert(
    'group: mentions contains the mentioned bare id',
    groupEvent.mentions &&
      Object.prototype.hasOwnProperty.call(groupEvent.mentions, MENTIONED_BARE) &&
      typeof groupEvent.mentions[MENTIONED_BARE] === 'string' &&
      groupEvent.mentions[MENTIONED_BARE].startsWith('@'),
    `mentions=${JSON.stringify(groupEvent.mentions)}`
  );
  const mr = groupEvent.messageReply;
  assert(
    'group: messageReply senderID is the quoted sender',
    mr && mr.senderID === MENTIONED_BARE,
    `messageReply=${JSON.stringify(mr)}`
  );
  assert(
    'group: messageReply body is the quoted text',
    mr && mr.body === 'hello there',
    `messageReply=${JSON.stringify(mr)}`
  );
  const replyId = mr && (mr.messageID || mr.id || mr.stanzaId);
  assert(
    'group: messageReply messageID is the quoted id',
    replyId === 'QUOTED123',
    `messageReply=${JSON.stringify(mr)}`
  );
}

if (dmEvent) {
  assert(
    'dm: body is the message text',
    typeof dmEvent.body === 'string' && dmEvent.body.includes('.ping'),
    `body=${JSON.stringify(dmEvent.body)}`
  );
  assert(
    'dm: threadID is the bare sender id',
    dmEvent.threadID === DM_BARE,
    `threadID=${JSON.stringify(dmEvent.threadID)}`
  );
  assert(
    'dm: senderID is the bare sender id',
    dmEvent.senderID === DM_BARE,
    `senderID=${JSON.stringify(dmEvent.senderID)}`
  );
  assert('dm: isGroup is false', dmEvent.isGroup === false, `isGroup=${dmEvent.isGroup}`);
  assert(
    'dm: mentions is empty',
    dmEvent.mentions && Object.keys(dmEvent.mentions).length === 0,
    `mentions=${JSON.stringify(dmEvent.mentions)}`
  );
  assert(
    'dm: messageReply is null',
    dmEvent.messageReply === null || dmEvent.messageReply === undefined,
    `messageReply=${JSON.stringify(dmEvent.messageReply)}`
  );
  }
}

// ---------------------------------------------------------------------------
// ping.onStart with a fake sock.
// ---------------------------------------------------------------------------
async function runPingTest() {
  if (!ping || typeof ping.onStart !== 'function') {
    console.log('FAIL: ping.js has no onStart function to run');
    fail++;
    return;
  }
  if (!groupEvent && !dmEvent) {
    console.log('FAIL: no translated event available, cannot run ping test');
    fail++;
    return;
  }

  const captured = [];
  const capture = (content) => {
    if (typeof content === 'string') captured.push(content);
    else if (content && typeof content === 'object')
      captured.push(content.body || content.text || JSON.stringify(content));
    else captured.push(String(content));
  };

  // Fake sock: sendMessage captures the sent content and resolves with a
  // fake message id (Baileys-style promise form).
  const fakeSock = {
    sendMessage: async (jid, content) => {
      capture(content);
      return { key: { id: 'FAKE_MSG_ID' } };
    },
  };

  // Fake api: callback-style sendMessage like the Messenger api shape.
  const fakeApi = {
    sendMessage: (content, threadID, cb) => {
      capture(content);
      if (typeof cb === 'function') cb(null, { messageID: 'FAKE_MSG_ID' });
      return { messageID: 'FAKE_MSG_ID' };
    },
    getThreadInfo: async () => ({
      threadName: 'Test Group',
      participantIDs: [SENDER_BARE],
      adminIDs: [],
      userInfo: {},
      isGroup: true,
    }),
    getUserInfo: async () => ({ name: 'Test Sender' }),
  };

  // Fake message object: reply/send capture, react/unsend are no-ops.
  const fakeMessage = {
    reply: (content, cb) => {
      capture(content);
      if (typeof cb === 'function') cb(null, { messageID: 'FAKE_MSG_ID' });
    },
    send: (content, cb) => {
      capture(content);
      if (typeof cb === 'function') cb(null, { messageID: 'FAKE_MSG_ID' });
    },
    react: () => {},
    unsend: () => {},
  };

  const stubDb = {
    get: async () => ({}),
    set: async () => {},
    getAll: async () => [],
  };

  const event = groupEvent || dmEvent;
  try {
    await ping.onStart({
      api: fakeApi,
      event,
      args: [],
      message: fakeMessage,
      threadsData: stubDb,
      usersData: stubDb,
      role: 0,
      sock: fakeSock,
    });
  } catch (err) {
    console.log(`FAIL: ping.onStart threw — ${err.message}`);
    fail++;
    return;
  }

  const joined = captured.join('\n');
  assert(
    'ping: captured reply contains "Pong"',
    /pong/i.test(joined),
    `captured=${JSON.stringify(captured)}`
  );
  assert('ping: something was actually sent', captured.length > 0, 'nothing captured');
}

(async () => {
  await runTranslationTests();
  await runPingTest();
  console.log(`\nadapter.test.js: ${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log(`Failing assertions: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('adapter.test.js: ALL PASS');
  process.exit(0);
})().catch((err) => {
  console.error(`adapter.test.js crashed: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
