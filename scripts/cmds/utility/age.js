// .age — calculate age from birth date (WhatsApp port).
//   .age DD-MM-YYYY
//
// WhatsApp port notes (vs the Messenger original):
// - moment is NOT installed on WhatsApp, so the date parsing and the
//   years/months/days breakdown are done with native Date. Behaviour and
//   reply text are unchanged.

module.exports = {
  config: {
    name: "age",
    aliases: ["agecalc", "agecalculator"],
    version: "1.0",
    countDown: 5,
    role: 0,
    description: "Calculate age from birth date",
    category: "utility",
    guide: "{pn} DD-MM-YYYY",
  },

  onStart: async function ({ message, args }) {
    const bold = (text) => text.split("").map((c) => {
      if (c >= "A" && c <= "Z") return String.fromCodePoint(c.charCodeAt(0) + 0x1d400 - 65);
      if (c >= "a" && c <= "z") return String.fromCodePoint(c.charCodeAt(0) + 0x1d41a - 97);
      if (c >= "0" && c <= "9") return String.fromCodePoint(c.charCodeAt(0) + 0x1d7ce - 48);
      return c;
    }).join("");

    // Strict DD-MM-YYYY parse (moment(input, "DD-MM-YYYY", true) equivalent).
    function parseDate(input) {
      const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(input || "");
      if (!m) return null;
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const y = Number(m[3]);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      const date = new Date(y, mo - 1, d);
      if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
      return date;
    }

    function formatDate(date) {
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      return `${dd}-${mm}-${date.getFullYear()}`;
    }

    function startOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    try {
      if (!args[0]) {
        return message.reply(`${bold("⚠️ Please provide your birth date!")}\n\n📝 ${bold("Example:")} \n${bold("/age 15-03-2008")}`);
      }

      const inputDate = args[0];
      const birthDate = parseDate(inputDate);

      if (!birthDate) {
        return message.reply(`${bold("❌ Invalid date format!")} \n${bold("Please use: DD-MM-YYYY")} \n${bold("Example: /age 15-03-2008")}`);
      }

      const now = new Date();
      const today = startOfDay(now);
      const birthDay = startOfDay(birthDate);

      if (birthDay.getTime() > today.getTime()) {
        return message.reply(`${bold("❌ Birth date cannot be in the future!")} \n${bold("Please enter a past date.")} \n${bold("Example: /age 15-03-2008")}`);
      }

      // Age breakdown: years, then remaining months, then remaining days.
      let years = now.getFullYear() - birthDate.getFullYear();
      let afterYears = new Date(birthDate);
      afterYears.setFullYear(birthDate.getFullYear() + years);
      if (afterYears > now) {
        years--;
        afterYears = new Date(birthDate);
        afterYears.setFullYear(birthDate.getFullYear() + years);
      }
      let months = (now.getFullYear() - afterYears.getFullYear()) * 12 + (now.getMonth() - afterYears.getMonth());
      let afterMonths = new Date(afterYears);
      afterMonths.setMonth(afterYears.getMonth() + months);
      if (afterMonths > now) {
        months--;
        afterMonths = new Date(afterYears);
        afterMonths.setMonth(afterYears.getMonth() + months);
      }
      const days = Math.floor((startOfDay(now) - startOfDay(afterMonths)) / 86400000);

      // Total time alive.
      const totalDays = Math.floor((now - birthDate) / 86400000);
      const totalHours = Math.floor((now - birthDate) / 3600000);
      const totalMinutes = Math.floor((now - birthDate) / 60000);

      // Next birthday.
      let nextBirthday = new Date(birthDate);
      nextBirthday.setFullYear(now.getFullYear());
      nextBirthday = startOfDay(nextBirthday);
      if (nextBirthday.getTime() < today.getTime()) {
        nextBirthday.setFullYear(now.getFullYear() + 1);
      }
      const daysUntilBirthday = Math.round((nextBirthday - today) / 86400000);
      const nextBirthdayText = daysUntilBirthday === 0
        ? `${formatDate(nextBirthday)} (Today!)`
        : `${formatDate(nextBirthday)} (in ${daysUntilBirthday} days)`;

      const lines = [
        "🎂 Your Age",
        `📅 Birth Date: ${formatDate(birthDate)}`,
        `🎈 Age: ${years} years, ${months} months, ${days} days`,
        `📆 Total Days Alive: ${totalDays.toLocaleString("en-US")} days`,
        `⏰ Total Hours Alive: ${totalHours.toLocaleString("en-US")} hours`,
        `⏱️ Total Minutes Alive: ${totalMinutes.toLocaleString("en-US")} minutes`,
        `🎉 Next Birthday: ${nextBirthdayText}`,
      ];

      return message.reply(lines.map(bold).join("\n"));
    } catch (err) {
      console.error("❌ /age command error:", err);
      return message.reply(`${bold("❌ Opps! Something went wrong. Please try again later.")}`);
    }
  },
};
