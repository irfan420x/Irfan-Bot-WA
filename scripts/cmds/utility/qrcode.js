// .qrcode — make or scan a QR code (WhatsApp port).
//   .qrcode make <text>
//   .qrcode scan <image_url>   (or send an image with ".qrcode scan" as caption)
// Public goqr.me API (api.qrserver.com), no key — same as the Messenger
// original. Make: GET create-qr-code returns PNG bytes. Scan: GET
// read-qr-code?fileurl=<url> returns [{symbol:[{data, error}]}].
//
// WhatsApp port notes (vs the Messenger original):
// - NoobCore fallbacks dropped (public API only).
// - Scan of a REPLIED-TO image is not possible: the adapter does not
//   download quoted media, so there is no image URL/bytes for it. Scan
//   works from an image URL argument, or from an image sent WITH the
//   command as its caption (uploaded to goqr.me via POST multipart).
// - No temp files: image bytes go straight to a buffer with fetch.

async function downloadImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error("Image download HTTP " + res.status);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/")) throw new Error("URL did not return an image");
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error("Empty image");
  return { buffer: buf, mimetype: ct.split(";")[0].trim() || "image/png" };
}

async function scanFromUrl(imageUrl) {
  const res = await fetch(
    `https://api.qrserver.com/v1/read-qr-code/?fileurl=${encodeURIComponent(imageUrl)}`,
    { signal: AbortSignal.timeout(20000) }
  );
  if (!res.ok) throw new Error("qrserver HTTP " + res.status);
  const data = await res.json();
  const symbol = data && data[0] && data[0].symbol && data[0].symbol[0];
  if (!symbol || typeof symbol !== "object")
    throw new Error("qrserver returned an invalid scan response");
  return symbol.error ? null : (symbol.data || null);
}

async function scanFromBuffer(buffer, mimetype) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimetype || "image/png" }), "qr.png");
  const res = await fetch("https://api.qrserver.com/v1/read-qr-code/", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error("qrserver HTTP " + res.status);
  const data = await res.json();
  const symbol = data && data[0] && data[0].symbol && data[0].symbol[0];
  if (!symbol || typeof symbol !== "object")
    throw new Error("qrserver returned an invalid scan response");
  return symbol.error ? null : (symbol.data || null);
}

module.exports = {
  config: {
    name: "qrcode",
    aliases: ["qr"],
    version: "2.0",
    countDown: 5,
    role: 0,
    description: "Make or scan QR code",
    category: "utility",
    guide: "{pn} make <text>\n{pn} scan <image_url>\n{pn} scan (with an image attached)",
  },

  onStart: async function ({ event, args, message }) {
    const action = args[0];

    if (!action)
      return message.reply(
        "🌀 Usage:\n• qrcode make <text>\n• qrcode scan <image_url or attach an image>"
      );

    try {
      // === MAKE QR ===
      if (action === "make") {
        const text = args.slice(1).join(" ");
        if (!text) return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ❌ Please provide text to generate QR.\n╚══════════════════╝");

        const img = await downloadImage(
          `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`
        );

        return message.reply({
          body: `✅ QR generated successfully!\n📄 Text: ${text}`,
          attachment: { buffer: img.buffer, mimetype: img.mimetype, fileName: "qr.png" },
        });
      }

      // === SCAN QR ===
      if (action === "scan") {
        let imageUrl = args.slice(1).join(" ");
        let decoded = null;

        const attached = (event.attachments || []).find((a) => a.type === "image" && a.buffer);
        if (attached) {
          decoded = await scanFromBuffer(attached.buffer, attached.mimetype);
        } else {
          if (!imageUrl) return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ 📸 Please provide an image URL or attach an image with the QR.\n╚══════════════════╝");
          decoded = await scanFromUrl(imageUrl);
        }

        if (decoded) return message.reply(`🔍 QR Scan Result:\n${decoded}`);
        return message.reply("╔═══ 𝐈𝐍𝐅𝐎 ═══╗\n║ ⚠️ No valid QR code found.\n╚══════════════════╝");
      }

      // === INVALID OPTION ===
      return message.reply(
        "❌ Invalid option.\nUse:\n• qrcode make <text>\n• qrcode scan <image_url or attach an image>"
      );
    } catch (err) {
      console.error("❌ QR Code Command Error:", err);
      message.reply("╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ Failed to process QR code. Please try again later.\n╚══════════════════╝");
    }
  },
};
