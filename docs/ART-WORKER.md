# The art worker (your PC with the RTX 3060)

The pictures are made for free on your graphics card. You install it once, and then it runs by itself:

- It **starts with the PC**, even at the login screen before anyone logs in (if you say yes in the
  installer and approve the admin prompt once). It also starts when you log in. It's hidden, with no window.
- Every 2 minutes it asks the English Quest server whether there are pictures to make.
- It only works when **nobody has used the PC for 5 minutes** and **the graphics card isn't busy** (for
  example a game), so games and work aren't slowed down. Before login only the graphics card check works,
  because Windows hides the mouse and keyboard from background tasks.
- While it makes pictures, it keeps the PC from going to sleep. When it's done, normal sleep rules apply.
- When there is work it **starts ComfyUI by itself** (from your Stability Matrix folder), makes each picture,
  turns it into pixel art, sends them to the server, and **closes ComfyUI** to free the
  graphics card.

The PC doesn't need to be on all the time. The server keeps the jobs until the PC is on and free.

> **Sleep:** if Windows sleeps after a few minutes at the login screen, the worker may not get its chance.
> In *Settings > System > Power*, set sleep to **Never** or **1–2 hours** when plugged in.

## Before you start

1. **ComfyUI in Stability Matrix.** If you use a different package (Automatic1111, Forge), also add ComfyUI:
   Stability Matrix > **Packages** > **Add Package** > **ComfyUI**. You don't need to open it after that.
2. **An SDXL model.** Any good SDXL model works; the pixel conversion fixes the style.
3. **Optional: a pixel-art LoRA for SDXL** (search "pixel art XL" in the Stability Matrix Model Browser).
   It makes the pictures look more like the old games.
4. **The worker password.** Set `WORKER_TOKEN` in `.env` on the server to any long text, and
   restart the server (`docker compose up -d`).

## Install (one time)

1. Download the project ZIP from GitHub and extract it.
2. Open the `worker` folder and double-click **`install.bat`**.
3. Answer the questions:
   - it finds ComfyUI by itself (or asks you to choose its folder),
   - choose the model and, if you have one, the LoRA,
   - type the server address (for example `http://192.168.88.10:8080`) and the `WORKER_TOKEN`.
4. It makes **one test picture** and opens it. If you see a picture, everything works.
5. It asks whether to also run **before login**. Say yes and approve the Windows admin prompt.

## Using it

1. The pictures the episodes need are **queued automatically** (for Episode 2 and every new episode).
   You don't need to press anything.
2. When the PC is free, the worker makes them. On a 3060 each SDXL picture takes about half a minute, so one
   episode (about 6 pictures × 3 versions) takes about 10 minutes.
3. The server uses each picture by itself (`AUTO_CHOOSE_ART=true` in `.env`, the default). If a picture came out
   badly, click **צור מחדש** (make again) on the parent page, under **תמונות** (pictures). With
   `AUTO_CHOOSE_ART=false` the PC makes 3 versions of each picture and you click the one you like.
4. When all pictures of an episode are ready, it becomes his mission.

The button **🎨 צור את התמונות החסרות** (make the missing pictures) also makes the optional pictures in
`art/shots.json`, for example new versions of Episode 1's places.

## If something doesn't work

- The log is in `%LOCALAPPDATA%\EnglishQuestWorker\worker.log`, and ComfyUI's log is next to it in `comfyui.log`.
- The parent page shows when the worker last connected.
- Settings are in `%LOCALAPPDATA%\EnglishQuestWorker\config.json`: model, LoRA, steps, colors,
  `idle_minutes` (set it to 0 to work even while the PC is in use), `gpu_busy_percent` (0 = don't check the
  graphics card).
- After changing `config.json`, or to install a newer worker from a new ZIP: double-click `worker\restart.bat`
  (in the new ZIP's folder) and approve the admin prompt. It copies the new worker in and restarts it.
- To remove it: double-click `worker\uninstall.bat` and approve the admin prompt.

## Wake-on-LAN (the PC turns on by itself)

If `WAKE_TIME` is set in `.env` (default `05:00`) and pictures are waiting, the server asks the router to wake
the PC at that time. The worker starts at the login screen, makes the pictures, and then **shuts the PC down**,
but only when the server woke it and nobody is logged in. To never shut down, set `"shutdown_after_wake": false`
in `config.json`. Setup steps (BIOS, network card, Fast Startup) are in [SETUP.md](SETUP.md), Part 4.1.
