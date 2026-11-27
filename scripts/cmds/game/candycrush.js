// .candycrush — Candy Crush with bet & direction reply (WhatsApp port).
// Economy is UNCHANGED from the Messenger original:
//   every match pays matches × 100 × combo (combo grows per cascade);
//   the bet is charged ONCE when the game ends (stop / 60s idle),
//   net = total earned − bet. Rewards land in the balance as they are
//   earned; the bet comes out at the end.
//
// WhatsApp port notes (vs the Messenger original):
// - Game state lives in a module-level Map keyed by threadID (the
//   original used global.irfbotCandy); reply routing uses
//   global.wabot.replyMap with onReply (was orionReply).
// - api.unsendMessage does not exist here — message.unsend(id) is used.
// - usersData has no addMoney(): balances change with get + set of the
//   whole user object (dot-path patch objects do NOT work on the WA
//   in-memory store).
// - The WA handler passes no usersData to onReply, so onReply resolves
//   it from global.wabot.db or core/database/db.js (same store the
//   handler itself falls back to).
// - Only one game per thread; starting a new one ends any old one
//   (the original silently overwrote it and leaked its timer).

const { fm, parseBet, box, medal } = require("./_gameUI.js");
const { usersData: dbUsersData } = require("../../../core/database/db.js");

const ROWS = ["A", "B", "C", "D", "E"];
const CANDIES = ["🍫", "🍬", "🍪", "🍩", "🍉", "🍭", "🍒", "🍓"];

// threadID -> { board, initiator, lastTime, messageID, timer, bet, totalCoins, combos }
const games = new Map();

function resolveUsersData(usersData) {
  return usersData
    || (global.wabot && global.wabot.db && global.wabot.db.usersData)
    || dbUsersData;
}

function replyWithId(message, content) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (id) => { if (!done) { done = true; resolve(id || null); } };
    try {
      const p = message.reply(content, (err, info) => finish(!err && info && info.messageID));
      if (p && typeof p.then === "function")
        p.then((info) => finish(info && info.messageID)).catch(() => finish(null));
      else
        setTimeout(() => finish(null), 5000);
    } catch (e) { finish(null); }
  });
}

function registerReply(messageID, entry) {
  if (!messageID || !global.wabot || !global.wabot.replyMap) return false;
  global.wabot.replyMap.set(messageID, { name: entry.name, commandName: entry.name, ...entry });
  return true;
}

function dropReply(messageID) {
  try {
    if (global.wabot && global.wabot.replyMap) global.wabot.replyMap.delete(messageID);
  } catch {}
}

// ================= BOARD =================

function generateBoard() {
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () =>
      CANDIES[Math.floor(Math.random() * CANDIES.length)]
    )
  );
}

function displayBoard(board) {
  let out = "🍬 CANDY CRUSH 🍬\n\n";
  out += "␣ | 1  2  3  4  5\n";
  board.forEach((row, i) => {
    out += `${ROWS[i]} | ${row.join(" ")}\n`;
  });
  return out;
}

function getPos(t) {
  return [t.charCodeAt(0) - 65, Number(t[1]) - 1];
}

function swap(b, r1, c1, r2, c2) {
  [b[r1][c1], b[r2][c2]] = [b[r2][c2], b[r1][c1]];
}

// Send a fresh board, move the reply target to it, unsend the old one.
async function refreshBoard(event, message, game, footer) {
  const sentID = await replyWithId(message, displayBoard(game.board) + footer);
  if (!sentID) return;

  // 🔄 UPDATE REPLY TARGET
  dropReply(event.messageReply && event.messageReply.messageID);
  registerReply(sentID, {
    name: "candycrush",
    author: event.senderID,
    threadID: event.threadID
  });

  const oldID = game.messageID;
  game.messageID = sentID;
  if (oldID && oldID !== sentID) {
    try { await message.unsend(oldID); } catch {}
  }
}

// ================= MATCH =================

function findMatches(b) {
  const m = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 3; c++)
      if (b[r][c] === b[r][c + 1] && b[r][c] === b[r][c + 2])
        m.push([r, c], [r, c + 1], [r, c + 2]);

  for (let c = 0; c < 5; c++)
    for (let r = 0; r < 3; r++)
      if (b[r][c] === b[r + 1][c] && b[r][c] === b[r + 2][c])
        m.push([r, c], [r + 1, c], [r + 2, c]);

  return m;
}

