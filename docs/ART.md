# Making the art with AI images

The look we want is **King's Quest V / Monkey Island 1 VGA**: hand-painted pixel art, 320 × 200,
rich colors. AI makes the painting, then the **Pixel Tool** (`tools/pixelate.html`) turns it into real
low-resolution pixel art with a small color palette, so every picture matches.

## 1. Make the image (ChatGPT or the OpenAI image tool)

Use a **landscape** image size (for example 1536 × 1024). Always start the prompt with the same style
text, so all scenes look like one game.

### Backgrounds

Copy this, then add the scene description at the end:

> A background for a 1990 Sierra point-and-click adventure game, in the style of King's Quest V:
> hand-painted VGA pixel art, rich saturated colors, soft painterly shading, clear dark outlines on
> important objects. Side view, camera at eye level. The bottom third is open ground where a character
> can walk. No people, no animals, no text, no user interface. Wide image. Scene:

### Characters and items

Characters go on a **magenta** background so the tool can remove it:

> A full-body character for a 1990 Sierra adventure game, King's Quest V style VGA pixel art. Standing,
> side view facing right, whole body visible, on a plain solid magenta (#FF00FF) background, no shadow,
> no text. Character:

Tips:
- Make 2–4 versions of each and pick the best one.
- If a scene comes out too detailed or too dark, add "simple shapes, bright daylight".
- Keep characters and the objects he must click **big and clear**, because they get small at 320 × 200.

## 2. Turn it into pixel art

Open `tools/pixelate.html` in the browser, or `http://SERVER:8080/tools/pixelate.html` when the
server runs, and drop the image in.

| Kind | Settings |
|---|---|
| Background | Background, 320 × 200, 32 colors, light dithering |
| Character | Character / item, height **48**, 32 colors, *Remove magenta background* on |
| Small item (key, bread) | Character / item, height **12–16**, 16 colors, magenta on |

Click **Download PNG**.

## 3. Send them to me

Upload the PNGs (or the original AI images) into our chat, or put them in `assets/raw/` in the
repository. I'll place them in the scenes and mark the clickable areas (door, chest, wolf, and so on).

## Shot list for the first episodes

### Prologue: Insert Disk
- **Attic at night**: dusty wooden attic, a desk with an old beige 1980s computer and monitor, a box of
  floppy disks, cardboard boxes, a small round window with moonlight, a hanging light bulb.
- **BYTE**: a small white mouse-pointer arrow with big cartoon eyes and tiny wings, glowing a little.

### Episode 1: The Cold Village (replaces the current drawings)
- **Village**: a snowy Viking village in daylight. A log house with a snowy roof and a red wooden
  door on the left, a big grey rock in front on the left, a tall pine tree in the middle, a path going
  right into a dark forest with a wooden sign.
- **Inside the house**: a warm Viking longhouse. A stone fireplace with fire on the left, a long wooden
  table in the middle, a wooden chest on the right, a door on the right wall, and a round red-and-yellow
  shield on the wall.
- **The bridge**: a wide frozen river with an old wooden bridge going into a pine forest on the far
  side, and two small snowy houses on the near side at the bottom left.
- **The hero**: a teenage boy in a red hoodie, blue jeans and white sneakers, brown hair.
- **Grandmother**: an old Viking woman with grey hair in a bun, a purple dress, a white apron and a
  wooden walking stick.
- **The wolf**: a big thin grey wolf, standing, looking hungry, not scary.
- **Items**: an old iron key, a round loaf of bread, a Viking sword.

## Animation

AI images are great for backgrounds, characters and items. They can't reliably draw the same character in
several walking poses. With AI art the characters will glide with a small step bounce. If he loves the
game, a pixel artist can draw real walking frames for the hero later (a few hours of work for an artist).
