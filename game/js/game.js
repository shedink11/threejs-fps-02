// IRONLINE — Tactical Strike. A Counter-Strike-STYLE round-based 5v5 tactical FPS.
// Original map, art, names and sounds. Three.js r160, fully offline, static files.
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const choice = arr => arr[Math.floor(Math.random() * arr.length)];
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const params = new URLSearchParams(location.search);
const SELFTEST = params.has('selftest');
const AUTOSTART = params.has('auto') || SELFTEST;

// ---------------------------------------------------------------- audio (synthesised, no assets)
const AudioSys = {
  ctx: null,
  init() { try { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) {} },
  tone(freq, dur, type = 'sine', vol = 0.12, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, freq = 1800, q = 0.8) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.ctx.destination); src.start(t);
  },
  shot(w) {
    if (w.id === 'sniper') { this.noise(0.28, 0.5, 900, 0.5); this.tone(140, 0.18, 'sawtooth', 0.16); }
    else if (w.id === 'shotgun') { this.noise(0.22, 0.45, 700, 0.6); this.tone(110, 0.15, 'sawtooth', 0.14); }
    else if (w.id === 'rifle') { this.noise(0.11, 0.32, 1600, 0.7); this.tone(190, 0.07, 'square', 0.06); }
    else if (w.id === 'smg') { this.noise(0.08, 0.24, 2100, 0.7); }
    else { this.noise(0.09, 0.28, 1400, 0.8); this.tone(320, 0.05, 'square', 0.05); }
  },
  hit() { this.tone(1200, 0.06, 'sine', 0.12); },
  kill() { this.tone(880, 0.09, 'sine', 0.14); this.tone(1320, 0.12, 'sine', 0.14, 0.08); },
  hurt() { this.tone(180, 0.12, 'sawtooth', 0.1); },
  reload() { this.tone(500, 0.05, 'square', 0.06); this.tone(700, 0.05, 'square', 0.06, 0.12); },
  beep(f = 1000) { this.tone(f, 0.09, 'sine', 0.14); },
  plantTick() { this.tone(1500, 0.05, 'sine', 0.1); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.14, i * 0.13)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, i * 0.14)); },
  click() { this.tone(900, 0.04, 'square', 0.06); },
};

// ---------------------------------------------------------------- weapons
const WEAPONS = {
  sidearm: { id: 'sidearm', name: 'P9 Sidearm', price: 0, damage: 34, headMult: 2, rpm: 320, mag: 12, reserve: 36, auto: false, spread: 0.012, adsSpread: 0.005, range: 42, reload: 1.05, zoom: 1, reward: 300 },
  smg:     { id: 'smg', name: 'VK-9 SMG', price: 1500, damage: 26, headMult: 2, rpm: 780, mag: 30, reserve: 90, auto: true, spread: 0.021, adsSpread: 0.009, range: 30, reload: 1.5, zoom: 1, reward: 300 },
  shotgun: { id: 'shotgun', name: 'M590 Breacher', price: 1800, damage: 10, pellets: 8, headMult: 2, rpm: 72, mag: 6, reserve: 24, auto: false, spread: 0.055, adsSpread: 0.032, range: 17, reload: 2.3, zoom: 1, reward: 300 },
  rifle:   { id: 'rifle', name: 'AR-77 Rifle', price: 2900, damage: 33, headMult: 4, rpm: 600, mag: 30, reserve: 90, auto: true, spread: 0.014, adsSpread: 0.004, range: 62, reload: 1.9, zoom: 1.15, reward: 300 },
  sniper:  { id: 'sniper', name: 'LW-50 Longshot', price: 4750, damage: 88, headMult: 4, rpm: 48, mag: 5, reserve: 15, auto: false, spread: 0.003, adsSpread: 0.0006, range: 130, reload: 2.7, zoom: 2.4, reward: 300 },
};
const ARMOR = { id: 'armor', name: 'Kevlar Vest', price: 650 };

// ---------------------------------------------------------------- map: boxes [x, z, w, d, h, color]
const MAP = {
  bounds: { x: 30, z: 22 },
  sites: { A: { x: -22, z: -13, r: 5 }, B: { x: 22, z: -13, r: 5 } },
  spawnAtk: { x: 0, z: 19 }, spawnDef: { x: 0, z: -19 },
  boxes: [
    // perimeter walls
    [-30.5, 0, 1, 46, 5, 0x3d4a58], [30.5, 0, 1, 46, 5, 0x3d4a58],
    [0, -22.5, 62, 1, 5, 0x3d4a58], [0, 22.5, 62, 1, 5, 0x3d4a58],
    // site A cover
    [-24, -15.5, 2.6, 2.6, 1.4, 0x8a6d3b], [-19, -11, 2, 2, 2.6, 0x5d7a52],
    [-22, -8.5, 3.2, 1.4, 1.2, 0x7a6a55], [-25.5, -11.5, 1.6, 3.4, 2.4, 0x6b5d4f],
    [-17.5, -16.5, 3, 1.6, 1.3, 0x8a6d3b],
    // site B cover
    [24, -15.5, 2.6, 2.6, 1.4, 0x8a6d3b], [19, -11, 2, 2, 2.6, 0x5d7a52],
    [22, -8.5, 3.2, 1.4, 1.2, 0x7a6a55], [25.5, -11.5, 1.6, 3.4, 2.4, 0x6b5d4f],
    [17.5, -16.5, 3, 1.6, 1.3, 0x8a6d3b],
    // long-lane blocks
    [-26.5, 6, 2, 6, 2.2, 0x4a5d6b], [26.5, 6, 2, 6, 2.2, 0x4a5d6b],
    [-26.5, -4, 2, 5, 2.2, 0x4a5d6b], [26.5, -4, 2, 5, 2.2, 0x4a5d6b],
    // mid crates
    [-3, 0, 2.2, 2.2, 1.5, 0x8a6d3b], [3, 3.5, 2.2, 2.2, 1.5, 0x5d7a52],
    [0, -4.5, 3.2, 1.6, 2.2, 0x7a6a55],
    // containers
    [-10, 10, 6, 2.6, 2.6, 0x8a3b3b], [10, 10, 6, 2.6, 2.6, 0x3b5a8a],
    [-12, -2, 2.6, 5, 2.6, 0x5d7a52], [12, -2, 2.6, 5, 2.6, 0x5d7a52],
    // centre silo block + spawn cover (silo kept off the attacker spawn sightline)
    [-14, 13.5, 3, 2, 2.6, 0x6b6f75], [-6, 16.5, 3, 2, 1.4, 0x8a6d3b],
    [6, 16.5, 3, 2, 1.4, 0x8a6d3b], [-6, -16.5, 3, 2, 1.4, 0x8a6d3b],
    [6, -16.5, 3, 2, 1.4, 0x8a6d3b],
    // connector walls
    [-14, -12, 1.6, 6, 3, 0x4a5d6b], [14, -12, 1.6, 6, 3, 0x4a5d6b],
    [-14, 4, 1.6, 5, 2.4, 0x6b5d4f], [14, 4, 1.6, 5, 2.4, 0x6b5d4f],
  ],
};
// waypoint graph [x, z]
const WP = [
  [0, 19], [-8, 15], [8, 15], [-25, 12], [25, 12], [-25, 2], [25, 2], [-25, -9],
  [25, -9], [-22, -13], [22, -13], [0, 9], [0, 1], [0, -8], [-13, -9], [13, -9],
  [0, -16], [-12, -16], [12, -16], [-15, 5], [15, 5], [-22, -18], [22, -18],
  [-6, 16], [6, 16], [0, 15],
];
const WEDGES = {
  0: [1, 2, 23, 24, 25], 1: [0, 3, 11, 19, 25], 2: [0, 4, 11, 20, 25],
  3: [1, 5], 4: [2, 6], 5: [3, 7, 19], 6: [4, 8, 20], 7: [5, 9, 14],
  8: [6, 10, 15], 9: [7, 14, 21], 10: [8, 15, 22], 11: [1, 2, 12, 19, 20],
  12: [11, 13, 14, 15], 13: [12, 14, 15, 16], 14: [7, 9, 12, 13, 17],
  15: [8, 10, 12, 13, 18], 16: [13, 17, 18], 17: [14, 16, 21],
  18: [15, 16, 22], 19: [1, 5, 11], 20: [2, 6, 11], 21: [9, 17],
  22: [10, 18], 23: [0, 1], 24: [0, 2], 25: [0, 1, 2],
};
function nearestWP(x, z) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < WP.length; i++) {
    const dx = WP[i][0] - x, dz = WP[i][1] - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WP.length).fill(-1), q = [from];
  prev[from] = from;
  while (q.length) {
    const n = q.shift();
    for (const m of WEDGES[n]) {
      if (prev[m] === -1) { prev[m] = n; if (m === to) { const p = [to]; let c = to; while (c !== from) { c = prev[c]; p.unshift(c); } return p; } q.push(m); }
    }
  }
  return [to];
}