function removeMatches(b, m) { m.forEach(([r, c]) => b[r][c] = "⬜"); }
function dropCandies(b) {
  for (let c = 0; c < 5; c++)
    for (let r = 4; r >= 0; r--)
      if (b[r][c] === "⬜")
        b[r][c] = CANDIES[Math.floor(Math.random() * CANDIES.length)];
}

// ================= USERS =================

async function addCoins(uid, coins, usersData, combos = 0) {
  const d = await usersData.get(uid) || {};
  if (!d.data) d.data = {};
  d.money = (d.money || 0) + coins;
  if (combos > 0) {
    d.data.candyEarned = (d.data.candyEarned || 0) + coins;
    d.data.candyCombos = (d.data.candyCombos || 0) + combos;
  }
  await usersData.set(uid, d);
}

async function removeCoins(uid, coins, usersData) {
  const d = await usersData.get(uid) || {};
  const newMoney = Math.max(0, (d.money || 0) - coins);
  d.money = newMoney;
  await usersData.set(uid, d);
  return newMoney;
}

async function getTopPlayers(usersData) {
  const all = await usersData.getAll();
  const ranked = all
    .filter(u => ((u.data && u.data.candyEarned) || 0) > 0)
    .sort((a, b) =>
      (((b.data && b.data.candyEarned) || 0) - ((a.data && a.data.candyEarned) || 0)) ||
      (((b.data && b.data.candyCombos) || 0) - ((a.data && a.data.candyCombos) || 0))
    )
    .slice(0, 5);

  return ranked.map(u => ({
    username: u.name || u.id || "Unknown",
    earned: (u.data && u.data.candyEarned) || 0,
    combos: (u.data && u.data.candyCombos) || 0
  }));
}

// ================= END =================

async function endGame(tid, message, usersData) {
  const g = games.get(tid);
  if (!g) return;
  if (g.timer) clearTimeout(g.timer);
  dropReply(g.messageID);

  const newBalance = await removeCoins(g.initiator, g.bet, usersData);
  const net = g.totalCoins - g.bet;
  const netStr = net >= 0 ? `+${fm(net)}` : fm(net);
  const title = net >= 0 ? "🏆 YOU WIN" : "💀 YOU LOSE";

  try {
    await message.reply(box(title, [
      `🔥 Combos: ${g.combos}`,
      `🍬 Earned: ${fm(g.totalCoins)}`,
      `🎲 Bet: ${fm(g.bet)}`,
      `📊 Net: ${netStr}`
    ], [
      `💵 Balance: ${fm(newBalance)}`,
      `🔁 Play again: .cc <bet>`
    ]));
  } catch {}

  const boardID = g.messageID;
  setTimeout(() => {
    try { message.unsend(boardID); } catch {}
    games.delete(tid);
  }, 60000);
}

function startInactivityTimer(tid, message, usersData) {
  return setTimeout(() => {
    const g = games.get(tid);
    if (!g) return;
    if (Date.now() - g.lastTime >= 60000)
      // Timeout ends the game — the captured message.reply still sends
      // to the thread, and the REAL usersData is passed so the bet
      // charge works.
      endGame(tid, message, usersData);
  }, 60000);
}

function resetInactivityTimer(tid, message, usersData) {
  const g = games.get(tid);
  if (!g) return;
  if (g.timer) clearTimeout(g.timer);
  g.timer = startInactivityTimer(tid, message, usersData);
}

