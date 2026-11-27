// .balance — economy: check balance, transfer, daily bonus (WhatsApp port).
// Money / exp / level come from usersData. The visual balance card is
// OPTIONAL: canvas is required lazily inside a try/catch and any render
// failure falls back to the text box. Canvas is NOT a dependency of this
// repo — never add it to package.json.
//
// WhatsApp port notes (vs the Messenger original):
// - `require("canvas")` / `require("node-fetch")` at the top level are
//   gone; canvas is lazy-required, avatar download uses global fetch.
// - No _tmp.js helper in this repo: the card PNG buffer is sent directly
//   as attachment { buffer, mimetype, fileName }.
// - usersData has no addMoney(): balances are changed with get + set of
//   the whole user object.
// - Bot name comes from global.wabot.config (was global.irfbot.orionsetting).

const { fm, parseBet } = require("../game/_gameUI.js");

// ========== CONFIGURABLE SETTINGS ==========
const CONFIG = {
    // Currency Settings
    currency: {
        symbol: "$",
        name: "Dollar",
        decimalPlaces: 2
    },

    // Transfer Settings
    transfer: {
        minAmount: 10,
        maxAmount: 1000000,
        taxRates: [
            { max: 1000, rate: 2 },
            { max: 10000, rate: 5 },
            { max: 50000, rate: 8 },
            { max: 100000, rate: 10 },
            { max: 500000, rate: 12 },
            { max: 1000000, rate: 15 }
        ],
        dailyLimit: 500000
    },

    // Daily Bonus Settings
    dailyBonus: {
        baseAmount: 100,
        streakMultiplier: 0.1, // 10% increase per day
        maxStreak: 30,
        resetHours: 21
    },

    // Card Design Settings
    card: {
        width: 1000,
        height: 500,
        borderRadius: 30,
        glowIntensity: 25
    },

    // Tier System
    tiers: [
        { name: "Starter", min: 0, max: 999, color: "#cd7f32", badge: "🥉", multiplier: 1.0 },
        { name: "Rookie", min: 1000, max: 4999, color: "#c0c0c0", badge: "🥈", multiplier: 1.1 },
        { name: "Pro", min: 5000, max: 19999, color: "#ffd700", badge: "🥇", multiplier: 1.2 },
        { name: "Elite", min: 20000, max: 49999, color: "#e5e4e2", badge: "💎", multiplier: 1.3 },
        { name: "Master", min: 50000, max: 99999, color: "#0ff", badge: "👑", multiplier: 1.5 },
        { name: "Legend", min: 100000, max: 499999, color: "#ff00ff", badge: "🌟", multiplier: 2.0 },
        { name: "God", min: 500000, max: Infinity, color: "#ff0000", badge: "⚡", multiplier: 3.0 }
    ]
};

// ========== HELPER FUNCTIONS ==========

/**
 * Get tier information based on balance
 */
function getTierInfo(balance) {
    const validBalance = Number(balance) || 0;

    for (const tier of CONFIG.tiers) {
        if (validBalance >= tier.min && validBalance <= tier.max) {
            return {
                ...tier,
                glow: `${tier.color}80`,
                nextTier: CONFIG.tiers[CONFIG.tiers.indexOf(tier) + 1] || null,
                progress: tier.max === Infinity ? 100 :
                    Math.min(100, ((validBalance - tier.min) / (tier.max - tier.min)) * 100)
            };
        }
    }

    // Fallback
    return {
        name: "Unknown",
        color: "#888888",
        badge: "❓",
        multiplier: 1.0,
        glow: "#88888880"
    };
}

/**
 * Calculate tax for transfer amount
 */
function calculateTax(amount) {
    let applicableRate = 0;

    for (const rate of CONFIG.transfer.taxRates) {
        if (amount <= rate.max) {
            applicableRate = rate.rate;
            break;
        }
    }

    // If amount exceeds all ranges, use the last rate
    if (applicableRate === 0) {
        applicableRate = CONFIG.transfer.taxRates[CONFIG.transfer.taxRates.length - 1].rate;
    }

    const tax = Math.ceil((amount * applicableRate) / 100);
    const total = amount + tax;

    return {
        rate: applicableRate,
        tax: tax,
        total: total,
        netAmount: amount
    };
}

