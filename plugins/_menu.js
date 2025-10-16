const os = require("os");
const { Module, commands } = require("../lib/plugins");
const { getTheme } = require("../Themes/themes");
const theme = getTheme();

const config = require("../config");
const TextStyles = require("../lib/textfonts");
const styles = new TextStyles();

const star = "⛥";
const name = "X-kira";

Module({
  command: "menu",
  package: "general",
  description: "Show all commands or a specific package",
})(async (message, match) => {
  const hostname = os.hostname();
  const time = new Date().toLocaleTimeString("en-ZA", {
    timeZone: "Africa/Johannesburg",
  });
  const mode = config.WORK_TYPE || process.env.WORK_TYPE;
  const ramUsedMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

  const grouped = commands
    .filter((cmd) => cmd.command && cmd.command !== "undefined")
    .reduce((acc, cmd) => {
      if (!acc[cmd.package]) acc[cmd.package] = [];
      acc[cmd.package].push(cmd.command);
      return acc;
    }, {});

  const categories = Object.keys(grouped).sort();
  let _cmd_st = "";

  if (match && grouped[match.toLowerCase()]) {
    const pack = match.toLowerCase();
    _cmd_st += `╭───╼「 *${styles.toMonospace(pack.toUpperCase())}* 」─╼\n`;
    grouped[pack]
      .sort((a, b) => a.localeCompare(b))
      .forEach((cmdName) => {
        _cmd_st += `┃ ${styles.toMonospace(cmdName)}\n`;
      });
    _cmd_st += `╰──────────╼\n`;
  } else {
    _cmd_st += `╭──╼「 *${styles.toMonospace(name)}* 」─╼\n`;
    _cmd_st += `┃ ${styles.toMonospace(star)} Host: ${styles.toMonospace(
      hostname
    )}\n`;
    _cmd_st += `┃ ${styles.toMonospace(star)} User: ${styles.toMonospace(
      message.pushName
    )}\n`;
    _cmd_st += `┃ ${styles.toMonospace(star)} Prefix: ${config.prefix}\n`;
    _cmd_st += `┃ ${styles.toMonospace(star)} Time: ${styles.toMonospace(
      time
    )}\n`;
    _cmd_st += `┃ ${styles.toMonospace(star)} Mode: ${styles.toMonospace(
      mode
    )}\n`;
    _cmd_st += `┃ ${styles.toMonospace(star)} Ram: ${ramUsedMB} MB\n`;
    _cmd_st += `╰──────────╼\n\n`;

    if (match && !grouped[match.toLowerCase()]) {
      _cmd_st += `_not found: ${match}_\n\n`;
      _cmd_st += `packages:\n`;
      categories.forEach((cat) => {
        _cmd_st += `- ${cat}\n`;
      });
    } else {
      for (const cat of categories) {
        _cmd_st += `╭───╼「 *${styles.toMonospace(cat.toUpperCase())}* 」\n`;
        grouped[cat]
          .sort((a, b) => a.localeCompare(b))
          .forEach((cmdName) => {
            _cmd_st += `┃ ${styles.toMonospace(cmdName)}\n`;
          });
        _cmd_st += `╰──────────╼\n`;
      }
    }
  }

  const channelJid = "120363400835083687@newsletter";
  const channelName = "© X-kira";
  const serverMessageId = 7;

  const opts = {
    image: { url: "https://files.catbox.moe/n9ectm.jpg" },
    caption: _cmd_st,
    mimetype: "image/jpeg",
    contextInfo: {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: channelJid,
        newsletterName: channelName,
        serverMessageId: serverMessageId,
      },
    },
  };

  await message.conn.sendMessage(message.from, opts);
});

Module({
  command: "list",
  package: "general",
  description: "List all available commands",
})(async (message) => {
  const aca = commands
    .filter((cmd) => cmd.command && cmd.command !== "undefined")
    .map((cmd) => cmd.command)
    .join("\n");
  await message.send(`*List:*\n${aca}`);
});

Module({
  command: "alive",
  package: "general",
  description: "Check if bot is alive",
})(async (message) => {
  const hostname = os.hostname();
  const time = new Date().toLocaleTimeString("en-ZA", {
    timeZone: "Africa/Johannesburg",
  });
  const ramUsedMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  const ctx = `
*${name}* is online

*Time:* ${time}
*Host:* ${hostname}
*RAM Usage:* ${ramUsedMB} MB
*Uptime:* ${hours}h ${minutes}m ${seconds}s
`;

  await message.send({
    image: { url: "https://files.catbox.moe/n9ectm.jpg" },
    caption: ctx,
  });
});
