const { Module } = require('../lib/plugins');

Module({
    command: 'uptime',
    package: 'mics',
    description: 'Shows how long the bot has been running'
})(async (message) => {
    if (!message.isfromMe) return;
    const tts = process.uptime();
    const days = Math.floor(tts / 86400);
    const hours = Math.floor((tts % 86400) / 3600);
    const minutes = Math.floor((tts % 3600) / 60);
    const seconds = Math.floor(tts % 60);
    const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    const sent = await message.send('uptime...');
    await message.send(`*Uptime:* ${uptime}`, { edit: sent.key });
});
