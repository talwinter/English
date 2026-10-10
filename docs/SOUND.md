# Voices and music

## Human-sounding voices (Kokoro)

The game reads every line aloud. With the server it uses **Kokoro**, a free text-to-speech model that sounds
close to a real person and runs on the server's CPU (an i3 with 8 GB is enough). Each character has their own
voice: the narrator, Byte, Grandmother, Father, and so on (the list is in `js/voices.js`).

- It runs as a second container, `kokoro`, in `docker-compose.yml`. `docker compose up -d --build` starts it.
  The first start downloads about 2–3 GB; after that it uses about 1–2 GB of memory.
- The server makes each line **once** and keeps it in `data/voice/`. It makes the lines of the episodes ahead
  of time, one by one, including every command line ("Open the door"), so the game plays them at once.
  A line that is not made yet (for example with his name in it) is read by the browser's voice right away,
  and the server makes the human voice for next time.
- The first time, making all the lines of the existing episodes takes some time (an hour or two on an
  i3). Meanwhile the game uses the browser's voice for lines that are not ready yet.
- The parent page shows how many lines are ready (**קולות אנושיים**).
- When a word is spoken it lights up on the screen, like before.

**Turning it off:** remove the `kokoro` service and the `TTS_URL` line from `docker-compose.yml`. The game then
uses the browser's voices (Microsoft Edge has the best ones on Windows).

If something is wrong, the parent page log shows lines starting with `Voices:`, and
`docker compose logs kokoro` shows Kokoro's own log.

## Music

The game has its own chiptune music (made in the browser), so it works without any files. You can replace it
with real music: put files in `data/music/` on the Docker server, with these names (`.ogg` or `.mp3`):

| File | Where it plays |
|---|---|
| `mystery.ogg` | The prologue (Grandpa's attic), dark forests |
| `adventure.ogg` | Outside, walking around |
| `cozy.ogg` | Inside houses, with friends |
| `danger.ogg` | Wolves, bears, the bridge |
| `glitch.ogg` | When the game "breaks" |

The files are used at once (no restart). A file that is missing plays the built-in music instead.

**Free music you may use:** on <https://opengameart.org>, search with **License: CC0** (free for anything,
no credit needed). Good searches: `chiptune`, `8-bit`, `rpg loop`. Packs that fit: "15 Melodic RPG Chiptunes",
"Chiptune: Exploration", "Spooky Dungeon", "The Arplands". Download, rename to the names above, and copy:

```sh
scp exploration.ogg user@SERVER:~/english-quest/data/music/adventure.ogg
```

## Sound effects

Sounds for picking things up, points, goals and wrong answers, and the special effects (the old computer
turning on, the screen breaking, being pulled into the game), are made by the browser. Nothing to set up.
The **Music** button in the game turns the music off; **Sound** turns the reading off.
