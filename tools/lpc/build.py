"""Builds the game's walking characters from LPC (Liberated Pixel Cup) sprite layers.

The LPC character generator (https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
has bodies, heads, hair and clothes as separate layers. This script stacks the layers we chose for each
character, colors them, and saves one sheet per character in assets/characters/<name>.png:

    row 0-3: walk, 9 frames of 64x64, facing up, left, down, right
    row 4-7: idle, 2 frames, facing up, left, down, right
    row 8:   hurt, 6 frames, falling down (the last frame: lying on the ground)

and the artists' names in assets/characters/CREDITS.md (the licenses ask for it).

Usage (needs Pillow and git):
    git clone --depth 1 --filter=blob:none --sparse <generator repo url> /tmp/lpc
    cd /tmp/lpc && git sparse-checkout set sheet_definitions tools/palettes
    python tools/lpc/build.py /tmp/lpc
"""

import json
import os
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "characters")
FRAME = 64

# Each layer: (sheet definition, color). Colors come from the generator's palettes (hair, cloth, body, eye).
CHARACTERS = {
    "hero": {
        "body": "teen",
        "layers": [
            ("body/body.json", "light"),
            ("head/heads/human/heads_human_male_small.json", ("light", "brown")),
            ("feet/shoes/feet_shoes_basic.json", "white"),
            ("legs/pants/legs_pants.json", "navy"),
            ("torso/shirts/longsleeve/torso_clothes_longsleeve.json", "red"),
            ("hair/short/hair_messy1.json", "dark_brown"),
        ],
    },
    "grandmother": {
        "body": "female",
        "layers": [
            ("body/body.json", "light"),
            ("head/heads/human/heads_human_female_elderly.json", ("light", "blue")),
            ("feet/shoes/feet_shoes_basic.json", "brown"),
            ("legs/skirts/legs_skirts_plain.json", "purple"),
            ("torso/shirts/longsleeve/torso_clothes_longsleeve.json", "purple"),
            ("torso/aprons/torso_aprons_apron.json", "white"),
            ("hair/braids/hair_bangs_bun.json", "gray"),
        ],
    },
    "father": {
        "body": "male",
        "layers": [
            ("body/body.json", "light"),
            ("head/heads/human/heads_human_male.json", ("light", "brown")),
            ("feet/boots/feet_boots_basic.json", "brown"),
            ("legs/pants/legs_pants.json", "brown"),
            ("torso/shirts/longsleeve/torso_clothes_longsleeve.json", "forest"),
            ("hair/short/hair_plain.json", "chestnut"),
            ("hair/beards/beards_beard.json", "chestnut"),
        ],
    },
}

ANIMATIONS = [("walk", 9, 4), ("idle", 2, 4), ("hurt", 6, 1)]


def git_file(repo, path):
    """Read a file from the generator repo (a sparse clone fetches it when asked)."""
    try:
        data = subprocess.run(["git", "-C", repo, "show", f"HEAD:{path}"], capture_output=True, check=True).stdout
    except subprocess.CalledProcessError:
        return None
    from io import BytesIO
    return Image.open(BytesIO(data)).convert("RGBA")


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def palette(repo, material, name, img):
    """(base colors, new colors). The base is the palette variant the image is drawn in (often "source",
    but clothes are drawn in "white"), found by which variant has the most of the image's colors."""
    with open(os.path.join(repo, "tools", "palettes", f"ulpc-{material}-palettes.json")) as f:
        p = json.load(f)
    if name not in p:
        raise SystemExit(f"no {material} color '{name}'; there are: {', '.join(k for k in p if k != 'source')}")
    used = {img.getpixel((x, y))[:3] for x in range(img.width) for y in range(img.height) if img.getpixel((x, y))[3]}
    def matches(variant):
        return sum(any(all(abs(a - b) <= 1 for a, b in zip(hex_rgb(c), u)) for u in used) for c in p[variant])
    base = max(p, key=lambda v: (matches(v), v == "source"))
    return [hex_rgb(c) for c in p[base]], [hex_rgb(c) for c in p[name]]


def recolor(img, pairs):
    src = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = src[x, y]
            if not a:
                continue
            for (sr, sg, sb), to in pairs:
                if abs(r - sr) <= 1 and abs(g - sg) <= 1 and abs(b - sb) <= 1:
                    src[x, y] = (*to, a)
                    break
    return img


def layer_images(repo, definition, color, body, anim):
    """The images of one sheet definition for one animation, with their z positions."""
    out = []
    for key, layer in sorted((k, v) for k, v in definition.items() if k.startswith("layer_")):
        folder = layer.get(body)
        if not folder:
            raise SystemExit(f"{definition['name']} has no {body} version")
        rec = definition.get("recolors")
        if rec:  # one image, colored with a palette
            img = git_file(repo, f"spritesheets/{folder}{anim}.png")
            if img is None:
                continue
            specs = [rec] if "material" in rec else [rec[k] for k in sorted(rec)]
            colors = color if isinstance(color, tuple) else (color,)
            pairs = []
            for spec, c in zip(specs, colors):
                src, dst = palette(repo, spec["material"], c, img)
                pairs += list(zip(src, dst))
            img = recolor(img, pairs)
        else:  # a ready-made image for each color
            img = git_file(repo, f"spritesheets/{folder}{anim}/{color}.png")
            if img is None:
                continue
        out.append((layer["zPos"], img))
    return out


def build(repo, name, spec, credits):
    sheet = Image.new("RGBA", (9 * FRAME, sum(a[2] for a in ANIMATIONS) * FRAME))
    row = 0
    for anim, frames, rows in ANIMATIONS:
        layers = []
        for def_path, color in spec["layers"]:
            with open(os.path.join(repo, "sheet_definitions", def_path)) as f:
                definition = json.load(f)
            layers += layer_images(repo, definition, color, spec["body"], anim)
            for c in definition.get("credits", []):
                credits[c["file"]] = c
        frame = Image.new("RGBA", (frames * FRAME, rows * FRAME))
        for _, img in sorted(layers, key=lambda l: l[0]):
            part = img.crop((0, 0, frames * FRAME, rows * FRAME))
            frame.alpha_composite(part)
        sheet.paste(frame, (0, row * FRAME))
        row += rows
    sheet.save(os.path.join(OUT, f"{name}.png"), optimize=True)
    print("made", name)


def main():
    repo = sys.argv[1] if len(sys.argv) > 1 else "/tmp/lpc"
    os.makedirs(OUT, exist_ok=True)
    credits = {}
    for name, spec in CHARACTERS.items():
        build(repo, name, spec, credits)
    lines = [
        "# Character sprites: credits",
        "",
        "The walking characters (hero, grandmother, father) are made from the Liberated Pixel Cup (LPC)",
        "character sprites, collected in the Universal LPC Spritesheet Character Generator",
        "(https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator).",
        "They are used under the licenses below (CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 / CC-BY). Thank you to:",
        "",
    ]
    for file, c in sorted(credits.items()):
        lines.append(f"- **{file}**: {', '.join(c['authors'])}. Licenses: {', '.join(c['licenses'])}.")
        for url in c.get("urls", []):
            lines.append(f"  {url}")
    with open(os.path.join(OUT, "CREDITS.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("credits written")


if __name__ == "__main__":
    main()
