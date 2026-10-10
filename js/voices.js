// Who says a line, and with which voice. Shared by the game (browser) and the server (which makes the
// voices with Kokoro). A line like  Byte: "Hello!"  is said by Byte; everything else by the narrator.

(function (root) {
  // Kokoro voices (https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).
  const NARRATOR = "af_heart";
  const CHARACTERS = {
    byte: "am_puck",
    grandmother: "bf_emma", grandma: "bf_emma", granny: "bf_emma",
    grandpa: "bm_george", grandfather: "bm_george", king: "bm_george", wizard: "bm_lewis",
    father: "am_michael", dad: "am_michael",
    mother: "af_bella", mom: "af_bella", queen: "bf_isabella",
    wolf: "am_fenrir", bear: "am_fenrir", troll: "am_fenrir", dragon: "am_fenrir",
  };
  // Other characters get one of these, always the same one for the same name.
  const POOL = ["am_michael", "bf_emma", "bm_george", "af_bella", "am_fenrir", "bf_isabella", "bm_lewis", "af_nicole"];

  // { who, say, offset }: the speaker ("narrator" or a lowercase name), the words to say, and where they
  // start in the text.
  function parse(text) {
    const m = /^([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)?): "([^"]+)"$/.exec(text);
    if (!m) return { who: "narrator", say: text, offset: 0 };
    return { who: m[1].toLowerCase(), say: m[2], offset: m[1].length + 3 };
  }

  function voiceFor(who) {
    if (!who || who === "narrator") return NARRATOR;
    if (CHARACTERS[who]) return CHARACTERS[who];
    let h = 0;
    for (const ch of who) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return POOL[h % POOL.length];
  }

  // Words in ALL CAPS ("THE LAST QUEST") are read as words, not spelled out.
  const forSpeech = (say) => say.replace(/\b[A-Z]{3,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());

  const API = { parse, voiceFor, forSpeech, NARRATOR, CHARACTERS, POOL };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Voices = API;
})(this);
