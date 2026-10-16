// Bolhas 3D — lado do navegador: recebe o estado do servidor, desenha e manda os controles.
import { THREE, createEngine, Batch, Bursts, ChaseCam, createInput, col } from './engine.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as A from '../shared/agar-rules.js';
import { createState, applyInit, applyTick } from '../shared/agar-state.js';
import { connect, createPlayback } from './net.js';
import { $, fmt, createMenu, setupGlow, feed, renderBoard, renderPowers, createLabels } from './ui.js';
import { createPellets } from './pellets.js';

const eng = createEngine(A.R);
const { scene, camera } = eng;
const st = createState();
const names = new Map(); // id → nome, guardado mesmo depois que o jogador morre
let myId = 0, spectateId = 0, alpha = 1, time = 0;
const myPowers = {};
const WHITE = col(0xffffff), BLACK = col(0x05020d), SHIELD = col(0x3fd8ff);

// ouriço: bola com 42 espinhos (os vértices de um icosaedro subdividido)
function spikyGeometry() {
  const parts = [new THREE.SphereGeometry(0.8, 16, 12)], seen = new Set();
  const d = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  const ico = new THREE.IcosahedronGeometry(1, 1).attributes.position;
  for (let i = 0; i < ico.count; i++) {
    d.fromBufferAttribute(ico, i).normalize();
    const key = d.toArray().map(v => v.toFixed(2)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const cone = new THREE.ConeGeometry(0.16, 0.55, 6);
    cone.translate(0, 0.95, 0);
    cone.applyQuaternion(q.setFromUnitVectors(Y, d));
    parts.push(cone);
  }
  return mergeGeometries(parts);
}

// ---------- malhas ----------
const cellB = new Batch(scene, new THREE.SphereGeometry(1, 32, 20), 700, { glow: 0.2, rim: 1.1 });
const ghostB = new Batch(scene, new THREE.SphereGeometry(1, 20, 14), 64, { glow: 0.5, rim: 1, opacity: 0.12 });
const virusB = new Batch(scene, spikyGeometry(), 64, { glow: 0.45 });
const eyeB = new Batch(scene, new THREE.SphereGeometry(1, 12, 8), 600, { glow: 0.15 });
const pupilB = new Batch(scene, new THREE.SphereGeometry(1, 8, 6), 600, { glow: 0 });
const shieldB = new Batch(scene, new THREE.IcosahedronGeometry(1, 3), 64, { glow: 0.6, opacity: 0.18, additive: true });
const pellets = createPellets(scene, camera);
const bursts = new Bursts(scene);
const cam = new ChaseCam(camera);
const labels = createLabels(camera);
const input = createInput({
  stick: $('stick'), knob: $('knob'), primary: $('split'), secondary: $('eject'),
  onPress: k => { if (k === 'primary' && st.players.has(myId)) net.send({ t: 'split' }); },
});

// posição e massa da célula suavizadas entre o tick anterior e o atual
const cellPos = (c, out) => c.t === st.tick
  ? out.set(c.px + (c.x - c.px) * alpha, c.py + (c.y - c.py) * alpha, c.pz + (c.z - c.pz) * alpha)
  : out.set(c.x, c.y, c.z);
const cellMass = c => c.t === st.tick ? c.pm + (c.m - c.pm) * alpha : c.m;

// ---------- rede ----------
const swallowed = []; // células sendo engolidas (animação de 0,2 s)
const V = new THREE.Vector3();
const hooks = {
  join(p) { names.set(p.id, p.name); },
  eat(p, cid) {
    pellets.eaten(p, out => { const c = st.cells.get(cid); return !!c && !!cellPos(c, out); });
    if (p.k && st.cells.get(cid)?.owner === myId) myPowers[A.POWER[p.k].fx] = time + A.POWER[p.k].secs;
  },
  gone(c, eater) {
    cellPos(c, V);
    if (eater) swallowed.push({ x: V.x, y: V.y, z: V.z, r: A.radius(c.m), c: col(c.c), eater, virus: c.owner === -1, t: 0 });
    else bursts.emit(V.x, V.y, V.z, col(c.c), 16, 6);
  },
  die(p, killer) {
    if (killer > 0) feed(`${names.get(killer) ?? '?'} engoliu ${p.name}`);
    if (p.id === myId) died(killer > 0 ? `${names.get(killer) ?? 'Alguém'} engoliu você com ${fmt(p.mass)} de massa.`
      : 'Sua bolha saiu da arena.', killer);
  },
};
const playback = createPlayback(A.TICK_RATE, m => applyTick(st, m, hooks));

const menu = createMenu((name, skin) => { net.send({ t: 'join', name, skin }); spectateId = 0; });
const syncGlow = setupGlow(eng);
const net = connect('/ws/agar', {
  onInit(m) {
    applyInit(st, m);
    playback.reset(m.n);
    for (const p of st.players.values()) names.set(p.id, p.name);
    if (myId) died('A conexão caiu e sua bolha ficou para trás.', 0); // reconectou
  },
  onTick(m) {
    playback.push(m);
    if (playback.size > A.TICK_RATE * 20) net.reconnect();
  },
  onYou(m) { myId = m.id; },
  onStatus: s => menu.status(s),
});

function died(text, killer) {
  myId = 0;
  spectateId = killer > 0 ? killer : 0;
  for (const k in myPowers) delete myPowers[k];
  menu.show(text);
}

// ---------- desenho ----------
const C = new THREE.Vector3(), D = new THREE.Vector3(), E = new THREE.Vector3();
const side = new THREE.Vector3(), eyeUp = new THREE.Vector3(), Q = new THREE.Quaternion(), EUL = new THREE.Euler();
const dirOf = (p, out) => { out.fromArray(p.dir); return out.lengthSq() < 1e-6 ? out.set(0, 0, -1) : out.normalize(); };

// desenha todas as células e devolve, por jogador, o centro de massa e a maior célula
function drawCells(dt) {
  const groups = new Map();
  for (const b of [cellB, ghostB, virusB, eyeB, pupilB, shieldB]) b.begin();
  for (const c of st.cells.values()) {
    cellPos(c, V);
    const m = cellMass(c), r = A.radius(m);
    if (c.owner === -1) { // ouriço girando devagar
      virusB.add(V.x, V.y, V.z, r, col(c.c), Q.setFromEuler(EUL.set(time * 0.3 + c.id, time * 0.2, 0)));
      continue;
    }
    if (c.owner === 0) { cellB.add(V.x, V.y, V.z, r, col(c.c)); continue; } // massa ejetada
    const p = st.players.get(c.owner);
    if (!p) continue;
    const g = groups.get(p) ?? groups.set(p, { x: 0, y: 0, z: 0, m: 0, big: 0, bx: 0, by: 0, bz: 0 }).get(p);
    g.x += V.x * m; g.y += V.y * m; g.z += V.z * m; g.m += m;
    if (r > g.big) { g.big = r; g.bx = V.x; g.by = V.y; g.bz = V.z; }
    const ghost = p.flags & A.FX.GHOST;
    (ghost ? ghostB : cellB).add(V.x, V.y, V.z, r, col(c.c));
    if (ghost && p.id !== myId) continue; // invisível: sem olhos nem escudo
    dirOf(p, D);
    side.crossVectors(D, camera.up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    eyeUp.crossVectors(side, D);
    for (const sg of [-1, 1]) { // olhos olhando para onde o dono vai
      E.copy(V).addScaledVector(D, r * 0.78).addScaledVector(side, sg * r * 0.3).addScaledVector(eyeUp, r * 0.28);
      eyeB.add(E.x, E.y, E.z, r * 0.2, WHITE);
      E.addScaledVector(D, r * 0.12);
      pupilB.add(E.x, E.y, E.z, r * 0.11, BLACK);
    }
    if (p.flags & A.FX.SHIELD) shieldB.add(V.x, V.y, V.z, r * (1.25 + Math.sin(time * 6) * 0.04), SHIELD);
  }
  for (let i = swallowed.length - 1; i >= 0; i--) { // engolida voando para dentro de quem comeu
    const s = swallowed[i], e = st.cells.get(s.eater);
    s.t += dt / 0.2;
    if (s.t >= 1 || !e) { swallowed.splice(i, 1); continue; }
    cellPos(e, V);
    s.x += (V.x - s.x) * s.t; s.y += (V.y - s.y) * s.t; s.z += (V.z - s.z) * s.t;
    (s.virus ? virusB : cellB).add(s.x, s.y, s.z, s.r * (1 - s.t), s.c);
  }
  for (const b of [cellB, ghostB, virusB, eyeB, pupilB, shieldB]) b.end();
  return groups;
}

function hud() {
  syncGlow();
  const rows = [...st.players.values()].map(p => ({ id: p.id, name: p.name, score: p.mass })).sort((a, b) => b.score - a.score);
  renderBoard(rows, rows.find(r => r.id === myId));
  renderPowers(st.players.get(myId)?.flags ?? 0, myPowers, time);
}

// ---------- loop ----------
let sendT = 0, hudT = 1, orbit = 0, nextEject = 0;
eng.run((dt, now) => {
  time = now;
  alpha = playback.update(dt);
  bursts.update(dt);
  const groups = drawCells(dt);
  pellets.draw(st.pellets, time, dt);

  const me = st.players.get(myId), mine = me && groups.get(me);
  let focus = mine ? me : st.players.get(spectateId);
  if (!groups.has(focus)) focus = [...groups.keys()].sort((a, b) => b.mass - a.mass)[0];
  const g = groups.get(focus);
  if (g) {
    C.set(g.x / g.m, g.y / g.m, g.z / g.m);
    cam.update(C, dirOf(focus, D), 0.35 * A.radius(g.m) + 0.5, dt, mine ? 1 : 1.5);
  } else {
    orbit += dt * 0.1;
    camera.position.set(Math.sin(orbit) * A.R * 0.8, 10, Math.cos(orbit) * A.R * 0.8);
    camera.lookAt(0, 0, 0);
  }
  eng.setWallFocus(mine ? C : camera.position);
  labels.draw([...groups].filter(([p]) => p !== me && !(p.flags & A.FX.GHOST)).map(([p, q]) => [p.name, q.bx, q.by, q.bz, q.big * 1.3]));

  if (mine) {
    const { x, y, secondary } = input.get(), u = cam.up;
    if ((sendT += dt) >= A.DT) {
      sendT = 0;
      net.send({ t: 'in', x: +x.toFixed(3), y: +y.toFixed(3), u: [+u.x.toFixed(3), +u.y.toFixed(3), +u.z.toFixed(3)] });
    }
    if (secondary && now >= nextEject) { nextEject = now + 0.12; net.send({ t: 'eject' }); } // segurar = solta várias
  }
  if ((hudT += dt) > 0.25) { hudT = 0; hud(); }
});
