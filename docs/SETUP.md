# Setup guide: step by step

Do the parts in this order. Each part says **where** you do it.

| Where | What it does |
|---|---|
| **MikroTik router** | Blocks Discord on your son's devices, and wakes the art PC at night |
| **Docker server** | Runs everything: the game, the Discord lock, the episode writer, the picture queue |
| **Art PC** (RTX 3060, `192.168.1.105`) | Makes the pictures with Stable Diffusion, then shuts down |
| **Your son's computer** | Just a browser: `http://SERVER:8080` |

In this guide, `SERVER` is your Docker server's IP address, and the router is `192.168.1.1`.
If your router has a different address, use that instead.

---

## Part 1: MikroTik router

Open **Winbox** and connect to the router.

### 1.1 Fixed IP addresses

Go to **IP > DHCP Server > Leases**. For each of these devices, double-click it and press **Make Static**:

- your son's computer (and his phone, if you want Discord locked there too),
- the art PC (`192.168.1.105`, MAC `E8:9C:25:0E:5B:90`).

Write down your son's devices' IP addresses.

### 1.2 Paste the English Quest setup

1. Open `router/discord-lock.rsc` from the project in a text editor and change:
   - **step 1**: your son's devices' IP addresses (one line per device; delete lines you don't need),
   - **step 4**: the password, to any long random text (nothing uses it, it's only so the user isn't empty).
   - The art PC's MAC (`E8:9C:25:0E:5B:90`) is already in the `eq-wake` script.
2. In Winbox open **New Terminal** and paste the whole file.
3. Check: **IP > Firewall > Filter Rules** should show 5 rules at the top with comments starting with
   `english-quest`, all **disabled** (grey). That's correct: the server turns them on.
   In **Address Lists**, each name in `eq-discord` should get dynamic IP entries under it within a minute.
4. Check that SSH is on: **IP > Services**, `ssh` must be enabled (it is by default).

> If you get an error about `interface=bridge`, your LAN has a different name. Run `/interface bridge print`,
> and in **System > Scripts > eq-wake** change `bridge` to that name.
>
> If you get an error about `place-before=0`, remove `place-before=0` from the 4 firewall lines and paste again.
>
> If the Docker server is on another network (for example an IoT VLAN) and your router blocks it, add an input
> rule that allows **only the Docker server's IP to port 22**, above the blocking rule. Don't start its comment
> with `english-quest`: the lock scripts switch those rules on and off.

You come back to the router once more in Part 2.3, to add the server's key.

---

## Part 2: Docker server

### 2.1 Get the project

```sh
git clone -b claude/optimistic-einstein-1j01oc https://github.com/talwinter/English.git english-quest
cd english-quest
```

(Or download the ZIP of the `claude/optimistic-einstein-1j01oc` branch from GitHub, unzip it, and `cd` into it.)

### 2.2 Settings

```sh
cp .env.example .env
nano .env
```

Fill in:

| Setting | What to put |
|---|---|
| `ADMIN_PASSWORD` | A password for the parent page |
| `WORKER_TOKEN` | Another password, for the art PC (you type it again in Part 4) |
| `ROUTER_HOST` | The router: `192.168.1.1` |
| `LOCK_TIME` / `LOCK_DAYS` | When Discord locks (default every day at 08:00) |
| `WAKE_TIME` | When to wake the art PC if pictures are waiting (default `05:00`) |
| `OPENAI_API_KEY` | Your OpenAI key (Part 3). You can leave it empty for now |

### 2.3 The key the server uses to talk to the router

```sh
mkdir -p data/ssh
ssh-keygen -t ed25519 -N "" -f data/ssh/id_ed25519 -C english-quest
scp data/ssh/id_ed25519.pub admin@192.168.1.1:/
```

(Use your router's admin user name if it's not `admin`.) Then in the **router terminal** (Winbox > New Terminal):

```
/user ssh-keys import public-key-file=id_ed25519.pub user=eq-lock
```

> If the import fails (older RouterOS), make an RSA key instead:
> `ssh-keygen -t rsa -b 4096 -N "" -f data/ssh/id_rsa`, copy and import `id_rsa.pub`, and add
> `ROUTER_SSH_KEY=/data/ssh/id_rsa` to `.env`.

### 2.4 Start it

```sh
docker compose up -d --build
docker compose logs -f
```

You should see `Server started on port 8080`. Press Ctrl+C to stop watching the log (the server keeps running).

### 2.5 Test the Discord lock

1. Open the parent page: `http://SERVER:8080/admin` (any user name, your `ADMIN_PASSWORD`).
2. Click **בדיקת חיבור לראוטר** (router test). It should show ✅ and the router's name.
3. Click **🔒 נעל עכשיו** (lock now). On your son's computer, `discord.com` and the Discord app should stop working.
4. Click **🔓 פתח להיום** (unlock for today). Discord works again.

### 2.6 Voices and music

`docker compose up -d --build` also starts **Kokoro**, which gives the game human-sounding voices (a different
voice for each character). The first start downloads it (2–3 GB) and then makes the voices of the existing
episodes for about half an hour. Nothing to set up. To use your own music, see [SOUND.md](SOUND.md).

---

## Part 3: The OpenAI key (for new episodes)

1. Go to <https://platform.openai.com> and sign in (or sign up).
2. **Settings > Billing**: add a little credit (for example $5). It should last a long time; see the cost
   notes in `docs/EPISODES.md`.
3. **API keys > Create new secret key**. Copy the key (it starts with `sk-`). You only see it once.
4. On the Docker server, put it in `.env`:

   ```
   OPENAI_API_KEY=sk-...
   ```

5. Restart: `docker compose up -d`

The parent page, under **פרקים** (episodes), now shows the next episode number and a
**✍️ כתוב את הפרק הבא עכשיו** (write the next episode now) button. Press it to try the writer right away.

---

## Part 4: The art PC (RTX 3060, 192.168.1.105)

### 4.1 Wake-on-LAN

So the server can turn the PC on at 05:00:

1. **BIOS:** turn on *Wake on LAN* (it may be called *Power On By PCI-E*, *Resume by LAN*, or similar).
   If there is *ErP*, turn it off.
2. **Windows:** Device Manager > Network adapters > your network card > Properties:
   - **Power Management:** tick *Allow this device to wake the computer* and *Only allow a magic packet to wake the computer*.
   - **Advanced:** *Wake on Magic Packet* = Enabled.
3. **Turn off Fast Startup:** Control Panel > Power Options > *Choose what the power buttons do* >
   *Change settings that are currently unavailable* > untick *Turn on fast startup*.
4. The PC must be connected **with a network cable** (Wi-Fi can't wake a PC).

### 4.2 Stable Diffusion

In **Stability Matrix**: Packages > Add Package > **ComfyUI**, and make sure you have an **SDXL model**.
An optional pixel-art LoRA for SDXL makes the pictures look even more like the old games.

### 4.3 Install the worker

1. Get the project on the PC (download the ZIP of the `claude/optimistic-einstein-1j01oc` branch and unzip it).
2. Open the `worker` folder and double-click **`install.bat`**.
3. Answer the questions:
   - choose the model (and the LoRA, if you have one),
   - server address: `http://SERVER:8080`,
   - worker token: the `WORKER_TOKEN` from `.env`.
4. It makes a **test picture** and opens it.
5. **Run before login? Yes.** Approve the Windows admin prompt.

### 4.4 Test the wake-up

1. Shut the PC down.
2. On the parent page, under **תמונות** (pictures), click **⏰ הער את מחשב התמונות** (wake the art PC).
3. The PC should turn on. If pictures are waiting, it makes them, and then shuts down by itself
   (only if nobody logged in).

---

## Part 5: Your son's computer

Make a desktop shortcut to `http://SERVER:8080` and give him headphones. That's all.

---

## What happens every day, by itself

| Time | What happens |
|---|---|
| Any time | When fewer than 2 new episodes are ready, the server writes one with OpenAI, checks it, and queues its pictures |
| 05:00 | If pictures are waiting, the router wakes the art PC. It makes them and shuts down |
| When you have a minute | On the parent page you try the new episode and approve it (the pictures are used by themselves) |
| 08:00 | Discord locks on his devices |
| After school | He plays today's episode (or the word challenge on days with no new episode), passes the challenge, and Discord opens until tomorrow |

## If something doesn't work

- **The parent page log** (at the bottom of `http://SERVER:8080/admin`) shows everything the server did,
  including router and OpenAI errors.
- **Server log:** `docker compose logs --tail 100`
- **Art PC log:** `%LOCALAPPDATA%\EnglishQuestWorker\worker.log` (and `comfyui.log` next to it)
- **Router log:** Winbox > Log; English Quest lines start with `english-quest`.

More detail: [DISCORD-LOCK.md](DISCORD-LOCK.md), [EPISODES.md](EPISODES.md), [ART-WORKER.md](ART-WORKER.md),
[SOUND.md](SOUND.md).
