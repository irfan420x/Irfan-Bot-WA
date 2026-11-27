// Pinterest image search via the Orion APIs (scripts/cmds/image/pinterest.js).
//   .pinterest <query>          -> first 10 images
//   .pinterest <query> - <n>    -> first n images per page (max 10)
//   Reply "next" to the bot's images -> next 10 from the same search.
//
// v2.2 (2026-11-25): the reply handler is registered with the messageID
// returned by the message.reply callback — that is the ID WhatsApp
// actually assigns, so "next" works. (Registering from a bare send's
// return value never matched the message the user replies to.)
//   POST https://orion-apis.vercel.app/pinterest/v1/search {query, limit}
// Rules from ORION-APIS-FOR-BOT.md:
//  - Search results: images.orig is an OBJECT {url, width, height} (not a
//    string). Real URL = images.orig.url (highest quality, uploader original).
//    Fall back to 736x / 474x when orig is missing; handle a plain string too.
//  - Download the i.pinimg.com URL and send it as a file.
//  - Latency 0.4-1.7s. Error 502 session_dead = the Pinterest cookie died:
//    tell Muse #1, do not try to fix it here.
//
// WhatsApp port note: the adapter's attachment is a single
// { buffer, mimetype, fileName } per message, so a page is sent as one
// captioned image (the replyMap is registered on THAT message) followed
// by the remaining images as plain sends. The Messenger originals'
// _http/_tmp/_img helpers do not exist in this repo; fetch is used directly.

const { orionPost } = require("../_orionApi.js");

const DEFAULT_PAGE = 10;
const MAX_PAGE = 10;
const PAGES_AHEAD = 3; // fetch 3 pages of URLs up front

function pickImageUrl(pin) {
  const images = (pin && pin.images) || {};
  const orig = images.orig;
  if (orig) {
    if (typeof orig === "string") return orig;
    if (orig.url) return orig.url;
  }
  for (const size of ["736x", "474x", "236x", "170x"]) {
    const v = images[size];
    if (!v) continue;
    if (typeof v === "string") return v;
    if (v.url) return v.url;
  }
  return null;
}

async function searchUrls(query, limit) {
  let pins;
  try {
    const data = await orionPost("/pinterest/v1/search", { query, limit }, { timeout: 20000 });
    pins = (data && data.data) || [];
  } catch (e) {
    const status = e && e.response && e.response.status;
    if (status === 502) {
      const err = new Error("SESSION_DEAD");
      err.sessionDead = true;
      throw err;
    }
    throw e;
  }
  const urls = [];
  for (const pin of pins) {
    const url = pickImageUrl(pin);
    if (url && !urls.includes(url)) urls.push(url);
    if (urls.length >= limit) break;
  }
  return urls;
}

async function downloadImage(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error(`Failed to fetch image: ${url}`, err.message);
    return null;
  }
}

// Download one page of URLs and send them. The first image goes out as a
// quoted reply carrying the page caption; the replyMap entry is registered
// from that reply's callback info.messageID. The rest follow as plain
// sends. `register` is called with the sent messageID once confirmed.
async function sendPage(message, query, urls, pageNum, register) {
  const buffers = [];
  for (const url of urls) {
    const buf = await downloadImage(url);
    if (buf) buffers.push(buf);
  }
  if (buffers.length === 0) {
    await message.reply(`❌ "${query}" — পেজ ${pageNum}: ছবি ডাউনলোড করা যায়নি। আবার চেষ্টা করো।`);
    return;
  }

  const caption = `✅ "${query}" — পেজ ${pageNum} (${buffers.length}টা ছবি)\nপরের ১০টা দেখতে এই মেসেজে রিপ্লাই দিয়ে "next" লেখো।`;

  await new Promise((resolve) => {
    message.reply(
      {
        body: caption,
        attachment: { buffer: buffers[0], mimetype: "image/jpeg", fileName: "pinterest-1.jpg" },
      },
      (err, info) => {
        if (!err && info && info.messageID && typeof register === "function") {
          register(info.messageID);
        }
        resolve();
      }
    );
  });

  for (let i = 1; i < buffers.length; i++) {
    try {
      await message.send({
        body: "",
        attachment: { buffer: buffers[i], mimetype: "image/jpeg", fileName: `pinterest-${i + 1}.jpg` },
      });
    } catch (e) {
      console.error("[pinterest] extra image send failed:", e.message);
    }
  }
}

function registerPage(author, query, urls, offset, pageSize, pageNum) {
  return (messageID) => {
    if (global.wabot && global.wabot.replyMap) {
      global.wabot.replyMap.set(messageID, {
        commandName: "pinterest",
        author,
        query,
        urls,
        offset,
        pageSize,
        pageNum,
      });
    }
  };
}

module.exports = {
  config: {
    name: "pinterest",
    aliases: ["pin"],
    version: "2.2",
    role: 0,
    countDown: 5,
    description: "Search Pinterest images. Reply 'next' for the next 10.",
    category: "image",
    guide: "{pn} <search query> - <images per page, max 10>\nExample: {pn} Naruto Uzumaki - 10\nReply 'next' to the bot's images for the next page.",
  },

  onStart: async function ({ event, message, args }) {
    try {
      const input = args.join(" ").trim();
      if (!input) {
        return message.reply(
          `❌ Please provide a search query.\nExample: .pin Naruto Uzumaki - 10`
        );
      }

      let query = input;
      let pageSize = DEFAULT_PAGE;

      if (input.includes("-")) {
        const parts = input.split("-");
        query = parts[0].trim();
        pageSize = parseInt(parts[1].trim()) || DEFAULT_PAGE;
      }

      if (pageSize > MAX_PAGE) pageSize = MAX_PAGE;
      if (pageSize < 1) pageSize = DEFAULT_PAGE;

      let urls;
      try {
        urls = await searchUrls(query, pageSize * PAGES_AHEAD);
      } catch (e) {
        if (e.sessionDead) {
          return message.reply(
            "❌ Pinterest সেশন শেষ হয়ে গেছে — Muse #1-কে জানানো হয়েছে।"
          );
        }
        throw e;
      }

      if (urls.length === 0) {
        return message.reply(
          `❌ No images found for "${query}". Try a different search.`
        );
      }

      const page = urls.slice(0, pageSize);
      await sendPage(
        message,
        query,
        page,
        1,
        registerPage(event.senderID, query, urls, pageSize, pageSize, 1)
      );
    } catch (error) {
      console.error(error);
      return message.reply(
        "❌ Something went wrong. Please try again later."
      );
    }
  },

  onReply: async function ({ event, message, Reply }) {
    if (!Reply || event.senderID !== Reply.author) return;
    const text = String(event.body || "").trim().toLowerCase();
    if (text !== "next") return; // only "next" pages forward

    const urls = Reply.urls || [];
    const offset = Reply.offset || 0;
    const pageSize = Reply.pageSize || DEFAULT_PAGE;
    const pageNum = (Reply.pageNum || 1) + 1;

    if (offset >= urls.length) {
      return message.reply(
        `✅ "${Reply.query}" — আর ছবি নেই। নতুন কিছু খুঁজতে আবার .pin লেখো।`
      );
    }

    const page = urls.slice(offset, offset + pageSize);
    await sendPage(
      message,
      Reply.query,
      page,
      pageNum,
      registerPage(event.senderID, Reply.query, urls, offset + pageSize, pageSize, pageNum)
    );
  },
};
