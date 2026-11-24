// A tiny 2D arcade rigid-body engine for the side view (x right, y up). Every body is a compound
// of circles; it collides with the terrain profile, static circles (trees, pillars, rocks), the
// fog walls and other bodies. Impulse-based, 3 substeps per frame.

export const G = -19; // a little heavier than earth: snappy jumps
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

export class Body {
  /** shapes: [[ox, oy, r], ...] in body space (x = forward when facing right). */
  constructor({ mass = 1, shapes = [[0, 0, 0.5]], inertia, restitution = 0.25, friction = 0.6, kind = 'prop', linDamp = 0.02, angDamp = 0.05, buoyant = 0.6 } = {}) {
    this.m = mass;
    this.im = mass > 0 ? 1 / mass : 0;
    const r = shapes[0][2];
    this.I = inertia ?? mass * r * r * 0.5;
    this.iI = this.I > 0 ? 1 / this.I : 0;
    this.shapes = shapes;
    this.bound = Math.max(...shapes.map((s) => Math.hypot(s[0], s[1]) + s[2]));
    this.restitution = restitution;
    this.friction = friction;
    this.kind = kind;
    this.linDamp = linDamp;
    this.angDamp = angDamp;
    this.buoyant = buoyant;
    this.p = [0, 0];
    this.v = [0, 0];
    this.a = 0;
    this.w = 0;
    this.f = [0, 0];
    this.t = 0;
    this.kinematic = false;
    this.enabled = true;
    this.grounded = 0;
    this.lastImpact = 0;
    this.lastHitBy = null;
    this.onContact = null; // (otherBody | null, impactSpeed)
    this.ws = shapes.map(() => [0, 0]);
    this.noBodyCollide = false;
    this.tuck = 0;
  }

  set(x, y, a = this.a) { this.p[0] = x; this.p[1] = y; this.a = a; this.updateShapes(); return this; }
  setShapes(shapes) { this.shapes = shapes; this.ws = shapes.map(() => [0, 0]); this.bound = Math.max(...shapes.map((s) => Math.hypot(s[0], s[1]) + s[2])); this.updateShapes(); }
  updateShapes() {
    const c = Math.cos(this.a), s = Math.sin(this.a);
    for (let i = 0; i < this.shapes.length; i++) {
      const [ox, oy] = this.shapes[i];
      this.ws[i][0] = this.p[0] + c * ox - s * oy;
      this.ws[i][1] = this.p[1] + s * ox + c * oy;
    }
  }
  /** body-space vector -> world */
  toWorld(lx, ly, out) { const c = Math.cos(this.a), s = Math.sin(this.a); out[0] = c * lx - s * ly; out[1] = s * lx + c * ly; return out; }
  addForce(fx, fy) { this.f[0] += fx; this.f[1] += fy; }
  addForceAt(fx, fy, rx, ry) { this.f[0] += fx; this.f[1] += fy; this.t += cross(rx, ry, fx, fy); }
  applyImpulse(jx, jy, rx = 0, ry = 0) {
    if (this.kinematic) return;
    this.v[0] += jx * this.im; this.v[1] += jy * this.im;
    this.w += cross(rx, ry, jx, jy) * this.iI;
  }
  pointVel(rx, ry, out) { out[0] = this.v[0] - this.w * ry; out[1] = this.v[1] + this.w * rx; return out; }
}

/** Static circles bucketed along x (trees, pillars, rocks). */
export class Statics {
  constructor(cell = 6) { this.cell = cell; this.map = new Map(); this.all = []; }
  add(o) {
    for (let i = Math.floor((o.x - o.r) / this.cell); i <= Math.floor((o.x + o.r) / this.cell); i++) {
      let l = this.map.get(i);
      if (!l) this.map.set(i, (l = []));
      l.push(o);
    }
    this.all.push(o);
    return o;
  }
  query(x) { return this.map.get(Math.floor(x / this.cell)); }
}

const _va = [0, 0], _vb = [0, 0];

