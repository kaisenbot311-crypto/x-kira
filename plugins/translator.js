const { Module } = require("../lib/plugins");
const Translator = require("../lib/Class/translate");

Module({
  command: "trt",
  package: "mics",
  description: "Translate text to any language",
})(async (message, match) => {
  if (!match)
    return await message.send(
      "_Please provide text and lang_\n\neg: .tr bn hello"
    );
  const args = match.split(" ");
  const lang = args[0];
  const text = args.slice(1).join(" ");
  if (!text)
    return await message.send("_Please provide text _\n\neg: .tr en hello");
  const translator = new Translator();
  const result = await translator.translate(text, lang);
  if (result.status !== 200) return await message.send(`_${result.error}_`);
  const { originalText, translatedText, targetLanguage, sourceLanguage } =
    result.data;
  const response = `*${translatedText}`;
  await message.send(response);
});
