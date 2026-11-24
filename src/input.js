// Side-view controls: keyboard, touch buttons and gamepad. dir = -1 (left) .. 1 (right): drive that
// way (turn around when slow, brake when fast) or spin in the air. Edges ("pressed") last one poll.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.dir = 0;
    this.boost = false;
    this.hopPressed = false;
    this.flash = false; // headlight flash (held)
    this.board = false; // scoreboard (held)
    this.yawDelta = 0;
    this.zoomDelta = 0;
    this.dragging = false;
    this.keys = new Set();
    this.anyInput = false;
    this.gadgetPressed = this.hornPressed = this.resetPressed = this.sightPressed = false;
    this._q = { gadget: false, horn: false, reset: false, sight: false, hop: false };
    this._touch = { boost: false, left: false, right: false };
    this._padPrev = [];
    this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = new Map();
    this.pinchDist = 0;
    this.stickEl = document.getElementById('stick');
    this.knobEl = document.getElementById('stickKnob');

    const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (!e.repeat) {
        if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Enter') this._q.gadget = true;
        if (e.code === 'Space' || e.code === 'KeyK') this._q.hop = true;
        if (e.code === 'KeyH') this._q.horn = true;
        if (e.code === 'KeyR') this._q.reset = true;
        // if (e.code === 'KeyV') this._q.sight = true; // ASCII view off
      }
      this.keys.add(e.code);
      this.anyInput = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this._touch.boost = this._touch.left = this._touch.right = false; this.releaseStick(); this.look.clear(); });

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomDelta += Math.sign(e.deltaY) * 0.1; }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const hold = (id, on) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); on(true); try { el.setPointerCapture(e.pointerId); } catch { /* */ } };
      const up = (e) => { e.preventDefault(); el.classList.remove('down'); on(false); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    hold('btnBoost', (d) => { this._touch.boost = d; });
    hold('btnLeft', (d) => { this._touch.left = d; });
    hold('btnRight', (d) => { this._touch.right = d; });
    hold('btnHop', (d) => { if (d) this._q.hop = true; });
    hold('btnGadget', (d) => { if (d) this._q.gadget = true; });
    hold('btnHorn', (d) => { if (d) this._q.horn = true; });
    hold('btnFlip', (d) => { if (d) this._q.reset = true; });
  }

  onDown(e) {
    this.anyInput = true;
    this.canvas.focus();
    if (false) {
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX; this.stick.oy = e.clientY;
      this.stick.x = this.stick.y = 0;
      this.stickEl.hidden = false;
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.knobEl.style.transform = 'translate(0px, 0px)';
      return;
    }
    this.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.look.size === 2) this.pinchDist = this.lookSpread();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* */ }
  }

  onMove(e) {
    if (e.pointerId === this.stick.id) {
      const R = 56;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.stick.x = dx / R; this.stick.y = -dy / R;
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      return;
    }
    const p = this.look.get(e.pointerId);
    if (!p) return;
    if (this.look.size === 1) this.yawDelta -= (e.clientX - p.x) * (e.pointerType === 'touch' ? 0.009 : 0.006);
    p.x = e.clientX; p.y = e.clientY;
    if (this.look.size === 2) {
      const d = this.lookSpread();
      if (this.pinchDist > 0) this.zoomDelta += (this.pinchDist - d) * 0.006;
      this.pinchDist = d;
    }
  }

  onUp(e) {
    if (e.pointerId === this.stick.id) this.releaseStick();
    this.look.delete(e.pointerId);
    if (this.look.size < 2) this.pinchDist = 0;
  }

  releaseStick() { this.stick.id = -1; this.stick.x = this.stick.y = 0; if (this.stickEl) this.stickEl.hidden = true; }
  lookSpread() { const it = this.look.values(); const a = it.next().value, b = it.next().value; return Math.hypot(a.x - b.x, a.y - b.y); }

  poll(dt) {
    const k = this.keys;
    let dir = 0;
    if (k.has('KeyD') || k.has('ArrowRight') || this._touch.right) dir += 1;
    if (k.has('KeyA') || k.has('ArrowLeft') || this._touch.left) dir -= 1;
    let boost = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyW') || k.has('ArrowUp') || this._touch.boost;
    let flash = k.has('KeyL');
    let board = k.has('Tab');
    if (k.has('Equal') || k.has('NumpadAdd')) this.zoomDelta -= dt * 1.5;
    if (k.has('Minus') || k.has('NumpadSubtract')) this.zoomDelta += dt * 1.5;
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (pads) {
      for (const gp of pads) {
        if (!gp || !gp.connected) continue;
        const gx = Math.abs(gp.axes[0] || 0) < 0.2 ? 0 : gp.axes[0];
        if (gx) dir = gx;
        const b = (i) => !!gp.buttons[i]?.pressed;
        const edge = (i) => b(i) && !this._padPrev[i];
        if (b(14)) dir = -1;
        if (b(15)) dir = 1;
        if ((gp.buttons[7]?.value ?? 0) > 0.3 || b(5)) boost = true;
        if (edge(0)) this._q.hop = true;
        if (edge(2)) this._q.gadget = true;
        if (edge(3)) this._q.horn = true;
        if (edge(9) || edge(1)) this._q.reset = true;
        // if (edge(8)) this._q.sight = true; // ASCII view off
        if (b(4)) flash = true;
        if (b(6)) board = true;
        for (const i of [0, 1, 2, 3, 8, 9]) this._padPrev[i] = b(i);
        if (gx || boost) this.anyInput = true;
        break;
      }
    }
    this.dir = Math.max(-1, Math.min(1, dir)); this.boost = boost; this.flash = flash; this.board = board;
    this.dragging = this.look.size > 0;
    this.gadgetPressed = this._q.gadget; this.hornPressed = this._q.horn; this.resetPressed = this._q.reset; this.sightPressed = this._q.sight; this.hopPressed = this._q.hop;
    this._q.gadget = this._q.horn = this._q.reset = this._q.sight = this._q.hop = false;
  }

  consumeLook() { const v = this.yawDelta; this.yawDelta = 0; return v; }
  consumeZoom() { const v = this.zoomDelta; this.zoomDelta = 0; return v; }
}
