// .cat — random cat image (WhatsApp port).
// Public API first: TheCatAPI returns [{ id, url, width, height }] —
// download [0].url. The Messenger original fell back to the NoobCore
// image endpoint on any failure; that fallback is dropped here (public
// API only, same as the other animal commands on WhatsApp).
// No temp files: image bytes are downloaded to a buffer with fetch.

async function fetchCatImage() {
  const res = await fetch("https://api.thecatapi.com/v1/images/search", {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("TheCatAPI HTTP " + res.status);
  const data = await res.json();
  const imageUrl = data && data[0] && data[0].url;
  if (!imageUrl || typeof imageUrl !== "string")
    throw new Error("TheCatAPI returned no image URL");
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!imgRes.ok) throw new Error("Cat image download HTTP " + imgRes.status);
  const ct = (imgRes.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/")) throw new Error("TheCatAPI did not return an image");
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (!buf.length) throw new Error("TheCatAPI did not return an image");
  return { buffer: buf, mimetype: ct.split(";")[0].trim() || "image/jpeg" };
}

module.exports = {
  config: {
    name: "cat",
    version: "1.0",
    countDown: 3,
    role: 0,
    description: "🐱 Send a random cat image",
    category: "image",
    guide: "{pn} — Shows a random cat image",
  },

  onStart: async function ({ message }) {
    try {
      const img = await fetchCatImage();
      await message.reply({
        body: "🐱 Here's a random cat for you!",
        attachment: { buffer: img.buffer, mimetype: img.mimetype, fileName: "cat.jpg" },
      });
    } catch (err) {
      console.error(err);
      message.reply("❌ Failed to fetch cat image.\n" + err.message);
    }
  },
};
