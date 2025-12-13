const { Module } = require("../lib/plugins");
const { getTheme } = require("../Themes/themes");
const theme = getTheme();
Module({
  command: "fullpp",
  package: "owner",
  description: "Set profile picture",
})(async (message) => {
  if (!message.isfromMe) return message.send(theme.isfromMe);
  if (!message.quoted || !/imageMessage/.test(message.quoted.type)) {
    return message.send("Reply to an image");
  }
  let buf = await message.quoted.download();
  await message.setPp(message.sender, buf);
  return message.send("_Profile picture updated_");
});
