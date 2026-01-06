
const { Module } = require('../lib/plugins');

const mention = require('./bin/mention');

Module({on:'text'})(async(message)=>{
  const b=message.body||'' // use ? 
  console.log(b)
  if(!message.isMentioned) return
  // example shape
const m = {
  sender: message.sender, 
  jid: message.from, 
  client: message.conn 
};
const text = `type/audio https://files.catbox.moe/bxvk6r.mp3

{
  "ptt": false,
  "mimetype": "audio/mpeg",
  "waveform": [99,0,99,0,99],
  "isForwarded": true,
  "forwardingScore": 5,
  "contextInfo": {
    "externalAdReply": {
      "title": " ▀▄▀▄▀▄ ×͜× ᴄ͢͢͢ʀɪᴍɪɴᴀʟ ×͜× ▄▀▄▀▄▀ ",
      "body": "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ×͜× ᴄ͢͢͢ʀɪᴍɪɴᴀʟ ×͜×",
      "showAdAttribution": true,
      "renderLargerThumbnail": true,
      "mediaType": 1,
      "thumbnail": "https://files.catbox.moe/sp5hba.jpeg",
      "mediaUrl": "https://files.catbox.moe/sp5hba.jpeg",
      "sourceUrl": "https://www.instagram.com/samin_bad_boy?igsh=cjcxanR4bmZyN2lj"
    }
  }
}`;
await mention(m, text);
// &sender -> replaced with @<senderNumber> and added to contextInfo.mentionedJid
})

Module({
  command: 'mee',
  package: 'fun',
  description: 'Send a hidden mention of the bot (no visible text, no sender mention)',
})(async (message, match) => {
  try {
    // resolve bot JID whether msgObj.bot is a string or a function
    const botJid =
      typeof message.botjid === 'function' ? await message.botjid() : message.botjid;

    if (!botJid) {
      return await message.send('Bot JID not available.');
    }

    // zero-width space — invisible in chat
    const hiddenText = '\u200B';

    // send hidden text and mention only the bot
    await message.send(hiddenText, { mentions: [botJid] });
  } catch (err) {
    console.error('mee hidden mention error:', err);
    await message.send('Something went wrong.');
  }
});