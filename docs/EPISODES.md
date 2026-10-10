# New episodes: the episode writer

The server writes new episodes by itself with OpenAI, checks them, and keeps them for you to try and approve.

## How it works

1. **The server keeps 2 new episodes ready.** When fewer are waiting, it writes the next one (at most once
   every 6 hours). It uses the series bible (`docs/STORY.md`), the story so far, the words he already knows,
   and Episode 2 as an example of the format.
2. **It checks the episode before you see it:**
   - **A robot plays it from start to end.** If it can't be finished, it's rejected.
   - Every English word must have a Hebrew translation.
   - Sentences are short (at most 30 words).
   - Not too many new words (at most 35).
   - Everything is connected: no missing scenes, items or pictures.

   If something fails, the server sends the list of problems back to OpenAI and asks again (up to 3 times).
3. **The pictures are queued right away**, so the art worker on your PC makes them while you decide.
4. **You try it and approve it** on the parent page under **פרקים** (episodes):
   - **▶ נסה את הפרק** (try the episode) opens it in preview mode. Preview doesn't count for him and doesn't
     touch the Discord lock.
   - **✅ אשר** (approve) publishes it.
   - **❌ דחה וכתוב מחדש** (reject and write again) asks you what to change ("funnier", "fewer new words",
     "more about BYTE") and writes it again.
5. **When you choose a background picture**, the server asks OpenAI where the things are in it (the door,
   the cave, the tree), so clicks land in the right place.
6. **It becomes his mission** the morning after all its pictures are chosen. Until then, his mission is the
   word challenge, so he never sees an episode with missing pictures.

You can also press **✍️ כתוב את הפרק הבא עכשיו** (write the next episode now), with an optional note.

## Settings (docker-compose.yml)

| Setting | What it does |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI key. Empty = no new episodes. |
| `OPENAI_MODEL` | Default `gpt-5-mini`. Any OpenAI model with structured output and image input works. |
| `EPISODES_AHEAD` | How many new episodes to keep ready (default 2). |
| `AUTO_PUBLISH` | `"true"` = publish without asking you, and use the first version of each picture. Start with `"false"` until you trust the quality. |

## Cost

Writing one episode is one large request (plus a retry if needed), and placing things in each new
background is one small request with the picture. With a mini model this should cost cents per episode;
check OpenAI's current prices. The pictures themselves are free (your PC's graphics card).

## Where things are

- Episodes: `data/episodes/published/` (approved) and `data/episodes/drafts/` (waiting for you), as JSON.
- The episode format is described at the top of `js/episode.js`. Episodes 1 and 2 are in `js/episodes/`.