// ---------------------------------------------------------------- game state
const TEAMS = {
  VAN: { name: 'Vanguard', short: 'VAN', color: 0x3f8cff, css: '#6db3ff' },
  RAI: { name: 'Raiders', short: 'RAI', color: 0xff5a45, css: '#ff7a6b' },
};
const BOT_NAMES = {
  VAN: ['Falcon', 'Bishop', 'Havoc', 'Nomad'],
  RAI: ['Viper', 'Ghost', 'Reaper', 'Sable', 'Onyx'],
};
const ROUND_TIME = 100, BUY_TIME = 12, SPIKE_TIME = 35, PLANT_TIME = 3, DEFUSE_TIME = 5;
const WIN_ROUNDS = 8, MAX_ROUNDS = 15;

const G = {
  phase: 'menu', // menu | buy | live | roundEnd | matchEnd
  round: 1, score: { VAN: 0, RAI: 0 },
  timer: 0, buyTimer: 0, endTimer: 0,
  spike: { state: 'carried', carrier: null, x: 0, z: 0, site: null, timer: 0, plantProgress: 0, defuseProgress: 0, defuser: null },
  lossStreak: { VAN: 0, RAI: 0 },
  attackTeam: 'VAN', // swaps after round 7
  players: [], // {isPlayer, name, team, hp, armor, alive, money, weapons, cur, ammo, ...}
  killfeed: [],
  stats: [],
  roundLog: [],
  selftestDone: false,
  spectateIdx: 0,
};

function teamOf(p) { return TEAMS[p.team]; }
function attackers() { return G.players.filter(p => p.team === G.attackTeam && p.alive); }
function defenders() { return G.players.filter(p => p.team !== G.attackTeam && p.alive); }
function playerObj() { return G.players[0]; }

// ---------------------------------------------------------------- three.js scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = false;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a6c4);
scene.fog = new THREE.Fog(0x87a6c4, 55, 130);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 300);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x4a4238, 1.5));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
sun.position.set(30, 50, 20);
scene.add(sun);

// ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(70, 54),
  new THREE.MeshLambertMaterial({ color: 0x8a8578 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
// ground grid lines (subtle, yard markings)
{
  const grid = new THREE.GridHelper(62, 31, 0x555045, 0x5d584d);
  grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.35;
  scene.add(grid);
}

// colliders: {x0,x1,z0,z1,h}
const colliders = [];
const wallMeshes = [];
function addBox(x, z, w, d, h, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h / 2, z);
  scene.add(m);
  colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
  wallMeshes.push(m);
  return m;
}
MAP.boxes.forEach(b => addBox(b[0], b[1], b[2], b[3], b[4], b[5]));

// site markers: painted ground rings + floating letters
const siteMeshes = {};
for (const [key, s] of Object.entries(MAP.sites)) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(s.r - 0.5, s.r, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.04, s.z);
  scene.add(ring);
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#ffd21f'; cx.font = 'bold 84px Arial'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText(key, 64, 70);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
  spr.scale.set(4, 4, 1); spr.position.set(s.x, 5.2, s.z);
  scene.add(spr);
  siteMeshes[key] = { ring, sprite: spr };
}
// spike visual
const spikeMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.3, 0.7),
  new THREE.MeshLambertMaterial({ color: 0xffd21f, emissive: 0x8a6d00 })
);
spikeMesh.visible = false;
scene.add(spikeMesh);

// ---------------------------------------------------------------- tracers & sparks
const tracers = [];
function spawnTracer(from, to, color = 0xffe9a8) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(line);
  tracers.push({ line, life: 0.09 });
}
const sparks = [];
function spawnSparks(pos, color = 0xffc861, n = 8) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.09),
      new THREE.MeshBasicMaterial({ color })
    );
    m.position.copy(pos);
    scene.add(m);
    sparks.push({ m, vx: rand(-3, 3), vy: rand(0, 3), vz: rand(-3, 3), life: rand(0.25, 0.5) });
  }
}
function updateFx(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.life -= dt;
    if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); tracers.splice(i, 1); }
    else t.line.material.opacity = t.life / 0.09;
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.life -= dt;
    if (s.life <= 0) { scene.remove(s.m); sparks.splice(i, 1); continue; }
    s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
    s.vy -= 9 * dt;
  }
}

// ---------------------------------------------------------------- collision
function collide(pos, r, y = 0) {
  // axis-separated AABB resolve for a circle of radius r at ground level
  for (const c of colliders) {
    if (y > c.h - 0.01) continue;
    const nx = clamp(pos.x, c.x0, c.x1), nz = clamp(pos.z, c.z0, c.z1);
    const dx = pos.x - nx, dz = pos.z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      } else {
        // centre inside box: push out along smallest penetration
        const pl = pos.x - c.x0, pr = c.x1 - pos.x, pt = pos.z - c.z0, pb = c.z1 - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.x0 - r; else if (m === pr) pos.x = c.x1 + r;
        else if (m === pt) pos.z = c.z0 - r; else pos.z = c.z1 + r;
      }
    }
  }
  pos.x = clamp(pos.x, -MAP.bounds.x + 0.6, MAP.bounds.x - 0.6);
  pos.z = clamp(pos.z, -MAP.bounds.z + 0.6, MAP.bounds.z - 0.6);
}
const _ray = new THREE.Raycaster();
function losBlocked(ax, ay, az, bx, by, bz) {
  const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const dist = dir.length();
  if (dist < 0.01) return false;
  dir.normalize();
  _ray.set(new THREE.Vector3(ax, ay, az), dir);
  _ray.far = dist;
  return _ray.intersectObjects(wallMeshes, false).length > 0;
}

// ---------------------------------------------------------------- viewmodel gun
const viewGun = new THREE.Group();
{
  const dark = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const mid = new THREE.MeshLambertMaterial({ color: 0x3a4048 });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
  barrel.position.set(0, -0.02, -0.45);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.42), mid);
  body.position.set(0, -0.03, -0.12);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.1), dark);
  grip.position.set(0, -0.14, 0.02); grip.rotation.x = 0.3;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), dark);
  mag.position.set(0, -0.14, -0.14); mag.rotation.x = 0.12;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), dark);
  sight.position.set(0, 0.06, -0.2);
  viewGun.add(barrel, body, grip, mag, sight);
  viewGun.position.set(0.22, -0.22, -0.35);
  camera.add(viewGun);
  scene.add(camera);
}
let gunKick = 0, gunBob = 0;

