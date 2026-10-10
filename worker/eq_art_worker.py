"""English Quest art worker.

Runs quietly on the PC with the GPU. Every few minutes it asks the English Quest server for picture
jobs. When there is work and nobody is using the PC, it starts ComfyUI (from Stability Matrix),
makes the pictures, turns them into pixel art, sends them to the server, and closes ComfyUI again
to free the graphics card.

Uses only Python's standard library plus Pillow, which ComfyUI already has.

    python eq_art_worker.py          run forever (started by Windows at login)
    python eq_art_worker.py --once   do the waiting jobs now, then exit
    python eq_art_worker.py --test   make one test picture (test.png, test-pixel.png), no server
"""

import base64
import io
import json
import logging
import logging.handlers
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULTS = {
    "server": "",               # English Quest server, e.g. http://192.168.88.10:8080
    "token": "",                # WORKER_TOKEN from docker-compose.yml
    "comfy_dir": "",            # ComfyUI folder (Stability Matrix: Data/Packages/ComfyUI)
    "comfy_url": "http://127.0.0.1:8188",
    "checkpoint": "",           # model file name; empty = pick an SDXL model automatically
    "lora": "",                 # optional LoRA file name (for example a pixel-art LoRA)
    "lora_strength": 0.8,
    "model": "sdxl",            # "sdxl" or "sd15"
    "steps": 28,
    "cfg": 6.5,
    "sampler": "dpmpp_2m",
    "scheduler": "karras",
    "colors": 32,
    "idle_minutes": 5,          # only use the GPU when the PC was not used for this long
    "gpu_busy_percent": 25,     # ...and when the graphics card is not busy (a game); 0 = don't check
    "shutdown_after_wake": True,  # shut down when done, if the server woke the PC and nobody logged in
    "poll_seconds": 120,
}
SIZES = {
    "sdxl": {"background": (1216, 768), "sprite": (1024, 1024)},
    "sd15": {"background": (768, 480), "sprite": (512, 512)},
}

log = logging.getLogger("eq-worker")


def load_config():
    cfg = dict(DEFAULTS)
    path = os.path.join(HERE, "config.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8-sig") as f:  # PowerShell may write a BOM
            cfg.update(json.load(f))
    return cfg


def setup_logging():
    handler = logging.handlers.RotatingFileHandler(os.path.join(HERE, "worker.log"), maxBytes=1_000_000, backupCount=2)
    handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    log.addHandler(handler)
    if sys.stdout and sys.stdout.isatty():
        log.addHandler(logging.StreamHandler())
    log.setLevel(logging.INFO)


def idle_seconds():
    """Seconds since the last mouse or keyboard input (Windows). Elsewhere: always idle."""
    if os.name != "nt":
        return 10 ** 9
    import ctypes

    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

    info = LASTINPUTINFO()
    info.cbSize = ctypes.sizeof(info)
    ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info))
    return (ctypes.windll.kernel32.GetTickCount() - info.dwTime) / 1000.0


