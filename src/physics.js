// A tiny arcade rigid-body engine. Every body is a compound of spheres; it collides with the
// terrain heightfield, static vertical cylinders (trees, rocks, pillars) and other bodies.
// Small, allocation-free in the hot loop, and stable enough for flips, barrel rolls and pinballs.

export const G = -19; // a little heavier than earth: snappier jumps
const EDGE = 64; // bodies never leave the glade (the dense rim forest beyond is scenery)

// ------------------------------------------------------------------ vec / quat helpers (arrays)
export const V = {
  cross: (a, b, o) => { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
};
/** rotate v by quaternion q -> o */
export function qrot(q, v, o) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  o[0] = ix * w + iw * -x + iy * -z - iz * -y;
  o[1] = iy * w + iw * -y + iz * -x - ix * -z;
  o[2] = iz * w + iw * -z + ix * -y - iy * -x;
  return o;
}
/** rotate v by the inverse of q -> o */
export function qrotInv(q, v, o) { _qi[0] = -q[0]; _qi[1] = -q[1]; _qi[2] = -q[2]; _qi[3] = q[3]; return qrot(_qi, v, o); }
const _qi = [0, 0, 0, 1];
export function qFromAxisAngle(ax, ay, az, a, o = [0, 0, 0, 1]) { const s = Math.sin(a / 2); o[0] = ax * s; o[1] = ay * s; o[2] = az * s; o[3] = Math.cos(a / 2); return o; }
export function qMul(a, b, o) {
  const x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1];
  const y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0];
  const z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3];
  const w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
  o[0] = x; o[1] = y; o[2] = z; o[3] = w;
  return o;
}

let nextId = 1;
export class Body {
  /**
   * spheres: [[ox, oy, oz, r], ...] in body space. inertia: diagonal [ix, iy, iz] (already scaled by mass).
   */
  constructor({ mass = 1, spheres = [[0, 0, 0, 0.5]], inertia, restitution = 0.25, friction = 0.8, kind = 'prop', linDamp = 0.02, angDamp = 0.08, buoyant = 0.6 } = {}) {
    this.id = nextId++;
    this.kind = kind;
    this.mass = mass;
    this.invMass = mass > 0 ? 1 / mass : 0;
    const r = spheres[0][3];
    const I = inertia || [0.4 * mass * r * r, 0.4 * mass * r * r, 0.4 * mass * r * r];
    this.invI = I.map((v) => (v > 0 ? 1 / v : 0));
    this.spheres = spheres;
    this.bound = Math.max(...spheres.map((s) => Math.hypot(s[0], s[1], s[2]) + s[3]));
    this.restitution = restitution;
    this.friction = friction;
    this.linDamp = linDamp;
    this.angDamp = angDamp;
    this.buoyant = buoyant;
    this.p = [0, 0, 0];
    this.v = [0, 0, 0];
    this.q = [0, 0, 0, 1];
    this.w = [0, 0, 0];
    this.f = [0, 0, 0]; // accumulated force
    this.t = [0, 0, 0]; // accumulated torque
    this.kinematic = false; // remote / scripted: collides but is not simulated
    this.enabled = true;
    this.grounded = 0;
    this.lastImpact = 0; // strongest impact speed this step
    this.lastHitBy = null;
    this.onImpact = null; // (speed, otherBody|null) => void
    this.ws = spheres.map(() => [0, 0, 0]); // world-space sphere centres
  }

  set(x, y, z) { this.p[0] = x; this.p[1] = y; this.p[2] = z; return this; }
  addForce(x, y, z) { this.f[0] += x; this.f[1] += y; this.f[2] += z; }
  addTorque(x, y, z) { this.t[0] += x; this.t[1] += y; this.t[2] += z; }

  /** world inverse inertia applied to vector a -> o */
  iI(a, o) {
    qrotInv(this.q, a, o);
    o[0] *= this.invI[0]; o[1] *= this.invI[1]; o[2] *= this.invI[2];
    return qrot(this.q, o, o);
  }

  /** impulse J (world) at world-relative point r */
  applyImpulse(J, r) {
    if (this.kinematic) return;
    this.v[0] += J[0] * this.invMass; this.v[1] += J[1] * this.invMass; this.v[2] += J[2] * this.invMass;
    V.cross(r, J, _t1);
    this.iI(_t1, _t2);
    this.w[0] += _t2[0]; this.w[1] += _t2[1]; this.w[2] += _t2[2];
  }

