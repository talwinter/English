// Where the hero can walk in a picture scene: the floor outline (a polygon, in 320x200 picture pixels).
// Clicks off the floor go to the nearest floor point, and the hero walks around corners of the outline
// instead of through walls. Shared by the game and the tests.

(function (root) {
  // The outline of a scene: scene.walk ([[x, y], ...]) or, for older scenes, the floor band.
  function outline(sc) {
    if (Array.isArray(sc.walk) && sc.walk.length >= 3) return sc.walk.map(([x, y]) => [x, y]);
    const f = sc.floor || { y0: 150, y1: 196 };
    return [[6, f.y0], [314, f.y0], [314, f.y1], [6, f.y1]];
  }

  function inside(poly, x, y) {
    let isIn = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) isIn = !isIn;
    }
    return isIn;
  }

  function centroid(poly) {
    const n = poly.length;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }

  // The closest point on the floor (a point just inside the edge when (x, y) is outside).
  function nearest(poly, x, y) {
    if (inside(poly, x, y)) return [x, y];
    let best = null, bestD = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const px = ax + t * dx, py = ay + t * dy;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bestD) { bestD = d; best = [px, py]; }
    }
    // Step a little toward the middle, so the point is really on the floor.
    const [cx, cy] = centroid(poly);
    for (let k = 1; k <= 20; k++) {
      const len = Math.hypot(cx - best[0], cy - best[1]) || 1;
      const p = [best[0] + ((cx - best[0]) / len) * k, best[1] + ((cy - best[1]) / len) * k];
      if (inside(poly, p[0], p[1])) return p;
    }
    return [cx, cy];
  }

  // Can he walk in a straight line from a to b without leaving the floor?
  function clear(poly, a, b) {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!inside(poly, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
    }
    return true;
  }

  // The points to walk through from `from` to `to` (both on the floor): straight if possible, else around
  // the corners of the outline (shortest way).
  function path(poly, from, to) {
    if (clear(poly, from, to)) return [to];
    // Points just inside each corner of the outline.
    const corners = poly.map(([x, y]) => {
      for (const r of [3, 6]) {
        const around = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]]
          .map(([dx, dy]) => [x + dx * r, y + dy * r]).filter(([px, py]) => inside(poly, px, py));
        if (around.length) return around[0];
      }
      return null;
    }).filter(Boolean);
    const nodes = [from, ...corners, to];
    const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false);
    dist[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === nodes.length - 1) break;
      done[u] = true;
      for (let v = 0; v < nodes.length; v++) {
        if (done[v] || !clear(poly, nodes[u], nodes[v])) continue;
        const d = dist[u] + Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1]);
        if (d < dist[v]) { dist[v] = d; prev[v] = u; }
      }
    }
    if (dist[nodes.length - 1] === Infinity) return [to]; // should not happen; walk straight
    const out = [];
    for (let i = nodes.length - 1; i > 0; i = prev[i]) out.unshift(nodes[i]);
    return out;
  }

  const API = { outline, inside, nearest, path, clear };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Walk = API;
})(this);
