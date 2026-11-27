// Prayer-break scheduler (core/prayerScheduler.js).
// Posts the 5-daily-prayer break announcement (Bangladesh / Asia/Dhaka) to
// every group that enabled it with `.prayer on` (thread setting
// sendPrayerBreak). Started once from WABOT.js after login:
//   const { startPrayerScheduler } = require("./core/prayerScheduler.js");
//   startPrayerScheduler({ sock });   // or { api, threadsData }
//
// Sending goes through global.wabot.send when it exists (the guarded
// send), otherwise the Baileys sock's sendMessage directly, so the
// scheduler also works with a fake sock in tests. A tick never throws:
// every failure is logged and retried later. No moment-timezone here —
// Dhaka wall-clock time comes from Intl, so this file needs no new deps.
// Never sends a stale catch-up: a prayer only fires inside a 2-minute
// window after its time, and each prayer fires once per day.

const {
	PRAYERS, TIMEZONE,
	fetchPrayerTimes, loadCachedTimes, saveCachedTimes,
	buildBreakMessage
} = require("../scripts/cmds/_prayerTimes.js");

let started = false;
let todaysTimes = null; // { date: "YYYY-MM-DD", times: { Fajr: "05:01", ... } }
let sentDate = null; // "YYYY-MM-DD" the sentToday set belongs to
let sentToday = new Set(); // prayer keys already announced today
let lastFetchAttempt = 0;
const FETCH_COOLDOWN_MS = 15 * 60 * 1000;
const TICK_MS = 60 * 1000;
const FIRE_WINDOW_MINUTES = 2; // fire if the tick lands up to 2 min late

// ---- Dhaka wall clock (Intl, no moment) ----

function _dhakaParts(date) {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: TIMEZONE,
		year: "numeric", month: "2-digit", day: "2-digit",
		hour: "2-digit", minute: "2-digit", second: "2-digit",
		hour12: false
	}).formatToParts(date || new Date());
	const out = {};
	for (const p of parts) out[p.type] = p.value;
	// en-GB hour12:false can yield "24" for midnight — normalise it.
	if (out.hour === "24") out.hour = "00";
	return out;
}

function dhakaNow() {
	const p = _dhakaParts();
	return {
		date: `${p.year}-${p.month}-${p.day}`,
		hour: parseInt(p.hour, 10),
		minute: parseInt(p.minute, 10),
		second: parseInt(p.second, 10),
		minutesSinceMidnight: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10)
	};
}

function todayStr() {
	return dhakaNow().date;
}

function resetSentIfNewDay(today) {
	if (sentDate !== today) {
		sentDate = today;
		sentToday = new Set();
	}
}

// ---- Times ----

// Load times for today: live fetch first, cached file as fallback (times
// drift only ~1 min/day, so a day-old cache is still close). Never throws.
async function ensureTimes() {
	try {
		const today = todayStr();
		if (todaysTimes && todaysTimes.date === today) return todaysTimes;
		const now = Date.now();
		if (now - lastFetchAttempt < FETCH_COOLDOWN_MS) return todaysTimes;
		lastFetchAttempt = now;
		const fresh = await fetchPrayerTimes();
		if (fresh) {
			todaysTimes = fresh;
			saveCachedTimes(fresh);
			return todaysTimes;
		}
		const cached = loadCachedTimes();
		if (cached) todaysTimes = cached;
		return todaysTimes;
	} catch (e) {
		return todaysTimes;
	}
}

// ---- Sending ----

function _log(level, ...args) {
	try {
		const logger = (global.wabot && global.wabot.logger) || console;
		const fn = logger[level] || logger.log || console.log;
		fn.call(logger, "[prayer]", ...args);
	} catch (e) { /* logging must never throw */ }
}

// Normalise whatever the caller passes (Messenger-style api, Baileys sock,
// or nothing — global.wabot is consulted) into { send, getThreadInfo }.
function _normalizeSender(apiOrSock) {
	const wabot = global.wabot || {};

	// 1) global.wabot.send is the guarded send — prefer it.
	if (typeof wabot.send === "function") {
		return {
			send: (jid, body) => wabot.send(jid, body),
			getThreadInfo: async (jid) => {
				try {
					if (wabot.sock && typeof wabot.sock.groupMetadata === "function") {
						const meta = await wabot.sock.groupMetadata(jid);
						return { threadName: meta && meta.subject };
					}
				} catch (e) { /* fall through */ }
				return null;
			}
		};
	}

	// 2) A Baileys sock (has sendMessage + groupMetadata). A Messenger-style
	// api also has sendMessage, so groupMetadata is the discriminator.
	const candidate = apiOrSock || wabot.sock;
	if (candidate && typeof candidate.sendMessage === "function"
		&& typeof candidate.groupMetadata === "function") {
		return {
			send: async (jid, body) => {
				// Baileys: sendMessage(jid, { text }). A fake sock in tests
				// may accept a plain string instead — try both.
				try {
					await candidate.sendMessage(jid, { text: body });
				} catch (e) {
					await candidate.sendMessage(jid, body);
				}
			},
			getThreadInfo: async (jid) => {
				try {
					if (typeof candidate.groupMetadata === "function") {
						const meta = await candidate.groupMetadata(jid);
						return { threadName: meta && meta.subject };
					}
				} catch (e) { /* fall through */ }
				try {
					if (typeof candidate.getThreadInfo === "function") {
						return await candidate.getThreadInfo(jid);
					}
				} catch (e) { /* fall through */ }
				return null;
			}
		};
	}

	// 2b) A bare fake/minimal sock in tests: sendMessage only, no
	// groupMetadata and no Messenger-style getThreadInfo. Treat it as
	// Baileys-like (sendMessage(jid, { text })).
	if (candidate && typeof candidate.sendMessage === "function"
		&& typeof candidate.getThreadInfo !== "function") {
		return {
			send: async (jid, body) => {
				try {
					await candidate.sendMessage(jid, { text: body });
				} catch (e) {
					await candidate.sendMessage(jid, body);
				}
			},
			getThreadInfo: async () => null
		};
	}

	// 3) Messenger-style api: sendMessage({ body }, threadID).
	if (apiOrSock && typeof apiOrSock.sendMessage === "function") {
		return {
			send: (jid, body) => apiOrSock.sendMessage({ body }, jid),
			getThreadInfo: async (jid) => {
				try { return await apiOrSock.getThreadInfo(jid); } catch (e) { return null; }
			}
		};
	}

	// No way to send — callers get a sender whose send() throws a clear
	// error; tick() catches it per group, so the scheduler never crashes.
	return {
		send: async () => { throw new Error("No socket available to send prayer break"); },
		getThreadInfo: async () => null
	};
}

