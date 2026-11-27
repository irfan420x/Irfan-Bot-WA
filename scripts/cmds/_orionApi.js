// Shared ORION API helper (scripts/cmds/_orionApi.js).
// Client for the ORION APIs (base https://orion-apis.vercel.app).
// These endpoints ALREADY exist and are live — this helper only calls
// them; it does not deploy anything.
//
//   orionGemini(messages, opts?) -> reply text
//     POST /gemini/v1/chat/completions, model "flash" (same backend .irfan uses).
//     messages: [{ role: "system"|"user"|"assistant", content: "..." }, ...]
//     Returns the trimmed reply string. Throws on HTTP error / empty reply.
//   orionTensorArt(prompt, opts?) -> { url, reused, taskId }
//     Text-to-image via TensorArt (same backend .tart uses).
//     opts: { width=768, height=1024, fresh=false, userID }
//     Flow (copied from ai-image/tart.js, the verified reference):
//       1) history check first — a repeat prompt costs 0 credit, no limit hit.
//       2) POST /tensorart/v1/generate { prompt, model: "WAN_2_7 IMAGE",
//          width, height, steps: 9 } — usually blocks until FINISH.
//       3) poll GET /tensorart/v1/jobs/<task_id> only when not FINISH yet.
//       4) image URL = /tensorart/v1/image?job=<task_id>.
//     Daily limit: SHARED with .tart — 1 generated image/day per user,
//     stored in data/tart/limits.json (same file + format as tart.js, so the
//     pool is not burned by using 5 commands). History reuse never counts.
//     Throws an Error with .code set:
//       "TENSORART_LIMIT"    — user already generated 1 image today
//       "TENSORART_LOGIN"    — 401 / need login (TensorArt cookie dead)
//       "TENSORART_CREDITS"  — 402/503 / insufficient credits (pool dry today)
//   orionGet(path, opts?) / orionPost(path, data, opts?) -> parsed JSON
//     Generic calls to the ORION base (for future endpoints).
//
// WhatsApp port note: the Messenger bot's ./_http.js (axios wrapper) does
// not exist in this repo, so the small HTTP layer below is inlined here
// using Node 20's built-in fetch, keeping the same axios-like shape
// ({ data, status, headers } and errors with .response.status/.response.data).
// No API keys in this file — the ORION APIs are keyless from the bot side.

const fs = require("fs");
const path = require("path");

const ORION_BASE = "https://orion-apis.vercel.app";

// ---- Minimal axios-shaped HTTP layer over built-in fetch ----
const DEFAULT_TIMEOUT = 15000;

function _headersToObject(headers) {
  const out = {};
  try {
    for (const [k, v] of headers.entries()) out[k.toLowerCase()] = v;
  } catch (e) { /* ignore */ }
  return out;
}

