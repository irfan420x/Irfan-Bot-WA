module.exports = {
  help: {
    description: "সব কমান্ডের তালিকা দেখুন, অথবা একটি কমান্ডের বিস্তারিত দেখুন।",
    guide: "{pn}help [command]",
    text: {
      commandNotFound: '"%1" নামে কোনো কমান্ড নেই। সব কমান্ড দেখতে %2help লিখুন।',
      noCommands: "কোনো কমান্ড লোড হয়নি।",
      listHeader: "%1 — কমান্ডসমূহ (প্রিফিক্স: %2)",
      listFooter: "একটি কমান্ডের বিস্তারিত দেখতে %1help <command> লিখুন।",
      roleText0: "সবাই",
      roleText1: "গ্রুপ অ্যাডমিন",
      roleText2: "বট অ্যাডমিন"
    }
  },
  prefix: {
    description: "বটের কমান্ড প্রিফিক্স দেখুন।",
    guide: "{pn}prefix",
    text: {
      reply: "%1 প্রিফিক্স: %2\nসব কমান্ড দেখতে %2help লিখুন।"
    }
  },
  language: {
    description: "এই চ্যাটের জন্য বটের ভাষা দেখুন বা বদলান।",
    guide: "{pn}language [en | bn]",
    text: {
      current: "এই চ্যাটের বর্তমান ভাষা: %1",
      set: "এই চ্যাটের ভাষা %1-এ বদলে দেওয়া হয়েছে।",
      invalid: "ভুল ভাষা। %1language en অথবা %1language bn লিখুন।",
      onlyAdmin: "শুধু গ্রুপ অ্যাডমিনরা ভাষা বদলাতে পারে।",
      langNameEn: "English",
      langNameBn: "বাংলা"
    }
  }
};
