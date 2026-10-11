// The layout builder. An episode says WHAT is in each room ("the chest, against the back wall, on the right;
// the sword inside the chest"); this puts every prop at a real position on the room's floor, so that:
//   - nothing overlaps and there is space to walk between things,
//   - every thing he must use has a place to stand in front of it,
//   - every such place can be reached from where he enters (checked on a grid).
// It is plain JavaScript on purpose: it runs on the server in the morning (no Godot, no Blender, no GPU)
// and again in the game, which only loads the models at the positions it is given.
//
// Room space: meters; x to the right, y away from the camera (the same as in Blender); origin at the floor
// centre. A prop's footprint is [width along x, depth along y]; its front faces -y (towards the camera).
//
//   layoutScene(shell, objects, catalog) -> { objects: { id: placement }, errors: [], warnings: [], map }
//
// An object: { id, prop, part?, where?, against?, near?, on?, inside?, slot?, interactive? }
//   prop      a catalog prop id, or "@id" for a fixed thing of the room (a bridge): it is not placed
//   where     a zone: back_left back_center back_right middle_left center middle_right front_left front_center
//             front_right, or left_edge right_edge back_edge front_edge
//   against   "back" | "left" | "right": the prop stands against that wall (props with place "wall" always do)
//   near      the id of another object it should be close to
//   on        the id of an object with surface=true it lies on (a table); inside: a container (a chest)
//   slot      a named spot of the shell (the middle of a bridge)
// A placement: { x, y, rot, stand: [x, y], z, parent? }   (rot in degrees about the vertical axis)

const CELL = 0.2;          // grid size for the reachability check
const GAP = 0.4;           // free space kept between props, so he can walk around them
const AGENT = 0.3;         // how far from things the hero's centre stays

const ZONES = {
  back_left: [0, 2], back_center: [1, 2], back_right: [2, 2],
  middle_left: [0, 1], center: [1, 1], middle_right: [2, 1],
  front_left: [0, 0], front_center: [1, 0], front_right: [2, 0],
};
const ZONE_NAMES = [...Object.keys(ZONES), "left_edge", "right_edge", "back_edge", "front_edge"];

function zoneRect(floor, name) {
  const [x0, y0, x1, y1] = floor;
  const w = x1 - x0, h = y1 - y0;
  if (ZONES[name]) {
    const [cx, cy] = ZONES[name];
    return [x0 + (w * cx) / 3, y0 + (h * cy) / 3, x0 + (w * (cx + 1)) / 3, y0 + (h * (cy + 1)) / 3];
  }
  const e = 0.16;
  if (name === "left_edge") return [x0, y0, x0 + w * e, y1];
  if (name === "right_edge") return [x1 - w * e, y0, x1, y1];
  if (name === "back_edge") return [x0, y1 - h * e, x1, y1];
  if (name === "front_edge") return [x0, y0, x1, y0 + h * e];
  return [x0, y0, x1, y1];
}

const overlap = (a, b, pad = 0) =>
  a[0] < b[2] + pad && a[2] > b[0] - pad && a[1] < b[3] + pad && a[3] > b[1] - pad;