async function _request(config) {
  const timeout = config.timeout || DEFAULT_TIMEOUT;
  const headers = { ...(config.headers || {}) };
  let body;
  if (config.data !== undefined && config.data !== null) {
    if (Buffer.isBuffer(config.data) || typeof config.data === "string") {
      body = config.data;
    } else {
      body = JSON.stringify(config.data);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
  }
  let url = config.url;
  if (config.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(config.params)) {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    const sep = url.includes("?") ? "&" : "?";
    const q = qs.toString();
    if (q) url += sep + q;
  }
  let res;
  try {
    res = await fetch(url, {
      method: config.method || "GET",
      headers,
      body,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw e;
  }
  const headersObj = _headersToObject(res.headers);
  let data;
  if (config.responseType === "arraybuffer") {
    data = Buffer.from(await res.arrayBuffer());
  } else {
    const text = await res.text();
    const ct = headersObj["content-type"] || "";
    if (ct.includes("application/json")) {
      try { data = JSON.parse(text); } catch (e) { data = text; }
    } else {
      try { data = JSON.parse(text); } catch (e) { data = text; }
    }
  }
  if (!res.ok) {
    const err = new Error("Request failed with status " + res.status);
    err.response = { status: res.status, data, headers: headersObj };
    throw err;
  }
  return { data, status: res.status, headers: headersObj };
}

const http = {
  request: _request,
  get(url, config = {}) { return _request({ ...config, method: "GET", url }); },
  post(url, data, config = {}) { return _request({ ...config, method: "POST", url, data }); },
};

// ---- Gemini ----
const GEMINI_URL = ORION_BASE + "/gemini/v1/chat/completions";
const GEMINI_MODEL = "flash";
const GEMINI_TIMEOUT_MS = 120000;

async function orionGemini(messages, opts = {}) {
  const timeout = opts.timeout || GEMINI_TIMEOUT_MS;
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: GEMINI_MODEL, messages }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error("AI API HTTP " + res.status);
  const data = await res.json();
  const reply =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;
  if (!reply || !String(reply).trim()) throw new Error("Empty AI response");
  return String(reply).trim();
}

// ---- TensorArt ----
const TENSORART_MODEL = "WAN_2_7 IMAGE";
const TENSORART_STEPS = 9;
const TENSORART_DAILY_LIMIT_PER_USER = 1; // ~11 credits/image; 50/day total pool

// Shared limit file with .tart (same path + format), so all TensorArt-backed
// commands share one 1/day/user limit instead of each burning the pool
// separately. Path is repo-relative (this file lives in scripts/cmds/).
const LIMITS_FILE = path.join(__dirname, "..", "..", "data", "tart", "limits.json");

function _todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function _loadLimits() {
  try {
    return JSON.parse(fs.readFileSync(LIMITS_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}

function _saveLimits(data) {
  try {
    const dir = path.dirname(LIMITS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LIMITS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn("[orionApi] could not save limits:", e.message);
  }
}

function tensorArtCountFor(uid) {
  const data = _loadLimits();
  const day = data[_todayKey()] || {};
  return day[String(uid)] || 0;
}

function _bumpTensorArtCount(uid) {
  const data = _loadLimits();
  const key = _todayKey();
  if (!data[key]) data[key] = {};
  data[key][String(uid)] = (data[key][String(uid)] || 0) + 1;
  const keys = Object.keys(data).sort();
  while (keys.length > 3) delete data[keys.shift()];
  _saveLimits(data);
}

function _parseParam(parameters, label) {
  const m = String(parameters || "").match(new RegExp(label + ":\\s*([^,\\n]+)"));
  return m ? m[1].trim() : "";
}

async function _findInHistory(prompt, width, height) {
  try {
    const res = await http.get(ORION_BASE + "/tensorart/v1/history?limit=25", { timeout: 15000 });
    const tasks = (res.data && res.data.tasks) || [];
    const want = prompt.trim().toLowerCase();
    for (const t of tasks) {
      if (t.status !== "FINISH") continue;
      const p = _parseParam(t.parameters, "Prompt").toLowerCase();
      const size = _parseParam(t.parameters, "Size");
      const steps = _parseParam(t.parameters, "Steps");
      if (p !== want) continue;
      if (size && size !== width + "x" + height) continue;
      if (steps && steps !== String(TENSORART_STEPS)) continue;
      const item = (t.items || [])[0];
      if (item && item.url) return item.url;
    }
  } catch (e) {
    console.warn("[orionApi] history check failed (continuing to generate):", e.message);
  }
  return null;
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function _tensorArtError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function orionTensorArt(prompt, opts = {}) {
  const width = opts.width || 768;
  const height = opts.height || 1024;
  const fresh = !!opts.fresh;
  const userID = opts.userID != null ? String(opts.userID) : null;

  // 1) History first — a repeat prompt costs 0 credit and never hits the limit.
  let imageUrl = null;
  if (!fresh) imageUrl = await _findInHistory(prompt, width, height);
  if (imageUrl) return { url: imageUrl, reused: true, taskId: null };

  // 2) Limit check (only for a fresh generation, which spends credits).
  if (userID && tensorArtCountFor(userID) >= TENSORART_DAILY_LIMIT_PER_USER) {
    throw _tensorArtError("daily image limit reached", "TENSORART_LIMIT");
  }

  let taskId = null;
  let status = "";
  try {
    const gen = await http.post(
      ORION_BASE + "/tensorart/v1/generate",
      { prompt, model: TENSORART_MODEL, width, height, steps: TENSORART_STEPS },
      { timeout: 120000 }
    );
    const data = gen.data || {};
    taskId = data.task_id || data.job_id || null;
    status = data.status || "";
    if (!taskId) {
      const errMsg = (data.error && data.error.message) || "No task_id from generate";
      throw new Error(errMsg);
    }
  } catch (e) {
    if (e.code) throw e;
    const st = e && e.response && e.response.status;
    const body = e && e.response && e.response.data;
    const msg = (body && body.error && body.error.message) || "";
    if (st === 401 || /need login/i.test(msg)) {
      throw _tensorArtError("TensorArt login expired", "TENSORART_LOGIN");
    }
    if (st === 402 || st === 503 || /insufficient credits/i.test(msg)) {
      throw _tensorArtError("TensorArt credits exhausted", "TENSORART_CREDITS");
    }
    throw e;
  }

  // 3) Poll until FINISH (only when generate did not already finish).
  // Never re-generate on a slow job — that would spend credits twice.
  if (status !== "FINISH") {
    const started = Date.now();
    while (Date.now() - started < 120000) {
      await _sleep(3000);
      const job = await http.get(ORION_BASE + "/tensorart/v1/jobs/" + taskId, { timeout: 15000 });
      status = (job.data && job.data.status) || "";
      if (status === "FINISH") break;
      if (status === "FAIL" || status === "FAILED") throw new Error("Generation failed (" + status + ")");
    }
    if (status !== "FINISH") throw new Error("Image is taking too long — try again in a bit.");
  }

  imageUrl = ORION_BASE + "/tensorart/v1/image?job=" + taskId;
  if (userID) _bumpTensorArtCount(userID);
  return { url: imageUrl, reused: false, taskId };
}

// ---- Generic ORION calls (for future endpoints) ----
async function orionGet(pathSuffix, opts = {}) {
  const res = await http.get(ORION_BASE + pathSuffix, opts);
  return res.data;
}

async function orionPost(pathSuffix, data, opts = {}) {
  const res = await http.post(ORION_BASE + pathSuffix, data, opts);
  return res.data;
}

module.exports = {
  ORION_BASE,
  orionGemini,
  orionTensorArt,
  tensorArtCountFor,
  orionGet,
  orionPost,
};
