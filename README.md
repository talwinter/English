# English Quest

A point-and-click adventure game for learning English, made for a 15-year-old Hebrew speaker
who loves games. It plays like the old Sierra and LucasArts games (King's Quest, Monkey Island):
you can only move forward by **understanding** the English, so there is no "next, next, next".

## How to play on Windows

1. On GitHub, click **Code → Download ZIP**, and extract the folder.
2. Double-click `index.html`. It opens in the browser. **Microsoft Edge is best**: it has the most
   natural English voices.
3. Use headphones. The game reads every sentence aloud and lights up each word as it is spoken.

No install, no account, and no internet needed (except for the nicer fonts). Progress is saved in
the browser automatically.

## What it teaches

- **Walking hero**: click a thing and the hero walks there and does the action. Click the ground to walk.
- **Reading to play**: the verb buttons (`Look at`, `Open`, `Take`, `Use`, `Give`, `Talk to`,
  `Enter`, `Go to`) and every message are in English. The goal (🎯) says what to do next.
- **Click any word** to see it in Hebrew and hear it.
- **Hints** (💡): first in simple English, then in Hebrew.
- **Typing**: commands can be typed, like in King's Quest: `open the door`, `give bread to wolf`.
- **Word Book** (📖): every word he clicked, with a short practice quiz. Words he clicked often
  or got wrong come up first.

## Files

| File | What it is |
| --- | --- |
| `js/game-data.js` | The story: scenes, objects, puzzles, goals and hints. |
| `js/dictionary.js` | English → Hebrew for every word in the game. |
| `js/art.js` | The pictures: King's Quest style EGA pixel art (160×168, 16 colors), the hero and other sprites. |
| `js/game.js` | The game engine and screen. |
| `js/speech.js` | Reading aloud with the browser's voices. |
| `tools/check-words.js` | Checks that every English word in the game has a Hebrew translation. |

After changing any text, run:

```
node tools/check-words.js
```

## Next steps

- More levels (the forest, finding the father), each adding about 20 new words.
- An AI helper character in the game who answers questions in simple English. It will use the
  OpenAI API through a small local server, so the API key is never inside the game files.
  For one player at about 20 minutes a day, a small model costs a few cents a day.