/**
 * Create rounded rectangle path
 */
function createRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * Draw progress bar
 */
function drawProgressBar(ctx, x, y, width, height, progress, color) {
    ctx.save();

    // Background
    ctx.fillStyle = "#333333";
    createRoundedRect(ctx, x, y, width, height, height / 2);
    ctx.fill();

    // Progress
    const progressWidth = Math.max(5, (progress / 100) * width);
    ctx.fillStyle = color;
    createRoundedRect(ctx, x, y, progressWidth, height, height / 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = "#555555";
    ctx.lineWidth = 1;
    createRoundedRect(ctx, x, y, width, height, height / 2);
    ctx.stroke();

    // Progress text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(progress)}%`, x + width / 2, y + height / 2 + 4);

    ctx.restore();
}

/**
 * Load user avatar with fallback. usersData.getAvatarUrl is optional in
 * this bot — when it is missing (or the download fails) the card draws
 * an initial instead. Never throws.
 */
/**
 * Load the target user's avatar as a canvas image.
 * Tries the LIVE WhatsApp profile picture first (sock.profilePictureUrl),
 * then a stored avatar URL if the DB has one. Returns null when no picture
 * is available (private profile, no picture, or fetch failure) — the card
 * then draws an initial instead. Never throws.
 */
async function loadUserAvatar(canvasLib, sock, usersData, targetID) {
    const jid = String(targetID || "").replace(/@.*$/, "") + "@s.whatsapp.net";
    // 1. Live fetch via Baileys (most reliable).
    if (sock && typeof sock.profilePictureUrl === "function") {
        try {
            const url = await Promise.race([
                sock.profilePictureUrl(jid, "image"),
                new Promise((_, reject) => setTimeout(() => reject(new Error("avatar timeout")), 10000))
            ]);
            if (url) {
                const response = await fetch(url);
                if (response.ok) {
                    const buffer = Buffer.from(await response.arrayBuffer());
                    if (buffer.length >= 100) return await canvasLib.loadImage(buffer);
                }
            }
        } catch (error) {
            console.log("Avatar live fetch failed:", error.message);
        }
    }
    // 2. Stored avatar URL (if the DB ever has one).
    try {
        if (usersData && typeof usersData.getAvatarUrl === "function") {
            const avatarURL = await usersData.getAvatarUrl(targetID);
            if (avatarURL) {
                const response = await fetch(avatarURL);
                if (response.ok) {
                    const buffer = Buffer.from(await response.arrayBuffer());
                    if (buffer.length >= 100) return await canvasLib.loadImage(buffer);
                }
            }
        }
    } catch (error) {
        console.log("Avatar load error:", error.message);
    }
    return null;
}

/**
 * Generate transaction ID
 */
function generateTransactionID() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    return `TX${timestamp}${random}`.toUpperCase();
}

/**
 * Pick a readable text color (dark or white) for a colored pill background.
 */
function pillTextColor(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return "#FFFFFF";
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#0F172A" : "#FFFFFF";
}

/**
 * Render the balance card (1000x500) and return a PNG buffer.
 * Canvas is required lazily by the caller; throws when canvas is not
 * installed, and the caller falls back to the text box.
 */
