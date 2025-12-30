const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "config.env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
}
const isTrue = (x) => String(x).toLowerCase() === "true";

module.exports = { //test 
  // ================= SESSION ================= //
  SESSION_ID:
    process.env.SESSION_ID ||
    "STARK-MD~2BsWFJ7L#HAS1ChTDHfZUN-HQxZatcfkqSQC3bowLKdFEY3RO-IM",
  // ================= DATABASE ================= //
  DATABASE_URL: process.env.DATABASE_URL || "",

  // ================= MENU ================= //
  MENU_INFO:
    process.env.MENU_INFO ||
    "x-kira,*_made whit love by x-kira ❤️‍🩹_*,https://i.postimg.cc/TY3P8vv2/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-1.webp,image",
  // name,desc,link,type(image/video/gif)

  THEME: process.env.THEME || "t", // Garfield

  // ================= BOT MODE ================= //
  WORK_TYPE: process.env.WORK_TYPE || "public",
  prefix: process.env.PREFIX || ".",
  BOT_NAME: process.env.BOT_NAME || "x-kira",

  // ================= FEATURES ================= //
  STATUS_REACT: isTrue(process.env.STATUS_REACT) || false,
  AUTOREAD: isTrue(process.env.AUTOREAD) || false,
  AUTOTYPING: isTrue(process.env.AUTOTYPING) || false,
  AUTOREACT: isTrue(process.env.AUTOREACT) || false,
  STATUS_SEEN: isTrue(process.env.STATUS_SEEN) || false,

  // =========================================== //
};
