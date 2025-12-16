const os = require("os");
const { Module, commands, plugins } = require("../lib/plugins");
const settings = require("../lib/database/settingdb");
const config = require("../config");

const readMore = String.fromCharCode(8206).repeat(4001);
const INVISIBLE_MARK = "\u2063MENU_MAP_v1"; // invisible marker to identify our menu

const runtime = (secs) => {
  const pad = (s) => s.toString().padStart(2, "0");
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
};

global.menuCommandMap = global.menuCommandMap || new Map();

Module({ command: "menu", package: "general", description: "Show all commands or a specific package" })(
  async (message, match) => {
    try {
      const time = new Date().toLocaleTimeString("en-ZA", { timeZone: "Africa/Johannesburg" });
      const userName = message.pushName || "User";
      const usedGB = ((os.totalmem() - os.freemem()) / 1073741824).toFixed(2);
      const totGB = (os.totalmem() / 1073741824).toFixed(2);
      const ram = `${usedGB} / ${totGB} GB`;

      const grouped = commands
        .filter((cmd) => cmd.command && cmd.command !== "undefined")
        .reduce((acc, cmd) => {
          if (!acc[cmd.package]) acc[cmd.package] = [];
          acc[cmd.package].push(cmd.command);
          return acc;
        }, {});

      const workType = settings.getGlobal("WORK_TYPE") ?? config.WORK_TYPE ?? "public";
      const prefix = settings.getGlobal("prefix") ?? config.prefix ?? ".";
      const menuInfo = settings.getGlobal("MENU_INFO") ?? config.MENU_INFO ?? "bot,[https://i.postimg.cc/pVZd1X4L/DM-FOR-PAID-PROMOTION-B-o-y-P-F-P-𝐼𝐺-3.webp,photo](https://i.postimg.cc/pVZd1X4L/DM-FOR-PAID-PROMOTION-B-o-y-P-F-P-𝐼𝐺-3.webp,photo)";
      const [name, media, type] = menuInfo.split(',').map(v => v.trim());
      const categories = Object.keys(grouped).sort();
      const flatCmds = [];
      for (const cat of categories) {
        const list = grouped[cat].slice().sort((a, b) => a.localeCompare(b));
        for (const c of list) flatCmds.push({ package: cat, command: c });
      }
      let _cmd_st = "";
      _cmd_st += `
*╭══〘〘 ${name} 〙〙*
*┃❍ ʀᴜɴ     :* ${runtime(process.uptime())}
*┃❍ ᴍᴏᴅᴇ    :* ${workType}
*┃❍ ᴘʀᴇғɪx  :* ${prefix}
*┃❍ ʀᴀᴍ     :* ${ram}
*┃❍ ᴛɪᴍᴇ    :* ${time}
*┃❍ ᴜsᴇʀ    :* ${userName}
*╰═════════════════⊷*
${readMore}
*♡︎•━━━━━━☻︎━━━━━━•♡︎*
*┃❍ Reply with the number to execute the command.*
`;
      if (match && grouped[match.toLowerCase()]) {
        const pack = match.toLowerCase();
        _cmd_st += `\n *╭────❒ ${pack.toUpperCase()} ❒⁠⁠⁠⁠*\n`;
        grouped[pack]
          .sort((a, b) => a.localeCompare(b))
          .forEach((cmdName) => {
            const index = flatCmds.findIndex(x => x.command === cmdName && x.package === pack) + 1;
            _cmd_st += ` *├◈ ${index} ${cmdName}*\n`;
          });
        _cmd_st += ` *┕──────────────────❒*\n`;
      } else {
        for (const cat of categories) {
          _cmd_st += `\n *╭────❒ ${cat.toUpperCase()} ❒⁠⁠⁠⁠*\n`;
          const list = grouped[cat].slice().sort((a, b) => a.localeCompare(b));
          for (const cmdName of list) {
            const index = flatCmds.findIndex(x => x.command === cmdName && x.package === cat) + 1;
            _cmd_st += ` *├◈ ${index} ${cmdName}*\n`;
          }
          _cmd_st += ` *┕──────────────────❒*\n`;
        }
       // _cmd_st += `\nᴛʜᴇ ʜᴇᴀʀᴛ ʜᴇᴀᴄᴋᴇʀ ɢɪʀʟ   𐏓꯭꯭❀𝄄𝄀꯭𝄄꯭ 𝐙͟𝐚͟𝐫͟𝐢͟𝐬͟𝐡͟𝐚͟❀͟𝄄𝄀꯭𝄄꯭⸙⟶`;
      }
      _cmd_st += INVISIBLE_MARK;

      let sent;
      if (type === "image") {
        sent = await message.conn.sendMessage(message.from, { image: { url: media }, caption: _cmd_st });
      } else if (type === "video") {
        sent = await message.conn.sendMessage(message.from, { video: { url: media }, caption: _cmd_st, gifPlayback: false });
      } else if (type === "gif") {
        sent = await message.conn.sendMessage(message.from, { video: { url: media }, caption: _cmd_st, gifPlayback: true });
      } else {
        sent = await message.conn.sendMessage(message.from, { text: _cmd_st });
      }
      try {
        const sentId = sent?.key?.id;
        if (sentId) {
      
          const names = flatCmds.map(x => x.command);
          global.menuCommandMap.set(sentId, names);
          setTimeout(() => global.menuCommandMap.delete(sentId), 10 * 60 * 1000);
        }
      } catch (e) { /* ignore storage errors */ }

    } catch (err) {
      console.error("Menu error:", err);
    }
  }
);

