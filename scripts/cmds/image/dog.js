// .dog — random dog image (WhatsApp port).
// Public API first: dog.ceo returns { message: "<image url>", status } —
// download the "message" URL. The Messenger original fell back to the
// NoobCore image endpoint on any failure; that fallback is dropped here
// (public API only, same as the other animal commands on WhatsApp).
// No temp files: image bytes are downloaded to a buffer with fetch.

async function fetchDogImage() {
  const res = await fetch("https://dog.ceo/api/breeds/image/random", {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("dog.ceo HTTP " + res.status);
  const data = await res.json();
  const imageUrl = data && data.status === "success" && data.message;
  if (!imageUrl || typeof imageUrl !== "string")
    throw new Error("dog.ceo returned no image URL");
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!imgRes.ok) throw new Error("Dog image download HTTP " + imgRes.status);
  const ct = (imgRes.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/")) throw new Error("dog.ceo did not return an image");
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (!buf.length) throw new Error("dog.ceo did not return an image");
  return { buffer: buf, mimetype: ct.split(";")[0].trim() || "image/jpeg" };
}

module.exports = {
  config: {
    name: "dog",
    version: "1.0",
    countDown: 3,
    role: 0,
    description: "🐶 Send a random dog image",
    category: "image",
    guide: "{pn} — Shows a random dog image",
  },

  onStart: async function ({ message }) {
    try {
      const img = await fetchDogImage();
      await message.reply({
        body: "🐶 Here's a random dog for you!",
        attachment: { buffer: img.buffer, mimetype: img.mimetype, fileName: "dog.jpg" },
      });
    } catch (err) {
      console.error(err);
      message.reply("❌ Failed to fetch dog image.\n" + err.message);
    }
  },
};