def gpu_busy(cfg):
    """True if something (a game) is using the graphics card. Needed at the login screen and when the
    worker runs as a Windows service, where mouse and keyboard can't be seen."""
    limit = cfg["gpu_busy_percent"]
    if not limit:
        return False
    samples = []
    for _ in range(3):
        try:
            out = subprocess.run(["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
                                 capture_output=True, text=True, timeout=10,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
            samples.append(max(int(x) for x in out.split() if x.strip().isdigit()))
        except (OSError, ValueError, subprocess.SubprocessError):
            return False  # no nvidia-smi: can't tell, so don't block
        time.sleep(1)
    return sum(samples) / len(samples) >= limit


def someone_logged_in():
    """True if a person is logged in on Windows (the desktop, explorer.exe, is running)."""
    if os.name != "nt":
        return True  # never shut down anything but Windows
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq explorer.exe", "/NH"], capture_output=True, text=True,
                             timeout=20, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        return "explorer.exe" in out.lower()
    except (OSError, subprocess.SubprocessError):
        return True  # not sure: don't shut down


def shut_down():
    log.info("Pictures done and nobody is logged in: shutting down in 2 minutes")
    subprocess.run(["shutdown", "/s", "/t", "120", "/c", "English Quest: the pictures are done. Shutting down."],
                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def keep_awake(on):
    """While making pictures, don't let Windows go to sleep."""
    if os.name == "nt":
        import ctypes
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | (0x00000001 if on else 0))


def http(method, url, body=None, headers=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        **({"Content-Type": "application/json"} if data else {}), **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        # Keep the reason the other side gave (ComfyUI explains which setting it did not accept).
        detail = e.read().decode("utf-8", "replace")
        try:
            j = json.loads(detail)
            parts = [j.get("error", {}).get("message", "")] if isinstance(j.get("error"), dict) else [str(j.get("error", ""))]
            for node in (j.get("node_errors") or {}).values():
                for err in node.get("errors", []):
                    parts.append(f"{err.get('message', '')}: {err.get('details', '')}")
            detail = " | ".join(p for p in parts if p) or detail
        except ValueError:
            pass
        raise RuntimeError(f"HTTP {e.code} from {url.split('?')[0]}: {detail[:600]}") from None


class Server:
    def __init__(self, cfg):
        self.url = cfg["server"].rstrip("/")
        self.auth = {"Authorization": f"Bearer {cfg['token']}"}

    def next_job(self):
        """Returns (job or None, may_shut_down)."""
        req = urllib.request.Request(f"{self.url}/api/art/next", headers=self.auth)
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
            shutdown = r.headers.get("X-EQ-Shutdown") == "yes"
            return (json.loads(data) if r.status == 200 and data else None), shutdown

    def result(self, key, n, raw, pixel):
        http("POST", f"{self.url}/api/art/result", {
            "key": key, "n": n,
            "raw": base64.b64encode(raw).decode(), "pixel": base64.b64encode(pixel).decode(),
        }, self.auth, timeout=120)

    def fail(self, key, error):
        http("POST", f"{self.url}/api/art/fail", {"key": key, "error": error}, self.auth)


class Comfy:
    def __init__(self, cfg):
        self.cfg = cfg
        self.url = cfg["comfy_url"].rstrip("/")
        self.proc = None

    def alive(self):
        try:
            return http("GET", f"{self.url}/system_stats", timeout=5)[0] == 200
        except (urllib.error.URLError, OSError):
            return False

    def ensure_running(self):
        if self.alive():
            return
        folder = self.cfg["comfy_dir"]
        python = os.path.join(folder, "venv", "Scripts" if os.name == "nt" else "bin", "python.exe" if os.name == "nt" else "python")
        if not os.path.exists(python) or not os.path.exists(os.path.join(folder, "main.py")):
            raise RuntimeError(f"ComfyUI not found in {folder}")
        port = urllib.parse.urlparse(self.url).port or 8188
        log.info("Starting ComfyUI")
        out = open(os.path.join(HERE, "comfyui.log"), "ab")
        self.proc = subprocess.Popen(
            [python, "main.py", "--listen", "127.0.0.1", "--port", str(port), "--disable-auto-launch"],
            cwd=folder, stdout=out, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        for _ in range(300):
            if self.alive():
                return
            if self.proc.poll() is not None:
                raise RuntimeError("ComfyUI stopped while starting, see comfyui.log")
            time.sleep(1)
        raise RuntimeError("ComfyUI did not start in 5 minutes")

    def stop(self):
        """Close ComfyUI if we started it, to free the graphics card."""
        if self.proc and self.proc.poll() is None:
            log.info("Closing ComfyUI")
            self.proc.terminate()
            try:
                self.proc.wait(30)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None

    def lora_ok(self):
        """Is the LoRA from config.json really there? If not, make pictures without it (and say so)."""
        try:
            _, data = http("GET", f"{self.url}/object_info/LoraLoader")
            names = json.loads(data)["LoraLoader"]["input"]["required"]["lora_name"][0]
        except Exception:
            return True  # can't tell: try it
        if self.cfg["lora"] in names:
            return True
        log.warning("LoRA %r is not in ComfyUI's LoRA folder, making pictures without it. Found: %s",
                    self.cfg["lora"], ", ".join(names) or "none")
        return False

    def checkpoint(self):
        if self.cfg["checkpoint"]:
            return self.cfg["checkpoint"]
        _, data = http("GET", f"{self.url}/object_info/CheckpointLoaderSimple")
        names = json.loads(data)["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
        if not names:
            raise RuntimeError("No models found in ComfyUI")
        xl = [n for n in names if "xl" in n.lower()]
        self.cfg["checkpoint"] = (xl or names)[0]
        log.info("Using model %s", self.cfg["checkpoint"])
        return self.cfg["checkpoint"]

    def generate(self, prompt, negative, width, height, seed):
        cfg = self.cfg
        model, clip = ["ckpt", 0], ["ckpt", 1]
        graph = {
            "ckpt": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": self.checkpoint()}},
            "pos": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": clip}},
            "neg": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": clip}},
            "latent": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
            "sample": {"class_type": "KSampler", "inputs": {
                "seed": seed, "steps": cfg["steps"], "cfg": cfg["cfg"], "sampler_name": cfg["sampler"],
                "scheduler": cfg["scheduler"], "denoise": 1.0,
                "model": model, "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": ["latent", 0]}},
            "decode": {"class_type": "VAEDecode", "inputs": {"samples": ["sample", 0], "vae": ["ckpt", 2]}},
            "save": {"class_type": "SaveImage", "inputs": {"filename_prefix": "english-quest", "images": ["decode", 0]}},
        }
        if cfg["lora"] and self.lora_ok():
            graph["lora"] = {"class_type": "LoraLoader", "inputs": {
                "lora_name": cfg["lora"], "strength_model": cfg["lora_strength"], "strength_clip": cfg["lora_strength"],
                "model": model, "clip": clip}}
            graph["sample"]["inputs"]["model"] = ["lora", 0]
            graph["pos"]["inputs"]["clip"] = graph["neg"]["inputs"]["clip"] = ["lora", 1]

        _, data = http("POST", f"{self.url}/prompt", {"prompt": graph, "client_id": str(uuid.uuid4())})
        prompt_id = json.loads(data)["prompt_id"]
        for _ in range(900):
            time.sleep(1)
            _, data = http("GET", f"{self.url}/history/{prompt_id}")
            entry = json.loads(data).get(prompt_id)
            if not entry:
                continue
            if entry.get("status", {}).get("status_str") == "error":
                raise RuntimeError("ComfyUI could not make the picture, see comfyui.log")
            images = entry.get("outputs", {}).get("save", {}).get("images", [])
            if images:
                q = urllib.parse.urlencode({"filename": images[0]["filename"], "subfolder": images[0].get("subfolder", ""), "type": "output"})
                return http("GET", f"{self.url}/view?{q}")[1]
        raise RuntimeError("The picture took more than 15 minutes")


def is_key(r, g, b):
    """The magenta background color around characters and items."""
    return r > 150 and b > 150 and g < 120 and abs(r - b) < 100


def pixelate(png, kind, height=None, colors=32):
    """Turn a big painting into small pixel art with few colors (like the Pixel Tool)."""
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    if kind == "background":
        w, h = img.size
        target = 16 / 10
        if w / h > target:
            cw = round(h * target)
            img = img.crop(((w - cw) // 2, 0, (w - cw) // 2 + cw, h))
        else:
            ch = round(w / target)
            img = img.crop((0, (h - ch) // 2, w, (h - ch) // 2 + ch))
        small = img.convert("RGB").resize((320, 200), Image.BOX).convert("RGBA")
    else:
        # Make the magenta background transparent, cut to the figure, and shrink to the wanted height.
        px = img.load()
        w, h = img.size
        for y in range(h):
            for x in range(w):
                r, g, b, _ = px[x, y]
                if is_key(r, g, b):
                    px[x, y] = (0, 0, 0, 0)
        box = img.getbbox()
        if not box:
            raise RuntimeError("The picture was only background")
        img = img.crop(box)
        size = max(4, int(height or 48))
        if kind == "item":  # items: the longest side gets the size (a key is wide, a sword is tall)
            scale = size / max(img.width, img.height)
        else:  # characters: the height gets the size
            scale = size / img.height
        tw, th = max(1, round(img.width * scale)), max(1, round(img.height * scale))
        small = img.convert("RGBa").resize((tw, th), Image.BOX).convert("RGBA")
        alpha = small.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
        small.putalpha(alpha)

    median_cut = getattr(getattr(Image, "Quantize", None), "MEDIANCUT", 0)
    no_dither = getattr(getattr(Image, "Dither", None), "NONE", 0)
    quantized = small.convert("RGB").quantize(colors=int(colors), method=median_cut, dither=no_dither).convert("RGBA")
    quantized.putalpha(small.getchannel("A"))
    out = io.BytesIO()
    quantized.save(out, "PNG", optimize=True)
    return out.getvalue()


def do_job(job, comfy, server, cfg):
    sizes = SIZES.get(cfg["model"], SIZES["sdxl"])
    width, height = sizes["background"] if job["kind"] == "background" else sizes["sprite"]
    for n in range(job["variants"]):
        log.info("Making %s (%d of %d)", job["key"], n + 1, job["variants"])
        raw = comfy.generate(job["prompt"], job["negative"], width, height, job["seed"] + n)
        server.result(job["key"], n, raw, pixelate(raw, job["kind"], job.get("height"), cfg["colors"]))


class Lock:
    """Only one worker works at a time: the one that holds a local port."""
    def __init__(self):
        self.sock = None

    @property
    def held(self):
        return self.sock is not None

    def acquire(self):
        if self.sock:
            return True
        s = socket.socket()
        try:
            s.bind(("127.0.0.1", 47811))
        except OSError:
            s.close()
            return False
        self.sock = s
        return True

    def release(self):
        if self.sock:
            self.sock.close()
            self.sock = None


def background_copy():
    """True for the copy started by Windows before login (the SYSTEM account). It can't see the mouse
    and keyboard, so it steps aside while someone is logged in and the login copy does the work."""
    return os.name == "nt" and os.environ.get("USERPROFILE", "").lower().endswith("systemprofile")


def run(cfg, lock, once=False):
    server, comfy = Server(cfg), Comfy(cfg)
    last_work = 0.0
    log.info("Worker started (%s). Server %s", "before-login copy" if background_copy() else "login copy", server.url)
    while True:
        job = None
        # Take turns: the before-login copy works only while nobody is logged in.
        if not once and background_copy() and someone_logged_in():
            if lock.held:
                comfy.stop()
                lock.release()
                log.info("Someone logged in: the login copy of the worker takes over")
            time.sleep(60)
            continue
        if not lock.held:
            if not lock.acquire():
                time.sleep(60)  # the other copy is working
                continue
            log.info("This copy is now the active worker")
        try:
            may_shut_down = False
            if idle_seconds() >= cfg["idle_minutes"] * 60 and not gpu_busy(cfg):
                job, may_shut_down = server.next_job()
            if job:
                keep_awake(True)
                comfy.ensure_running()
                do_job(job, comfy, server, cfg)
                log.info("Done: %s", job["key"])
                last_work = time.time()
                continue  # look for the next job right away
            keep_awake(False)
            if may_shut_down and cfg["shutdown_after_wake"] and not someone_logged_in():
                comfy.stop()
                shut_down()
                return
            if comfy.proc and time.time() - last_work > 300:
                comfy.stop()
            if once:
                comfy.stop()
                return
        except Exception as e:  # keep running; report the problem
            log.error("Problem: %s", e)
            if job:
                try:
                    server.fail(job["key"], str(e))
                except Exception:
                    pass
            if once:
                comfy.stop()
                raise
        time.sleep(cfg["poll_seconds"])


def test(cfg):
    comfy = Comfy(cfg)
    try:
        comfy.ensure_running()
        print("Making a test picture (this can take a minute the first time)...")
        sizes = SIZES.get(cfg["model"], SIZES["sdxl"])["background"]
        raw = comfy.generate(
            "background art for a 1990 Sierra adventure game, King's Quest V style, hand-painted VGA pixel art, "
            "a small wooden house next to a lake, daylight", "text, watermark, blurry", sizes[0], sizes[1], 1234)
        with open(os.path.join(HERE, "test.png"), "wb") as f:
            f.write(raw)
        with open(os.path.join(HERE, "test-pixel.png"), "wb") as f:
            f.write(pixelate(raw, "background", colors=cfg["colors"]))
        print("OK: test.png and test-pixel.png")
    finally:
        comfy.stop()


def main():
    setup_logging()
    cfg = load_config()
    if "--test" in sys.argv:
        test(cfg)
        return
    if not cfg["server"] or not cfg["token"]:
        sys.exit("Set server and token in config.json")
    once = "--once" in sys.argv
    lock = Lock()
    if once and not lock.acquire():
        log.info("Another worker is already running")
        return
    run(cfg, lock, once=once)


if __name__ == "__main__":
    main()
