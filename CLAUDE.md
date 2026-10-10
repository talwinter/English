# English Quest: handoff for Claude Code

Read this first. It is the memory of the first development phase (in a cloud session), and the plan for the
next one (on the parent's Windows PC, with Godot, Blender and their MCP servers).

## The project in one paragraph

A point-and-click adventure series, "Lost in the Game", that teaches English to the parent's 15-year-old
son. He is a native Hebrew speaker and a gamer (Fortnite, Valorant, Roblox, God of War) who skips text, so the game
can only be won by understanding the English. Every morning at 08:00 the home router (MikroTik) blocks
Discord on his devices until he plays today's episode and passes a short word challenge. New episodes are
written automatically by OpenAI on the home Docker server, checked by a robot that plays them, and approved
by the parent. The story bible is `docs/STORY.md` (a boy is pulled into his grandpa's 1987 computer game,
"THE LAST QUEST"; his sidekick is Byte, a flying mouse-pointer arrow).

## Working with the parent

- They write in Hebrew or English; answer in the language they used. Keep answers short and concrete.
- Before you change anything on their systems (router, Docker server, PC settings), say what you will do
  and why, and wait for "continue". They asked for this explicitly.
- They don't want to do manual art work (no choosing pictures, no drawing hotspots). Automate it.
- Costs: the only paid service is OpenAI (writing episodes, gpt-5-mini; a few cents each). Don't add paid
  services without asking. Everything else runs at home or is free.
- Their PC has personal/NSFW Stable Diffusion LoRAs. Never use them for anything in this game.
- Never commit secrets: `.env` holds the passwords and the OpenAI key and is git-ignored.

## The machines

| Machine | What runs there |
|---|---|
| **Docker server** (Ubuntu, i3 4th gen, 8 GB) | `~/docker/english-quest`: this repo, `docker compose up -d --build`. Two containers: `english-quest` (Node 22 server, port 8080, data in `./data`) and `kokoro` (free text-to-speech, CPU). |
| **MikroTik router** | Scripts `eq-block` / `eq-unblock` / `eq-wake`, run by the server over SSH as user `eq-lock` (key in `data/ssh/`). Address list `eq-kid` = his devices, `eq-discord` = Discord domains. Setup: `router/discord-lock.rsc`, `docs/DISCORD-LOCK.md`. |
| **Parent's PC** (Windows, RTX 3060 12 GB, 192.168.1.105, MAC E8-9C-25-0E-5B-90) | Stability Matrix + ComfyUI, and the art worker (`worker/`, a scheduled task, woken at 05:00 by Wake-on-LAN). From now on also the development machine (Claude Code, Godot, Blender). |
| **Son's PC** (Windows) | Plays the game. Today: the web game at `http://SERVER:8080`. Next: a Godot EXE. |

The parent updates machines with `git pull` (server: then `docker compose up -d --build`; art PC: then
`worker/restart.bat`). The working branch is `claude/optimistic-einstein-1j01oc`.

## What exists today (all working, 18 server tests: `npm test`)

- `server/`: Node 22 with no dependencies.
  - Daily lock schedule (`schedule.js`), router control (`router.js`), the word challenge, graded on the server so it can't be skipped (`challenge.js`).
  - Episode loading and built-in overrides (`content.js`), the episode writer with OpenAI structured output and a repair loop (`writer.js`), the checker and solver robot (`validate.js`).
  - The art queue for the PC worker (`art.js`), Wake-on-LAN (`wake.js`), Kokoro voices made once and cached in `data/voice/` (`voice.js`).
  - The parent page (`admin.html`, basic auth with `ADMIN_PASSWORD`).
- **Episodes are data** (JSON), format documented at the top of `js/episode.js`.
  - Contents: scenes, objects, items, goals, rules (first matching rule wins), conditions (flags/has), effects (set/add/remove/goal/go/finish/fx), a Hebrew dictionary, and an art list.
  - Episodes: built-in `js/episodes/s1e0.js` (prologue "Insert Disk": attic, old computer, he types his name and is pulled in), `s1e1.js` (The Cold Village), `s1e2.js` (Into the Forest), plus published ones in `data/episodes/published/`.
  - `node tools/check-words.js` checks every built-in episode.
- **The web game** (`index.html`, `js/`):
  - Verbs (Look at, Take, Open, Use, Give, Talk to, Enter, Go to) and typed commands ("give bread to wolf").
  - Click any word for Hebrew, a word book and practice, hints in English then Hebrew.
  - Effects (`fx.js`), chiptune music and sound effects (`audio.js`), voices (`speech.js` + `voices.js`: each character has a Kokoro voice, words light up as spoken).
  - The daily mission and challenge UI (`mission.js`).
- **Server API the next client must use:**

| Endpoint | What it does |
|---|---|
| `GET /api/status` | Locked or not, today's mission (episode id or challenge), streak. |
| `GET /api/play[?episode=id]` | `{ episode, dictionary, chosen }`: today's episode (or a named one) with the Hebrew words. |
| `POST /api/episode-done {episode}` | He finished the episode; the mission becomes the challenge. |
| `POST /api/challenge/start` | Starts the challenge: 8 questions on words from his episodes. |
| `POST /api/challenge/answer {id, q, choice}` | Answers a question; 6 right answers pass and open Discord until the next morning. |
| `GET /api/voice?wait=0&text=...[&slow=1]` | `{ audio: "/voice/<id>.mp3", words: [[start, end], ...] }`, or `{ audio: null }` when the line isn't made yet (the server then makes it for next time). |
| `GET /music/<name>` | Optional music files. |

  The parent page is under `/admin`. The art worker uses `/api/art/*` with `WORKER_TOKEN`.
- **Docs for the parent:** `docs/SETUP.md` (start here), `DISCORD-LOCK.md`, `EPISODES.md`, `ART-WORKER.md`, `ART.md`, `SOUND.md`, `STORY.md`.

## Lessons learned (don't repeat these)

- **AI backgrounds + guessing where things are does not work.** Flat Stable Diffusion pictures have no
  meaning to the game. We asked OpenAI vision for boxes and a floor outline, but it marked desks as floor,
  so the hero stood on a desk or a wall. Patching this per picture is endless. That's why we're moving to a
  real 3D world (below).
- A single AI picture of the hero slides instead of walking. LPC sprites fixed that in the web game
  (`assets/characters/`, `tools/lpc/build.py`), but the new plan uses 3D characters instead.
- The son must hear every line at once. If a voice isn't ready, speak it some other way right away. Never
  leave silence (he clicks again and the line is lost).
- MikroTik:
  - The Discord block needs the FQDN address list. TLS-host matching alone fails with split ClientHellos.
  - Never touch rules the parent made. Our scripts only change rules in `chain=forward` with an
    `english-quest` comment; an earlier version disabled their SSH input rule by matching a name.
- Art worker on Windows: a missing LoRA gives HTTP 400 from ComfyUI; trailing commas in `config.json` broke
  it (now tolerated); the scheduled task must log, or failures are silent.
- Kokoro needs a minute to start after a restart; the server retries every 5 minutes.
- Sandbox lesson (cloud only): `pkill -f <pattern>` can kill your own shell if the pattern is in the command
  line; use `pgrep -f "^node ..."`.

## The plan: a Godot game in low-poly 3D with a pixel look

The parent chose this direction:
- Every room is real low-poly 3D, rendered at low resolution (about 320x180, scaled up with nearest-neighbor)
  so it looks like retro pixel art.
- Each room has a fixed camera angle, like King's Quest framing but with real depth.
- The walkable area is a navigation mesh baked from the room itself, so the hero can never stand on a desk
  or a wall, and clicks hit real objects (raycasts).
- The game is a Windows EXE that downloads new episodes from the existing server, so it never needs
  reinstalling for new content.

### Step 0: proof of concept first (do this before anything else)

The parent wants to see it work before real development starts. Keep it small:

1. Install and check:
   - **Godot 4** (latest stable, standard version, not .NET).
   - **Blender** (they have used Blender MCP before, from Unity work).
   - **Godot MCP:** start with `Coding-Solo/godot-mcp` (`npx @coding-solo/godot-mcp`, set `GODOT_PATH` if
     needed); it runs projects, reads errors, and creates scenes and nodes. Others exist (GDAI MCP, bradypp,
     plugin-based ones); switch only if this one falls short.
   - **Blender MCP**, the one they used before.
   - Add both MCP servers to Claude Code and confirm Claude can call them.
2. Build a tiny scene: **Grandpa's attic** from the prologue.
   - Model it in Blender through the MCP: a wooden attic with a sloped roof, a desk with an old beige 1987
     computer (monitor and keyboard), a cardboard box on the floor, a small round window, a hanging bulb.
   - Export it as glTF into the Godot project.
   - Use CC0 assets where they help: **Kenney** (kenney.nl: furniture kit, characters) and **Quaternius**
     (quaternius.com: animated low-poly characters). They need no credit. Check each pack's license file anyway.
3. In Godot:
   - The pixel look: render through a low-resolution SubViewport, scaled up with no filtering.
   - A fixed camera.
   - An animated low-poly boy (red hoodie, jeans) who walks on a baked NavigationRegion3D where you click.
4. Interaction:
   - Clicking the computer makes him walk to the floor in front of the desk, turn to it, and show one line
     of English text ("It is Grandpa's old computer. It is from 1987.").
   - Clicking the desk top or a wall never puts him on it.
5. Take screenshots (and if possible a short video) and show the parent. Wait for their go-ahead before
   step 1.

### Step 1 onward (after the parent approves the proof of concept)

1. **Client architecture in Godot.**
   - **Episodes:** keep the episode JSON idea (scenes, objects, rules, goals, effects) and port the rule
     engine (`js/episode.js`) to GDScript, or keep it identical by testing both against the same episodes.
   - **Verb UI and typing:** the verb bar, typed commands and the sentence line.
   - **English text:** in a RichTextLabel with clickable words (meta tags) showing Hebrew.
   - **Hebrew:** set the text direction to right-to-left where needed (Godot 4 supports BiDi).
   - **Voices:** from `/api/voice` (mp3 via AudioStreamMP3), with word highlighting from the word times,
     and a fallback when a line isn't ready.
   - **Effects and the rest of the UI:** the effects (shake, glitch, the old-computer boot, typing his name,
     being pulled into the screen), music, the word book, and the challenge UI.
2. **Rooms catalog.** Instead of AI picture prompts, an episode picks rooms and props from a catalog:
   - Rooms: attic, longhouse, village, forest, cave, bridge, and so on.
   - Props: each has a model, where to stand to use it, and its clickable shape.
   - Rooms are built once (Blender + CC0 kits); new episodes reuse and dress them.
   - Update the episode writer's schema and rules (`server/writer.js`) and the checker (`server/validate.js`)
     to use the catalog.
   - The robot solver stays.
3. **Content updates without reinstalling.**
   - The game asks the server for today's episode (`/api/play`).
   - New rooms or models ship as Godot resource packs (`.pck`) that the game downloads and loads at start.
   - Optionally, a tiny launcher updates the EXE itself.
4. **The Discord flow is unchanged:** finish the episode → `POST /api/episode-done` → the challenge →
   Discord opens.
5. **Keep the web game working** until the Godot game replaces it on his PC.
6. **The Stable Diffusion art worker** is no longer needed for backgrounds. It may still make illustrations,
   for example a title card per episode. Ask the parent before removing anything.

## Checks before you push

- `npm test` (server tests) and `node tools/check-words.js` (every built-in episode is solvable and every
  word has Hebrew).
- Run the thing you changed (the game, the server, the scene) and look at it. Screenshots help the parent.