  /** velocity of a world-relative point r */
  pointVel(r, o) {
    V.cross(this.w, r, o);
    o[0] += this.v[0]; o[1] += this.v[1]; o[2] += this.v[2];
    return o;
  }

  updateSpheres() {
    for (let i = 0; i < this.spheres.length; i++) {
      qrot(this.q, this.spheres[i], this.ws[i]);
      this.ws[i][0] += this.p[0]; this.ws[i][1] += this.p[1]; this.ws[i][2] += this.p[2];
    }
  }

  /** world-space axis: 0 right, 1 up, 2 forward */
  axis(i, o) { _ax[0] = i === 0 ? 1 : 0; _ax[1] = i === 1 ? 1 : 0; _ax[2] = i === 2 ? 1 : 0; return qrot(this.q, _ax, o); }
}
const _t1 = [0, 0, 0], _t2 = [0, 0, 0], _t3 = [0, 0, 0], _ax = [0, 0, 0];
const _n = [0, 0, 0], _r = [0, 0, 0], _vr = [0, 0, 0], _J = [0, 0, 0], _tan = [0, 0, 0], _q = [0, 0, 0, 1];

/** Solve one contact between body a (and optional body b) at point with normal n (from b to a). */
function contact(a, b, px, py, pz, n, pen, rest, fric) {
  const ra = _r; ra[0] = px - a.p[0]; ra[1] = py - a.p[1]; ra[2] = pz - a.p[2];
  a.pointVel(ra, _vr);
  let rbx = 0, rby = 0, rbz = 0;
  const rb = [0, 0, 0];
  if (b) {
    rbx = px - b.p[0]; rby = py - b.p[1]; rbz = pz - b.p[2];
    rb[0] = rbx; rb[1] = rby; rb[2] = rbz;
    b.pointVel(rb, _t3);
    _vr[0] -= _t3[0]; _vr[1] -= _t3[1]; _vr[2] -= _t3[2];
  }
  const vn = V.dot(_vr, n);
  // positional correction (split by mass)
  const ia = a.kinematic ? 0 : a.invMass, ib = b && !b.kinematic ? b.invMass : 0;
  const wsum = ia + ib;
  if (wsum > 0 && pen > 0) {
    const k = (Math.min(pen, 0.6) * 0.85) / wsum;
    if (ia) { a.p[0] += n[0] * k * ia; a.p[1] += n[1] * k * ia; a.p[2] += n[2] * k * ia; }
    if (ib) { b.p[0] -= n[0] * k * ib; b.p[1] -= n[1] * k * ib; b.p[2] -= n[2] * k * ib; }
  }
  if (vn >= 0) return 0;
  // effective mass along n
  const eff = (body, r, dir) => {
    if (!body || body.kinematic) return 0;
    V.cross(r, dir, _t1);
    body.iI(_t1, _t2);
    V.cross(_t2, r, _t1);
    return body.invMass + V.dot(dir, _t1);
  };
  const denom = eff(a, ra, n) + eff(b, rb, n);
  if (denom <= 0) return 0;
  const e = -vn > 1.5 ? rest : 0; // no jitter-bounce at rest
  const j = (-(1 + e) * vn) / denom;
  _J[0] = n[0] * j; _J[1] = n[1] * j; _J[2] = n[2] * j;
  a.applyImpulse(_J, ra);
  if (b) { _J[0] = -_J[0]; _J[1] = -_J[1]; _J[2] = -_J[2]; b.applyImpulse(_J, rb); }
  // friction
  _tan[0] = _vr[0] - n[0] * vn; _tan[1] = _vr[1] - n[1] * vn; _tan[2] = _vr[2] - n[2] * vn;
  const tl = V.len(_tan);
  if (tl > 1e-4) {
    _tan[0] /= tl; _tan[1] /= tl; _tan[2] /= tl;
    const dt = eff(a, ra, _tan) + eff(b, rb, _tan);
    if (dt > 0) {
      let jt = tl / dt;
      jt = Math.min(jt, fric * j);
      _J[0] = -_tan[0] * jt; _J[1] = -_tan[1] * jt; _J[2] = -_tan[2] * jt;
      a.applyImpulse(_J, ra);
      if (b) { _J[0] = -_J[0]; _J[1] = -_J[1]; _J[2] = -_J[2]; b.applyImpulse(_J, rb); }
    }
  }
  return -vn;
}