const inside = (r, f) => r[0] >= f[0] - 1e-6 && r[1] >= f[1] - 1e-6 && r[2] <= f[2] + 1e-6 && r[3] <= f[3] + 1e-6;
const rectAt = (x, y, w, d) => [x - w / 2, y - d / 2, x + w / 2, y + d / 2];
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function layoutScene(shell, objects, catalog) {
  const errors = [], warnings = [];
  const floor = shell.floor;
  const props = catalog.props || {};
  const placed = {};                 // id -> placement
  const rects = [];                  // footprints on the floor: { id, rect }
  const blocked = (shell.blocked || []).map((r) => r.slice());
  const spawn = shell.spawn || [(floor[0] + floor[2]) / 2, floor[1] + 0.4];
  const walls = shell.walls || {};
  const byId = Object.fromEntries(objects.map((o) => [o.id, o]));

  const free = (rect, selfId, pad = GAP) => {
    const small = Math.max(rect[2] - rect[0], rect[3] - rect[1]) < 0.6;
    if (small) pad = Math.min(pad, 0.12);
    if (blocked.some((b) => overlap(rect, b))) return false;
    if (dist((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2, spawn[0], spawn[1]) < 0.9 + Math.max(rect[2] - rect[0], rect[3] - rect[1]) / 2) return false;
    return !rects.some((r) => r.id !== selfId && overlap(rect, r.rect, r.keepout ? 0 : pad));
  };

  const prop = (o) => (o.prop && !String(o.prop).startsWith("@") ? props[o.prop] : null);

  // ---- objects that are not on the floor: fixed parts of the room, things on or in other things
  const floorObjects = [];
  const attached = [];
  const partsOf = [];
  for (const o of objects) {
    if (o.of) { partsOf.push(o); continue; }       // the door of a house: part of another object
    if (!o.prop) continue;
    if (String(o.prop).startsWith("@")) {
      const fixed = (shell.fixed || []).find((f) => f.id === String(o.prop).slice(1));
      if (!fixed) errors.push(`${o.id}: this room has no fixed thing "${o.prop.slice(1)}"`);
      else placed[o.id] = { fixed: true, id: fixed.id };
      continue;
    }
    if (!props[o.prop]) { errors.push(`${o.id}: there is no prop "${o.prop}" in the catalog`); continue; }
    if (o.on || o.inside) attached.push(o);
    else floorObjects.push(o);
  }

  // ---- place things on the floor: the ones with the most constraints first, big ones before small
  const strict = (o) => (o.slot ? 0 : o.against || (prop(o) && prop(o).wall) ? 1 : o.where ? 2 : 3);
  const area = (o) => { const f = prop(o).footprint; return f[0] * f[1]; };
  floorObjects.sort((a, b) => strict(a) - strict(b) || area(b) - area(a));

  for (const o of floorObjects) {
    const p = prop(o);
    let [fw, fd] = p.footprint;
    const wall = o.against || (p.wall ? "back" : null);
    let rot = 0;
    const edge = (p.place || []).includes("edge");

    // a named slot of the room: exactly there
    if (o.slot) {
      const s = (shell.slots || {})[o.slot];
      if (!s) { errors.push(`${o.id}: the room has no slot "${o.slot}"`); continue; }
      placed[o.id] = { x: s[0], y: s[1], rot: 0, z: 0, footprint: [fw, fd] };
      rects.push({ id: o.id, rect: rectAt(s[0], s[1], fw, fd) });
      continue;
    }

    const zone = o.where && ZONE_NAMES.includes(o.where) ? zoneRect(floor, o.where) : null;
    if (o.where && !zone) warnings.push(`${o.id}: unknown zone "${o.where}"`);
    const near = o.near && placed[o.near] && placed[o.near].x != null ? placed[o.near] : null;

    const candidates = (area_) => {
      const out = [];
      const [zx0, zy0, zx1, zy1] = area_;
      for (let x = zx0 + CELL / 2; x <= zx1; x += CELL) {
        for (let y = zy0 + CELL / 2; y <= zy1; y += CELL) {
          let cx = x, cy = y, w = fw, d = fd, r = 0;
          if (edge && o.where === "right_edge") cx = floor[2] - fw * 0.15;      // an exit: mostly outside the floor
          else if (edge && o.where === "left_edge") cx = floor[0] + fw * 0.15;
          if (wall === "back" && walls.back != null) cy = walls.back - d / 2;
          else if (wall === "left" && walls.left != null) { r = 90; w = fd; d = fw; cx = walls.left + w / 2; }
          else if (wall === "right" && walls.right != null) { r = -90; w = fd; d = fw; cx = walls.right - w / 2; }
          const rect = rectAt(cx, cy, w, d);
          if (!edge && !inside(rect, floor.map((v, i) => v + (i < 2 ? -0.2 : 0.2)))) continue;
          if (edge && !inside(rect, [floor[0] - fw, floor[1] - 0.2, floor[2] + fw, floor[3] + 0.2])) continue;
          out.push({ x: cx, y: cy, rect, w, d, rot: r });
        }
      }
      return out;
    };

    const tryAreas = [];
    if (zone) tryAreas.push(zone);
    tryAreas.push(floor);
    let best = null;
    for (const area_ of tryAreas) {
      const zc = [(area_[0] + area_[2]) / 2, (area_[1] + area_[3]) / 2];
      for (const c of candidates(area_)) {
        if (!free(c.rect, o.id)) continue;
        let score = dist(c.x, c.y, zc[0], zc[1]);
        if (near) score += 2 * Math.max(0, dist(c.x, c.y, near.x, near.y) - 2.2) + 0.3 * dist(c.x, c.y, near.x, near.y);
        // prefer places in front of the camera's middle and not hiding things at the very front
        score += 0.02 * Math.abs(c.x);
        if (!best || score < best.score) best = { ...c, score };
      }
      if (best) {
        if (area_ === floor && zone) warnings.push(`${o.id}: no room in ${o.where}, put elsewhere`);
        break;
      }
    }
    if (!best) {
      errors.push(`${o.id} (${o.prop}): there is no room for it in "${shell.id}"; use fewer or smaller things, or another zone`);
      continue;
    }
    rot = best.rot;
    placed[o.id] = { x: round(best.x), y: round(best.y), rot, z: 0, footprint: [best.w, best.d] };
    rects.push({ id: o.id, rect: best.rect });
    // keep the place to stand in front of it (and of its door, window...) free for the things placed later
    const keep = [o.id, ...partsOf.filter((q) => q.of === o.id).map((q) => q.id)];
    for (const k of keep) {
      if (k !== o.id) placed[k] = { ...placed[o.id], partOf: o.id };
      const st = standFor(k);
      if (st) rects.push({ id: `${k}:stand`, rect: rectAt(st[0], st[1], 0.9, 0.9), keepout: true });
    }
  }

  // ---- things on a surface (a table) or inside a container (a chest)
  const counters = {};
  for (const o of attached) {
    const parentId = o.on || o.inside;
    const parent = placed[parentId];
    const pp = byId[parentId] && prop(byId[parentId]);
    if (!parent || parent.x == null || !pp) { errors.push(`${o.id}: ${o.on ? "on" : "inside"} "${parentId}" which is not placed`); continue; }
    if (o.on && !pp.surface) { errors.push(`${o.id}: "${parentId}" has no surface to put things on`); continue; }
    if (o.inside && !pp.container) { errors.push(`${o.id}: "${parentId}" is not a container`); continue; }
    const n = (counters[parentId] = (counters[parentId] || 0) + 1) - 1;
    const spread = o.on ? (n % 3 - 1) * Math.min(0.45, pp.footprint[0] / 3) : 0;
    placed[o.id] = {
      x: round(parent.x + spread), y: round(parent.y), rot: 0, parent: parentId,
      z: o.on ? pp.surface_height || pp.height : pp.inside_height || pp.height * 0.7,
    };
  }

  for (const o of partsOf) {
    const base = placed[o.of];
    if (!base || base.x == null) { errors.push(`${o.id}: it is a part of "${o.of}" which is not placed`); continue; }
    placed[o.id] = placed[o.id] || { ...base, partOf: o.of };
  }

  // ---- places to stand: in front of each thing, a little to the side when that is taken
  function standFor(id) {
    const pl = placed[id];
    if (!pl) return null;
    if (pl.fixed) {
      // fixed things of the room have their own stand point in the model (stand_<id>)
      return null;
    }
    if (pl.partOf) {
      // the door or window of a placed prop: a spot in front of that part
      const pp = prop(byId[pl.partOf]);
      const part = pp && pp.parts && pp.parts[byId[id].part];
      if (part) {
        const r = rad(pl.rot || 0);
        const lx = part.center[0], ly = part.center[1] - part.size[1] / 2 - 0.6;
        return [round(pl.x + lx * Math.cos(r) - ly * Math.sin(r)), round(pl.y + lx * Math.sin(r) + ly * Math.cos(r))];
      }
    }
    const parent = pl.parent && placed[pl.parent];
    const base = parent || pl;
    const o = byId[parent ? pl.parent : id];
    const p = prop(o);
    if (!p) return null;   // a thing without a prop of its own (a part of something that was not placed)
    const part = byId[id].part && p.parts && p.parts[byId[id].part];
    const dist0 = (p.stand || 0.7);
    const [w, d] = base.footprint || p.footprint;
    const cx = base.x + (part ? part.center[0] * Math.cos(rad(base.rot)) : 0);
    const cy = base.y;
    const tries = [
      [cx, base.y - d / 2 - dist0], [cx - w / 2 - dist0, cy], [cx + w / 2 + dist0, cy],
      [cx, base.y + d / 2 + dist0], [cx - w / 3, base.y - d / 2 - dist0], [cx + w / 3, base.y - d / 2 - dist0],
    ];
    // against the left or right wall: the front faces the room, handled by rotating the offsets
    if (base.rot === 90) tries.unshift([base.x + w / 2 + dist0, cy]);
    if (base.rot === -90) tries.unshift([base.x - w / 2 - dist0, cy]);
    for (const [sx, sy] of tries) {
      const r = rectAt(sx, sy, 0.5, 0.5);
      const inFloor = sx >= floor[0] + 0.1 && sx <= floor[2] - 0.1 && sy >= floor[1] + 0.1 && sy <= floor[3] - 0.1;
      if (!inFloor) continue;
      if (blocked.some((b) => overlap(r, b))) continue;
      if (rects.some((q) => !q.keepout && q.id !== id && q.id !== (pl.parent || "") && overlap(r, q.rect, 0.05))) continue;
      return [round(sx), round(sy)];
    }
    return null;
  }

  for (const o of objects) {
    const pl = placed[o.id];
    if (!pl || pl.fixed) continue;
    const s = standFor(o.id);
    if (s) pl.stand = s;
    else {
      const slots = Object.keys(shell.slots || {});
      errors.push(`${o.id}: no free place to stand in front of it` +
        (o.slot ? ` (the slot "${o.slot}" is too narrow or too crowded for a thing of this size)` : "") +
        `. Put it somewhere else: another zone in "where" (${ZONE_NAMES.slice(0, 9).join(", ")}), or a different slot (${slots.join(", ") || "this room has none"}), ` +
        "or use a smaller prop, or leave it out. Things on a bridge or a narrow strip must be small, because he has to be able to stand next to them.");
    }
  }

  // ---- reachability: a grid of the floor; footprints (made a bit bigger) are walls; walk from the entry
  const gx = Math.ceil((floor[2] - floor[0]) / CELL), gy = Math.ceil((floor[3] - floor[1]) / CELL);
  const cellOf = (x, y) => [Math.floor((x - floor[0]) / CELL), Math.floor((y - floor[1]) / CELL)];
  const solid = new Uint8Array(gx * gy);
  const mark = (rect, pad) => {
    const [ax, ay] = cellOf(rect[0] - pad, rect[1] - pad);
    const [bx, by] = cellOf(rect[2] + pad, rect[3] + pad);
    for (let i = Math.max(0, ax); i <= Math.min(gx - 1, bx); i++) for (let j = Math.max(0, ay); j <= Math.min(gy - 1, by); j++) solid[j * gx + i] = 1;
  };
  for (const r of rects) if (!r.keepout) mark(r.rect, AGENT * 0.5);
  for (const b of blocked) mark(b, 0);
  const seen = new Uint8Array(gx * gy);
  const [sx, sy] = cellOf(spawn[0], spawn[1]);
  const stack = [[Math.min(gx - 1, Math.max(0, sx)), Math.min(gy - 1, Math.max(0, sy))]];
  seen[stack[0][1] * gx + stack[0][0]] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= gx || nj >= gy || seen[nj * gx + ni] || solid[nj * gx + ni]) continue;
      seen[nj * gx + ni] = 1;
      stack.push([ni, nj]);
    }
  }
  const reach = (x, y) => {
    const [i, j] = cellOf(x, y);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const ni = i + di, nj = j + dj;
      if (ni >= 0 && nj >= 0 && ni < gx && nj < gy && seen[nj * gx + ni]) return true;
    }
    return false;
  };
  for (const o of objects) {
    const pl = placed[o.id];
    if (pl && pl.stand && !reach(pl.stand[0], pl.stand[1])) {
      errors.push(`${o.id}: the place to stand in front of it can not be reached from where he comes in`);
    }
  }

  return { objects: placed, errors, warnings, map: { floor, spawn, rects: rects.map((r) => ({ id: r.id, rect: r.rect.map(round) })), blocked, walls } };
}

const rad = (deg) => (deg * Math.PI) / 180;
const round = (v) => Math.round(v * 100) / 100;

module.exports = { layoutScene, ZONE_NAMES, zoneRect };