async function generateBalanceCard(userData, tier, targetID, usersData, sock, displayName) {
    const canvasLib = require("canvas"); // lazy + optional — throws if absent
    const { createCanvas } = canvasLib;
    const W = CONFIG.card.width, H = CONFIG.card.height;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    const botName = (global.wabot && global.wabot.config && (global.wabot.config.botName || global.wabot.config.name)) || "WABOT";
    const name = (displayName || userData.name || "User").length > 22
        ? (displayName || userData.name || "User").slice(0, 20) + "..."
        : (displayName || userData.name || "User");

    // --- Background: deep slate gradient + soft tier-colored glow ---
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0F172A");
    bg.addColorStop(1, "#1E293B");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W - 120, 60, 0, W - 120, 60, 420);
    glow.addColorStop(0, tier.color + "33");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // --- Inner panel ---
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    createRoundedRect(ctx, 20, 20, W - 40, H - 40, CONFIG.card.borderRadius);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
    ctx.lineWidth = 1.5;
    createRoundedRect(ctx, 20, 20, W - 40, H - 40, CONFIG.card.borderRadius);
    ctx.stroke();

    // --- Tier badge pill (top right) ---
    const badgeText = `${tier.badge} ${tier.name}`;
    ctx.font = "bold 26px Arial";
    const badgeW = ctx.measureText(badgeText).width + 44;
    const badgeX = W - 40 - badgeW, badgeY = 48, badgeH = 52;
    ctx.fillStyle = tier.color;
    createRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.fillStyle = pillTextColor(tier.color);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

    // --- Avatar (left) with tier-colored ring ---
    const ax = 125, ay = 165, ar = 72;
    const avatar = await loadUserAvatar(canvasLib, sock, usersData, targetID);
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) {
        ctx.drawImage(avatar, ax - ar, ay - ar, ar * 2, ar * 2);
    } else {
        const ag = ctx.createRadialGradient(ax, ay, 0, ax, ay, ar);
        ag.addColorStop(0, tier.color);
        ag.addColorStop(1, "#334155");
        ctx.fillStyle = ag;
        ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 64px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name.charAt(0).toUpperCase(), ax, ay + 2);
    }
    ctx.restore();
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 4, 0, Math.PI * 2);
    ctx.stroke();

    // --- Name + balance ---
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "bold 38px Arial";
    ctx.fillText(name, 225, 135);
    ctx.fillStyle = "#94A3B8";
    ctx.font = "20px Arial";
    ctx.fillText("B A L A N C E", 225, 168);
    ctx.fillStyle = tier.color;
    ctx.font = "bold 62px Arial";
    ctx.fillText(`${CONFIG.currency.symbol}${fm(userData.money)}`, 225, 240);

    // --- Progress to next tier ---
    const nextName = tier.nextTier ? tier.nextTier.name : "MAX";
    ctx.fillStyle = "#94A3B8";
    ctx.font = "20px Arial";
    ctx.fillText(`Progress to ${nextName}`, 225, 295);
    drawProgressBar(ctx, 225, 308, 560, 22, tier.progress, tier.color);

    // --- Bottom info row ---
    ctx.fillStyle = "#CBD5E1";
    ctx.font = "22px Arial";
    ctx.fillText(`✨ Multiplier  ×${tier.multiplier.toFixed(1)}`, 60, 415);
    ctx.textAlign = "right";
    ctx.fillStyle = "#94A3B8";
    ctx.font = "20px Arial";
    const d = new Date();
    const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    ctx.fillText(`✨ ${botName}  •  ${dateStr}`, W - 60, 415);

    return canvas.toBuffer("image/png");
}