export class Physics {
  constructor(terrain, { halfW, waterY, pond }) {
    this.terrain = terrain;
    this.statics = new Statics();
    this.halfW = halfW;
    this.waterY = waterY;
    this.pond = pond;
    this.bodies = [];
    this.hooks = []; // fn(h) per substep: car suspension etc.
  }
  add(b) { this.bodies.push(b); b.updateShapes(); return b; }
  remove(b) { const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1); }

  inWater(x, y) { return x > this.pond.x0 && x < this.pond.x1 && y < this.waterY; }

  step(dt) {
    if (!(dt > 1e-5)) return; // paused / duplicate frame: a zero step would divide by zero
    const sub = 3, h = dt / sub, bodies = this.bodies;
    for (const b of bodies) b.lastImpact = 0;
    for (let s = 0; s < sub; s++) {
      for (const fn of this.hooks) fn(h);
      for (const b of bodies) {
        if (!b.enabled || b.kinematic) { b.f[0] = b.f[1] = b.t = 0; continue; }
        let gy = G;
        // water: buoyancy + drag
        if (this.inWater(b.p[0], b.p[1])) {
          const depth = Math.min(1.5, this.waterY - b.p[1]);
          gy += -G * b.buoyant * (0.6 + depth * 0.5);
          b.v[0] *= 1 - h * 1.6; b.v[1] *= 1 - h * 2.2; b.w *= 1 - h * 2;
        }
        b.v[0] += (b.f[0] * b.im) * h;
        b.v[1] += (b.f[1] * b.im + gy) * h;
        b.w += b.t * b.iI * h;
        b.f[0] = b.f[1] = b.t = 0;
        const ld = Math.exp(-b.linDamp * h), ad = Math.exp(-b.angDamp * h);
        b.v[0] *= ld; b.v[1] *= ld; b.w *= ad;
        b.p[0] += b.v[0] * h; b.p[1] += b.v[1] * h; b.a += b.w * h;
        // fog walls
        const W = this.halfW - 1;
        if (b.p[0] > W) { b.p[0] = W; if (b.v[0] > 0) b.v[0] *= -0.4; }
        if (b.p[0] < -W) { b.p[0] = -W; if (b.v[0] < 0) b.v[0] *= -0.4; }
        b.updateShapes();
      }
      for (const b of bodies) if (b.enabled && b.kinematic) b.updateShapes();
      for (const b of bodies) if (b.enabled && !b.kinematic) this.collideWorld(b);
      this.collideBodies();
    }
    // props at rest stay at rest: bleed off the solver's leftover jitter (also keeps the host
    // from re-broadcasting barrels that are only trembling)
    for (const b of bodies) {
      if (!b.enabled || b.kinematic || b.car || !b.grounded) continue;
      if (Math.abs(b.v[0]) + Math.abs(b.v[1]) < 0.35 && Math.abs(b.w) < 0.5) { b.v[0] *= 0.5; b.v[1] *= 0.5; b.w *= 0.5; }
    }
  }

  collideWorld(b) {
    b.grounded = Math.max(0, b.grounded - 1);
    for (let i = 0; i < b.shapes.length; i++) {
      const c = b.ws[i], r = b.shapes[i][2];
      // terrain (cars tuck their colliders in a little: the wheels carry them, not the belly)
      const rt = r - b.tuck;
      const g = this.terrain.height(c[0]);
      if (c[1] - rt < g + 0.5) {
        const n = this.terrain.normal(c[0], _va);
        const pen = rt - (c[1] - g) * n[1];
        if (pen > 0) { this.resolve(b, null, c[0] - n[0] * rt, c[1] - n[1] * rt, n[0], n[1], pen); b.grounded = 3; }
      }
      // static circles
      const list = this.statics.query(c[0]);
      if (list) for (const o of list) {
        if (o.off) continue;
        const dx = c[0] - o.x, dy = c[1] - o.y, d = Math.hypot(dx, dy), R = r + o.r;
        if (d >= R || d < 1e-6) continue;
        if (o.breakable && o.breakable(b)) continue;
        const nx = dx / d, ny = dy / d;
        this.resolve(b, null, o.x + nx * o.r, o.y + ny * o.r, nx, ny, R - d);
        if (ny > 0.6) b.grounded = 3;
      }
    }
  }

  collideBodies() {
    const B = this.bodies, n = B.length;
    for (let i = 0; i < n; i++) {
      const a = B[i];
      if (!a.enabled || a.noBodyCollide) continue;
      for (let j = i + 1; j < n; j++) {
        const b = B[j];
        if (!b.enabled || b.noBodyCollide || (a.kinematic && b.kinematic)) continue;
        const bx = a.p[0] - b.p[0], by = a.p[1] - b.p[1], br = a.bound + b.bound;
        if (bx * bx + by * by > br * br) continue;
        for (let si = 0; si < a.shapes.length; si++) {
          for (let sj = 0; sj < b.shapes.length; sj++) {
            const ca = a.ws[si], cb = b.ws[sj], R = a.shapes[si][2] + b.shapes[sj][2];
            const dx = ca[0] - cb[0], dy = ca[1] - cb[1], d = Math.hypot(dx, dy);
            if (d >= R || d < 1e-6) continue;
            const nx = dx / d, ny = dy / d;
            this.resolve(a, b, cb[0] + nx * b.shapes[sj][2], cb[1] + ny * b.shapes[sj][2], nx, ny, R - d);
          }
        }
      }
    }
  }

  /** Contact between a and b (b = null: the world). Normal points from b to a. */
  resolve(a, b, px, py, nx, ny, pen) {
    const aDyn = !a.kinematic, bDyn = b && !b.kinematic;
    const ima = aDyn ? a.im : 0, imb = bDyn ? b.im : 0;
    const iia = aDyn ? a.iI : 0, iib = bDyn ? b.iI : 0;
    if (ima + imb <= 0) return;
    // positional correction
    const k = Math.max(0, pen - 0.005) * 0.85 / (ima + imb);
    if (aDyn) { a.p[0] += nx * k * ima; a.p[1] += ny * k * ima; a.updateShapes(); }
    if (bDyn) { b.p[0] -= nx * k * imb; b.p[1] -= ny * k * imb; b.updateShapes(); }
    const rax = px - a.p[0], ray = py - a.p[1];
    const rbx = b ? px - b.p[0] : 0, rby = b ? py - b.p[1] : 0;
    a.pointVel(rax, ray, _va);
    if (b) b.pointVel(rbx, rby, _vb); else { _vb[0] = 0; _vb[1] = 0; }
    const rvx = _va[0] - _vb[0], rvy = _va[1] - _vb[1];
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const ran = cross(rax, ray, nx, ny), rbn = cross(rbx, rby, nx, ny);
    const kn = ima + imb + ran * ran * iia + rbn * rbn * iib;
    const e = vn < -2 ? Math.max(a.restitution, b ? b.restitution : 0.15) : 0;
    const j = -(1 + e) * vn / kn;
    // friction
    const tx = -ny, ty = nx;
    const vt = rvx * tx + rvy * ty;
    const rat = cross(rax, ray, tx, ty), rbt = cross(rbx, rby, tx, ty);
    const kt = ima + imb + rat * rat * iia + rbt * rbt * iib;
    const mu = b ? (a.friction + b.friction) * 0.5 : a.friction;
    const jt = Math.max(-mu * j, Math.min(mu * j, -vt / kt));
    const jx = nx * j + tx * jt, jy = ny * j + ty * jt;
    if (aDyn) a.applyImpulse(jx, jy, rax, ray);
    if (bDyn) b.applyImpulse(-jx, -jy, rbx, rby);
    // resting on top of another body counts as standing on something (so a buggy can hop off a log)
    if (b) { if (ny > 0.5) a.grounded = 3; else if (ny < -0.5) b.grounded = 3; }
    const speed = -vn;
    if (speed > a.lastImpact) { a.lastImpact = speed; a.lastHitBy = b; }
    if (b && speed > b.lastImpact) { b.lastImpact = speed; b.lastHitBy = a; }
    if (speed > 1.5) { if (a.onContact) a.onContact(b, speed); if (b && b.onContact) b.onContact(a, speed); }
  }

  /** Radial blast (explosions, the shockwave horn). filter(body) -> bool */
  blast(x, y, radius, power, filter) {
    for (const b of this.bodies) {
      if (!b.enabled || b.kinematic || (filter && !filter(b))) continue;
      const dx = b.p[0] - x, dy = b.p[1] - y, d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const k = 1 - d / radius, inv = d > 0.01 ? 1 / d : 0;
      b.v[0] += dx * inv * power * k;
      b.v[1] += dy * inv * power * k * 0.6 + power * 0.55 * k;
      b.w += (Math.random() - 0.5) * power * 0.6 * k;
    }
  }
}