// ---------------------------------------------------------------- entities
function makeNameSprite(text, colorCss) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 56;
  const cx = cv.getContext('2d');
  cx.font = 'bold 30px Arial'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.shadowColor = '#000'; cx.shadowBlur = 6;
  cx.fillStyle = colorCss; cx.fillText(text, 128, 28);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(2.4, 0.53, 1);
  return spr;
}
function makeAgentMesh(team, name) {
  const g = new THREE.Group();
  const col = TEAMS[team].color;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.75, 4, 10),
    new THREE.MeshLambertMaterial({ color: col })
  );
  body.position.y = 0.95;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xd9b48f })
  );
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: col })
  );
  helmet.position.y = 1.64;
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.1, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x1c1f24 })
  );
  gun.position.set(0.25, 1.15, 0.35);
  const label = makeNameSprite(name, TEAMS[team].css);
  label.position.y = 2.15;
  g.add(body, head, helmet, gun, label);
  return { group: g, body, head, label };
}
function newAgent(isPlayer, name, team) {
  const mesh = makeAgentMesh(team, name);
  scene.add(mesh.group);
  const a = {
    isPlayer, name, team,
    pos: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: 0,
    hp: 100, armor: 0, alive: true,
    money: 800, weapons: { sidearm: { mag: 12, reserve: 36 } }, cur: 'sidearm',
    kills: 0, deaths: 0, damage: 0,
    mesh, speed: 0, moving: false, crouched: false,
    // bot brain
    path: [], pathIdx: 0, goal: null, goalSite: null,
    state: 'move', target: null, reactT: 0, burstLeft: 0, burstT: 0, shootCd: 0,
    strafeDir: 1, strafeT: 0, holdPos: null, lastSeen: 0, plantT: 0,
    // player shooting
    bloom: 0, fireCd: 0, reloadT: 0, ads: false, lastShot: 0,
    spawnProt: 0,
  };
  mesh.body.userData.agent = a; mesh.body.userData.part = 'body';
  mesh.head.userData.agent = a; mesh.head.userData.part = 'head';
  return a;
}
function buildRoster() {
  // clear old meshes
  for (const p of G.players) scene.remove(p.mesh.group);
  G.players = [];
  G.players.push(newAgent(true, 'You', 'VAN'));
  for (const n of BOT_NAMES.VAN) G.players.push(newAgent(false, n, 'VAN'));
  for (const n of BOT_NAMES.RAI) G.players.push(newAgent(false, n, 'RAI'));
  if (SELFTEST) playerObj().isPlayer = false; // bot drives the "player" slot in self-test
}
function hitMeshes() {
  const arr = [];
  for (const p of G.players) if (p.alive) arr.push(p.mesh.body, p.mesh.head);
  return arr;
}

// ---------------------------------------------------------------- input
const keys = {};
let mouseDown = false, mouseDownR = false, pointerLocked = false;
addEventListener('keydown', e => {
  if (e.code === 'Tab') { e.preventDefault(); showScoreboard(true); }
  keys[e.code] = true;
  if (e.code === 'KeyB' && G.phase === 'buy') toggleBuy();
  if (e.code === 'KeyR') tryReload(playerObj());
  if (G.phase !== 'buy') {
    if (e.code === 'Digit1') switchWeapon(playerObj(), 'primary');
    if (e.code === 'Digit2') switchWeapon(playerObj(), 'sidearm');
  }
  if (e.code === 'Escape' && G.phase !== 'menu' && G.phase !== 'matchEnd' && !SELFTEST) pauseGame(true);
  if (G.phase === 'buy') {
    const map = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'sniper', Digit5: 'armor', Digit6: 'sidearm' };
    // note: Digit1/2 also switch weapons; buying takes precedence during buy phase
    if (map[e.code]) buyItem(map[e.code]);
  }
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Tab') showScoreboard(false);
});
addEventListener('mousemove', e => {
  const p = playerObj();
  if (!p || !p.isPlayer || !pointerLocked || !p.alive) return;
  if (G.phase !== 'live') return;
  const sens = p.ads ? 0.0009 : 0.0016;
  p.yaw -= e.movementX * sens;
  p.pitch = clamp(p.pitch - e.movementY * sens, -1.45, 1.45);
});
renderer.domElement.addEventListener('mousedown', e => {
  const p = playerObj();
  if (!p || !p.isPlayer) return;
  if (G.phase === 'live' && p.alive) {
    if (!pointerLocked) { lockPointer(); return; }
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) { mouseDownR = true; p.ads = true; }
  }
});
addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) { mouseDownR = false; const p = playerObj(); if (p) p.ads = false; }
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && G.phase === 'live' && playerObj().isPlayer && playerObj().alive && !SELFTEST) pauseGame(true);
});
function lockPointer() {
  try { renderer.domElement.requestPointerLock(); } catch (e) {}
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- combat helpers
function weaponOf(a) { return WEAPONS[a.cur]; }
function hasPrimary(a) { return Object.keys(a.weapons).some(k => k !== 'sidearm'); }
function primaryId(a) { return Object.keys(a.weapons).find(k => k !== 'sidearm') || null; }
function switchWeapon(a, which) {
  if (!a.alive) return;
  if (which === 'primary') { const p = primaryId(a); if (p) { a.cur = p; a.reloadT = 0; } }
  else if (a.weapons.sidearm) { a.cur = 'sidearm'; a.reloadT = 0; }
  if (a.isPlayer) AudioSys.click();
}
function tryReload(a) {
  if (!a.alive || a.reloadT > 0) return;
  const w = weaponOf(a), st = a.weapons[a.cur];
  if (!st || st.mag >= w.mag || st.reserve <= 0) return;
  a.reloadT = w.reload;
  if (a.isPlayer) AudioSys.reload();
}
function applyDamage(victim, dmg, attacker, isHead, wname) {
  if (!victim.alive) return;
  let rem = dmg;
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, rem * 0.5);
    victim.armor -= absorbed; rem -= absorbed;
  }
  victim.hp -= rem;
  if (attacker) attacker.damage += Math.round(dmg);
  if (victim.isPlayer) { AudioSys.hurt(); flashDamage(); }
  if (victim.hp <= 0) killAgent(victim, attacker, isHead, wname);
}
function killAgent(victim, attacker, isHead, wname) {
  victim.hp = 0; victim.alive = false; victim.deaths++;
  victim.mesh.group.visible = false;
  if (attacker && attacker !== victim) {
    attacker.kills++;
    attacker.money += 300;
    addKillfeed(attacker, victim, wname, isHead);
    if (attacker.isPlayer) { AudioSys.kill(); showHitmarker(true); }
  }
  if (victim.isPlayer) { document.exitPointerLock && document.exitPointerLock(); }
  // spike drops
  if (G.spike.state === 'carried' && G.spike.carrier === victim) {
    G.spike.state = 'dropped';
    G.spike.x = victim.pos.x; G.spike.z = victim.pos.z;
    G.spike.carrier = null;
    spikeMesh.visible = true;
    spikeMesh.position.set(G.spike.x, 0.2, G.spike.z);
  }
  checkRoundEnd();
}
function addKillfeed(a, v, wname, isHead) {
  const kf = $('killfeed');
  const div = document.createElement('div');
  div.innerHTML = `<span class="${a.team === 'VAN' ? 'van' : 'rai'}">${a.name}</span> <span class="wpn">${isHead ? '◉ ' : ''}${wname || ''}</span> <span class="${v.team === 'VAN' ? 'van' : 'rai'}">${v.name}</span>`;
  kf.prepend(div);
  while (kf.children.length > 5) kf.removeChild(kf.lastChild);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
}
let dmgFlashT = 0;
function flashDamage() { dmgFlashT = 0.35; }
function showHitmarker(isKill) {
  const hm = $('hitmarker');
  hm.style.opacity = 1;
  hm.className = isKill ? 'kill' : '';
  setTimeout(() => { hm.style.opacity = 0; }, 120);
}

