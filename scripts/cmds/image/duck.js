// .duck — random duck image (WhatsApp port).
// Public API first: random-d.uk returns { message, url } where "url" is
// the duck image (a .gif). The Messenger original fell back to the
// NoobCore image endpoint on any failure; that fallback is dropped here
// (public API only, same as the other animal commands on WhatsApp).
// No temp files: image bytes are downloaded to a buffer with fetch.
// Note: random-d.uk serves GIFs — sent with mimetype image/gif.

async function fetchDuckImage() {
  const res = await fetch("https://random-d.uk/api/v2/random", {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("random-d.uk HTTP " + res.status);
  const data = await res.json();
  const imageUrl = data && data.url;
  if (!imageUrl || typeof imageUrl !== "string")
    throw new Error("random-d.uk returned no image URL");
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!imgRes.ok) throw new Error("Duck image download HTTP " + imgRes.status);
  const ct = (imgRes.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/")) throw new Error("random-d.uk did not return an image");
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (!buf.length) throw new Error("random-d.uk did not return an image");
  return { buffer: buf, mimetype: ct.split(";")[0].trim() || "image/gif" };
}

module.exports = {
  config: {
    name: "duck",
    version: "1.0",
    countDown: 3,
    role: 0,
    description: "🦆 Send a random duck image",
    category: "image",
    guide: "{pn} — Shows a random duck image",
  },

  onStart: async function ({ message }) {
    try {
      const img = await fetchDuckImage();
      await message.reply({
        body: "🦆 Here's a random duck for you!",
        attachment: { buffer: img.buffer, mimetype: img.mimetype, fileName: "duck.gif" },
      });
    } catch (err) {
      console.error(err);
      message.reply("❌ Failed to fetch duck image.\n" + err.message);
    }
  },
};
