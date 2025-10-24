// randomphotolink.js
const crypto = require("crypto");

const photoLinks = [
  "https://i.postimg.cc/yxzShQDT/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-5.webp",
  "https://i.postimg.cc/qMwCnG4b/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-10.webp",
  "https://i.postimg.cc/MpGfYjpb/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-11.webp",
  "https://i.postimg.cc/5NgFvmbm/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-12.webp",
  "https://i.postimg.cc/xT5bHPn5/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-7.webp",
  "https://i.postimg.cc/nr0cs0BD/B-O-Y-P-F-P-whois-jimm4t-𝐼𝐺-life-line2-o-𝐷-𝑜-𝑤-1.webp",
  "https://i.postimg.cc/NG40PfVP/B-O-Y-P-F-P-whois-jimm4t-𝐼𝐺-life-line2-o-𝐷-𝑜-𝑤-3.webp",
  "https://i.postimg.cc/2jw5X8Mp/B-O-Y-P-F-P-whois-jimm4t-𝐼𝐺-life-line2-o-𝐷-𝑜-𝑤-4.webp",
  "https://i.postimg.cc/SQrKtN5T/B-O-Y-P-F-P-whois-jimm4t-𝐼𝐺-life-line2-o-𝐷-𝑜-𝑤-5.webp",
  "https://i.postimg.cc/NG40PfV3/B-O-Y-P-F-P-whois-jimm4t-𝐼𝐺-life-line2-o-𝐷-𝑜-𝑤-6.webp",
  "https://i.postimg.cc/RCR0bVy5/B-O-Y-P-F-P-whois-jimm4t-𝐼𝐺-life-line2-o-𝐷-𝑜-𝑤-7.webp",
  "https://i.postimg.cc/CMNK6LXw/B-O-Y-P-F-P-whois-jimm4t-𝐼𝐺-life-line2-o-𝐷-𝑜-𝑤-8.webp",
  "https://i.postimg.cc/jqXjkdmr/B-O-Y-P-F-P-whois-jimm4t-𝐼𝐺-life-line2-o-𝐷-𝑜-𝑤-9.webp",
  "https://i.postimg.cc/NG40PfSg/DM-FOR-PAID-PROMOTION-B-o-y-P-F-P-𝐼𝐺.webp",
  "https://i.postimg.cc/pVZd1X4L/DM-FOR-PAID-PROMOTION-B-o-y-P-F-P-𝐼𝐺-3.webp",
  "https://i.postimg.cc/v8zmSHkD/DM-FOR-PAID-PROMOTION-B-o-y-P-F-P-𝐼𝐺-4.webp",
  "https://i.postimg.cc/wxVBbTZ7/DM-FOR-PAID-PROMOTION-B-o-y-P-F-P-𝐼𝐺-5.webp",
  "https://i.postimg.cc/VLkNyPPz/DM-FOR-PAID-PROMOTION-B-o-y-P-F-P-𝐼𝐺-6.webp",
  "https://i.postimg.cc/L68sdFFv/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉.webp",
  "https://i.postimg.cc/TY3P8vvt/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-1.webp",
  "https://i.postimg.cc/FsCHNChx/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-2.webp",
  "https://i.postimg.cc/QNbMnxw9/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊.webp",
  "https://i.postimg.cc/TY3P8vv2/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-1.webp",
  "https://i.postimg.cc/pXLdNMMZ/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-13.webp",
  "https://i.postimg.cc/CLxKyppK/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-2.webp",
  "https://i.postimg.cc/BQnvWffP/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-4.webp",
  "https://i.postimg.cc/4Nx3CRRz/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-5.webp",
  "https://i.postimg.cc/02yNg117/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-6.webp",
  "https://i.postimg.cc/m2grxWW3/𝙎𝙒𝙄𝙋𝙀-𝙋𝙄𝘾𝙎-GC-link-in-bio-𝘿𝙈-𝙋𝘼𝙄𝘿-𝙁𝙊𝙍-𝙋𝙍𝙊𝙈𝙊𝙏𝙄𝙊𝙉-𝙅𝙊-9.webp",
];

function getRandomPhoto() {
  // Generate a cryptographically secure random index
  const randomBytes = crypto.randomBytes(4).readUInt32BE();
  const index = randomBytes % photoLinks.length;
  return photoLinks[index];
}

// Export for use in other files
module.exports = { getRandomPhoto };
