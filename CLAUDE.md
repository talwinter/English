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

## Current state (at the move to the parent's PC)

- **Art worker:** the Stable Diffusion art worker was removed from the PC (`worker/uninstall.bat`).
- **Server settings** in `.env`:
  - `WAKE_TIME=` is empty, so the router no longer wakes the PC.
  - `AUTO_WRITE=false`, so no new episodes are written: they would wait forever for AI pictures.
- **The game:**
  - The web game keeps running with the built-in episodes. Episode 1 shows its old drawings.
  - On days with no new episode, the mission is the word challenge, and the Discord lock works as usual.
- **Building episodes:** episodes stay fully automatic. OpenAI still writes the story, puzzles and English,
  and the parent only tries and approves. What changes is how rooms are made: from a catalog of 3D objects
  instead of AI pictures (step 2 of the plan below). The parent designs the mechanism once, not each episode.
  Turn writing back on (`AUTO_WRITE`) only when the Godot game can play its episodes.
- **Daily lock:** `LOCK_ENABLED=false` in the server's `.env` turns the 08:00 Discord lock off until the Godot
  game is tested (the parent page's "Lock now" still works). Set it back to `true` (or remove it) to resume.

## Deployed on the real server (2026-10-12)

- The Docker server (`~/docker/english-quest`, ssh `tal@192.168.2.47`) runs commit `bea42bd`: the 3D writer, the
  catalog, `/updates/*`, the start-screen mission rules, `WRITE_TIME=04:00` (in its `.env`).
- Its `.env` is unchanged otherwise: `LOCK_ENABLED=false`, `AUTO_WRITE=false`, `AUTO_PUBLISH=false`,
  `EPISODES_AHEAD=2`. Nothing writes or locks by itself yet. Backups of `.env` and `data/state.json` are next to them.
- Episode 3 ("The Frozen Lake", made on the dev PC) waits there as a draft for approval; the content pack
  `20261012-0035-55edc647` is in `data/updates/`.
- The 04:30 check on the dev PC (`EnglishQuest-MorningCheck`) is created but **disabled** until the server flow
  is switched on: `Enable-ScheduledTask -TaskName EnglishQuest-MorningCheck`, and set `CHECK_SERVER` and
  `SERVER_ADMIN_PASSWORD` in the dev PC's `.env`.
- To switch the daily flow on: in the server's `.env` set `AUTO_WRITE=true` (and `LOCK_ENABLED=true` when the Godot
  game is on his PC), then `docker compose up -d`.

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

## The plan: a Godot game in stylized low-poly 3D

The parent chose this direction (updated after the proof of concept; the first idea, a 320x180 pixel look,
was judged too retro for a kid who plays Fortnite and Roblox):
- Every room is real low-poly 3D at **full resolution**, in a modern stylized look: soft light and shadows,
  ambient occlusion, bloom on lights and screens, warm filmic colors, rounded (beveled) models, dust in the
  light. The pixel look stays available as an option (`-- --pixel` renders 480x270 with no filtering).
- Each room has a fixed camera angle, like King's Quest framing but with real depth.
- The walkable area is a navigation mesh baked from the room itself, so the hero can never stand on a desk
  or a wall, and clicks hit real objects (raycasts).
- The game is a Windows EXE that downloads new episodes from the existing server, so it never needs
  reinstalling for new content.

### Step 0: proof of concept (BUILT; waiting for the parent's go-ahead for step 1)

