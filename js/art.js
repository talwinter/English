// King's Quest style pictures: 160x168 pixels, 16 EGA colors, each pixel shown twice as wide.
// Scenes are painted with simple commands (rects, polygons, lines, ovals, sprites).
// Painting inside p.obj(id, baseY, ...) makes those pixels clickable as `id`, and things whose
// base is lower on screen than the hero's feet are drawn in front of him (like AGI's priority screen).

(function () {
  const W = 160, H = 168;
  const PALETTE = [
    0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
    0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff,
  ];
  // Color names
  const K = 0, B = 1, G = 2, C = 3, R = 4, M = 5, N = 6, L = 7, D = 8, LB = 9, LG = 10, LC = 11, LR = 12, LM = 13, Y = 14, Wh = 15;
  const HIT_ONLY = -1;
  // Dither patterns: checkerboard and sparse
  const dith = (a, b) => (x, y) => ((x + y) & 1 ? b : a);
  const sparse = (a, b) => (x, y) => ((x & 1) === 0 && (y & 1) === 0 ? b : a);

  class Painter {
    constructor(base) {
      if (base) {
        this.base = base;
        this.c = new Uint8Array(base.c);
      } else {
        this.c = new Uint8Array(W * H);
        this.hit = new Uint8Array(W * H);
        this.pri = new Uint8Array(W * H);
        this.ids = [null];
      }
      this.h = 0;
      this.pr = 0;
    }
    reset() { this.c.set(this.base.c); }

    pset(x, y, col) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = y * W + x;
      if (typeof col === "function") col = col(x, y);
      if (col !== HIT_ONLY) this.c[i] = col;
      if (!this.base) {
        if (this.h) this.hit[i] = this.h;
        else if (col !== HIT_ONLY) this.hit[i] = 0;
        this.pri[i] = this.pr;
      }
    }
    span(y, x0, x1, col) { for (let x = Math.ceil(x0); x <= Math.floor(x1); x++) this.pset(x, y, col); }
    rect(x, y, w, h, col) { for (let j = y; j < y + h; j++) this.span(j, x, x + w - 1, col); }
    hitRect(x, y, w, h) { this.rect(x, y, w, h, HIT_ONLY); }
    box(x, y, w, h, col, out = K) { this.rect(x, y, w, h, out); this.rect(x + 1, y + 1, w - 2, h - 2, col); }

    line(x0, y0, x1, y1, col) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.pset(x0, y0, col);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    lines(pts, col, closed = true) {
      for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        this.line(a[0], a[1], b[0], b[1], col);
      }
    }
    poly(pts, col) {
      const ys = pts.map((p) => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
        const cy = y + 0.5, xs = [];
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
          if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) this.span(y, xs[i] - 0.5, xs[i + 1] - 0.5, col);
      }
    }
    shape(pts, col, out = K) { this.poly(pts, col); if (out != null) this.lines(pts, out); }
    oval(cx, cy, rx, ry, col) {
      for (let y = -ry; y <= ry; y++) {
        const half = rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.5)) ** 2));
        this.span(cy + y, cx - half, cx + half, col);
      }
    }
    ovalOut(cx, cy, rx, ry, col, out = K) { this.oval(cx, cy, rx, ry, out); this.oval(cx, cy, rx - 1, ry - 1, col); }

    // rows: array of strings, map: char -> color, '.' = transparent.
    // depthY: when set, skip pixels of things standing in front of this y.
    sprite(x, y, rows, map, flip = false, depthY = null) {
      const pri = this.base ? this.base.pri : null;
      rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
          const ch = flip ? row[row.length - 1 - i] : row[i];
          if (ch === "." || map[ch] == null) continue;
          const px = x + i, py = y + j;
          if (depthY != null && pri && px >= 0 && px < W && py >= 0 && py < H && pri[py * W + px] > depthY) continue;
          this.pset(px, py, map[ch]);
        }
      });
    }

    obj(id, baseY, fn) {
      let n = this.ids.indexOf(id);
      if (n < 0) { n = this.ids.length; this.ids.push(id); }
      const [h, pr] = [this.h, this.pr];
      this.h = n; this.pr = baseY;
      fn();
      this.h = h; this.pr = pr;
    }
    idAt(x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return null;
      return this.ids[this.hit[(y | 0) * W + (x | 0)]];
    }
  }

  // Draw a 160-wide buffer onto a 320x168 canvas image (each pixel twice as wide).
  const RGBA = PALETTE.map((c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0);
  function blit(colors, imageData) {
    const out = new Uint32Array(imageData.data.buffer);
    for (let i = 0, o = 0; i < W * H; i++, o += 2) out[o] = out[o + 1] = RGBA[colors[i]];
  }

  // ---------- shared drawing helpers
  function pine(p, x, baseY, h, col = G) {
    p.box(x - 1, baseY - Math.round(h * 0.14), 3, Math.round(h * 0.14) + 1, N);
    const tiers = [[0, 0.42, 0.09], [0.24, 0.66, 0.13], [0.46, 0.88, 0.17]];
    for (const [t0, t1, w] of tiers) {
      const top = baseY - h + h * t0, bot = baseY - h + h * t1, hw = Math.max(2, h * w);
      p.shape([[x, top], [x - hw, bot], [x + hw, bot]], col);
      p.span(Math.round(bot) - 1, x - hw + 2, x + hw - 2, dith(Wh, col));
      p.shape([[x, top], [x - hw * 0.35, top + (bot - top) * 0.32], [x + hw * 0.35, top + (bot - top) * 0.32]], Wh, null);
    }
  }
  function mountains(p, peaks, baseY, col = L) {
    const pts = [[0, baseY]];
    peaks.forEach(([x, y], i) => {
      pts.push([x, y]);
      if (i < peaks.length - 1) pts.push([(x + peaks[i + 1][0]) / 2, baseY - 10 - (i % 2) * 6]);
    });
    pts.push([W, baseY], [W, baseY + 2], [0, baseY + 2]);
    p.shape(pts, col, D);
    for (const [x, y] of peaks) p.shape([[x, y], [x - 6, y + 8], [x - 2, y + 6], [x, y + 9], [x + 3, y + 6], [x + 6, y + 8]], Wh, null);
  }
  function cloud(p, x, y, w) {
    p.oval(x, y, w, 3, Wh);
    p.oval(x - w / 3, y + 1, w / 2, 2, Wh);
    p.oval(x + w / 4, y - 2, w / 2, 3, Wh);
  }
  function door(p, x, y, w, h, open) {
    if (open) {
      p.box(x, y, w, h, K);
      p.rect(x + 2, y + 2, w - 4, h - 2, dith(Y, N));
      p.shape([[x, y], [x - 4, y + 3], [x - 4, y + h], [x, y + h]], R);
    } else {
      p.box(x, y, w, h, R);
      for (let i = x + 4; i < x + w - 1; i += 4) p.line(i, y + 1, i, y + h - 2, K);
      p.rect(x + 1, y + 5, w - 2, 1, K); p.rect(x + 1, y + h - 7, w - 2, 1, K);
      p.rect(x + w - 3, y + h / 2, 1, 2, Y);
    }
  }
  function smallHouse(p, x, y, w, h) {
    p.box(x, y, w, h, N);
    for (let j = y + 3; j < y + h; j += 3) p.line(x + 1, j, x + w - 2, j, K);
    p.shape([[x - 2, y + 1], [x + w / 2, y - h * 0.7], [x + w + 1, y + 1]], Wh);
    p.box(x + w / 2 - 2, y + h / 2 - 1, 4, 4, Y);
  }

  // ---------- sprites (facing right; flipped for left)
  const HERO_MAP = { k: K, b: B, r: R, n: N, g: L, d: D, y: Y, w: Wh };
  const HERO_TOP = [
    "..nnnn..",
    ".nnnnnn.",
    ".nnnyyy.",
    ".nnyyky.",
    "..nyyyy.",
    "...yyy..",
    "..dddd..",
    ".dddddd.",
    ".drrrrd.",
    ".drrrrd.",
    ".yrrrry.",
    "..nnnn..",
    "..rrrr..",
    "..rrrr..",
  ];
  const HERO_LEGS = [
    ["..b..b..", "..b..b..", "..b..b..", "..b..b..", "..n..n..", "..nn.nn."],
    ["..b..b..", ".b....b.", ".b....b.", "b......b", "n......n", "nn.....n"],
    ["..b.b...", "..b.b...", "...bb...", "...bb...", "...nn...", "...nnn.."],
  ];
  const HERO = HERO_LEGS.map((legs) => HERO_TOP.concat(legs));

  const GRANDMA = [
    "..ggg....",
    ".ggggg...",
    ".ggyyy...",
    ".gyyyky..",
    ".gyyyyy..",
    "..yyyy...",
    ".mmmmmm..",
    "mmmmmmmm.",
    "mmmmmmmyn",
    "mrmmmmmrn",
    ".rrwwwrrn",
    ".rrwwwrrn",
    ".rrwwwrrn",
    ".rrwwwrrn",
    "rrrwwwrrn",
    "rrrwwwrrn",
    "rrrwwwrrn",
    "rrrrrrrrn",
    "rrrrrrrrn",
    ".kk..kk.n",
  ];
  const GRANDMA_MAP = { g: L, y: Y, k: K, m: LM, r: M, w: Wh, n: N };

  const WOLF = [
    "..k.k.........",
    ".kgkgk........",
    ".kgggk........",
    "kgggggk.......",
    "kgykgggk....kk",
    "kggggggkkkkkgk",
    ".kwggggggggggk",
    "..kgggggggggk.",
    "..kggggggggdk.",
    "..kgdggggddk..",
    "..kgk.kgk.kgk.",
    "..kgk.kgk.kgk.",
    "..kgk.kgk.kgk.",
    "..kgk.kgk.kgk.",
    "..kgk.kgk.kgk.",
    "..kk..kk..kk..",
  ];
  const WOLF_MAP = { k: K, g: L, d: D, y: Y, w: Wh };

  // ---------- scenes
  const SCENES = {
    outside: {
      floor: { x0: 6, x1: 154, y0: 117, y1: 162 },
      spots: { door: [43, 119], house: [43, 119], window: [70, 119], rock: [38, 146], key: [45, 150], tree: [98, 132], forest: [142, 122] },
      entry: { inside: [43, 119], bridge: [140, 124], start: [70, 142] },
      draw(p, s, show) {
        p.rect(0, 0, W, 64, LB);
        p.rect(0, 54, W, 10, dith(LB, Wh));
        p.oval(140, 12, 4, 7, Y);
        cloud(p, 28, 14, 10); cloud(p, 92, 22, 8);
        mountains(p, [[14, 40], [50, 26], [90, 36], [128, 28]], 66);
        p.rect(0, 68, W, H - 68, Wh);
        p.rect(0, 68, W, 2, dith(Wh, L));
        p.oval(20, 100, 14, 2, dith(Wh, L)); p.oval(110, 150, 18, 2, dith(Wh, L)); p.oval(70, 160, 12, 2, dith(Wh, L));

        p.obj("forest", 0, () => {
          p.shape([[146, 70], [156, 70], [160, 76], [160, 96], [140, 120], [118, 168], [96, 168], [128, 104]], dith(Wh, L), null);
          pine(p, 136, 92, 30); pine(p, 148, 98, 44); pine(p, 158, 102, 50);
          p.box(124, 100, 2, 14, N);
          p.shape([[116, 94], [131, 94], [134, 97], [131, 100], [116, 100]], N);
          p.line(119, 97, 129, 97, K); p.line(127, 96, 129, 97, K); p.line(127, 98, 129, 97, K);
        });

        p.obj("house", 112, () => {
          p.box(24, 62, 58, 51, N);
          for (let y = 66; y < 112; y += 4) p.line(25, y, 80, y, K);
          p.box(66, 30, 7, 20, L);
          p.line(66, 36, 72, 36, K); p.line(66, 42, 72, 42, K);
          p.shape([[15, 66], [53, 28], [91, 66]], Wh);
          p.poly([[53, 34], [86, 64], [70, 64]], dith(Wh, L));
          p.rect(17, 64, 73, 3, dith(N, K));
          p.rect(34, 112, 18, 1, L);
        });
        p.obj("window", 112, () => {
          p.box(63, 74, 13, 12, Y);
          p.line(69, 74, 69, 85, K); p.line(63, 79, 75, 79, K);
          p.rect(62, 86, 15, 2, Wh);
        });
        p.obj("door", 112, () => door(p, 36, 82, 14, 31, s.flag("doorOpen")));
        if (s.flag("doorOpen")) p.poly([[36, 113], [50, 113], [55, 121], [31, 121]], dith(Wh, Y));

        p.obj("tree", 124, () => pine(p, 112, 124, 92));

        p.obj("rock", 141, () => {
          const rock = [[7, 141], [5, 133], [9, 124], [17, 118], [26, 119], [32, 125], [34, 134], [31, 141]];
          p.shape(rock, L);
          p.poly([[25, 125], [33, 129], [33, 137], [30, 140], [21, 140], [24, 132]], dith(L, D));
          p.line(14, 128, 17, 133, D); p.line(17, 133, 15, 138, D);
          p.shape([[10, 124], [17, 118], [26, 119], [31, 124], [24, 123], [19, 125], [14, 124]], Wh, null);
          p.rect(4, 141, 32, 2, dith(Wh, L));
        });
        if (show("key")) p.obj("key", 150, () => {
          p.hitRect(26, 139, 16, 10);
          p.rect(28, 142, 5, 5, K); p.rect(29, 143, 3, 3, Y); p.pset(30, 144, K);
          p.rect(32, 143, 8, 3, K); p.line(33, 144, 39, 144, Y);
          p.rect(37, 145, 3, 3, K); p.pset(38, 146, Y);
        });
      },
      anim(p, t) {
        for (let i = 0; i < 3; i++) {
          const k = ((t * 0.6 + i / 3) % 1);
          p.oval(70 + Math.sin(t + i) * 2 + k * 6, 28 - k * 22, 2 + k * 3, 1 + k * 2, dith(L, LB));
        }
        snowfall(p, t);
      },
    },

    inside: {
      floor: { x0: 10, x1: 150, y0: 108, y1: 162 },
      spots: { grandmother: [74, 110], fire: [36, 112], table: [90, 113], bread: [90, 113], chest: [108, 122], sword: [108, 122], door: [146, 108] },
      entry: { outside: [144, 110], start: [144, 110] },
      draw(p, s, show) {
        p.rect(0, 0, W, 100, N);
        for (let y = 10; y < 100; y += 6) p.line(0, y, W, y, K);
        p.rect(0, 0, W, 7, D); p.line(0, 7, W, 7, K);
        p.box(96, 7, 5, 93, N);
        p.rect(0, 100, W, 68, dith(N, D));
        p.line(0, 100, W, 100, K);
        p.oval(80, 134, 34, 11, Y); p.oval(80, 134, 32, 10, R); p.oval(80, 134, 22, 6, dith(R, M));

        p.box(108, 28, 18, 16, LB);
        p.rect(109, 39, 16, 4, Wh); p.line(116, 28, 116, 43, K); p.line(108, 35, 125, 35, K);
        p.ovalOut(84, 40, 6, 11, R);
        p.line(84, 30, 84, 50, Y); p.line(79, 40, 89, 40, Y); p.oval(84, 40, 1, 2, L);
        p.box(104, 58, 28, 3, N);
        p.ovalOut(109, 54, 3, 4, L); p.ovalOut(117, 53, 3, 5, D); p.ovalOut(125, 55, 2, 3, B);

        p.obj("fire", 100, () => {
          p.box(4, 38, 44, 5, N);
          p.rect(6, 43, 40, 57, L);
          for (let y = 47, row = 0; y < 100; y += 5, row++) {
            p.line(6, y, 45, y, K);
            for (let x = 6 + (row % 2) * 4; x < 46; x += 8) p.line(x, y - 4, x, y, K);
          }
          p.lines([[6, 43], [45, 43], [45, 99], [6, 99]], K);
          p.rect(14, 70, 24, 30, K);
          p.oval(26, 70, 12, 8, K);
          p.box(15, 95, 22, 4, N);
        });

        p.obj("grandmother", 106, () => p.sprite(57, 86, GRANDMA, GRANDMA_MAP));

        p.obj("table", 104, () => {
          p.box(70, 88, 38, 4, N);
          p.box(73, 91, 3, 14, N); p.box(102, 91, 3, 14, N);
        });
        if (show("bread")) p.obj("bread", 104, () => {
          p.hitRect(82, 80, 16, 8);
          p.shape([[83, 88], [84, 84], [87, 81], [93, 81], [96, 84], [97, 88]], N);
          p.line(87, 82, 93, 82, Y); p.line(85, 84, 95, 84, dith(Y, N));
          p.line(87, 83, 88, 86, K); p.line(90, 83, 91, 86, K); p.line(93, 83, 94, 86, K);
        });

        const open = s.flag("chestOpen");
        if (open) p.obj("chest", 118, () => p.shape([[116, 104], [140, 104], [143, 93], [119, 93]], N));
        if (show("sword")) p.obj("sword", 117, () => {
          p.rect(126, 82, 4, 22, K); p.rect(127, 83, 2, 20, L); p.line(128, 83, 128, 101, Wh);
          p.box(122, 98, 12, 3, Y);
        });
        p.obj("chest", 118, () => {
          p.box(116, 104, 24, 15, N);
          p.rect(117, 109, 22, 1, Y); p.rect(117, 114, 22, 1, Y);
          if (open) p.rect(117, 105, 22, 2, K);
          else { p.box(116, 100, 24, 5, N); p.box(127, 105, 3, 4, Y); }
        });

        p.obj("door", 100, () => door(p, 140, 46, 16, 54, false));
      },
      anim(p, t) {
        const f = Math.floor(t * 8) % 3;
        const h = [0, 3, 1][f];
        p.poly([[17, 95], [20, 80 - h], [24, 88], [27, 74 + h], [30, 86], [34, 79 - h], [36, 95]], R);
        p.poly([[20, 95], [23, 85 + h], [26, 90], [29, 81 - h], [32, 95]], LR);
        p.poly([[23, 95], [26, 88 - h], [29, 95]], Y);
      },
    },

    bridge: {
      floor: { x0: 40, x1: 154, y0: 126, y1: 162 },
      spots: { bridge: [80, 128], wolf: [80, 128], forest: [80, 128], river: [112, 128], village: [42, 152] },
      entry: { outside: [46, 150], start: [46, 150] },
      draw(p, s, show) {
        p.rect(0, 0, W, 56, LB);
        p.rect(0, 46, W, 10, dith(LB, Wh));
        cloud(p, 120, 12, 12); cloud(p, 40, 20, 7);
        mountains(p, [[20, 30], [64, 22], [104, 34], [146, 24]], 56);
        p.rect(0, 58, W, 22, Wh);

        p.obj("forest", 0, () => {
          p.hitRect(0, 36, W, 44);
          for (let x = 4, i = 0; x < W + 6; x += 11, i++) pine(p, x, 78 + (i % 2) * 2, 28 + (i % 3) * 5);
        });
        p.obj("river", 0, () => {
          p.rect(0, 80, W, 40, B);
          p.line(0, 80, W, 80, K);
        });
        p.shape([[0, 120], [28, 117], [62, 119], [100, 116], [130, 119], [W, 117], [W, H], [0, H]], Wh);
        p.oval(110, 150, 20, 2, dith(Wh, L)); p.oval(70, 160, 14, 2, dith(Wh, L));

        p.obj("bridge", 0, () => {
          p.shape([[64, 125], [96, 125], [89, 77], [71, 77]], N);
          for (let y = 81; y < 125; y += 4) {
            const t = (y - 77) / 48;
            p.line(71 - 7 * t + 1, y, 89 + 7 * t - 1, y, K);
          }
          p.line(62, 118, 69, 70, K); p.line(98, 118, 91, 70, K);
          p.line(63, 118, 70, 70, N); p.line(97, 118, 90, 70, N);
          p.box(61, 116, 3, 10, N); p.box(96, 116, 3, 10, N);
        });
        if (show("wolf")) p.obj("wolf", 0, () => p.sprite(73, 88, WOLF, WOLF_MAP));

        p.obj("village", 0, () => {
          p.hitRect(0, 124, 38, 44);
          smallHouse(p, 4, 138, 14, 12);
          smallHouse(p, 21, 146, 12, 10);
          p.shape([[34, 160], [38, 157], [38, 163]], N);
        });
      },
      anim(p, t) {
        for (let i = 0; i < 14; i++) {
          const x = ((i * 37 + t * 6 * (i % 2 ? 1 : -1)) % 170 + 170) % 170 - 5;
          const y = 84 + ((i * 11) % 33);
          if (x > 60 && x < 100 && y < 125) continue;
          p.line(x, y, x + 4, y, i % 3 ? LB : LC);
        }
      },
    },
  };

  function snowfall(p, t) {
    for (let i = 0; i < 30; i++) {
      const x = (i * 53 + Math.sin(t + i) * 3) % W;
      const y = (i * 29 + t * (10 + (i % 4) * 3)) % 120;
      p.pset(x, y, Wh);
    }
  }

  window.PIX = { W, H, Painter, blit, HERO, HERO_MAP, HERO_HEIGHT: HERO[0].length, HERO_WIDTH: 8 };
  window.ART = SCENES;
})();
