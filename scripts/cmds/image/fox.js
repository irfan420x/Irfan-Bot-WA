// .fox — random fox image (WhatsApp port).
// Public API first: randomfox.ca returns { image, link } — download the
// "image" URL. The Messenger original fell back to the NoobCore image
// endpoint on any failure; that fallback is dropped here (public API
// only, same as the other animal commands on WhatsApp).
// No temp files: image bytes are downloaded to a buffer with fetch.

async function fetchFoxImage() {
  const res = await fetch("https://randomfox.ca/floof/", {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("randomfox.ca HTTP " + res.status);
  const data = await res.json();
  const imageUrl = data && data.image;
  if (!imageUrl || typeof imageUrl !== "string")
    throw new Error("randomfox.ca returned no image URL");
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!imgRes.ok) throw new Error("Fox image download HTTP " + imgRes.status);
  const ct = (imgRes.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/")) throw new Error("randomfox.ca did not return an image");
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (!buf.length) throw new Error("randomfox.ca did not return an image");
  return { buffer: buf, mimetype: ct.split(";")[0].trim() || "image/jpeg" };
}

module.exports = {
  config: {
    name: "fox",
    version: "1.0",
    countDown: 3,
    role: 0,
    description: "🦊 Send a random fox image",
    category: "image",
    guide: "{pn} — Shows a random fox image",
  },

  onStart: async function ({ message }) {
    try {
      const img = await fetchFoxImage();
      await message.reply({
        body: "🦊 Here's a random fox for you!",
        attachment: { buffer: img.buffer, mimetype: img.mimetype, fileName: "fox.jpg" },
      });
    } catch (err) {
      console.error(err);
      message.reply("❌ Failed to fetch fox image.\n" + err.message);
    }
  },
};
