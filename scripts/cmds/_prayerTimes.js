// Shared prayer-times helper (scripts/cmds/_prayerTimes.js).
// Bangladesh 5-daily prayer times (Asia/Dhaka) via the free Aladhan API
// (no key). Method 1 (Karachi — Fajr/Isha 18 deg) matches the Islamic
// Foundation Bangladesh calculation. Times are cached to a JSON file so a
// restart or a failed fetch never leaves the scheduler with nothing.
// Also: Bengali formatting (digits, dayparts) + the break announcement
// message, in Irfan's exact wording.
//
// WhatsApp port note: the Messenger bot's fs-extra + ./_http.js (axios)
// do not exist in this repo, so plain fs + Node 20's built-in fetch are
// used instead. Behaviour is identical.

const fs = require("fs");
const path = require("path");

const TIMEZONE = "Asia/Dhaka";
const CITY = "Dhaka";
const COUNTRY = "Bangladesh";
const METHOD = 1;
const BREAK_MINUTES = 20; // Irfan's example: Maghrib 5:20-5:40
const CACHE_PATH = path.join(__dirname, "../../data/prayer/times.json");

// Ordered 5 daily prayers: Aladhan key -> Bengali name.
const PRAYERS = [
	{ key: "Fajr", bn: "ফজর" },
	{ key: "Dhuhr", bn: "যোহর" },
	{ key: "Asr", bn: "আসর" },
	{ key: "Maghrib", bn: "মাগরিব" },
	{ key: "Isha", bn: "এশা" }
];

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
function toBengaliDigits(str) {
	return String(str).replace(/[0-9]/g, d => BN_DIGITS[+d]);
}

// "17:11" -> "সন্ধ্যা ৫:১১" (12-hour + Bengali digits + daypart).
function formatBengaliTime(hhmm) {
	const parts = String(hhmm).split(":");
	const h = parseInt(parts[0], 10);
	const m = parseInt(parts[1], 10);
	if (isNaN(h) || isNaN(m)) return String(hhmm);
	let part;
	if (h >= 4 && h < 6) part = "ভোর";
	else if (h >= 6 && h < 12) part = "সকাল";
	else if (h >= 12 && h < 16) part = "দুপুর";
	else if (h >= 16 && h < 17) part = "বিকাল";
	else if (h >= 17 && h < 20) part = "সন্ধ্যা";
	else part = "রাত";
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return `${part} ${toBengaliDigits(h12)}:${toBengaliDigits(String(m).padStart(2, "0"))}`;
}

// "17:11" + 20 min -> "17:31" (24h, wraps past midnight).
function addMinutes(hhmm, mins) {
	const parts = String(hhmm).split(":");
	const total = ((parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + mins) % (24 * 60) + 24 * 60) % (24 * 60);
	return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Fetch today's Dhaka times. Returns { date: "YYYY-MM-DD", times: {...} }
// or null on any failure (caller falls back to the cache).
async function fetchPrayerTimes() {
	try {
		const qs = new URLSearchParams({ city: CITY, country: COUNTRY, method: String(METHOD) });
		const res = await fetch("https://api.aladhan.com/v1/timingsByCity?" + qs.toString(), {
			signal: AbortSignal.timeout(15000),
		});
		if (!res.ok) return null;
		const json = await res.json();
		const data = json && json.data;
		if (!data || !data.timings) return null;
		const times = {};
		for (const p of PRAYERS) {
			const raw = String(data.timings[p.key] || "").split(" ")[0]; // "05:01 (BST)" -> "05:01"
			if (!/^\d{2}:\d{2}$/.test(raw)) return null;
			times[p.key] = raw;
		}
		// Aladhan gregorian date is "DD-MM-YYYY".
		const g = (data.date && data.date.gregorian && data.date.gregorian.date) || "";
		const d = g.split("-");
		if (d.length !== 3 || d[2].length !== 4) return null;
		return { date: `${d[2]}-${d[1]}-${d[0]}`, times };
	} catch (e) {
		return null;
	}
}

function loadCachedTimes() {
	try {
		const c = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
		if (c && c.date && c.times) return c;
		return null;
	} catch (e) {
		return null;
	}
}

function saveCachedTimes(payload) {
	try {
		fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
		fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2), "utf8");
		return true;
	} catch (e) {
		return false;
	}
}

// Irfan's exact announcement wording, with the prayer name, the real group
// name and the break window filled in.
function buildBreakMessage(prayerBn, groupName, startHHMM) {
	const endHHMM = addMinutes(startHHMM, BREAK_MINUTES);
	const startBn = formatBengaliTime(startHHMM);
	const endBn = formatBengaliTime(endHHMM);
	return [
		`📢 নামাজের বিরতি ঘোষণা | ${groupName} 🕌`,
		``,
		`🤝 সম্মানিত ${groupName} গ্রুপের সদস্যবৃন্দ,🔊`,
		``,
		`🕊️ আসসালামু আলাইকুম ওয়া রাহমাতুল্লাহ।`,
		``,
		`⏳ 📌নামাজের পবিত্র সময় হওয়ায় গ্রুপের কার্যক্রম সাময়িকভাবে নামাজের বিরতির জন্য বন্ধ রাখা হচ্ছে।🔕✅`,
		``,
		`🕌 ওয়াক্ত: ${prayerBn} ✅🕋🕌`,
		``,
		`⏰ বিরতির সময়: ${startBn} ⏰থেকে – ${endBn} ⏰পর্যন্ত 🕌⛪🕋`,
		``,
		`🔄 নামাজের পর যথাসময়ে আবারও আমাদের আড্ডা ও কার্যক্রম শুরু হবে, ইনশাআল্লাহ। 🤲 সবাই নামাজ আদায় করে নেবেন এবং গ্রুপের শৃঙ্খলা বজায় রাখবেন। 🛡️`,
		``,
		`🙏 ধন্যবাদ,`,
		``,
		`👑 অ্যাডমিন প্যানেল — ${groupName} ✨`
	].join("\n");
}

module.exports = {
	PRAYERS, BREAK_MINUTES, TIMEZONE,
	toBengaliDigits, formatBengaliTime, addMinutes,
	fetchPrayerTimes, loadCachedTimes, saveCachedTimes,
	buildBreakMessage
};