module.exports = {
  config: {
    name: "candycrush",
    aliases: ["cc"],
    version: "3.3",
    countDown: 3,
    role: 0,
    description: "🍬 Candy Crush Game",
    category: "game",
    guide: "{pn} <bet> | {pn} top — Reply: E3 U / D / L / R, or stop to end"
  },

  // ================= START =================
  onStart: async function ({ event, message, args, usersData }) {
    usersData = resolveUsersData(usersData);

    // ===== TOP =====
    if (args[0] === "top") {
      const top = await getTopPlayers(usersData);
      if (!top.length)
        return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⚡ No players yet!\n╚══════════════════╝");

      return message.reply(box("🏆 CANDY CRUSH TOP 5", top.map((p, i) =>
        `${medal(i)} ${p.username} — 🍬 ${fm(p.earned)} earned • 🔥 ${p.combos} combos`
      )));
    }

    // ===== BET =====
    const bet = parseBet(args[0]);
    if (!bet || bet <= 0)
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Use: .cc <bet>\n╚══════════════════╝");

    const user = await usersData.get(event.senderID) || {};
    if ((user.money || 0) < bet)
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Not enough balance!\n╚══════════════════╝");

    // One game per thread — end any running one first (its timer is
    // cleared so it cannot charge the bet later).
    const old = games.get(event.threadID);
    if (old) {
      if (old.timer) clearTimeout(old.timer);
      dropReply(old.messageID);
      games.delete(event.threadID);
    }

    const board = generateBoard();

    const game = {
      board,
      initiator: event.senderID,
      lastTime: Date.now(),
      messageID: null,
      timer: null,
      bet,
      totalCoins: 0,
      combos: 0
    };
    games.set(event.threadID, game);

    const sentID = await replyWithId(message,
      displayBoard(board) +
      `\n💰 Bet: ${fm(bet)}\n\nReply with move:\nE3 U / D / L / R\n🛑 Type stop to end the game`
    );
    if (!sentID) {
      games.delete(event.threadID);
      return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Couldn't start the game — please try again.\n╚══════════════════╝");
    }

    registerReply(sentID, {
      name: "candycrush",
      author: event.senderID,
      threadID: event.threadID
    });

    game.messageID = sentID;
    game.timer = startInactivityTimer(event.threadID, message, usersData);
  },

  // ================= REPLY =================
  onReply: async function ({ event, message, usersData }) {
    usersData = resolveUsersData(usersData);
    if (!event.messageReply) return;

    const game = games.get(event.threadID);
    if (!game) return;

    game.lastTime = Date.now();
    // ⏱️ Every reply is activity — restart the 60s inactivity timer.
    resetInactivityTimer(event.threadID, message, usersData);

    // ===== PARSE =====
    const parts = (event.body || "").trim().toUpperCase().split(/\s+/);

    // 🛑 STOP ends the game (the only way to quit early).
    if (parts.length === 1 && parts[0] === "STOP")
      return endGame(event.threadID, message, usersData);

    // ⚠️ Invalid input: warn and KEEP the game going (no bet charged).
    if (parts.length !== 2)
      return message.reply(
        `⚠️ Wrong format! Reply like: E3 U\n` +
        `💡 Reply to the board message above.`
      );

    const pos = parts[0];
    const dir = parts[1];

    if (!/^[A-E][1-5]$/.test(pos))
      return message.reply(
        `⚠️ Invalid position! Use a row A–E and a column 1–5 (e.g. E3).\n` +
        `💡 Reply to the board message above.`
      );

    let [r1, c1] = getPos(pos);
    let r2 = r1, c2 = c1;

    if (dir === "U") r2--;
    else if (dir === "D") r2++;
    else if (dir === "L") c2--;
    else if (dir === "R") c2++;
    else return message.reply(
      `⚠️ Invalid direction! Use U / D / L / R.\n` +
      `💡 Reply to the board message above.`
    );

    if (r2 < 0 || r2 > 4 || c2 < 0 || c2 > 4)
      return message.reply(
        `⚠️ Out of bounds! That move goes off the board.\n` +
        `💡 Reply to the board message above.`
      );

    swap(game.board, r1, c1, r2, c2);

    let reward = 0;
    let combo = 0;

    while (true) {
      const matches = findMatches(game.board);
      if (!matches.length) break;

      combo++;
      game.combos++;

      const r = matches.length * 100 * combo;
      reward += r;

      removeMatches(game.board, matches);
      dropCandies(game.board);
    }

    // 😢 No match — swap the candies back and keep playing.
    if (!reward) {
      swap(game.board, r1, c1, r2, c2);
      return refreshBoard(event, message, game,
        `\n😢 No match! The candies swap back.\n\nReply next move (or stop to end)`
      );
    }

    game.totalCoins += reward;
    await addCoins(event.senderID, reward, usersData, combo);

    return refreshBoard(event, message, game,
      `\n🔥 Combo x${combo}\n💰 +${fm(reward)}  •  Total: ${fm(game.totalCoins)}\n\nReply next move (or stop to end)`
    );
  }
};
