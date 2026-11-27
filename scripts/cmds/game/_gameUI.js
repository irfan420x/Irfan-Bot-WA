// Shared visual helpers for game commands (scripts/cmds/game/_gameUI.js).
// One box style, one money formatter, one bet parser — so every game
// looks and reads the same. Pure functions, no bot state, no language
// dependency: games call these and embed the result in their own
// messages.
//
//   box(title, bodyLines, footerLines)
//     Standard result box (slot's style):
//       ╔═══ 🎰 GAME NAME ═══╗
//       ║ <body lines>
//       ╠══════════════════╣
//       ║ <footer lines>
//       ╚══════════════════╝
//     title: header text (e.g. "🏆 YOU WIN", "💀 YOU LOSE", "🎰 SLOT MACHINE").
//     bodyLines / footerLines: arrays of strings (each becomes one "║ ..." line).
//     footerLines is optional.
//
//   fm(n)
//     Money formatter: 1500 -> "1.50K", 2500000 -> "2.50M", 3200000000 -> "3.20B",
//     1100000000000 -> "1.10T", 1000000000000000 -> "1.00QT". Negative keeps the sign.
//
//   parseBet(str)
//     Bet parser with suffixes: "1k" -> 1000, "2.5m" -> 2500000, "1b" -> 1e9,
//     "1t" -> 1e12, "1qt" -> 1e15, "500" -> 500. Returns null for invalid input
//     (empty, non-numeric, negative, zero, NaN, Infinity).
//
//   parseAmount(str, balance)
//     Amount parser for bank-style commands: "all" / "max" -> the full balance,
//     "half" -> half the balance (floored), otherwise the same number/suffix
//     parsing as parseBet. Returns null for invalid input. Note: "all" / "max" /
//     "half" of a zero balance return 0 — callers must still reject amount <= 0.
//
//   streakText(streak)
//     "🔥 Streak: 3" plus a shoutout at 3/5/10 wins in a row.
//     Display only — it never changes payouts.
//
//   medal(i)
//     "🥇" / "🥈" / "🥉" for 0/1/2, otherwise "4." / "5." ... (i is 0-based).

function fm(n) {
	const num = Number(n);
	if (!isFinite(num))
		return "0";
	const sign = num < 0 ? "-" : "";
	const abs = Math.abs(num);
	const units = [
		[1e15, "QT"],
		[1e12, "T"],
		[1e9, "B"],
		[1e6, "M"],
		[1e3, "K"]
	];
	for (const [value, suffix] of units) {
		if (abs >= value)
			return sign + (abs / value).toFixed(2) + suffix;
	}
	return sign + String(Math.floor(abs));
}

function parseBet(str) {
	if (str === undefined || str === null)
		return null;
	const s = String(str).trim().toLowerCase();
	if (!s)
		return null;
	const m = s.match(/^(\d+(?:\.\d+)?)\s*(qt|k|m|b|t)?$/);
	if (!m)
		return null;
	const num = parseFloat(m[1]);
	const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12, qt: 1e15 }[m[2] || ""] || 1;
	const value = Math.floor(num * mult);
	if (!isFinite(value) || value <= 0)
		return null;
	return value;
}

function parseAmount(str, balance) {
	const max = Math.max(0, Math.floor(Number(balance) || 0));
	if (str === undefined || str === null)
		return null;
	const s = String(str).trim().toLowerCase();
	if (s === "all" || s === "max")
		return max;
	if (s === "half")
		return Math.floor(max / 2);
	return parseBet(s);
}

function box(title, bodyLines, footerLines) {
	const body = (bodyLines || []).map(l => `║ ${l}`).join("\n");
	const foot = (footerLines || []).map(l => `║ ${l}`).join("\n");
	let out = `╔═══ ${title} ═══╗\n${body}`;
	if (foot)
		out += `\n╠══════════════════╣\n${foot}`;
	out += `\n╚══════════════════╝`;
	return out;
}

function streakText(streak) {
	const n = Number(streak) || 0;
	if (n <= 0)
		return "";
	if (n >= 10)
		return `🔥 Streak: ${n} — UNSTOPPABLE! 👑`;
	if (n >= 5)
		return `🔥 Streak: ${n} — ON FIRE!`;
	if (n >= 3)
		return `🔥 Streak: ${n}!`;
	return `🔥 Streak: ${n}`;
}

function medal(i) {
	return ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
}

module.exports = { fm, parseBet, parseAmount, box, streakText, medal };
