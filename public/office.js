// Isometric office view: one desk per agent session, one little person per
// agent, animated by status. Plain canvas 2D, no assets, no dependencies.
(() => {
  'use strict';

  const TW = 64; // tile width in px
  const TH = 32; // tile height in px (one z unit is also TH px)
  const WALL_H = 2.4;
  const LOUNGE_W = 4.2;
  const ACTIVE = new Set(['thinking', 'tool', 'typing']);
  const LOUNGE_MINUTES = 10;

  const SKIN = ['#f3cfb0', '#e5b38f', '#c98d66', '#9a6646', '#6e4630', '#f7dcc7'];
  const HAIR = ['#2a2019', '#4b3020', '#8a4b2a', '#c99a5b', '#1c1c1c', '#8c8c8c', '#a33a2c', '#3d3550'];
  const SHIRT = {
    claude: ['#c96442', '#d9825f', '#b4553a', '#e09a72'],
    codex: ['#10a37f', '#2bb38f', '#0d8a6b', '#4cc3a0'],
  };
  const PANTS = ['#34405a', '#2c2c34', '#4a3f35', '#3b4a3f'];

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const pick = (arr, h, salt) => arr[(Math.imul(h ^ Math.imul(salt, 2654435761), 2246822519) >>> 0) % arr.length];

  function palette() {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? {
      floorA: '#3a3631', floorB: '#36322d', floorLine: 'rgba(0,0,0,.18)',
      wallL: '#4a4640', wallR: '#3f3b36', wallTop: '#5a554e', trim: '#2b2926',
      window: '#2c4a66', windowLight: 'rgba(120,170,230,.10)',
      deskTop: '#8a6a4c', deskL: '#6e533b', deskR: '#5c4431',
      monitor: '#1b1b1d', screenOff: '#26282c',
      chair: '#2d2d32', rug: '#3e4a46', couch: '#5b6b8c', couchD: '#4a587a',
      text: '#ecebe6', tagBg: 'rgba(20,20,19,.78)', bubble: '#f4f3ee', bubbleInk: '#1c1c1a',
      plant: '#4f8a52', pot: '#9a5b3c', shadow: 'rgba(0,0,0,.28)',
    } : {
      floorA: '#e9dcc7', floorB: '#e3d5be', floorLine: 'rgba(120,90,50,.10)',
      wallL: '#f4efe6', wallR: '#e8e1d4', wallTop: '#fbf8f2', trim: '#cfc5b3',
      window: '#bcd9ef', windowLight: 'rgba(255,255,255,.35)',
      deskTop: '#c89f72', deskL: '#a8825a', deskR: '#946f4b',
      monitor: '#2a2a2e', screenOff: '#3a3d44',
      chair: '#4a4a52', rug: '#c9d6cf', couch: '#7d93c4', couchD: '#6a80b0',
      text: '#1c1c1a', tagBg: 'rgba(255,255,255,.88)', bubble: '#ffffff', bubbleInk: '#1c1c1a',
      plant: '#5a9b5d', pot: '#b86f4b', shadow: 'rgba(60,40,20,.18)',
    };
  }

  const STATUS_COLOR = {
    thinking: '#8b6be6', tool: '#3b8ee0', typing: '#22a874', waiting: '#e09412',
    done: '#5f9a4c', error: '#de4b40', interrupted: '#9b9a94', idle: '#9b9a94',
  };

  class Office {
    constructor(root, { onHover, label } = {}) {
      this.root = root;
      this.onHover = onHover || (() => {});
      this.label = label || ((s) => s.project || s.agent);
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'office-canvas';
      root.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.people = new Map();
      this.deskOf = new Map();
      this.sessions = [];
      this.layout = this.makeLayout(4);
      this.cam = null;
      this.hit = [];
      this.hoverKey = null;
      this.first = true;
      this.pal = palette();
      this.visible = true;
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => (this.pal = palette()));

      new ResizeObserver(() => this.resize()).observe(root);
      this.canvas.addEventListener('mousemove', (e) => this.pointer(e));
      this.canvas.addEventListener('click', (e) => this.pointer(e, true));
      this.canvas.addEventListener('mouseleave', () => { this.hoverKey = null; this.onHover(null); });
      this.resize();
      this.last = performance.now();
      const loop = (t) => { this.frame(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }

    // ------------------------------------------------------------ layout

    makeLayout(n) {
      const cols = Math.max(2, Math.min(8, Math.ceil(Math.sqrt(n * 1.3))));
      const rows = Math.max(2, Math.ceil(n / cols));
      const desks = [];
      for (let i = 0; i < cols * rows; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = 1.3 + c * 2.3;
        const y = 1.4 + r * 2.7;
        desks.push({ x, y, seat: { x: x + 0.7, y: y + 1.2 }, stand: { x: x + 1.75, y: y + 0.95 } });
      }
      const officeW = 1.3 + cols * 2.3;
      const W = officeW + LOUNGE_W;
      const D = Math.max(1.4 + rows * 2.7 + 0.4, 7.5);
      const lx = officeW + 0.3;
      const lounge = [];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 2; c++) lounge.push({ x: lx + 0.9 + c * 1.35 + (r % 2) * 0.35, y: 2.3 + r * 1.15 });
      }
      return {
        n: cols * rows, cols, rows, desks, W, D, officeW, lounge,
        door: { x: 0.35, y: D - 1.1 },
        coffee: { x: W - 0.9, y: 0.25 },
      };
    }

    update(sessions) {
      this.sessions = sessions;
      const keys = new Set(sessions.map((s) => s.key));
      const L = this.layout;
      const need = sessions.length;
      if (need > L.n || (L.n > 6 && need < L.n * 0.4)) {
        this.layout = this.makeLayout(Math.max(4, need));
        this.deskOf.clear();
      }
      for (const k of [...this.deskOf.keys()]) if (!keys.has(k)) this.deskOf.delete(k);
      const used = new Set(this.deskOf.values());
      const order = [...sessions].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
      for (const s of order) {
        if (this.deskOf.has(s.key)) continue;
        let i = 0;
        while (used.has(i)) i++;
        this.deskOf.set(s.key, i);
        used.add(i);
      }

      // Recently finished agents hang out in the lounge, oldest first out.
      const now = Date.now();
      const loungers = sessions
        .filter((s) => s.status === 'done' && now - (s.lastEventAt || 0) < LOUNGE_MINUTES * 60_000)
        .sort((a, b) => (b.lastEventAt || 0) - (a.lastEventAt || 0))
        .slice(0, this.layout.lounge.length);
      const loungeSpot = new Map(loungers.map((s, i) => [s.key, this.layout.lounge[i]]));

      for (const s of sessions) {
        let p = this.people.get(s.key);
        const desk = this.layout.desks[this.deskOf.get(s.key)];
        const spot = loungeSpot.get(s.key);
        const pose = spot ? 'lounge' : s.status === 'waiting' || s.status === 'error' ? 'stand' : 'sit';
        const target = spot || (pose === 'stand' ? desk.stand : desk.seat);
        if (!p) {
          const h = hash(s.key);
          p = {
            key: s.key, h,
            skin: pick(SKIN, h, 3), hair: pick(HAIR, h, 7), pants: pick(PANTS, h, 13),
            shirt: pick(SHIRT[s.agent] || SHIRT.claude, h, 11),
            hairStyle: h % 4,
            x: this.first ? target.x : this.layout.door.x,
            y: this.first ? target.y : this.layout.door.y,
            phase: (h % 1000) / 1000 * Math.PI * 2,
          };
          this.people.set(s.key, p);
        }
        p.leaving = false;
        p.s = s;
        p.desk = desk;
        p.pose = pose;
        p.tx = target.x;
        p.ty = target.y;
        if (s.agent && SHIRT[s.agent] && !SHIRT[s.agent].includes(p.shirt)) p.shirt = pick(SHIRT[s.agent], p.h, 11);
      }
      for (const [k, p] of this.people) {
        if (!keys.has(k) && !p.leaving) {
          p.leaving = true;
          p.pose = 'walk';
          p.tx = this.layout.door.x;
          p.ty = this.layout.door.y;
        }
      }
      this.first = false;
    }

    setVisible(v) { this.visible = v; if (v) this.resize(); }

    // ------------------------------------------------------------ camera / input

    resize() {
      const r = this.root.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cw = Math.max(200, r.width);
      this.ch = Math.max(240, r.height);
      this.canvas.width = Math.round(this.cw * dpr);
      this.canvas.height = Math.round(this.ch * dpr);
      this.canvas.style.width = this.cw + 'px';
      this.canvas.style.height = this.ch + 'px';
      this.dpr = dpr;
    }

    fitCamera() {
      const { W, D } = this.layout;
      const P = (x, y, z) => this.iso(x, y, z);
      const left = P(0, D, 0).x, right = P(W, 0, 0).x;
      const top = P(0, 0, WALL_H).y - 30, bottom = P(W, D, 0).y + 20;
      const zoom = Math.min(this.cw / (right - left + 40), this.ch / (bottom - top + 40), 1.8);
      const want = {
        zoom,
        ox: this.cw / 2 - ((left + right) / 2) * zoom,
        oy: this.ch / 2 - ((top + bottom) / 2) * zoom,
      };
      if (!this.cam) this.cam = want;
      else for (const k of ['zoom', 'ox', 'oy']) this.cam[k] += (want[k] - this.cam[k]) * 0.12;
    }

    pointer(e, click) {
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let found = null;
      for (let i = this.hit.length - 1; i >= 0; i--) {
        const h = this.hit[i];
        if (mx >= h.x0 && mx <= h.x1 && my >= h.y0 && my <= h.y1) { found = h; break; }
      }
      const key = found ? found.key : null;
      this.canvas.style.cursor = key ? 'pointer' : 'default';
      if (key !== this.hoverKey || click) {
        this.hoverKey = key;
        const p = key && this.people.get(key);
        this.onHover(p ? p.s : null, { x: e.clientX, y: e.clientY }, !!click);
      }
    }

    iso(x, y, z = 0) {
      return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 - z * TH };
    }

    // ------------------------------------------------------------ drawing primitives

    poly(pts, fill, stroke) {
      const c = this.ctx;
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
    }

    box(x, y, z, w, d, h, top, left, right) {
      const P = (a, b, cc) => this.iso(a, b, cc);
      this.poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], left);
      this.poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], right);
      this.poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top);
    }

    shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
      return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }

    roundRect(x, y, w, h, r, fill, stroke) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
    }

    // ------------------------------------------------------------ room

    drawRoom(t) {
      const { W, D, officeW } = this.layout;
      const pal = this.pal;
      const P = (x, y, z) => this.iso(x, y, z);
      const c = this.ctx;

      // floor
      for (let x = 0; x < Math.ceil(W); x++) {
        for (let y = 0; y < Math.ceil(D); y++) {
          const x1 = Math.min(W, x + 1), y1 = Math.min(D, y + 1);
          this.poly([P(x, y), P(x1, y), P(x1, y1), P(x, y1)], (x + y) % 2 ? pal.floorA : pal.floorB);
        }
      }
      // lounge rug
      this.poly([P(officeW + 0.4, 1.7), P(W - 0.3, 1.7), P(W - 0.3, D - 0.8), P(officeW + 0.4, D - 0.8)], pal.rug);
      // walls
      this.poly([P(0, 0, 0), P(W, 0, 0), P(W, 0, WALL_H), P(0, 0, WALL_H)], pal.wallL);
      this.poly([P(0, 0, 0), P(0, D, 0), P(0, D, WALL_H), P(0, 0, WALL_H)], pal.wallR);
      this.poly([P(0, 0, WALL_H), P(W, 0, WALL_H), P(W, -0.15, WALL_H), P(-0.15, -0.15, WALL_H), P(-0.15, D, WALL_H), P(0, D, WALL_H)], pal.wallTop);
      // baseboards
      this.poly([P(0, 0, 0), P(W, 0, 0), P(W, 0, 0.12), P(0, 0, 0.12)], pal.trim);
      this.poly([P(0, 0, 0), P(0, D, 0), P(0, D, 0.12), P(0, 0, 0.12)], pal.trim);
      // windows on back wall
      for (let x = 1.2; x < W - 1.5; x += 2.6) {
        this.poly([P(x, 0, 0.9), P(x + 1.5, 0, 0.9), P(x + 1.5, 0, 2.0), P(x, 0, 2.0)], pal.window);
        this.poly([P(x + 0.74, 0, 0.9), P(x + 0.76, 0, 0.9), P(x + 0.76, 0, 2.0), P(x + 0.74, 0, 2.0)], pal.trim);
        this.poly([P(x, 0, 1.45), P(x + 1.5, 0, 1.45), P(x + 1.5, 0, 1.48), P(x, 0, 1.48)], pal.trim);
        // light patch on the floor
        this.poly([P(x, 0.1), P(x + 1.5, 0.1), P(x + 1.9, 1.3), P(x + 0.4, 1.3)], pal.windowLight);
      }
      // door on left wall
      const dy = this.layout.door.y;
      this.poly([P(0, dy - 0.55, 0), P(0, dy + 0.55, 0), P(0, dy + 0.55, 1.75), P(0, dy - 0.55, 1.75)], pal.trim);
      this.poly([P(0, dy - 0.48, 0), P(0, dy + 0.48, 0), P(0, dy + 0.48, 1.68), P(0, dy - 0.48, 1.68)], this.shade(pal.deskL, -10));
      // clock on left wall showing real time
      const cc = P(0, 1.2, 1.85);
      c.save();
      c.translate(cc.x, cc.y);
      c.transform(1, -0.5, 0, 1, 0, 0);
      c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fillStyle = pal.bubble; c.fill();
      c.lineWidth = 2; c.strokeStyle = pal.trim; c.stroke();
      const d = new Date();
      const hand = (ang, len, w) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(ang) * len, -Math.cos(ang) * len); c.lineWidth = w; c.strokeStyle = pal.bubbleInk; c.stroke(); };
      hand(((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, 5.5, 2);
      hand((d.getMinutes() / 60) * Math.PI * 2, 8, 1.4);
      c.restore();
      // sign above lounge
      const sp = P(officeW + 2.2, 0, 2.0);
      c.save();
      c.translate(sp.x, sp.y);
      c.transform(1, 0.5, 0, 1, 0, 0);
      c.font = '700 11px ui-sans-serif, system-ui, sans-serif';
      c.fillStyle = this.shade(pal.trim, -40);
      c.textAlign = 'center';
      c.fillText('☕ LOUNGE', 0, 0);
      c.restore();
    }

    // Furniture and people are sorted together by depth (x + y).
    furniture() {
      const pal = this.pal;
      const L = this.layout;
      const items = [];
      const { W, D, officeW } = L;
      // coffee machine + counter
      items.push({ depth: W - 1.2 + 0.6, draw: () => {
        this.box(W - 2.2, 0.15, 0, 2.0, 0.7, 0.85, pal.deskTop, pal.deskL, pal.deskR);
        this.box(W - 1.15, 0.25, 0.85, 0.45, 0.4, 0.55, '#555', '#3a3a3a', '#2e2e2e');
        this.box(W - 1.05, 0.62, 0.95, 0.12, 0.05, 0.12, '#e05a3a', '#c04a2a', '#a03a1a');
        this.box(W - 1.9, 0.3, 0.85, 0.18, 0.18, 0.16, '#fff', '#ddd', '#ccc');
      } });
      // couch
      items.push({ depth: officeW + 1 + D - 0.8, draw: () => {
        const x = officeW + 0.9, y = D - 1.25;
        this.box(x, y, 0, 2.6, 0.75, 0.35, pal.couch, pal.couchD, this.shade(pal.couchD, -12));
        this.box(x, y + 0.55, 0.35, 2.6, 0.2, 0.4, this.shade(pal.couch, 10), pal.couchD, this.shade(pal.couchD, -12));
      } });
      // plants
      for (const [px, py] of [[0.45, 0.45], [officeW + 0.1, 0.45], [W - 0.5, D - 0.5]]) {
        items.push({ depth: px + py, draw: () => this.plant(px, py) });
      }
      // desks
      L.desks.forEach((dk, i) => {
        const occupant = [...this.deskOf.entries()].find(([, v]) => v === i);
        const p = occupant && this.people.get(occupant[0]);
        items.push({ depth: dk.x + 0.7 + dk.y + 0.4, draw: () => this.desk(dk, p) });
        items.push({ depth: dk.seat.x + dk.seat.y - 0.05, draw: () => this.chair(dk, p) });
      });
      return items;
    }

    plant(x, y) {
      const pal = this.pal;
      this.box(x - 0.18, y - 0.18, 0, 0.36, 0.36, 0.3, this.shade(pal.pot, 10), pal.pot, this.shade(pal.pot, -15));
      const c = this.ctx;
      const b = this.iso(x, y, 0.3);
      c.fillStyle = pal.plant;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        c.beginPath();
        c.ellipse(b.x + Math.cos(a) * 6, b.y - 12 + Math.sin(a) * 3, 6, 12, a / 3, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = this.shade(pal.plant, 20);
      c.beginPath(); c.ellipse(b.x, b.y - 18, 5, 9, 0, 0, Math.PI * 2); c.fill();
    }

    desk(dk, p) {
      const pal = this.pal;
      const { x, y } = dk;
      // legs + top
      this.box(x + 0.05, y + 0.05, 0, 0.08, 0.08, 0.72, pal.deskL, pal.deskL, pal.deskR);
      this.box(x + 1.27, y + 0.05, 0, 0.08, 0.08, 0.72, pal.deskL, pal.deskL, pal.deskR);
      this.box(x + 0.05, y + 0.67, 0, 0.08, 0.08, 0.72, pal.deskL, pal.deskL, pal.deskR);
      this.box(x + 1.27, y + 0.67, 0, 0.08, 0.08, 0.72, pal.deskL, pal.deskL, pal.deskR);
      this.box(x, y, 0.72, 1.4, 0.8, 0.07, pal.deskTop, pal.deskL, pal.deskR);
      // monitor
      const mx = x + 0.42, my = y + 0.12, mz = 0.79;
      this.box(mx + 0.22, my + 0.04, mz, 0.1, 0.1, 0.18, pal.monitor, pal.monitor, pal.monitor);
      this.box(mx, my, mz + 0.18, 0.56, 0.08, 0.42, pal.monitor, pal.monitor, this.shade(pal.monitor, 10));
      this.screen(mx + 0.04, my + 0.08, mz + 0.22, 0.48, 0.34, p);
      // keyboard + mug
      this.box(x + 0.48, y + 0.45, 0.79, 0.44, 0.16, 0.025, '#d8d8d8', '#aaa', '#999');
      if (p && p.h % 3 === 0) this.box(x + 1.1, y + 0.3, 0.79, 0.12, 0.12, 0.13, '#f2f2f2', '#d0d0d0', '#bbb');
      // name plate
      if (p && p.s) {
        const c = this.ctx;
        const np = this.iso(x + 0.7, y + 0.8, 0.45);
        c.save();
        c.translate(np.x, np.y);
        c.transform(1, 0.5, 0, 1, 0, 0);
        c.font = '600 7px ui-sans-serif, system-ui, sans-serif';
        c.fillStyle = 'rgba(255,255,255,.75)';
        c.textAlign = 'center';
        c.fillText((p.s.agent === 'claude' ? 'Claude' : 'Codex'), 0, 0);
        c.restore();
      }
    }

    screen(x, y, z, w, h, p) {
      const pal = this.pal;
      const P = (a, b, cc) => this.iso(a, b, cc);
      const st = p && p.s ? p.s.status : 'off';
      const base = {
        thinking: '#3a3160', tool: '#14324f', typing: '#123d2e', waiting: '#4d3510',
        done: '#1f3a1a', error: '#4a1612', interrupted: pal.screenOff, idle: pal.screenOff, off: pal.screenOff,
      }[st] || pal.screenOff;
      const corners = [P(x, y, z), P(x + w, y, z), P(x + w, y, z + h), P(x, y, z + h)];
      this.poly(corners, base);
      if (!p || !p.s || st === 'idle' || st === 'interrupted') return;
      const c = this.ctx;
      c.save();
      c.beginPath();
      corners.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
      c.closePath();
      c.clip();
      const t = this.t / 1000;
      const col = STATUS_COLOR[st];
      if (st === 'tool' || st === 'typing') {
        // scrolling code lines
        const scroll = (t * (st === 'tool' ? 2.2 : 1.2) + p.phase) % 1;
        for (let i = -1; i < 6; i++) {
          const zz = z + h - 0.05 - ((i + scroll) * h) / 5;
          const len = 0.12 + ((p.h >> (i + 8 & 15)) % 7) / 20;
          const a = P(x + 0.05, y, zz), b = P(x + 0.05 + Math.min(len, w - 0.1), y, zz);
          c.strokeStyle = i % 3 === 0 ? col : 'rgba(255,255,255,.55)';
          c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        }
      } else {
        const m = P(x + w / 2, y, z + h / 2);
        c.fillStyle = col;
        c.globalAlpha = st === 'thinking' ? 0.5 + 0.4 * Math.sin(t * 3 + p.phase) : 0.9;
        c.font = '700 10px ui-sans-serif, system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText({ thinking: '…', waiting: '?', done: '✓', error: '!' }[st] || '', m.x, m.y);
      }
      c.restore();
      // glow on desk
      c.save();
      c.globalAlpha = 0.18;
      const g = P(x + w / 2, y + 0.35, 0.8);
      c.fillStyle = col;
      c.beginPath(); c.ellipse(g.x, g.y, 18, 7, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }

    chair(dk, p) {
      const pal = this.pal;
      const sx = dk.seat.x - 0.25, sy = dk.seat.y - 0.2;
      const seated = p && !p.leaving && p.pose === 'sit' && Math.hypot(p.x - p.tx, p.y - p.ty) < 0.05;
      const ox = seated ? 0 : 0.15, oy = seated ? 0 : 0.2;
      this.box(sx + 0.22 + ox, sy + 0.17 + oy, 0, 0.06, 0.06, 0.32, '#222', '#222', '#111');
      this.box(sx + ox, sy + oy, 0.32, 0.5, 0.45, 0.08, this.shade(pal.chair, 15), pal.chair, this.shade(pal.chair, -10));
      if (!seated) this.box(sx + ox, sy + oy + 0.4, 0.4, 0.5, 0.07, 0.5, this.shade(pal.chair, 15), pal.chair, this.shade(pal.chair, -10));
    }

    // ------------------------------------------------------------ people

    person(p) {
      const c = this.ctx;
      const t = this.t / 1000;
      const s = p.s || {};
      const moving = Math.hypot(p.tx - p.x, p.ty - p.y) > 0.05;
      const seated = !moving && p.pose === 'sit';
      const lounging = !moving && p.pose === 'lounge';
      const idle = s.status === 'idle';
      const b = this.iso(p.x, p.y, seated ? 0.34 : 0);
      const front = !seated; // seated people face their monitor (back to us)
      const step = moving ? Math.sin(t * 12 + p.phase) : 0;
      const bob = moving ? Math.abs(step) * 1.5 : lounging ? Math.sin(t * 2 + p.phase) * 0.6 : 0;

      // shadow
      const fb = this.iso(p.x, p.y, 0);
      c.fillStyle = this.pal.shadow;
      c.beginPath(); c.ellipse(fb.x, fb.y, 10, 5, 0, 0, Math.PI * 2); c.fill();
      if (this.hoverKey === p.key) {
        c.strokeStyle = STATUS_COLOR[s.status] || '#888';
        c.lineWidth = 2;
        c.beginPath(); c.ellipse(fb.x, fb.y, 14, 7, 0, 0, Math.PI * 2); c.stroke();
      }

      const x = b.x, y = b.y - bob;
      const sub = s.subagent ? 0.8 : 1;
      c.save();
      c.translate(x, y);
      c.scale(sub, sub);

      // legs
      c.fillStyle = p.pants;
      if (seated) {
        c.fillRect(-5, -4, 4, 5);
        c.fillRect(1, -4, 4, 5);
      } else {
        c.fillRect(-5, -10 + step * 0, 4, 10 + step * 2);
        c.fillRect(1, -10, 4, 10 - step * 2);
        c.fillStyle = '#2a2a2a';
        c.fillRect(-5, -1 + step, 4, 2);
        c.fillRect(1, -1 - step, 4, 2);
      }
      const hip = seated ? -4 : -10;
      // torso
      this.roundRect(-7, hip - 13, 14, 14, 3, p.shirt);
      // arms
      const typingArms = seated && (s.status === 'tool' || s.status === 'typing');
      c.fillStyle = this.shade(p.shirt, -18);
      if (s.status === 'waiting' && !moving) {
        // raised hand
        const wave = Math.sin(t * 8 + p.phase) * 2;
        c.fillRect(6, hip - 26 + wave * 0.3, 3, 14);
        c.fillStyle = p.skin;
        c.beginPath(); c.arc(7.5 + wave * 0.4, hip - 27, 2.4, 0, Math.PI * 2); c.fill();
        c.fillStyle = this.shade(p.shirt, -18);
        c.fillRect(-9, hip - 11, 3, 10);
      } else if (typingArms) {
        const k1 = Math.sin(t * 18 + p.phase) > 0 ? 1 : 0;
        c.fillRect(-9, hip - 11 - k1, 3, 8);
        c.fillRect(6, hip - 11 - (1 - k1), 3, 8);
      } else {
        const sw = moving ? step * 2 : 0;
        c.fillRect(-9, hip - 11 + sw, 3, 10);
        c.fillRect(6, hip - 11 - sw, 3, 10);
      }
      if (lounging && s.status === 'done') {
        // coffee mug
        c.fillStyle = '#fafafa';
        c.fillRect(7, hip - 6, 5, 6);
        c.fillStyle = '#6b3f22';
        c.fillRect(8, hip - 6, 3, 1.5);
        c.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2 + p.phase);
        c.strokeStyle = '#bbb';
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(9.5, hip - 8); c.quadraticCurveTo(12, hip - 11, 9.5, hip - 14); c.stroke();
        c.globalAlpha = 1;
      }
      // head
      const sleepy = idle && seated;
      const hy = hip - 20 + (sleepy ? 6 : 0) + (s.status === 'thinking' && seated ? Math.sin(t * 1.5 + p.phase) * 0.6 : 0);
      c.fillStyle = p.skin;
      c.beginPath(); c.arc(0, hy, 7, 0, Math.PI * 2); c.fill();
      // hair
      c.fillStyle = p.hair;
      if (front) {
        c.beginPath(); c.arc(0, hy - 1.5, 7.3, Math.PI * 1.05, Math.PI * 1.95); c.fill();
        if (p.hairStyle === 1) { c.fillRect(-7.3, hy - 2, 2.5, 8); c.fillRect(4.8, hy - 2, 2.5, 8); }
        if (p.hairStyle === 2) { c.beginPath(); c.arc(0, hy - 8, 3.2, 0, Math.PI * 2); c.fill(); }
        // face
        c.fillStyle = '#2a2018';
        if (idle) {
          c.fillRect(-3.5, hy, 2.5, 1); c.fillRect(1, hy, 2.5, 1);
        } else {
          const blink = Math.sin(t * 0.7 + p.phase * 3) > 0.985;
          c.fillRect(-3, hy - 0.5, 1.6, blink ? 0.6 : 2);
          c.fillRect(1.6, hy - 0.5, 1.6, blink ? 0.6 : 2);
          if (s.status === 'done' || lounging) {
            c.strokeStyle = '#2a2018'; c.lineWidth = 1;
            c.beginPath(); c.arc(0, hy + 2.2, 2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
          }
        }
      } else {
        // back of head
        c.beginPath(); c.arc(0, hy - 0.5, 7.2, 0, Math.PI * 2); c.fill();
        if (p.hairStyle === 2) { c.beginPath(); c.arc(0, hy - 7, 3.2, 0, Math.PI * 2); c.fill(); }
        if (p.hairStyle === 1) { c.fillRect(-6, hy, 12, 8); }
      }
      c.restore();

      const headTop = y + (hy - 8) * sub;
      this.hit.push({ key: p.key, x0: x - 12, x1: x + 12, y0: headTop - 4, y1: fb.y + 4 });
      return { x, y: headTop };
    }

    bubble(p, at) {
      const c = this.ctx;
      const t = this.t / 1000;
      const s = p.s || {};
      const st = s.status;
      const col = STATUS_COLOR[st] || '#888';
      const pal = this.pal;
      const x = at.x, y = at.y - 6;
      c.save();
      c.font = '600 10px ui-sans-serif, system-ui, -apple-system, "PingFang TC", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';

      const pill = (text, fg, bg, yy) => {
        const w = Math.min(130, c.measureText(text).width + 12);
        this.roundRect(x - w / 2, yy - 8, w, 16, 8, bg);
        c.fillStyle = fg;
        let tx = text;
        while (c.measureText(tx).width > w - 10 && tx.length > 2) tx = tx.slice(0, -2) + '…';
        c.fillText(tx, x, yy + 0.5);
        return yy - 8;
      };

      let top = y;
      if (st === 'thinking') {
        // thought cloud
        c.fillStyle = pal.bubble;
        c.beginPath(); c.arc(x + 6, y - 2, 2, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x + 10, y - 7, 3, 0, Math.PI * 2); c.fill();
        this.roundRect(x - 2, y - 26, 32, 16, 8, pal.bubble);
        for (let i = 0; i < 3; i++) {
          c.fillStyle = col;
          c.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(t * 5 - i * 0.7));
          c.beginPath(); c.arc(x + 6 + i * 8, y - 18, 2.4, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
        top = y - 26;
      } else if (st === 'typing') {
        this.roundRect(x - 2, y - 24, 34, 16, 5, col);
        c.beginPath(); c.moveTo(x + 2, y - 9); c.lineTo(x - 2, y - 3); c.lineTo(x + 8, y - 9); c.fillStyle = col; c.fill();
        const n = Math.floor(t * 4) % 4;
        c.fillStyle = '#fff';
        for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + 7 + i * 8, y - 16, 2, 0, Math.PI * 2); c.fill(); }
        top = y - 24;
      } else if (st === 'tool') {
        const tool = (s.activity || 'tool').split(/[:\s]/)[0];
        top = pill('⚙ ' + tool, '#fff', col, y - 12);
      } else if (st === 'waiting' || st === 'error') {
        const jump = Math.abs(Math.sin(t * 4)) * 4;
        c.fillStyle = col;
        c.beginPath(); c.arc(x, y - 12 - jump, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff';
        c.font = '800 12px ui-sans-serif, system-ui, sans-serif';
        c.fillText('!', x, y - 11.5 - jump);
        top = y - 22 - jump;
      } else if (st === 'done') {
        c.fillStyle = col;
        c.beginPath(); c.arc(x, y - 10, 7, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff';
        c.font = '800 9px ui-sans-serif, system-ui, sans-serif';
        c.fillText('✓', x, y - 9.5);
        top = y - 18;
      } else if (st === 'idle') {
        c.fillStyle = col;
        c.font = '700 10px ui-sans-serif, system-ui, sans-serif';
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.6 + i / 3) % 1;
          c.globalAlpha = 1 - k;
          c.fillText('z', x + 6 + k * 10, y - 4 - k * 18);
        }
        c.globalAlpha = 1;
        top = y - 20;
      } else if (st === 'interrupted') {
        c.fillStyle = col;
        c.fillRect(x - 4, y - 14, 8, 8);
        top = y - 16;
      }

      // name tag
      if (!s.subagent || this.hoverKey === p.key) {
        c.font = '600 10px ui-sans-serif, system-ui, -apple-system, "PingFang TC", sans-serif';
        pill(this.label(s), pal.text, pal.tagBg, top - 11);
      }
      c.restore();
    }

    // ------------------------------------------------------------ frame

    frame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t = now;
      if (!this.visible) return;

      for (const [k, p] of this.people) {
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const dist = Math.hypot(dx, dy);
        const v = 2.6 * dt;
        if (dist > v) { p.x += (dx / dist) * v; p.y += (dy / dist) * v; }
        else { p.x = p.tx; p.y = p.ty; if (p.leaving) this.people.delete(k); }
      }

      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.cw, this.ch);
      this.fitCamera();
      c.translate(this.cam.ox, this.cam.oy);
      c.scale(this.cam.zoom, this.cam.zoom);

      this.drawRoom(now);
      const items = this.furniture();
      for (const p of this.people.values()) items.push({ depth: p.x + p.y + 0.01, person: p });
      items.sort((a, b) => a.depth - b.depth);

      this.hit = [];
      const heads = [];
      for (const it of items) {
        if (it.person) heads.push([it.person, this.person(it.person)]);
        else it.draw();
      }
      // Bubbles always on top, sorted back-to-front so front ones win.
      for (const [p, at] of heads) this.bubble(p, at);

      // Hit boxes are in world px; convert to screen px for pointer tests.
      const z = this.cam.zoom;
      this.hit = this.hit.map((h) => ({
        key: h.key,
        x0: h.x0 * z + this.cam.ox, x1: h.x1 * z + this.cam.ox,
        y0: h.y0 * z + this.cam.oy, y1: h.y1 * z + this.cam.oy,
      }));
    }
  }

  window.Office = Office;
})();
