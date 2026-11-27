// _card.js — SHARED ORION CARD HELPER (WhatsApp bot).
//
// One place for the bot's card style, so every command renders the same
// brand instead of copy-pasting canvas code. Matches the Messenger bot's
// balance-card look: dark slate gradient, purple glow, rounded inner
// panel, ORION brand footer.
//
// Rules:
// - NEVER require("canvas") at the top level. getCanvas() lazy-requires
//   it once and caches the result; it returns null when canvas is not
//   installed, and every caller must fall back to its text message.
// - No function in this file throws for a missing avatar / bad image /
//   missing canvas — helpers return null and the caller sends text.
// - Fonts: "sans-serif" only. Emoji support on this host is partial:
//   fruit emoji render monochrome, 7-keycap renders, but star/sparkle
//   glyphs (⭐ ✨) are INVISIBLE — use drawStar() for stars and plain
//   text instead of decorative emoji on cards.

"use strict";

const BRAND = {
  bgTop: "#0F172A",
  bgBottom: "#1E293B",
  panel: "rgba(255, 255, 255, 0.04)",
  panelBorder: "rgba(255, 255, 255, 0.10)",
  purple: "#8B5CF6",
  purpleLight: "#C4B5FD",
  purpleGlow: "rgba(139, 92, 246, 0.35)",
  pink: "#EC4899",
  text: "#F8FAFC",
  muted: "#94A3B8",
  subtle: "#CBD5E1",
  gold: "#FFD700",
  green: "#22C55E",
  red: "#EF4444",
  dark: "#334155",
};

let canvasLib = null;
let canvasTried = false;

/** Lazy canvas loader. Returns { createCanvas, loadImage } or null. */
function getCanvas() {
  if (canvasTried) return canvasLib;
  canvasTried = true;
  try {
    const { createCanvas, loadImage } = require("canvas");
    canvasLib = { createCanvas, loadImage };
  } catch (_e) {
    canvasLib = null;
  }
  return canvasLib;
}

/** Bot display name from the live config (falls back to ORION). */
function botName() {
  try {
    const cfg = (global.wabot && global.wabot.config) || {};
    return cfg.nickNameBot || cfg.botName || cfg.name || "ORION";
  } catch (_e) {
    return "ORION";
  }
}

/** Rounded-rectangle path (call fill()/stroke() after). */
function roundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/**
 * New blank card: dark gradient + purple glow + rounded inner panel.
 * opts: { glowColor, accent } — glowColor tints the radial glow.
 * Returns { canvas, ctx, W, H } or null when canvas is unavailable.
 */
function newCard(width, height, opts) {
  const cv = getCanvas();
  if (!cv) return null;
  const o = opts || {};
  const W = width, H = height;
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, BRAND.bgTop);
  bg.addColorStop(1, BRAND.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glowColor = o.glowColor || BRAND.purple;
  const glow = ctx.createRadialGradient(W - 120, 60, 0, W - 120, 60, 420);
  glow.addColorStop(0, glowColor + "33");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = BRAND.panel;
  roundedRect(ctx, 20, 20, W - 40, H - 40, 30);
  ctx.fill();
  ctx.strokeStyle = BRAND.panelBorder;
  ctx.lineWidth = 1.5;
  roundedRect(ctx, 20, 20, W - 40, H - 40, 30);
  ctx.stroke();

  return { canvas, ctx, W, H };
}

/** Bottom brand line: "ORION • <date>" left, optional right text. */
function footer(ctx, W, H, rightText) {
  const d = new Date();
  const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = BRAND.muted;
  ctx.font = "20px sans-serif";
  ctx.fillText(`${botName()}  •  ${dateStr}`, 60, H - 45);
  if (rightText) {
    ctx.textAlign = "right";
    ctx.fillText(String(rightText), W - 60, H - 45);
  }
}

/** Centered card title, e.g. "USER INFO" / "SYSTEM INFO". */
function title(ctx, W, text, y, size, color) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color || BRAND.text;
  ctx.font = `bold ${size || 44}px sans-serif`;
  ctx.fillText(text, W / 2, y);
}

