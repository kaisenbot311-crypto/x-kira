const { Module } = require('../lib/plugins');
const axios = require('axios');

Module({
  command: 'ssweb',
  package: 'tools',
  description: 'Full-page web screenshot'
})(async (message, match) => {
  let url = match?.trim() || message.quoted?.body?.trim();
  if (!/^https?:\/\//i.test(url)) return await message.send('_ssweb <url> or reply to url_');
  const link = `https://image.thum.io/get/width/1200/crop/900/fullpage/${url}`;
  const img = (await axios.get(link, { responseType: 'arraybuffer' })).data;
  await message.send({ image: img });
});


Module({
  command: 'shorturl',
  package: 'tools',
  description: 'Shorten a url using tinyurl',
})(async (message, match) => {
  const url = (match || message.quoted?.text || '').trim();
  if (!url || !url.startsWith('http')) return await message.send('_valid url required_');
  const res = await axios.get(`https://tinyurl.com/api-create.php?url=${url}`);
  await message.send(`*short:*\n${res.data}`);
});

Module({
  command: 'qr',
  package: 'tools',
  description: 'Generate QR code',
})(async (message, match) => {
  const text = match || message.quoted?.text;
  if (!text) return await message.send('_text required_');
  const img = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${text}`;
  await message.send({ image: { url: img } }, { quoted: message });
});

Module({
  command: 'calc',
  package: 'tools',
  description: 'Solve math expressions',
})(async (message, match) => {
if (!match) return await message.send('_expression required_');
try {const result = eval(match.replace(/[^-()\d/*+.]/g, ''));
await message.send(`*answer*:\n\n*${result}*`);
} catch {
await message.send('_invalid_');
}});