function _threadJid(t) {
	if (!t) return null;
	if (t.threadIDFull) return t.threadIDFull;
	const bare = t.threadID || t.id;
	if (!bare) return null;
	if (String(bare).includes("@")) return String(bare);
	return String(bare) + "@g.us"; // prayer breaks only go to groups
}

async function getGroupName(sender, thread, fallback) {
	try {
		const jid = _threadJid(thread);
		if (jid) {
			const info = await sender.getThreadInfo(jid);
			if (info && info.threadName) return info.threadName;
		}
	} catch (e) { /* fall through to the stored name */ }
	return (thread && thread.threadName) || fallback || "this group";
}

// Send one prayer's break announcement to all enabled groups.
// Returns how many groups got it. One group's failure never blocks others.
async function sendPrayerBreak(apiOrSock, threadsData, prayer, startHHMM) {
	const sender = _normalizeSender(apiOrSock);
	let threads = [];
	try {
		const db = threadsData || (global.wabot && global.wabot.db && global.wabot.db.threadsData);
		if (!db || typeof db.getAll !== "function") return 0;
		threads = await db.getAll() || [];
	} catch (e) {
		_log("error", "Could not list threads:", e.message);
		return 0;
	}
	const enabled = threads.filter(t => t && t.settings && t.settings.sendPrayerBreak === true && _threadJid(t));
	let sent = 0;
	for (const t of enabled) {
		try {
			const jid = _threadJid(t);
			const groupName = await getGroupName(sender, t, "this group");
			const body = buildBreakMessage(prayer.bn, groupName, startHHMM);
			await sender.send(jid, body);
			sent++;
		} catch (e) {
			_log("error", `Failed to send ${prayer.key} break to ${_threadJid(t)}:`, e.message);
		}
	}
	return sent;
}

async function tick(apiOrSock, threadsData) {
	try {
		const today = todayStr();
		resetSentIfNewDay(today);
		const times = await ensureTimes();
		if (!times) return; // no times at all yet — retry after the cooldown
		const now = dhakaNow();
		for (const p of PRAYERS) {
			const hhmm = times.times[p.key];
			if (!hhmm) continue;
			if (sentToday.has(p.key)) continue;
			const parts = hhmm.split(":");
			const prayerMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
			const diff = now.minutesSinceMidnight - prayerMinutes;
			// Fire only inside the 2-minute window — never a stale catch-up.
			if (diff >= 0 && diff < FIRE_WINDOW_MINUTES) {
				const n = await sendPrayerBreak(apiOrSock, threadsData, p, hhmm);
				sentToday.add(p.key);
				_log("info", `${p.bn} break sent to ${n} group(s) (${today} ${hhmm} Dhaka)`);
			}
		}
	} catch (e) {
		_log("error", "tick failed:", e.message);
	}
}

function startPrayerScheduler(opts) {
	try {
		if (started) return;
		started = true;
		const options = opts || {};
		const apiOrSock = options.api || options.sock || (global.wabot && global.wabot.sock) || null;
		const threadsData = options.threadsData
			|| (global.wabot && global.wabot.db && global.wabot.db.threadsData)
			|| null;
		// Load the cache immediately so the first tick has something to work with.
		const cached = loadCachedTimes();
		if (cached) todaysTimes = cached;
		const timer = setInterval(() => tick(apiOrSock, threadsData), TICK_MS);
		if (timer && typeof timer.unref === "function") timer.unref();
		// First tick soon after start (not a full minute away).
		const first = setTimeout(() => tick(apiOrSock, threadsData), 10 * 1000);
		if (first && typeof first.unref === "function") first.unref();
		_log("info", "Prayer-break scheduler started (Dhaka, 5 daily, 20-min break)");
	} catch (e) {
		// Safe to call with a fake sock in tests: never throw on start.
		_log("error", "Could not start prayer scheduler:", e && e.message);
	}
}

module.exports = { startPrayerScheduler, sendPrayerBreak, ensureTimes, dhakaNow };