module.exports = {
    config: {
        name: "balance",
        aliases: ["bal"],
        version: "2.2.0",
        countDown: 3,
        role: 0,
        description: "💰 Advanced economy system with visual cards & secure transfers",
        category: "economy",
        guide: "╔═══ 𝐄𝐂𝐎𝐍𝐎𝐌𝐘 ═══╗\n║ 💰 {pn} - Check balance\n║ 👤 {pn} @user - Check someone\n║ 💸 {pn} transfer @user <amt>\n║ 🎁 {pn} daily - Claim bonus\n╚══════════════════╝"
    },

    onStart: async function ({ message, event, args, usersData, sock }) {
        const { senderID, mentions, messageReply } = event;
        const command = args[0] && args[0].toLowerCase();

        try {
            // Handle Transfer
            if (command === "transfer" || command === "send" || command === "pay") {
                const targetID = Object.keys(mentions || {})[0] || (messageReply && messageReply.senderID);
                const amount = parseBet(args[args.length - 1]);

                if (!targetID || amount === null || amount < CONFIG.transfer.minAmount) {
                    return message.reply(`╔═══ 𝐒𝐘𝐒𝐓𝐄𝐌 ═══╗\n║ ⚠️ Invalid transfer!\n║ 💰 Min: ${CONFIG.transfer.minAmount}\n╚══════════════════╝`);
                }

                const senderData = await usersData.get(senderID);
                const taxInfo = calculateTax(amount);

                if ((senderData.money || 0) < taxInfo.total) {
                    return message.reply(`╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ Insufficient funds\n║ 💸 Need: ${fm(taxInfo.total)}\n╚══════════════════╝`);
                }

                const targetData = await usersData.get(targetID);
                senderData.money = (senderData.money || 0) - taxInfo.total;
                targetData.money = (targetData.money || 0) + amount;

                await usersData.set(senderID, senderData);
                await usersData.set(targetID, targetData);

                const txID = generateTransactionID();
                return message.reply(`╔═══ 𝐓𝐑𝐀𝐍𝐒𝐅𝐄𝐑 ═══╗\n║ ✅ Success!\n║ 👤 To: ${(mentions && mentions[targetID]) || "User"}\n║ 💰 Amount: ${fm(amount)}\n║ 📉 Tax: ${fm(taxInfo.tax)} (${taxInfo.rate}%)\n║ 🆔 ID: ${txID}\n╚══════════════════╝`);
            }

            // Handle Daily
            if (command === "daily" || command === "claim") {
                const userData = await usersData.get(senderID);
                const now = Date.now();
                const lastDaily = userData.lastDaily || 0;
                const cooldown = 24 * 60 * 60 * 1000;

                if (now - lastDaily < cooldown) {
                    const remaining = cooldown - (now - lastDaily);
                    const hours = Math.floor(remaining / (60 * 60 * 1000));
                    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
                    return message.reply(`╔═══ 𝐃𝐀𝐈𝐋𝐘 ═══╗\n║ ⏳ Already claimed!\n║ 🕒 Next in: ${hours}h ${minutes}m\n╚══════════════════╝`);
                }

                const reward = CONFIG.dailyBonus.baseAmount;
                userData.money = (userData.money || 0) + reward;
                userData.lastDaily = now;
                await usersData.set(senderID, userData);

                return message.reply(`╔═══ 𝐃𝐀𝐈𝐋𝐘 ═══╗\n║ 🎁 Bonus Claimed!\n║ 💰 Reward: ${fm(reward)}\n║ ✨ Come back tomorrow!\n╚══════════════════╝`);
            }

            // Default: Show Balance Card
            const targetID = Object.keys(mentions || {})[0] || (messageReply && messageReply.senderID) || senderID;
            const userData = await usersData.get(targetID);
            const tier = getTierInfo(userData.money);
            // Real name: DB record first, then the sender's live push name
            // (self only — a mentioned user has no push name on this event).
            const displayName = userData.name
                || (String(targetID) === String(senderID) ? (event.senderName || null) : null)
                || "User";

            const balMsg = `╔═══ 𝐁𝐀𝐋𝐀𝐍𝐂𝐄 ═══╗\n` +
                `║ 👤 User: ${displayName}\n` +
                `║ 💰 Money: ${fm(userData.money)}\n` +
                `║ 🏆 Tier: ${tier.badge} ${tier.name}\n` +
                `╠══════════════════╣\n` +
                `║ 📈 Progress: ${Math.round(tier.progress)}%\n` +
                `╚══════════════════╝`;

            // Send the visual card with no caption — the card already shows
            // name, balance, tier and progress, so the text box below it
            // would just duplicate it. Full text only when there is no card.
            try {
                const cardBuffer = await generateBalanceCard(userData, tier, targetID, usersData, sock, displayName);
                return message.reply({
                    body: "",
                    attachment: { buffer: cardBuffer, mimetype: "image/png", fileName: "balance.png" }
                });
            } catch (cardErr) {
                console.error("Balance card render failed:", cardErr.message);
                return message.reply(balMsg);
            }

        } catch (error) {
            console.error(error);
            return message.reply(`╔═══ 𝐄𝐑𝐑𝐎𝐑 ═══╗\n║ ❌ ${error.message}\n╚══════════════════╝`);
        }
    }
};
