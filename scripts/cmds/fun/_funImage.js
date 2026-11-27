"use strict";

// _funImage.js — shared helpers for the fun/love image commands
// (WhatsApp ports of the Messenger bot's fun-image commands).
//
// ORION fun-image endpoints (LIVE, base https://orion-apis.vercel.app):
//   POST /fun-image/v1/<template> { avatars: [...] } / { uid } / { emojis: [...] }
//   -> PNG bytes. NoobCore stays as fallback when ORION fails, exactly as
//   in the Messenger originals (same GitHub-raw NCApiUrl.json lookup).
//
// WhatsApp differences (vs the Messenger originals):
// - No usersData.getAvatarUrl / Facebook graph URLs. Avatars come from
//   sock.profilePictureUrl(bareId + "@s.whatsapp.net") — throws when the
//   user has no picture or it is private; callers turn that into a clear
//   error reply instead of crashing.
// - No _http.js / _img.js / _tmp.js here: plain global fetch + Buffers,
//   sent as message.reply({ body, attachment: { buffer, mimetype, fileName } }).
// - No getLang: the English strings from the originals are inlined.

const ORION_BASE = "https://orion-apis.vercel.app";
const NC_API_CONFIG =
  "https://raw.githubusercontent.com/noobcore404/NC-STORE/main/NCApiUrl.json";

const AVATAR_FAIL =
  "❌ Couldn't fetch the profile picture — the user may not have one set, or it may be private.";

function bareId(id) {
  if (!id) return "";
  return String(id).split("@")[0].split(":")[0].replace(/\D/g, "");
}

// Mention first, then quoted (replied-to) sender, then the sender themself.
function resolveTarget(event) {
  if (event.mentions && Object.keys(event.mentions).length > 0) {
    return bareId(Object.keys(event.mentions)[0]);
  }
  if (event.messageReply && event.messageReply.senderID) {
    return bareId(event.messageReply.senderID);
  }
  return bareId(event.senderID);
}

// Mention first, then quoted sender; null when neither is present.
function resolveMentionOrReply(event) {
  if (event.mentions && Object.keys(event.mentions).length > 0) {
    return bareId(Object.keys(event.mentions)[0]);
  }
  if (event.messageReply && event.messageReply.senderID) {
    return bareId(event.messageReply.senderID);
  }
  return null;
}

// Best-effort display name: WhatsApp notify name first, then stored
// bot data, then the bare id. Never throws.
async function displayName(api, usersData, bare) {
  try {
    if (api && typeof api.getUserInfo === "function") {
      const info = await api.getUserInfo(bare);
      const name =
        (info && info.name) || (info && info[bare] && info[bare].name);
      if (name) return name;
    }
  } catch (_) { /* fall through */ }
  try {
    if (usersData && typeof usersData.getName === "function") {
      const name = await usersData.getName(bare);
      if (name) return name;
    }
  } catch (_) { /* fall through */ }
  return bare;
}

// WhatsApp profile-picture URL for a bare id. Throws when there is no
// picture / it is private / no socket — callers reply AVATAR_FAIL.
async function getAvatarUrl(sock, bare) {
  if (!sock || typeof sock.profilePictureUrl !== "function") {
    throw new Error("No socket available for profile picture");
  }
  const url = await sock.profilePictureUrl(bare + "@s.whatsapp.net", "image");
  if (!url) throw new Error("No profile picture URL");
  return url;
}

function isImageBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 100) return false;
  // PNG 89 50 4E 47, JPEG FF D8, GIF 47 49 46, WEBP 52 49 46 46
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  return false;
}

function mimeOf(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return "image/png";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49) return "image/webp";
  return "image/png";
}

// GET a URL, return the image bytes as a Buffer, or null on any failure
// (non-200, non-image content-type, too short, timeout).
async function fetchImageBuffer(url, timeoutMs) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs || 30000),
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return isImageBuffer(buf) ? buf : null;
  } catch (_) {
    return null;
  }
}

// POST to an ORION fun-image template. Returns the PNG Buffer, or null
// when ORION fails (caller falls back to NoobCore). Never throws.
async function orionFunImage(template, body) {
  try {
    const res = await fetch(ORION_BASE + "/fun-image/v1/" + template, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null;
    if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
      return null; // not a PNG
    }
    return buf;
  } catch (e) {
    console.warn("[orion] fun-image/" + template + " failed, falling back to NoobCore:", e.message);
    return null;
  }
}

// NoobCore API base (apiv1) from the public NC-STORE config. Null on failure.
async function getNoobCoreApiBase() {
  try {
    const res = await fetch(NC_API_CONFIG, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = await res.json();
    return (data && data.apiv1) || null;
  } catch (_) {
    return null;
  }
}

// GET a NoobCore image endpoint (full URL already built by the caller).
// Returns the image Buffer, or null on any failure.
async function noobCoreImage(url) {
  return fetchImageBuffer(url, 30000);
}

module.exports = {
  ORION_BASE,
  AVATAR_FAIL,
  bareId,
  resolveTarget,
  resolveMentionOrReply,
  displayName,
  getAvatarUrl,
  isImageBuffer,
  mimeOf,
  fetchImageBuffer,
  orionFunImage,
  getNoobCoreApiBase,
  noobCoreImage,
};
