# Going live: the checklist

What changes when the Godot game replaces the web game for the son. Do these in order. Each step says what it
changes, so you can stop at any point; the old web game keeps working until Discord's lock is turned on.

## 1. The game on his PC

1. On the dev PC: `powershell -File tools\make-package.ps1` (it takes about a minute). It makes `dist\EnglishQuest.zip`
   (about 105 MB: the game, a copy of the Godot engine, a launcher and a config that points at the server).
2. Copy the zip to his PC, unzip it anywhere, and double-click **Play English Quest.bat**.
3. The first start shows the prologue. Everything he does is sent to the server (his name, finished episodes,
   word progress) because the package config has `"report": true`.

To try the package without touching his progress, run it from a console with `--no-server`
(`EnglishQuest.exe --path game -- --no-server`).

## 2. The server (Docker host, Ubuntu)

Say "continue" before you do this. It changes the running server.

```bash
cd ~/docker/english-quest
git pull
docker compose up -d --build
```

What it adds: the 3D episode writer, one new episode per day, the canon and the series spine, voices made ahead
for his name and the tips, the parent page sections (canon, problem reports, wishes), and episode 1 and 2 served
laid out in 3D.

`.env` on the server (edit it, then `docker compose up -d`):

| Setting | Value | Why |
|---|---|---|
| `LOCK_ENABLED` | `true` | Turn the daily 08:00 lock back on when you want it (the "Lock now" button works even when `false`). |
| `WAKE_TIME` | empty | The art PC is not used any more. |
| `OPENAI_API_KEY` | your key | Writes the episodes (a few cents each). |
| `AUTO_WRITE` | `true` (or remove it) | Keeps `EPISODES_AHEAD` new episodes ready. |
| `EPISODES_AHEAD` | `2` | How many to keep ready. |
| `AUTO_PUBLISH` | `false` | You try each new episode on the parent page, then approve. Set `true` later if you trust it. |
| `EPISODE_FORMAT` | not set | 3D is the default. `2d` is the old pictures format (not used any more). |

## 2b. The same stack on the dev PC (Docker Desktop)

Test everything here first. It is the same two containers as the server, made safe for a dev PC: the router is a
mock (never touches the MikroTik), its data is in `data-dev/` (separate from the real progress), and episodes are
only written when you press the button.

```bash
docker compose -p english-quest-dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

- The server answers on `http://localhost:8081` (port 8080 is used by another project on this PC); the parent
  page is `http://localhost:8081/admin` with the `ADMIN_PASSWORD` from `.env` (`dev`).
- Play against it without touching the real server: `godot\play.bat --server=http://localhost:8081`
  (the game reports progress only when `report` is on in `godot/config.json`; leave it off for tests).
- Kokoro takes a minute or two to start; the server then makes the voices of the lines (the log shows progress).
- Stop it: `docker compose -p english-quest-dev down`.

## 2c. How an episode reaches the son

| Where it was made | Steps | What the son sees |
|---|---|---|
| **On the server** (the normal way) | the writer makes a draft, you approve it on `http://SERVER:8080/admin` | his game asks `/api/play` when it starts and gets the approved episode |
| **On the dev PC** (like s1e3 today) | `node tools/push-episode.js --id s1e3 --to http://SERVER:8080` (needs `SERVER_ADMIN_PASSWORD` in `.env` or the environment), then approve on the server's page | the same |
| **Built-in** (`js/episodes/`) | `git pull` + `docker compose up -d --build` on the server | the same |

The server checks a pushed episode again (words, robot, rooms) before it appears on the parent page.

What does **not** travel with an episode is game code and 3D models (new props, rooms, the UI): they are files of the
game itself. Until the game updates itself (planned: content packs), a change there means a new
`dist\EnglishQuest.zip` (`tools\make-package.ps1`) on his PC.

## 3. The first morning

1. Open `http://SERVER:8080/admin` and look at "episodes": the writer's draft shows its steps (brief, writing,
   layout, checks, repairs). Press the try button, play it on your PC with `play.bat`, then approve.
2. Check "wishes": anything the story needed that the catalog does not have. They are built in batches on the
   dev PC (`godot/blender/`), and you get previews afterwards.
3. After the lock turns on, he plays the episode, then the 8-question word challenge opens Discord until the next
   morning. The problem reports he sends from the game ("Something wrong?") appear on the same page.

## 4. What still needs the dev PC (and you being around)

- New props, rooms and characters for the catalog (the writer's wishes). The daily episodes themselves do not
  need the dev PC: the server writes, lays out and checks them by itself.
- A cutscene or effect that the library does not have (a rare case; the writer wishes for it).
- Changing the game itself (a new button, a new kind of puzzle): update the package and copy it again.

## Try the whole pipeline without OpenAI

```bash
node tools/build-episode.js --id s1e3 --replay catalog/example-episode.json
```

Writes an episode from a stored answer, places it, checks it, and shows every step on a page
(`data/builds/<id>-<time>/report.html`, it refreshes itself). With the key in `.env` and no `--replay`, OpenAI
writes it for real; add `--install` to copy the result into `godot/episodes/` so `play.bat --episode=s1e3` plays it.