export class Physics {
  constructor(world) {
    this.world = world;
    this.bodies = [];
    this.hooks = [];
    this.waterY = world.hf ? 0 : 0;
  }

  add(b) { this.bodies.push(b); return b; }
  remove(b) { const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1); }

  step(dt) {
    const sub = 3;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      // vehicles compute suspension / traction forces every substep (stiff springs stay stable)
      if (this.hooks) for (const fn of this.hooks) fn(h);
      this.substep(h);
      for (const b of this.bodies) { b.f[0] = b.f[1] = b.f[2] = 0; b.t[0] = b.t[1] = b.t[2] = 0; }
    }
  }

  substep(h) {
    const W = this.world;
    const bodies = this.bodies;
    // integrate velocities
    for (const b of bodies) {
      if (!b.enabled || b.kinematic) continue;
      b.lastImpact = 0;
      b.v[0] += (b.f[0] * b.invMass) * h;
      b.v[1] += (b.f[1] * b.invMass + G) * h;
      b.v[2] += (b.f[2] * b.invMass) * h;
      b.iI(b.t, _t2);
      b.w[0] += _t2[0] * h; b.w[1] += _t2[1] * h; b.w[2] += _t2[2] * h;
      // water: drag + a little lift
      if (b.p[1] < W.waterY - 0.1 && Math.hypot(b.p[0] - W.pond.x, b.p[2] - W.pond.z) < W.pond.r + 4) {
        const k = Math.exp(-2.2 * h);
        b.v[0] *= k; b.v[2] *= k; b.v[1] = b.v[1] * k + b.buoyant * 6 * h;
      }
      const ld = Math.exp(-b.linDamp * h), ad = Math.exp(-b.angDamp * h);
      b.v[0] *= ld; b.v[1] *= ld; b.v[2] *= ld;
      b.w[0] *= ad; b.w[1] *= ad; b.w[2] *= ad;
    }
    // integrate positions
    for (const b of bodies) {
      if (!b.enabled || b.kinematic) continue;
      b.p[0] += b.v[0] * h; b.p[1] += b.v[1] * h; b.p[2] += b.v[2] * h;
      // the glade's edge: an invisible, springy fence of fog
      const rr = Math.hypot(b.p[0], b.p[2]);
      if (rr > EDGE) {
        const nx = b.p[0] / rr, nz = b.p[2] / rr, out = b.v[0] * nx + b.v[2] * nz;
        if (out > 0) { b.v[0] -= nx * out * 1.4; b.v[2] -= nz * out * 1.4; }
        b.p[0] = nx * EDGE; b.p[2] = nz * EDGE;
      }
      const wl = V.len(b.w);
      if (wl > 1e-6) {
        qFromAxisAngle(b.w[0] / wl, b.w[1] / wl, b.w[2] / wl, wl * h, _q);
        qMul(_q, b.q, b.q);
        const ql = Math.hypot(b.q[0], b.q[1], b.q[2], b.q[3]);
        b.q[0] /= ql; b.q[1] /= ql; b.q[2] /= ql; b.q[3] /= ql;
      }
      b.updateSpheres();
    }
    for (const b of bodies) if (b.enabled && b.kinematic) b.updateSpheres();
    // terrain + static obstacles
    for (const b of bodies) {
      if (!b.enabled || b.kinematic) continue;
      b.grounded = Math.max(0, b.grounded - 1);
      for (let i = 0; i < b.spheres.length; i++) {
        const c = b.ws[i], r = b.spheres[i][3];
        const gy = W.hf.at(c[0], c[2]);
        if (c[1] - r < gy) {
          W.hf.normal(c[0], c[2], _n);
          const pen = (gy - (c[1] - r)) * _n[1];
          const sp = contact(b, null, c[0] - _n[0] * r, c[1] - _n[1] * r, c[2] - _n[2] * r, _n, pen, b.restitution, b.friction);
          if (sp > b.lastImpact) { b.lastImpact = sp; b.lastHitBy = null; }
          b.grounded = 3;
          b.updateSpheres();
        }
        const list = W.statics.query(c[0], c[2]);
        if (list) {
          for (const o of list) {
            if (o.off) continue;
            if (c[1] - r > o.top) continue;
            const dx = c[0] - o.x, dz = c[2] - o.z;
            const d = Math.hypot(dx, dz);
            if (d >= r + o.r) continue;
            if (o.breakable && o.breakable(b)) continue; // snapped: the car smashes straight through
            // landing on top of a short obstacle (rocks, pillars)
            if (c[1] > o.top - 0.25 && o.top < 50) {
              _n[0] = 0; _n[1] = 1; _n[2] = 0;
              const sp = contact(b, null, c[0], o.top, c[2], _n, o.top - (c[1] - r), b.restitution, b.friction);
              if (sp > b.lastImpact) { b.lastImpact = sp; b.lastHitBy = o; }
            } else {
              _n[0] = d > 1e-4 ? dx / d : 1; _n[1] = 0; _n[2] = d > 1e-4 ? dz / d : 0;
              const sp = contact(b, null, c[0] - _n[0] * r, c[1], c[2] - _n[2] * r, _n, r + o.r - d, b.restitution * 0.6, b.friction);
              if (sp > b.lastImpact) { b.lastImpact = sp; b.lastHitBy = o; }
            }
            b.updateSpheres();
          }
        }
      }
    }
    // body vs body (broadphase on bounding spheres)
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (!a.enabled) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (!b.enabled || (a.kinematic && b.kinematic)) continue;
        const dx = a.p[0] - b.p[0], dy = a.p[1] - b.p[1], dz = a.p[2] - b.p[2];
        const rr = a.bound + b.bound;
        if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
        if (a.ignore === b || b.ignore === a) continue;
        for (let si = 0; si < a.spheres.length; si++) {
          for (let sj = 0; sj < b.spheres.length; sj++) {
            const ca = a.ws[si], cb = b.ws[sj];
            const ra = a.spheres[si][3], rb = b.spheres[sj][3];
            const ex = ca[0] - cb[0], ey = ca[1] - cb[1], ez = ca[2] - cb[2];
            const d = Math.hypot(ex, ey, ez);
            if (d >= ra + rb || d < 1e-5) continue;
            _n[0] = ex / d; _n[1] = ey / d; _n[2] = ez / d;
            // solve with the dynamic one as 'a'
            const A = a.kinematic ? b : a, B = a.kinematic ? a : b;
            if (A === b) { _n[0] = -_n[0]; _n[1] = -_n[1]; _n[2] = -_n[2]; }
            const px = cb[0] + (ex / d) * rb, py = cb[1] + (ey / d) * rb, pz = cb[2] + (ez / d) * rb;
            const rest = Math.max(A.restitution, B.restitution);
            const sp = contact(A, B, px, py, pz, _n, ra + rb - d, rest, Math.min(A.friction, B.friction));
            if (sp > 0.5) {
              if (sp > A.lastImpact) { A.lastImpact = sp; A.lastHitBy = B; }
              if (sp > B.lastImpact) { B.lastImpact = sp; B.lastHitBy = A; }
              if (A.onContact) A.onContact(B, sp);
              if (B.onContact) B.onContact(A, sp);
            }
            A.updateSpheres(); B.updateSpheres();
          }
        }
      }
    }
  }

  /** Radial impulse (explosions, shockwaves). Returns bodies affected. */
  blast(x, y, z, radius, power, filter) {
    const hit = [];
    for (const b of this.bodies) {
      if (!b.enabled || b.kinematic || (filter && !filter(b))) continue;
      const dx = b.p[0] - x, dy = b.p[1] - y, dz = b.p[2] - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      const k = (1 - d / radius) * power;
      const nx = d > 0.01 ? dx / d : 0, nz = d > 0.01 ? dz / d : 0;
      // mostly upward: things fly end-over-end
      b.v[0] += nx * k * 0.8; b.v[2] += nz * k * 0.8; b.v[1] += k * 0.9 + 2;
      b.w[0] += (Math.random() - 0.5) * k * 0.6; b.w[2] += (Math.random() - 0.5) * k * 0.6; b.w[1] += (Math.random() - 0.5) * k * 0.3;
      hit.push([b, 1 - d / radius]);
    }
    return hit;
  }
}
