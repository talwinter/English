# English Quest: Lost in the Game

A point-and-click adventure series for learning English, made for a 15-year-old Hebrew speaker who loves
games. It plays like the old Sierra and LucasArts games (King's Quest, Monkey Island): you can only move
forward by **understanding** the English, so there is no "next, next, next".

Every morning Discord locks on his devices. He plays today's episode, passes a short word challenge,
and Discord opens until the next morning.

- **The story**: [docs/STORY.md](docs/STORY.md)
- **Making the art with AI images**: [docs/ART.md](docs/ART.md)
- **Setting up the server and the MikroTik Discord lock**: [docs/DISCORD-LOCK.md](docs/DISCORD-LOCK.md)

## Playing

With the server (Docker): open `http://SERVER:8080` on his computer. Microsoft Edge has the most natural
English voices. Use headphones, because the game reads every sentence aloud and lights up each word as
it's spoken.

Without the server: double-click `index.html`. The game works the same, just without the Discord lock.

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
| `js/game-data.js` | Episode 1: scenes, objects, puzzles, goals and hints. |
| `js/dictionary.js` | English → Hebrew for every word in the game. |
| `js/art.js` | The pictures: King's Quest style EGA pixel art, the hero and other sprites. |
| `js/game.js` | The game engine and screen. |
| `js/mission.js` | The daily mission, the Discord indicator and the Word Challenge. |
| `js/speech.js` | Reading aloud with the browser's voices. |
| `server/` | The server: daily lock schedule, router control (SSH), challenge, parent page. |
| `router/discord-lock.rsc` | The MikroTik setup to paste into the router. |
| `tools/pixelate.html` | Turns AI images into VGA pixel art. |
| `tools/check-words.js` | Checks that every English word in the game has a Hebrew translation. |

## Development

No dependencies, only Node.js 22.

```sh
npm test                                      # lock schedule, challenge, server, and word check
ROUTER_MODE=mock LOCK_TIME=00:00 ADMIN_PASSWORD=pw npm start   # run locally without a router
```