// player shooting (hitscan raycast)
function playerShoot(p, dt) {
  const w = weaponOf(p);
  const st = p.weapons[p.cur];
  if (p.reloadT > 0 || !st) return;
  if (st.mag <= 0) { tryReload(p); return; }
  const interval = 60 / w.rpm;
  if (performance.now() / 1000 - p.lastShot < interval) return;
  p.lastShot = performance.now() / 1000;
  st.mag--;
  AudioSys.shot(w);
  gunKick = 1;
  p.bloom = Math.min(p.bloom + (w.id === 'sniper' ? 0.35 : w.id === 'rifle' ? 0.16 : 0.1), 1);
  const pellets = w.pellets || 1;
  const muzzle = new THREE.Vector3();
  camera.getWorldPosition(muzzle);
  for (let i = 0; i < pellets; i++) {
    const spread = (p.ads ? w.adsSpread : w.spread) * (1 + p.bloom * 1.6) * (p.moving ? 1.7 : 1) * (p.crouched ? 0.75 : 1);
    const dir = new THREE.Vector3(rand(-spread, spread), rand(-spread, spread), -1).applyQuaternion(camera.quaternion).normalize();
    _ray.set(muzzle, dir); _ray.far = 200;
    const targets = [...hitMeshes(), ...wallMeshes, ground];
    const hits = _ray.intersectObjects(targets, false);
    if (!hits.length) continue;
    const h = hits[0];
    spawnTracer(muzzle.clone(), h.point.clone());
    if (h.object.userData.agent) {
      const victim = h.object.userData.agent;
      if (victim.team === p.team) continue;
      const isHead = h.object.userData.part === 'head';
      const dist = h.distance;
      let dmg = w.damage * (dist > w.range ? Math.max(0.5, w.range / dist) : 1);
      if (isHead) dmg *= w.headMult;
      applyDamage(victim, Math.round(dmg), p, isHead, w.name);
      spawnSparks(h.point, 0xff5040, 6);
      AudioSys.hit(); showHitmarker(false);
    } else {
      spawnSparks(h.point, 0xcfc4a8, 4);
    }
  }
  if (st.mag === 0) tryReload(p);
}

// bot shooting (probabilistic hitscan)
function botShoot(a, target, dt) {
  const w = weaponOf(a);
  const st = a.weapons[a.cur];
  if (!st || st.mag <= 0) { a.shootCd = 0.5; if (st) tryReload(a); return; }
  const interval = 60 / w.rpm;
  a.shootCd -= dt;
  if (a.shootCd > 0) return;
  a.shootCd = interval;
  st.mag--;
  // muzzle position + tracer to target (approx)
  const from = new THREE.Vector3(a.pos.x, 1.45, a.pos.z);
  const to = new THREE.Vector3(target.pos.x, target.crouched ? 1.1 : 1.35, target.pos.z);
  spawnTracer(from, to, 0xffd9a0);
  if (Math.random() < 0.35) AudioSys.noise(0.05, 0.08, 1600, 0.7);
  const dist = from.distanceTo(to);
  let pHit = 0.62 - dist * 0.006;
  if (target.moving) pHit -= 0.12;
  if (a.moving) pHit -= 0.18;
  if (target.crouched) pHit -= 0.05;
  pHit = clamp(pHit, 0.06, 0.75);
  if (Math.random() < pHit) {
    const isHead = Math.random() < 0.09;
    let dmg = w.damage * (dist > w.range ? Math.max(0.5, w.range / dist) : 1);
    if (isHead) dmg *= w.headMult;
    applyDamage(target, Math.round(dmg), a, isHead, w.name);
    spawnSparks(to, 0xff5040, 4);
  }
}

// ---------------------------------------------------------------- player update
function updatePlayer(p, dt) {
  if (!p.alive) return;
  const w = weaponOf(p);
  p.fireCd -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const st = p.weapons[p.cur];
      const need = w.mag - st.mag, take = Math.min(need, st.reserve);
      st.mag += take; st.reserve -= take;
    }
  }
  p.bloom = Math.max(0, p.bloom - dt * 1.4);
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  p.crouched = !!(keys.ControlLeft || keys.KeyC);
  const walk = keys.ShiftLeft || keys.ShiftRight;
  let speed = 5.0;
  if (walk) speed = 3.1;
  if (p.crouched) speed = 2.1;
  if (p.ads) speed = Math.min(speed, 2.6);
  p.moving = (fwd !== 0 || str !== 0);
  if (p.moving) gunBob += dt * speed * 1.6;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  const mx = (-sin * fwd + cos * str), mz = (-cos * fwd - sin * str);
  const ml = Math.hypot(mx, mz) || 1;
  p.pos.x += (mx / ml) * speed * dt * (p.moving ? 1 : 0);
  p.pos.z += (mz / ml) * speed * dt * (p.moving ? 1 : 0);
  collide(p.pos, 0.42);
  // jump
  if (keys.Space && p.pos.y === 0) p.vy = 5.2;
  if (p.vy === undefined) p.vy = 0;
  if (p.pos.y > 0 || p.vy > 0) {
    p.vy -= 14 * dt;
    p.pos.y = Math.max(0, p.pos.y + p.vy * dt);
    if (p.pos.y === 0) p.vy = 0;
  }
  // camera
  const eyeH = p.crouched ? 1.15 : 1.62;
  camera.position.set(p.pos.x, p.pos.y + eyeH, p.pos.z);
  camera.rotation.y = p.yaw; camera.rotation.x = p.pitch;
  const targetFov = p.ads ? 75 / (w.zoom || 1) : 75;
  camera.fov = lerp(camera.fov, targetFov, dt * 10);
  camera.updateProjectionMatrix();
  // viewmodel
  viewGun.visible = true;
  const bobY = Math.sin(gunBob * 2) * 0.008 * (p.moving ? 1 : 0);
  const bobX = Math.cos(gunBob) * 0.006 * (p.moving ? 1 : 0);
  gunKick = Math.max(0, gunKick - dt * 6);
  viewGun.position.set(0.22 + bobX - (p.ads ? 0.22 : 0), -0.22 + bobY + (p.ads ? 0.075 : 0) + gunKick * 0.03, -0.35 + gunKick * 0.09);
  // firing
  if (mouseDown && (w.auto || !p._firedOnce)) {
    playerShoot(p, dt);
    p._firedOnce = true;
  }
  if (!mouseDown) p._firedOnce = false;
  // spike pickup / plant / defuse
  updateSpikeInteract(p, dt);
}

function updateSpikeInteract(p, dt) {
  const s = G.spike;
  // pickup dropped spike (attacker only)
  if (s.state === 'dropped' && p.team === G.attackTeam) {
    const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
    if (d < 1.2) { s.state = 'carried'; s.carrier = p; spikeMesh.visible = false; }
  }
  // plant (attacker carrying, inside a site)
  if (s.state === 'carried' && s.carrier === p && p.team === G.attackTeam) {
    const site = siteAt(p.pos.x, p.pos.z);
    if (site && keys.KeyE) {
      s.plantProgress += dt / PLANT_TIME;
      showAction('PLANTING SPIKE', s.plantProgress);
      if (Math.random() < dt * 4) AudioSys.plantTick();
      if (s.plantProgress >= 1) plantSpike(site, p);
    } else s.plantProgress = 0;
  }
  // defuse (defender near planted spike)
  if (s.state === 'planted' && p.team !== G.attackTeam) {
    const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
    if (d < 1.6 && keys.KeyE) {
      s.defuseProgress += dt / DEFUSE_TIME;
      s.defuser = p;
      showAction('DEFUSING SPIKE', s.defuseProgress);
      if (Math.random() < dt * 4) AudioSys.plantTick();
      if (s.defuseProgress >= 1) endRound(p.team, `${p.name} defused the spike`);
    } else if (s.defuser === p) { s.defuseProgress = 0; s.defuser = null; }
  }
  if (s.state !== 'carried' || s.carrier !== p) {
    if (s.plantProgress > 0 && s.carrier !== p) s.plantProgress = 0;
  }
}
function siteAt(x, z) {
  for (const [k, s] of Object.entries(MAP.sites)) {
    if (Math.hypot(x - s.x, z - s.z) < s.r) return k;
  }
  return null;
}
function showAction(label, prog) {
  $('actionbar').classList.remove('hidden');
  $('actionlabel').textContent = label;
  $('actionfill').style.width = `${clamp(prog * 100, 0, 100)}%`;
}
function hideAction() { $('actionbar').classList.add('hidden'); }