Status: done and working in `godot/`. Grandpa's attic and the hero are modeled in Blender (by Python scripts in
`godot/blender/`, run through the Blender MCP), exported to `godot/assets/*.glb`, and played in Godot 4.7.2.
- Run it: `Godot_v4.7.2-stable_win64.exe --path godot` (Godot is in
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe\`).
  After changing a `.glb`: `Godot_..._console.exe --headless --path godot --import`.
- Scripted check with screenshots in `godot/shots/`: add `-- --demo` (the output prints `PROOF:` and `REACH`
  lines; 16,800 simulated clicks must end with 0 destinations on furniture). `-- --still` takes one picture.
- Rebuild the models: in Blender, `exec(open(r"...\godotlenderttic.py").read())` and `boy.py`
  (`lib.py` has the mesh helpers). Models are made from code, flat colors, Bevel modifiers for rounded edges.
- **The catalog contract (names in the glTF that `godot/main.gd` reads; step 1 will formalise it):**
  `nav_floor` (walkable floor, the navmesh is baked from it), `block_<Id>` (furniture footprint carved out of
  the navmesh), `pick_<Id>` (clickable volume), `stand_<Id>` (empty: where the hero stands to use it),
  `spawn_Hero`, `light_bulb`. Everything else is scenery.
- Navigation: a `NavigationRegion3D` baked at runtime from `nav_floor` plus `NavigationObstacle3D` footprints.
  A click that hits a `pick_` goes to its `stand_` point; any other click is projected on the floor plane and
  snapped to the closest navmesh point, so a wall or a desk top never becomes a destination.
- The Godot MCP (`@coding-solo/godot-mcp`) is added to Claude Code in local scope (`claude mcp get godot`);
  its tools load in a new session. Everything above also works from the command line.
- Known gaps: the hero is procedural (no Kenney/Quaternius download was needed yet); baking parses render
  meshes at runtime (a warning), later it should use the layout JSON; no sound yet.

**Step 1 progress (the prologue is fully playable, `godot/scripts/`):**
- `engine.gd`: the rule engine ported from `js/episode.js` + `js/game.js` (rules, conditions, effects, points,
  goals, hints, typed commands). Test: `Godot --headless --path godot --script res://scripts/test_engine.gd`.
- `game.gd` (orchestrator), `room.gd` (the catalog contract), `actor.gd` (hero/Byte walking), `hud.gd`
  (verbs, bag, goal, clickable words with Hebrew, typed commands, story mode), `terminal.gd` (the CRT screen as
  a viewport), `fx_layer.gd` (glitch, flash, fade, title card), `sfx.gd` (sounds, music with ducking under
  voices), `voice.gd` (server voices at /api/voice, else the computer's own text-to-speech at once).
- Effects library an episode can ask for (`fx`): shake, flash, glitch, crt, boot, askname, pullin. The prologue
  uses crt (screen turns on), boot (camera zooms into the full-screen terminal), glitch, askname (he types his
  name on the old screen), pullin (vortex, he is lifted, stretched and sucked in), then `_ending` drops him
  into `cold_world.glb` where Byte flies in.
- Assets: `attic.glb`, `boy.glb` (rigged, Idle with blinking, Walk), `byte.glb` (wings flap in code),
  `cold_world.glb`; sounds are synthesized by `godot/tools/make_sounds.py` into `godot/audio/`.
- Data: `node tools/export-episodes.js` writes `godot/episodes/*.json` (the same data the server sends);
  `-- --server=http://HOST:8080` plays from the server and calls /api/episode-done at the end.
- Run the robot with video: `Godot --path godot --write-movie shots/x.avi --fixed-fps 30 -- --autoplay`.
- **Learning UX (the priority of the whole game, the parent said so): `word_ui.gd` + `word_store.gd`.** Click any
  English word: a card with the word, Hebrew, Hear / Slow and the sentence. Words he has not mastered are gold
  in every text, "learning" words are pale, mastered words are white, so the text itself shows progress. The Word
  Book collects every word he met (filters new / learning / mastered) and has Practice: hear a word, choose the
  Hebrew; right answers move a word up the boxes, wrong ones send it back. Translation is always free.
  Test: `Godot --headless --path godot --script res://scripts/test_words.gd`; visual demo: `-- --words-demo --shots`.
  State is in `user://words.json` (not yet synced to the server's challenge).
- The HUD (`hud.gd`) and the bag (five fixed slots, pictures rendered from the real 3D models by
  `item_icons.gd`) must look the same in every episode and mode.
- **Round 3 (all in `godot/scripts/`, tested):** `settings.gd` + `settings_ui.gd` (volumes, text size, full
  screen, quality, "Something wrong?" report box), `coach.gd` (first-time tips with a gold frame, from
  `base.ui.tips`), `save_game.gd` (resume exactly, saved after every action), `server_api.gd` + `mission_ui.gd`
  (episode done, progress sync, the daily challenge, "Discord is open!"), Byte follows him in every room,
  idle hints, word-by-word highlight while a line is spoken, more music and ambience (`make_sounds.py`).
- **Rooms from the catalog (episode 1 plays in 3D):** `catalog/` (props, shells, `overrides.json` for hand
  tuning, built by `node tools/build-catalog.js`), `server/layout.js` (places props: no overlaps, stand points,
  reachability; plain Node, runs on the server), `server/episode3d.js`, `tools/hints/<id>.json` (3D hints for
  old 2D episodes), `Room.add_props()` in Godot, scene changes with entries, opening doors and lids,
  characters with Idle (grandmother, wolf), `previously` recap, `endingStyle` ("fall" or "lines").
  Robot for any episode: `-- --episode=s1e1 --autoplay --shots --no-server` (plays the solver's solution).
- **Config:** `godot/config.json` {"server": "...", "report": true} (git-ignored). `report` makes this PC tell the
  server (episode done, name, progress); tests and robots never do. Test runs use `user://test_*.json`.
- **Server additions:** `/api/profile` (name), `/api/progress` (word knowledge, weak words go to the challenge and
  to the writer's prompt), `/api/report` (problem reports, listed on the parent page), one new episode per day.
- **Round 4:** episode 2 in 3D (catalog batch 2 in `godot/blender/batch2.py`: forest glade, cave, bear, father,
  fallen tree, berry bush, cave mouth, berries; hints in `tools/hints/s1e2.json`); the server serves built-in
  episodes laid out in 3D (`withRooms3d` in `server/content.js`); `tools/build-episode.js` runs the writer
  pipeline with a self-refreshing progress page (`--replay <file>` needs no OpenAI key); wishes list on the
  parent page; `tools/make-package.ps1` makes `dist/EnglishQuest.zip` for the son's PC; `docs/DEPLOY.md` is the
  go-live checklist.
- **Round 5 (auto-update):** `godot/scripts/launcher.gd` is the first scene; it downloads the content pack from
  `/updates/manifest.json` (made by `tools/make-update.ps1`, uploaded by `tools/push-update.js`), loads it with
  `ProjectSettings.load_resource_pack`, remembers a version that did not start (`update_state.gd`). New scripts in
  an update must be reached with `preload`, not `class_name`. `tools/push-episode.js` moves an episode from the dev
  server to the real one. The HUD is docked (`UiKit`), the game picture sits between the bars.
- Not done yet: the live OpenAI run of the 3D episode builder with its progress page (writer schema for props,
  `wishes`, continuity check), syncing word progress to the server, `.pck` content updates, typed-command voice
  lines, more scenes/props (the catalog), the layout builder and reachability check on the server.

Original checklist, kept for reference:

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
2. **Rooms built automatically from a catalog.** No human builds episodes:
   - **OpenAI writes the whole episode**, as today: story, puzzles, English, dictionary.
   - **Rooms come from a catalog.** For each room it picks a room shell from the catalog (attic, longhouse,
     village, forest, cave, bridge, ...) and the props, with placement hints. For example: "desk against the
     back wall; old computer on the desk; box on the floor, left".
   - **The catalog** is many CC0 models (Kenney, Quaternius), plus models Claude makes in Blender via MCP for
     things the story needs (the 1987 computer). Each prop has its model, its footprint, where it can stand
     (floor, wall, on another prop), where to stand to use it, and its clickable shape. Rooms are built once
     and reused.
   - **A layout builder places the props** from the hints. It runs **on the Docker server**, in plain
     Node, like the robot solver: no Godot, no Blender, and the parent's PC does not need to be on.
     - It works on a top-down floor plan of the room (a grid), using each prop's footprint from the catalog.
     - It keeps props from overlapping, and stores their final positions in the episode.
     - The Godot game only loads the models at those positions, and bakes its navigation mesh at runtime.
     - Blender (and Claude on the PC) is needed only when the catalog itself grows.
     - Godot also runs headless on Linux (no GPU), so it could go in a container for a stronger check
       later, if the grid check isn't enough.
   - **Two checks before the parent sees the episode:**
     - the robot solver (as today): the episode can be finished
     - a new reachability check: every prop he must use can be reached on the floor plan's walkable cells

     Failures go back to OpenAI in the repair loop, as today.
   - **Props missing from the catalog:** the writer uses the closest prop and adds the missing one to a wish
     list on the parent page; Claude models those later. Maybe later: generate 3D models on the PC's RTX 3060
     with a free local image-to-3D model.
   - **Server changes:** update the episode writer's schema and rules (`server/writer.js`) and the checker
     (`server/validate.js`) to the catalog. The parent page stays "try it, then approve".
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