Module({ on: "text" })(async (message) => {
  try {
    if (!message.quoted) return;
    const quotedKeyId = message.quoted?.key?.id;
    if (!quotedKeyId) return;
    const names = global.menuCommandMap.get(quotedKeyId);
    if (!names) return;
    const raw = (message.body || "").trim();
    if (!raw) return;
    const parts = raw.split(/\s+/);
    const numStr = parts.shift();
    if (!/^\d+$/.test(numStr)) return;
    const idx = parseInt(numStr, 10);
    if (idx < 1 || idx > names.length) return;
    const cmdName = names[idx - 1]; 
    const args = parts.join(" ");
    const PREFIX = settings.getGlobal("prefix") ?? config.prefix ?? ".";
    message.body = `${PREFIX}${cmdName}${args ? " " + args : ""}`;
    let found = null;
    if (Array.isArray(plugins)) {
      found = plugins.find(
        (p) => p.command === cmdName || (p.aliases && p.aliases.includes(cmdName))
      );
    }
    if (!found && Array.isArray(commands)) {
      found = commands.find(
        (c) => c.command === cmdName || (c.aliases && c.aliases.includes(cmdName))
      );
    }
    if (found) {
      try {
        if (typeof found.exec === "function") {
          await found.exec(message, args);
        } else if (typeof found.run === "function") {
          await found.run(message, args);
        } else {
          if (typeof global?.dispatch === "function") {
            await global.dispatch({ ...message });
          }
        }
      } catch (err) {
        console.error("Error executing plugin from menu-reply:", err);
      }
      return;
    }
    const emuBody = `${PREFIX}${cmdName}${args ? " " + args : ""}`;
    if (typeof global?.dispatch === "function") {
      await global.dispatch({ ...message, body: emuBody });
    }
    return;
  } catch (err) {
    console.error("Menu-reply handler error:", err);
  }
});


Module({
  command: "list",
  package: "general",
  description: "Show all available commands (with package, description and optional usage)",
})(async (message) => {
  try {
    let out = [];
    out.push("*📜 Command list*");
    out.push("");
    const grouped = commands
      .filter((c) => c.command) 
      .reduce((acc, c) => {
        const pkg = (c.package || "other").toLowerCase();
        acc[pkg] = acc[pkg] || [];
        acc[pkg].push(c);
        return acc;
      }, {});
    const pkgs = Object.keys(grouped).sort();
    for (const pkg of pkgs) {
      out.push(`*┏━ ${pkg.toUpperCase()} ━*`);
      grouped[pkg]
        .sort((a, b) => (a.command || "").localeCompare(b.command || ""))
        .forEach((c) => {
          const name = c.command || "(unknown)";
          const desc = c.description ? `${c.description}` : "No description";
          const usage = c.usage ? `\n  _Usage:_ \`${c.usage}\`` : "";
          out.push(`• *${name}* — ${desc}${usage}`);
        });
      out.push(`*┗━━━━━━━━━━━━━━━━━*`);
      out.push("");
    }
    const text = out.join("\n");
    await message.send(text);
  } catch (err) {
    console.error("Error in list plugin:", err);
    await message.send("❌ Failed to fetch command list.");
  }
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
  const name =
          settings.getGlobal("BOT_NAME") ??
          config.BOT_NAME ??
          "BOT";
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
  const imageUrl =
    settings.getGlobal("MENU_URL") ||
    config.MENU_URL ||
    getRandomPhoto();
  await message.send({
    image: { url: imageUrl },
    caption: ctx,
  });
  await message.send({
    image: { url: getRandomPhoto() },
    caption: ctx,
  });
});


