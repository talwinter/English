# English Quest: Lost in the Game

A point-and-click adventure series for learning English, made for a 15-year-old Hebrew speaker who loves
games. It plays like the old Sierra and LucasArts games (King's Quest, Monkey Island): you can only move
forward by **understanding** the English, so there is no "next, next, next".

Every morning Discord locks on his devices. He plays today's episode, passes a short word challenge,
and Discord opens until the next morning.

- **Start here: setup guide (router, Docker server, art PC)**: [docs/SETUP.md](docs/SETUP.md)
- **The story**: [docs/STORY.md](docs/STORY.md)
- **New episodes written automatically**: [docs/EPISODES.md](docs/EPISODES.md)
- **Making the art automatically on your PC's graphics card**: [docs/ART-WORKER.md](docs/ART-WORKER.md)
- **Making the art by hand**: [docs/ART.md](docs/ART.md)
- **Setting up the server and the MikroTik Discord lock**: [docs/DISCORD-LOCK.md](docs/DISCORD-LOCK.md)
- **Voices (Kokoro) and music**: [docs/SOUND.md](docs/SOUND.md)

## Playing

With the server (Docker): open `http://SERVER:8080` on his computer. Use headphones, because the game reads
every sentence aloud, with a human-sounding voice for each character (Kokoro, on the server), and lights up
each word as it's spoken.

Without the server: double-click `index.html`. The game works the same (Episode 1 with its built-in drawings),
just without the Discord lock, and with the browser's voices (Microsoft Edge has the best ones).

The series starts with a prologue, **Insert Disk**: in Grandpa's attic he turns on an old 1987 computer,
types his name, and is pulled into the game.

## What it teaches

- **Walking hero**: click a thing and the hero walks there and does the action. Click the ground to walk.
- **Reading to play**: the verb buttons (`Look at`, `Open`, `Take`, `Use`, `Give`, `Talk to`,
  `Enter`, `Go to`) and every message are in English. The goal (🎯) says what to do next.
- **Click any word** to see it in Hebrew and hear it.
- **Hints** (💡): first in simple English, then in Hebrew.
- **Typing**: commands can be typed, like in King's Quest: `open the door`, `give bread to wolf`.
- **Word Book**: every word he clicked, with a short practice quiz.
- **Daily Word Challenge**: 8 quick questions on the words from his episodes; 6 right answers
  open Discord. The server keeps the answers, so it can't be skipped from the browser.

## Files

| File | What it is |
| --- | --- |
| `js/episodes/` | The prologue (s1e0) and Episodes 1 and 2. Episodes are data; the format is described in `js/episode.js`. |
| `js/base.js` | The verb buttons and the game's own messages, shared by all episodes. |
| `js/loader.js` | Picks today's episode from the server (or Episode 1 without a server). |
| `js/dictionary.js` | English → Hebrew for every word in the game. |
| `js/art.js` | The pictures: King's Quest style EGA pixel art, the hero and other sprites. |
| `js/game.js` | The game engine and screen. |
| `js/mission.js` | The daily mission, the Discord indicator and the Word Challenge. |
| `js/speech.js` | Reading aloud: the server's voices (Kokoro), or the browser's. |
| `js/voices.js` | Which character says a line, and with which voice. |
| `js/audio.js` | Music and sound effects. |
| `js/fx.js` | Special effects (shake, flash, glitch, an old computer starting, being pulled into the game). |
| `server/` | The server: daily lock, router control (SSH), challenge, picture queue, episode writer and checks, parent page. |
| `router/discord-lock.rsc` | The MikroTik setup to paste into the router. |
| `art/shots.json` | The pictures the episodes need (descriptions for Stable Diffusion). |
| `worker/` | The art worker for the Windows PC with the GPU, and its one-click installer. |
| `tools/pixelate.html` | Turns AI images into VGA pixel art by hand. |
| `tools/check-words.js` | Checks that every English word in the game has a Hebrew translation. |

## Development

No dependencies, only Node.js 22.

```sh
npm test                                      # lock schedule, challenge, server, and word check
ROUTER_MODE=mock LOCK_TIME=00:00 ADMIN_PASSWORD=pw npm start   # run locally without a router
```