/**
 * Pill (rounded badge) with centered text. Returns the pill width.
 * opts: { bg, color, font, x, y, h } — x/y is the top-left corner.
 */
function pill(ctx, x, y, text, opts) {
  const o = opts || {};
  const font = o.font || "bold 26px sans-serif";
  const h = o.h || 52;
  ctx.font = font;
  const w = ctx.measureText(text).width + 44;
  ctx.fillStyle = o.bg || BRAND.purple;
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = o.color || "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  return w;
}

/** Readable text color (dark or white) on a colored pill background. */
function pillTextColor(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return "#FFFFFF";
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0F172A" : "#FFFFFF";
}

/**
 * Horizontal progress / usage bar with a % label.
 * opts: { color, bg, border }.
 */
function bar(ctx, x, y, w, h, percent, opts) {
  const o = opts || {};
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  ctx.save();
  ctx.fillStyle = o.bg || "#333333";
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const fillW = Math.max(5, (pct / 100) * w);
  ctx.fillStyle = o.color || BRAND.purple;
  roundedRect(ctx, x, y, fillW, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = o.border || "#555555";
  ctx.lineWidth = 1;
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(pct)}%`, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

/** "Label : value" stat row. opts: { labelColor, valueColor, font }. */
function statRow(ctx, x, y, label, value, opts) {
  const o = opts || {};
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = o.labelColor || BRAND.muted;
  ctx.font = o.font || "24px sans-serif";
  ctx.fillText(label, x, y);
  ctx.fillStyle = o.valueColor || BRAND.text;
  ctx.font = `bold ${o.font ? parseInt(o.font, 10) : 24}px sans-serif`;
  const labelW = ctx.measureText(label).width;
  ctx.fillText(String(value), x + labelW + 12, y);
}

/** Truncate a string to n chars with an ellipsis. */
function truncate(str, n) {
  const s = String(str == null ? "" : str);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** True when the buffer looks like a JPEG or PNG. */
function isImageBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // PNG
  return false;
}

/**
 * Fetch one WhatsApp profile picture as a Buffer (or null).
 * sock.profilePictureUrl throws when the user has no picture — that is
 * the normal fallback case, not an error. 10s timeout.
 */
async function fetchAvatar(sock, jid, timeoutMs) {
  try {
    if (!sock || typeof sock.profilePictureUrl !== "function") return null;
    const url = await sock.profilePictureUrl(jid, "image");
    if (!url) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 10000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100 || !isImageBuffer(buf)) return null;
      return buf;
    } finally {
      clearTimeout(timer);
    }
  } catch (_e) {
    return null;
  }
}

/** loadImage from a Buffer, or null on any failure. */
async function loadImageSafe(buf) {
  const cv = getCanvas();
  if (!cv || !buf) return null;
  try {
    return await cv.loadImage(buf);
  } catch (_e) {
    return null;
  }
}

/**
 * Draw a circular avatar: the image when given, otherwise a gradient
 * circle with the first letter of `name`. opts: { ring } — ring color
 * (default purple); pass null/"" for no ring.
 */
function drawAvatar(ctx, opts) {
  const o = opts || {};
  const x = o.x, y = o.y, r = o.r;
  const ring = o.ring === undefined ? BRAND.purple : o.ring;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  if (o.img) {
    ctx.drawImage(o.img, x - r, y - r, r * 2, r * 2);
  } else {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, o.gradientFrom || BRAND.purple);
    g.addColorStop(1, o.gradientTo || BRAND.dark);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const first = String(o.name || "?").trim().charAt(0).toUpperCase() || "?";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${Math.round(r * 0.9)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(first, x, y + 2);
  }
  ctx.restore();
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Five-pointed star path (⭐ is invisible in canvas text — draw it). */
function drawStar(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = color || BRAND.gold;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Canvas -> PNG Buffer. */
function toPng(canvas) {
  return canvas.toBuffer("image/png");
}

module.exports = {
  BRAND,
  getCanvas,
  botName,
  roundedRect,
  newCard,
  footer,
  title,
  pill,
  pillTextColor,
  bar,
  statRow,
  truncate,
  isImageBuffer,
  fetchAvatar,
  loadImageSafe,
  drawAvatar,
  drawStar,
  toPng,
};
