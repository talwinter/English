# The art worker (your PC with the RTX 3060)

The pictures are made for free on your graphics card. You install it once, and then it runs by itself:

- It **starts with Windows**, hidden, with no window.
- Every 2 minutes it asks the English Quest server whether there are pictures to make.
- It only works when **nobody has used the PC for 5 minutes**, so games and work aren't slowed down.
- When there is work it **starts ComfyUI by itself** (from your Stability Matrix folder), makes 3 versions of
  each picture, turns them into pixel art, sends them to the server, and **closes ComfyUI** to free the
  graphics card.

The PC doesn't need to be on all the time. The server keeps the jobs until the PC is on and free.

## Before you start

1. **ComfyUI in Stability Matrix.** If you use a different package (Automatic1111, Forge), also add ComfyUI:
   Stability Matrix > **Packages** > **Add Package** > **ComfyUI**. You don't need to open it after that.
2. **An SDXL model.** Any good SDXL model works; the pixel conversion fixes the style.
3. **Optional: a pixel-art LoRA for SDXL** (search "pixel art XL" in the Stability Matrix Model Browser).
   It makes the pictures look more like the old games.
4. **The worker password.** Set `WORKER_TOKEN` in `docker-compose.yml` on the server to any long text, and
   restart the server (`docker compose up -d`).

## Install (one time)

1. Download the project ZIP from GitHub and extract it.
2. Open the `worker` folder and double-click **`install.bat`**.
3. Answer the questions:
   - it finds ComfyUI by itself (or asks you to choose its folder),
   - choose the model and, if you have one, the LoRA,
   - type the server address (for example `http://192.168.88.10:8080`) and the `WORKER_TOKEN`.
4. It makes **one test picture** and opens it. If you see a picture, everything works.

## Using it

1. On the parent page (`http://SERVER:8080/admin`), in **תמונות** (pictures), click **🎨 צור את התמונות החסרות**
   (make the missing pictures).
2. When the PC is free, the worker makes them. On a 3060 each SDXL picture takes about half a minute, so the
   first set (11 pictures × 3 versions) takes about 15–20 minutes.
3. Back on the parent page, **click the version you like best** for each picture. Click **צור מחדש** (make again)
   for new versions.

Later, new episodes add their pictures to the queue automatically.

## If something doesn't work

- The log is in `%LOCALAPPDATA%\EnglishQuestWorker\worker.log`, and ComfyUI's log is next to it in `comfyui.log`.
- The parent page shows when the worker last connected.
- Settings are in `%LOCALAPPDATA%\EnglishQuestWorker\config.json`: model, LoRA, steps, colors,
  `idle_minutes` (set it to 0 to work even while the PC is in use).
- To remove it: double-click `worker\uninstall.bat`.