// ---------------------------------------------------------------- bot AI
function nearestEnemy(a) {
  let best = null, bd = 1e9;
  for (const p of G.players) {
    if (!p.alive || p.team === a.team) continue;
    const d = Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  return { enemy: best, dist: bd };
}
function canSee(a, b) {
  if (!b || !b.alive) return false;
  const d = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
  if (d > 55) return false;
  // facing check (bots see ~100 deg cone, or close range omnidirectional)
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const ang = Math.atan2(dx, dz); // yaw convention: forward = (-sin yaw, -cos yaw)
  let diff = Math.abs(((ang - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  // forward vector is (-sin yaw, -cos yaw) => angle of forward = atan2(-sin, -cos) = yaw + PI
  const fwdAng = Math.atan2(-Math.sin(a.yaw), -Math.cos(a.yaw));
  diff = Math.abs(((ang - fwdAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  if (d > 6 && diff > 1.15) return false;
  return !losBlocked(a.pos.x, 1.5, a.pos.z, b.pos.x, b.crouched ? 1.1 : 1.4, b.pos.z);
}
function botSetGoal(a, wpIdx) {
  const from = nearestWP(a.pos.x, a.pos.z);
  a.path = findPath(from, wpIdx);
  a.pathIdx = 0;
}
function botThink(a, dt) {
  // pick/refresh target (reaction delay only starts when a NEW target appears)
  const { enemy, dist } = nearestEnemy(a);
  a.target = null;
  if (enemy && canSee(a, enemy)) {
    if (!a._hadTarget) a.reactT = rand(0.25, 0.65);
    a._hadTarget = true;
    a.target = enemy; enemy.lastSeen = performance.now() / 1000;
  } else a._hadTarget = false;
  if (a.target) a.reactT -= dt;
  // role goal
  const isAtk = a.team === G.attackTeam;
  if (G.spike.state === 'planted') {
    if (isAtk) {
      // hold near planted site
      if (!a.holdPos) { a.holdPos = { x: clamp(G.spike.x + rand(-6, 6), -28, 28), z: clamp(G.spike.z + rand(-6, 6), -20, 20) }; botSetGoal(a, nearestWP(a.holdPos.x, a.holdPos.z)); }
      a.state = 'hold';
    } else {
      if (a.state !== 'defuse') { botSetGoal(a, nearestWP(G.spike.x, G.spike.z)); a.state = 'defuse'; }
    }
  } else if (isAtk) {
    // spike carrier always heads for the team's site, even after a mid-round pickup
    if (G.spike.carrier === a && a.state !== 'plant') {
      if (siteAt(a.pos.x, a.pos.z)) a.state = 'plant';
      else if (a.goalSite !== G.teamSite || a.pathIdx >= a.path.length) {
        a.goalSite = G.teamSite;
        botSetGoal(a, G.teamSite === 'A' ? 9 : 10);
        a.state = 'move';
      }
    } else if (a.state !== 'plant') {
      if (!a.goalSite) { a.goalSite = G.teamSite; botSetGoal(a, a.goalSite === 'A' ? 9 : 10); a.state = 'move'; }
      else if (a.state === 'move' && a.pathIdx >= a.path.length) a.state = 'holdsite';
    }
  } else {
    // defenders: hold assigned site; if spike carrier spotted near, converge handled by engage
    if (a.state === 'move' && a.pathIdx >= a.path.length) a.state = 'holdsite';
  }
  // planting
  if (a.state === 'plant' && G.spike.carrier === a) {
    a.plantT += dt;
    if (Math.random() < dt * 4) AudioSys.plantTick();
    if (a.plantT >= PLANT_TIME) { plantSpike(siteAt(a.pos.x, a.pos.z) || a.goalSite, a); a.plantT = 0; a.state = 'hold'; }
    return;
  }
  // defusing
  if (a.state === 'defuse') {
    const d = Math.hypot(a.pos.x - G.spike.x, a.pos.z - G.spike.z);
    if (d < 1.6 && G.spike.state === 'planted') {
      G.spike.defuseProgress += dt / DEFUSE_TIME;
      G.spike.defuser = a;
      if (Math.random() < dt * 4) AudioSys.plantTick();
      if (G.spike.defuseProgress >= 1) { endRound(a.team, `${a.name} defused the spike`); return; }
    }
  }
  // movement along path (unless engaging at close range)
  const engaging = a.target && a.reactT <= 0;
  if (engaging && dist < 40) {
    // strafe + shoot
    a.strafeT -= dt;
    if (a.strafeT <= 0) { a.strafeDir *= -1; a.strafeT = rand(0.5, 1.4); }
    const dx = a.target.pos.x - a.pos.x, dz = a.target.pos.z - a.pos.z;
    a.yaw = Math.atan2(-dx, -dz);
    const px = -Math.cos(a.yaw) * a.strafeDir, pz = Math.sin(a.yaw) * a.strafeDir;
    a.pos.x += px * 2.2 * dt; a.pos.z += pz * 2.2 * dt;
    a.moving = true;
    // burst fire
    if (a.burstLeft <= 0) { a.burstLeft = randi(3, 6); a.burstT = rand(0.35, 0.8); }
    a.burstT -= dt;
    if (a.burstLeft > 0 && a.burstT <= 0) { botShoot(a, a.target, dt); a.burstLeft--; a.burstT = 0.12; }
    collide(a.pos, 0.42);
  } else if (a.path && a.pathIdx < a.path.length) {
    const wp = WP[a.path[a.pathIdx]];
    const dx = wp[0] - a.pos.x, dz = wp[1] - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.7) { a.pathIdx++; }
    else {
      const sp = 4.3;
      a.pos.x += (dx / d) * sp * dt;
      a.pos.z += (dz / d) * sp * dt;
      a.yaw = Math.atan2(-dx, -dz);
      a.moving = true;
      collide(a.pos, 0.42);
    }
  } else {
    a.moving = false;
    // idle scan
    a.yaw += Math.sin(performance.now() / 1700 + a.name.length) * dt * 0.35;
  }
  // reload when idle
  if (a.reloadT > 0) {
    a.reloadT -= dt;
    if (a.reloadT <= 0) {
      const w = weaponOf(a), st = a.weapons[a.cur];
      const need = w.mag - st.mag, take = Math.min(need, st.reserve);
      st.mag += take; st.reserve -= take;
    }
  }
  // mesh sync
  a.mesh.group.position.set(a.pos.x, a.pos.y || 0, a.pos.z);
  a.mesh.group.rotation.y = a.yaw;
}
function updateBotMesh(a) {
  a.mesh.group.position.set(a.pos.x, a.pos.y || 0, a.pos.z);
  a.mesh.group.rotation.y = a.yaw;
  a.mesh.group.visible = a.alive;
}

// ---------------------------------------------------------------- rounds & economy
function plantSpike(site, planter) {
  const s = MAP.sites[site];
  G.spike.state = 'planted';
  G.spike.site = site;
  G.spike.x = s.x; G.spike.z = s.z;
  G.spike.timer = SPIKE_TIME;
  G.spike.plantProgress = 0; G.spike.defuseProgress = 0; G.spike.defuser = null;
  spikeMesh.visible = true;
  spikeMesh.position.set(s.x, 0.2, s.z);
  if (planter) planter.money += 300;
  banner(`SPIKE PLANTED — SITE ${site}`, 'Defenders: defuse it before it blows. Attackers: hold the site.', 'lose');
  AudioSys.beep(700); setTimeout(() => AudioSys.beep(700), 250);
  // defenders converge
  for (const p of G.players) {
    if (!p.alive || p.isPlayer) continue;
    if (p.team !== G.attackTeam) { p.state = 'defuse'; p.holdPos = null; botSetGoal(p, nearestWP(s.x, s.z)); }
    else { p.holdPos = null; }
  }
}
function startMatch() {
  buildRoster();
  G.score = { VAN: 0, RAI: 0 };
  G.round = 1;
  G.lossStreak = { VAN: 0, RAI: 0 };
  G.attackTeam = 'VAN';
  G.stats = [];
  $('startscreen').classList.add('hidden');
  $('endscreen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  AudioSys.init();
  startRound();
}
function startRound() {
  if (G.round > MAX_ROUNDS || G.score.VAN >= WIN_ROUNDS || G.score.RAI >= WIN_ROUNDS) { endMatch(); return; }
  // sides swap after round 7
  G.attackTeam = G.round <= 7 ? 'VAN' : 'RAI';
  G.teamSite = Math.random() < 0.5 ? 'A' : 'B';
  // reset spike
  G.spike = { state: 'carried', carrier: null, x: 0, z: 0, site: null, timer: 0, plantProgress: 0, defuseProgress: 0, defuser: null };
  spikeMesh.visible = false;
  // spawn positions
  const atkSpots = [[0, 19], [-3, 18], [3, 18], [-6, 19], [6, 19]];
  const defSpots = [[0, -19], [-3, -18], [3, -18], [-6, -19], [6, -19]];
  let ai = 0, di = 0;
  for (const p of G.players) {
    p.hp = 100; p.alive = true;
    p.mesh.group.visible = true;
    p.pos.y = 0; p.vy = 0; p.pitch = 0;
    if (p.team === G.attackTeam) {
      const s = atkSpots[ai++ % atkSpots.length];
      p.pos.set(s[0], 0, s[1]); p.yaw = 0; // face north (-z, toward the sites)
    } else {
      const s = defSpots[di++ % defSpots.length];
      p.pos.set(s[0], 0, s[1]); p.yaw = Math.PI; // face south (+z, toward mid)
    }
    p.path = []; p.pathIdx = 0; p.goalSite = null; p.state = 'move'; p.target = null;
    p.holdPos = null; p.plantT = 0; p.reloadT = 0; p.bloom = 0; p.ads = false;
    if (!p.weapons.sidearm) p.weapons.sidearm = { mag: 12, reserve: 36 };
    // dead players lose their primary
    if (p._diedLastRound) {
      const prim = primaryId(p);
      if (prim) delete p.weapons[prim];
      p.armor = 0;
      p.cur = 'sidearm';
      p._diedLastRound = false;
    }
    // bots buy
    if (!p.isPlayer) botBuy(p);
    updateBotMesh(p);
    if (p.isPlayer) { camera.position.set(p.pos.x, 1.62, p.pos.z); camera.rotation.set(0, p.yaw, 0); }
  }
  // spike carrier: a random attacker (player 40% when attacking)
  const atk = G.players.filter(p => p.team === G.attackTeam);
  let carrier;
  if (playerObj().team === G.attackTeam && Math.random() < 0.4) carrier = playerObj();
  else carrier = choice(atk.filter(p => !p.isPlayer).length ? atk.filter(p => !p.isPlayer) : atk);
  G.spike.carrier = carrier;
  // defenders take sites; attackers head to chosen site
  for (const p of G.players) {
    if (p.isPlayer) continue;
    if (p.team === G.attackTeam) {
      p.goalSite = G.teamSite;
      if (p === carrier) botSetGoal(p, G.teamSite === 'A' ? 9 : 10);
      else botSetGoal(p, choice([G.teamSite === 'A' ? 9 : 10, G.teamSite === 'A' ? 14 : 15, 12]));
    } else {
      const assign = ['A', 'A', 'B', 'B', 'mid'][G.players.filter(q => q.team === p.team).indexOf(p) % 5];
      p.goalSite = assign;
      if (assign === 'A') botSetGoal(p, choice([9, 14, 21]));
      else if (assign === 'B') botSetGoal(p, choice([10, 15, 22]));
      else botSetGoal(p, choice([12, 13]));
    }
  }
  G.phase = 'buy';
  G.buyTimer = BUY_TIME;
  G.timer = ROUND_TIME;
  banner(`ROUND ${G.round}`, `${teamOf({ team: G.attackTeam }).name} attack · Site ${G.teamSite} favoured · Buy phase — press B`, '');
  openBuy();
  updateHUD();
}
function botBuy(p) {
  if (p.money >= 2900 && !p.weapons.rifle) { p.weapons.rifle = { mag: 30, reserve: 90 }; p.money -= 2900; p.cur = 'rifle'; }
  else if (p.money >= 1500 && !p.weapons.smg && !p.weapons.rifle) { p.weapons.smg = { mag: 30, reserve: 90 }; p.money -= 1500; p.cur = 'smg'; }
  else if (p.weapons.rifle) p.cur = 'rifle';
  else if (p.weapons.smg) p.cur = 'smg';
  else p.cur = 'sidearm';
  if (p.money >= 650 && p.armor <= 0) { p.armor = 100; p.money -= 650; }
  const st = p.weapons[p.cur]; if (st) { st.mag = WEAPONS[p.cur].mag; st.reserve = WEAPONS[p.cur].reserve; }
}
function endRound(winnerTeam, reason) {
  if (G.phase !== 'live' && G.phase !== 'buy') return;
  G.phase = 'roundEnd';
  G.endTimer = 4;
  G.score[winnerTeam]++;
  const loser = winnerTeam === 'VAN' ? 'RAI' : 'VAN';
  G.lossStreak[winnerTeam] = 0;
  G.lossStreak[loser]++;
  const lossBonus = Math.min(1900 + 500 * (G.lossStreak[loser] - 1), 3400);
  for (const p of G.players) {
    if (p.team === winnerTeam) p.money += 3250;
    else p.money += lossBonus;
    if (!p.alive) p._diedLastRound = true;
  }
  const youWon = playerObj().team === winnerTeam;
  banner(youWon ? 'ROUND WON' : 'ROUND LOST', `${teamOf({ team: winnerTeam }).name} take round ${G.round} — ${reason}`, youWon ? 'win' : 'lose');
  if (youWon) AudioSys.win(); else AudioSys.lose();
  G.roundLog.push({ round: G.round, winner: winnerTeam, reason, score: { ...G.score } });
  $('buy').classList.add('hidden');
  hideAction();
  updateHUD();
}
function checkRoundEnd() {
  if (G.phase !== 'live') return;
  const vanAlive = G.players.some(p => p.team === 'VAN' && p.alive);
  const raiAlive = G.players.some(p => p.team === 'RAI' && p.alive);
  if (!vanAlive) endRound('RAI', 'Vanguard eliminated');
  else if (!raiAlive) endRound('VAN', 'Raiders eliminated');
}
function endMatch() {
  G.phase = 'matchEnd';
  const winner = G.score.VAN > G.score.RAI ? 'VAN' : 'RAI';
  const youWon = playerObj().team === winner;
  $('hud').classList.add('hidden');
  $('endscreen').classList.remove('hidden');
  $('endTitle').textContent = youWon ? 'VICTORY' : 'DEFEAT';
  $('endTitle').style.color = youWon ? '#7dff9a' : '#ff7a6b';
  $('endSub').textContent = `${teamOf({ team: winner }).name} win the match ${G.score.VAN} — ${G.score.RAI}`;
  const tb = $('endtable').querySelector('tbody');
  tb.innerHTML = '';
  const sorted = [...G.players].sort((a, b) => b.kills - a.kills);
  for (const p of sorted) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.name}${p.isPlayer ? ' (you)' : ''}</td><td>${teamOf(p).name}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.damage}</td>`;
    tb.appendChild(tr);
  }
  if (youWon) AudioSys.win(); else AudioSys.lose();
  if (SELFTEST) finishSelftest();
}
function finishSelftest() {
  if (G.selftestDone) return;
  G.selftestDone = true;
  const p = playerObj();
  const result = {
    ok: true,
    rounds: G.roundLog.length,
    score: G.score,
    playerKills: p.kills, playerDeaths: p.deaths,
    log: G.roundLog.map(r => `R${r.round}:${r.winner}`),
  };
  const el = $('selftest');
  el.textContent = 'SELFTEST ' + JSON.stringify(result);
  document.title = `SELFTEST PASS rounds=${result.rounds} score=${G.score.VAN}-${G.score.RAI}`;
  console.log('SELFTEST_RESULT', JSON.stringify(result));
}

// ---------------------------------------------------------------- HUD / buy menu / minimap
function banner(title, sub, cls) {
  $('banner').classList.remove('hidden');
  $('bannerTitle').textContent = title;
  $('bannerTitle').className = cls || '';
  $('bannerSub').textContent = sub;
  clearTimeout(banner._t);
  banner._t = setTimeout(() => $('banner').classList.add('hidden'), 4200);
}
function updateHUD() {
  const p = playerObj();
  if (!p) return;
  const w = weaponOf(p), st = p.weapons[p.cur];
  $('health').textContent = Math.max(0, Math.ceil(p.hp));
  $('health').className = p.hp <= 30 ? 'low' : '';
  $('armor').textContent = p.armor > 0 ? `🛡 ${Math.ceil(p.armor)} armour` : '';
  $('money').textContent = `$${p.money}`;
  $('ammo').innerHTML = st ? `${st.mag} <span class="res">/ ${st.reserve}</span>` : '—';
  $('weaponname').textContent = w.name + (p.reloadT > 0 ? ' · reloading…' : '');
  $('timer').textContent = fmtTime(Math.max(0, G.timer));
  $('timer').style.color = G.timer <= 10 && G.phase === 'live' ? '#ff5040' : '#fff';
  $('score').innerHTML = `<span class="van">VANGUARD ${G.score.VAN}</span> — <span class="rai">${G.score.RAI} RAIDERS</span>`;
  $('roundinfo').textContent = `ROUND ${Math.min(G.round, MAX_ROUNDS)} · FIRST TO ${WIN_ROUNDS} · ${G.attackTeam === 'VAN' ? 'VANGUARD ATTACK' : 'RAIDERS ATTACK'}` + (G.spike.state === 'planted' ? ` · SPIKE ${fmtTime(G.spike.timer)}` : '');
  // crosshair gap from bloom
  const gap = 3 + p.bloom * 14 + (p.moving ? 4 : 0);
  $('chT').style.top = (11 - gap - 5) + 'px';
  $('chB').style.top = (11 + gap + 2) + 'px';
  $('chL').style.left = (11 - gap - 5) + 'px';
  $('chR').style.left = (11 + gap + 2) + 'px';
  // centre hints
  let hint = '';
  if (G.phase === 'buy') hint = 'Buy phase — press B for the shop';
  else if (!p.alive) hint = 'You are down — spectating a teammate';
  else if (G.spike.state === 'carried' && G.spike.carrier === p) {
    const s = siteAt(p.pos.x, p.pos.z);
    hint = s ? 'Hold E to plant the spike' : 'Carrying the spike — reach Site A or B';
  } else if (G.spike.state === 'dropped' && p.team === G.attackTeam) hint = 'Spike dropped — walk over it to pick it up';
  else if (G.spike.state === 'planted' && p.team !== G.attackTeam) hint = 'Spike planted — hold E at the spike to defuse';
  $('centerhint').textContent = hint;
  // spectate label
  if (!p.alive && G.phase === 'live') {
    const mates = G.players.filter(q => q.team === p.team && q.alive);
    $('spectate').classList.remove('hidden');
    $('spectate').textContent = mates.length ? `SPECTATING ${mates[G.spectateIdx % mates.length].name}` : 'No teammates left';
  } else $('spectate').classList.add('hidden');
  if (dmgFlashT > 0) {
    renderer.domElement.style.filter = `brightness(${1 + dmgFlashT}) sepia(0.4) hue-rotate(-30deg)`;
  } else renderer.domElement.style.filter = '';
  drawMinimap();
}
const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const W = 170, H = 130, sx = W / 62, sz = H / 46;
  const X = x => (x + 31) * sx, Z = z => (z + 23) * sz;
  mm.clearRect(0, 0, W, H);
  mm.fillStyle = 'rgba(20,26,34,0.9)'; mm.fillRect(0, 0, W, H);
  mm.fillStyle = 'rgba(255,210,31,0.25)';
  for (const s of Object.values(MAP.sites)) { mm.beginPath(); mm.arc(X(s.x), Z(s.z), s.r * sx, 0, 7); mm.fill(); }
  mm.fillStyle = '#8b98a5';
  for (const c of colliders) mm.fillRect(X(c.x0), Z(c.z0), (c.x1 - c.x0) * sx, (c.z1 - c.z0) * sz);
  mm.font = 'bold 11px Arial'; mm.fillStyle = '#ffd21f';
  mm.fillText('A', X(MAP.sites.A.x) - 4, Z(MAP.sites.A.z) + 4);
  mm.fillText('B', X(MAP.sites.B.x) - 4, Z(MAP.sites.B.z) + 4);
  const now = performance.now() / 1000;
  for (const p of G.players) {
    if (!p.alive) continue;
    const isMe = p.isPlayer;
    let col = p.team === 'VAN' ? '#6db3ff' : '#ff7a6b';
    if (isMe) col = '#ffffff';
    else if (p.team !== playerObj().team && now - p.lastSeen > 1.5) continue; // enemies only when recently seen
    mm.fillStyle = col;
    mm.beginPath(); mm.arc(X(p.pos.x), Z(p.pos.z), isMe ? 4 : 3, 0, 7); mm.fill();
  }
  if (G.spike.state === 'dropped' || G.spike.state === 'planted') {
    mm.fillStyle = '#ffd21f';
    mm.beginPath(); mm.arc(X(G.spike.x), Z(G.spike.z), 4, 0, 7); mm.fill();
  }
}
function buildBuyTable() {
  const t = $('buytable');
  t.innerHTML = '';
  const rows = [
    ['1', 'rifle', 'AR-77 Rifle — accurate auto rifle, 4× headshot'],
    ['2', 'smg', 'VK-9 SMG — fast close-range spray'],
    ['3', 'shotgun', 'M590 Breacher — devastating up close'],
    ['4', 'sniper', 'LW-50 Longshot — one-shot headshot, scoped'],
    ['5', 'armor', 'Kevlar Vest — 100 armour, halves damage'],
    ['6', 'sidearm', 'P9 Sidearm — refill pistol ammo'],
  ];
  for (const [k, id, desc] of rows) {
    const tr = document.createElement('tr');
    const price = id === 'armor' ? ARMOR.price : WEAPONS[id].price;
    tr.dataset.id = id;
    tr.innerHTML = `<td class="k">${k}</td><td>${desc}</td><td class="p">$${price}</td>`;
    tr.addEventListener('click', () => buyItem(id));
    t.appendChild(tr);
  }
}
function refreshBuy() {
  const p = playerObj();
  $('buymoney').textContent = `$${p.money}`;
  $('buytimer').textContent = G.phase === 'buy' ? `buy time ${Math.ceil(G.buyTimer)}s` : '';
  for (const tr of $('buytable').children) {
    const id = tr.dataset.id;
    const price = id === 'armor' ? ARMOR.price : WEAPONS[id].price;
    const owned = id === 'armor' ? p.armor > 0 : !!p.weapons[id];
    tr.classList.toggle('owned', owned && id !== 'sidearm');
    tr.classList.toggle('afford', !owned && p.money >= price);
  }
}
function buyItem(id) {
  if (G.phase !== 'buy') return;
  const p = playerObj();
  if (!p.alive) return;
  if (id === 'armor') {
    if (p.armor > 0 || p.money < ARMOR.price) { AudioSys.click(); return; }
    p.money -= ARMOR.price; p.armor = 100;
  } else if (id === 'sidearm') {
    const st = p.weapons.sidearm;
    if (st && st.reserve < WEAPONS.sidearm.reserve) { st.reserve = WEAPONS.sidearm.reserve; AudioSys.click(); }
    refreshBuy(); updateHUD(); return;
  } else {
    const w = WEAPONS[id];
    if (p.weapons[id] || p.money < w.price) { AudioSys.click(); return; }
    // one primary at a time
    const old = primaryId(p);
    if (old) delete p.weapons[old];
    p.money -= w.price;
    p.weapons[id] = { mag: w.mag, reserve: w.reserve };
    p.cur = id;
  }
  AudioSys.click();
  refreshBuy(); updateHUD();
}
function openBuy() { buildBuyTable(); refreshBuy(); $('buy').classList.remove('hidden'); }
function toggleBuy() {
  if (G.phase !== 'buy') return;
  $('buy').classList.toggle('hidden');
  if (!$('buy').classList.contains('hidden')) refreshBuy();
}
function showScoreboard(on) {
  let sb = $('scoreboard');
  if (on && !sb) {
    sb = document.createElement('div');
    sb.id = 'scoreboard';
    sb.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);background:rgba(8,12,18,.92);border:1px solid #3a4a5c;border-radius:8px;padding:14px 22px;z-index:9;font-size:14px';
    document.body.appendChild(sb);
  }
  if (!sb) return;
  if (on) {
    let html = '<b style="color:#ffd21f">SCOREBOARD</b><br><br>';
    for (const t of ['VAN', 'RAI']) {
      html += `<span style="color:${TEAMS[t].css}">${TEAMS[t].name} — ${G.score[t]} rounds</span><br>`;
      for (const p of G.players.filter(q => q.team === t))
        html += `&nbsp;&nbsp;${p.name}${p.isPlayer ? ' (you)' : ''} — ${p.kills}K / ${p.deaths}D — $${p.money}<br>`;
    }
    sb.innerHTML = html;
    sb.classList.remove('hidden');
  } else sb.classList.add('hidden');
}

// ---------------------------------------------------------------- screens / pause
function pauseGame(on) {
  if (G.phase === 'menu' || G.phase === 'matchEnd') return;
  if (on) {
    $('paused').classList.remove('hidden');
    G._paused = true;
    document.exitPointerLock && document.exitPointerLock();
  } else {
    $('paused').classList.add('hidden');
    G._paused = false;
    if (playerObj().alive && G.phase === 'live') lockPointer();
  }
}
$('startBtn').addEventListener('click', () => { startMatch(); });
$('againBtn').addEventListener('click', () => { startMatch(); });
$('menuBtn').addEventListener('click', () => {
  $('endscreen').classList.add('hidden');
  $('startscreen').classList.remove('hidden');
  G.phase = 'menu';
});
$('resumeBtn').addEventListener('click', () => pauseGame(false));
renderer.domElement.addEventListener('click', () => {
  if (G.phase === 'live' && playerObj().alive && !pointerLocked && !G._paused && playerObj().isPlayer) lockPointer();
});

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let spikeBeepT = 0;
function step(dt) {
  if (G.phase === 'menu' || G.phase === 'matchEnd' || G._paused) return;
  dmgFlashT = Math.max(0, dmgFlashT - dt);
  if (G.phase === 'buy') {
    G.buyTimer -= dt;
    refreshBuy();
    if (G.buyTimer <= 0) {
      G.phase = 'live';
      G.timer = ROUND_TIME;
      $('buy').classList.add('hidden');
      banner('GO GO GO', `${teamOf({ team: G.attackTeam }).name} — take Site A or Site B`, '');
      if (playerObj().isPlayer && playerObj().alive) lockPointer();
    }
  } else if (G.phase === 'live') {
    G.timer -= dt;
    // spike timer
    if (G.spike.state === 'planted') {
      G.spike.timer -= dt;
      spikeBeepT -= dt;
      if (spikeBeepT <= 0) { AudioSys.beep(G.spike.timer < 10 ? 1500 : 1000); spikeBeepT = G.spike.timer < 10 ? 0.5 : 1.0; }
      if (G.spike.timer <= 0) endRound(G.attackTeam, 'spike detonated');
    }
    if (G.timer <= 0 && G.phase === 'live') {
      if (G.spike.state === 'planted') endRound(G.attackTeam, 'spike detonated');
      else endRound(G.attackTeam === 'VAN' ? 'RAI' : 'VAN', 'time expired — spike never planted');
    }
  } else if (G.phase === 'roundEnd') {
    G.endTimer -= dt;
    if (G.endTimer <= 0) { G.round++; startRound(); }
  }
  if (G.phase === 'live') {
    const p = playerObj();
    if (p.isPlayer) {
      if (p.alive) updatePlayer(p, dt);
      else spectate(dt);
    } else {
      botThink(p, dt);
      updateBotMesh(p);
      // selftest camera follows the bot-"player"
      camera.position.set(p.pos.x, p.pos.y + 2.2, p.pos.z);
      const look = new THREE.Vector3(p.pos.x - Math.sin(p.yaw) * 5, 1.4, p.pos.z - Math.cos(p.yaw) * 5);
      camera.lookAt(look);
      viewGun.visible = false;
    }
    for (const b of G.players) {
      if (b.isPlayer) continue;
      if (!b.alive) continue;
      botThink(b, dt);
      updateBotMesh(b);
    }
    // spike pickup by bots (dropped)
    if (G.spike.state === 'dropped') {
      for (const b of G.players) {
        if (!b.alive || b.team !== G.attackTeam) continue;
        if (Math.hypot(b.pos.x - G.spike.x, b.pos.z - G.spike.z) < 1.2) {
          G.spike.state = 'carried'; G.spike.carrier = b; spikeMesh.visible = false;
          if (b.isPlayer) { /* player pickup handled in updateSpikeInteract */ }
          break;
        }
      }
    }
    // hide action bar when not planting/defusing
    if (!(keys.KeyE && G.phase === 'live')) hideAction();
  }
  updateFx(dt);
  updateHUD();
}
function spectate(dt) {
  const p = playerObj();
  const mates = G.players.filter(q => q.team === p.team && q.alive);
  if (!mates.length) return;
  const m = mates[G.spectateIdx % mates.length];
  camera.position.set(m.pos.x, m.pos.y + 2.4, m.pos.z);
  camera.lookAt(m.pos.x - Math.sin(m.yaw) * 5, 1.3, m.pos.z - Math.cos(m.yaw) * 5);
  viewGun.visible = false;
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (SELFTEST) {
    for (let i = 0; i < 60 && !G.selftestDone; i++) step(1 / 60);
  } else step(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- boot
buildRoster();
updateHUD();
animate();
if (AUTOSTART) {
  setTimeout(() => { if (G.phase === 'menu') startMatch(); }, 300);
}
window.__game = {
  get state() { return { phase: G.phase, round: G.round, score: G.score, timer: G.timer, spike: G.spike.state, players: G.players.map(p => ({ name: p.name, team: p.team, hp: Math.round(p.hp), alive: p.alive, kills: p.kills, money: p.money })) }; },
  start: startMatch,
  G,
};
console.log('IRONLINE loaded. window.__game available. ?auto=1 autostarts, ?selftest=1 runs a full bot match.');
