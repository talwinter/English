# Setting up the Discord lock

How it works:

1. Every day at **08:00** the server tells the MikroTik router to block Discord on **your son's devices only**.
2. He plays today's episode at `http://SERVER:8080` and passes the **Word Challenge**.
3. The server tells the router to open Discord again, until tomorrow at 08:00.

The server runs in Docker. It talks to the router over SSH with its own router user, which can only run
two small scripts: `eq-block` and `eq-unblock`.

## Step 1: The router (RouterOS 7)

1. Give each of his devices a **static IP**: *IP > DHCP Server > Leases*, double-click the device,
   then **Make Static**.
2. Open `router/discord-lock.rsc` and change:
   - the IP addresses in step 1 (one line per device),
   - the password in step 4 (any long random text; the server doesn't use it).
3. Paste the whole file into the router terminal (Winbox > **New Terminal**).

Nothing is blocked yet: the rules are added **disabled**. Check *IP > Firewall > Filter Rules*: you should see 5
rules at the top with comments starting `english-quest`.

> If you get an error on `place-before=0`, your forward chain has no rules yet. Remove `place-before=0`
> from those 4 lines and paste again.

## Step 2: The server key

On the Docker server, inside the project folder:

```sh
mkdir -p data/ssh
ssh-keygen -t ed25519 -N "" -f data/ssh/id_ed25519 -C english-quest
```

Copy `data/ssh/id_ed25519.pub` to the router (drag it into Winbox > **Files**), then in the router terminal:

```
/user ssh-keys import public-key-file=id_ed25519.pub user=eq-lock
```

> If the import fails on an older RouterOS, make an RSA key instead:
> `ssh-keygen -t rsa -b 4096 -N "" -f data/ssh/id_rsa`, import `id_rsa.pub`, and add
> `ROUTER_SSH_KEY=/data/ssh/id_rsa` to `.env`.

## Step 3: Start the server

Copy `.env.example` to `.env` and fill it in:

- `ADMIN_PASSWORD`: your password for the parent page.
- `ROUTER_HOST`: your router's IP.
- `LOCK_TIME` and `LOCK_DAYS` if you want something else (for example no lock on Saturday:
  `LOCK_DAYS=0,1,2,3,4,5`).

Then:

```sh
docker compose up -d --build
```

## Step 4: Test it

1. Open the parent page at `http://SERVER:8080/admin` (any user name, your `ADMIN_PASSWORD` from `.env`).
2. Click **בדיקת חיבור לראוטר** (test router connection). It should show ✅ and the router's name.
3. Click **🔒 נעל עכשיו** (lock now). On his computer, `discord.com` and the Discord app should stop working.
4. Click **🔓 פתח להיום** (unlock for today). Discord works again.

Then make a shortcut on his desktop to `http://SERVER:8080`. That's the game.

## The parent page

- See whether Discord is locked, today's mission, his streak, and the last 3 weeks.
- **🔓 Unlock for today**: for special days.
- **🔒 Lock now**: stays locked until he completes a mission.
- **Router test** and a log of everything that happened.

## Updating

```sh
git pull
docker compose up -d --build
```

His progress is kept in `data/state.json`.

## What it can't stop (honestly)

This blocks Discord on your home network, on the devices you listed. It can't block:

- his phone on **mobile data**, or a hotspot from a friend's phone,
- a **VPN**,
- a device that isn't on the list.

For a 15-year-old, the lock works best as a deal he knows about ("15 minutes of English, then Discord"),
not as a trap. The game is built so that deal feels short and fun.

## How the block works (technical)

While locked, on his devices only:

- all traffic to Discord's servers is rejected. The router looks up Discord's names (list `eq-discord`) and
  keeps their IP addresses up to date by itself. This also cuts connections that are already open,
- new TLS connections to any name containing `discord` are rejected as an extra check (this reads the TLS
  name; modern browsers often split it over two packets, so it can't be the only rule),
- QUIC (UDP 443) is rejected, so his browser falls back to TLS, which the rule above can check (other
  sites keep working),
- his connections skip FastTrack, so every new connection is checked,
- when the lock starts, his open connections are cut once, so a running Discord session drops.

The server re-applies the current state every 10 minutes, so a router reboot fixes itself.
