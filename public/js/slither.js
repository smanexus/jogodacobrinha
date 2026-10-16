// Cobrinha 3D — lado do navegador: recebe o estado do servidor, desenha e manda os controles.
import { THREE, createEngine, Batch, Bursts, ChaseCam, createInput, col } from './engine.js';
import * as S from '../shared/slither-rules.js';
import { createState, applyInit, applyTick } from '../shared/slither-state.js';
import { connect, createPlayback } from './net.js';
import { $, createMenu, setupGlow, feed, renderBoard, renderPowers, createLabels } from './ui.js';
import { createPellets } from './pellets.js';

const eng = createEngine(S.R);
const { scene, camera } = eng;
const st = createState();
const names = new Map(); // id → nome, guardado mesmo depois que a cobra morre (para o "quem te pegou")
let myId = 0, spectateId = 0, alpha = 1, time = 0;
const myPowers = {}; // fx → segundo (relógio local) em que acaba, só para o contador do HUD

const skinColors = S.SKINS.map(s => s.colors.map(col));
const WHITE = col(0xffffff), BLACK = col(0x05020d), SHIELD = col(0x3fd8ff);

// ---------- malhas ----------
const bodyB = new Batch(scene, new THREE.SphereGeometry(1, 16, 12), 14000, { glow: 0.22 });
const ghostB = new Batch(scene, new THREE.SphereGeometry(1, 12, 8), 4000, { glow: 0.6, opacity: 0.1 });
const eyeB = new Batch(scene, new THREE.SphereGeometry(1, 12, 8), 300, { glow: 0.15 });
const pupilB = new Batch(scene, new THREE.SphereGeometry(1, 8, 6), 300, { glow: 0 });
const shieldB = new Batch(scene, new THREE.IcosahedronGeometry(1, 2), 64, { glow: 0.6, opacity: 0.22, additive: true });
const pellets = createPellets(scene, camera);
const bursts = new Bursts(scene);
const cam = new ChaseCam(camera);
const labels = createLabels(camera);
const input = createInput({ stick: $('stick'), knob: $('knob'), primary: $('boost') });

// ---------- rede ----------
let killsTick = 0;
const killedBy = new Map(); // mortes do tick atual, para juntar batidas de frente numa frase só
const hooks = {
  eat(p, sid) {
    pellets.eaten(p, out => { const s = st.snakes.get(sid); return !!s && !!pt(s, 0, out); });
    if (sid === myId && p.k) myPowers[S.POWER[p.k].fx] = time + S.POWER[p.k].secs;
  },
  die(s, killer) {
    const cs = skinColors[s.skin];
    for (let i = 0; i < s.body.length; i += 6) bursts.emit(s.body[i], s.body[i + 1], s.body[i + 2], cs[(i / 6) % cs.length], 3, 7);
    if (killsTick !== st.tick) { killsTick = st.tick; killedBy.clear(); }
    killedBy.set(s.id, killer);
    const last = $('feed').firstChild;
    if (killer > 0 && killedBy.get(killer) === s.id && last) last.textContent = `${names.get(killer) ?? '?'} e ${s.name} bateram de frente`;
    else if (killer > 0) feed(`${names.get(killer) ?? '?'} derrotou ${s.name}`);
    else if (killer === 0) feed(`${s.name} bateu na parede`);
    if (s.id === myId) died(killer > 0 ? `${names.get(killer) ?? 'Alguém'} pegou você com ${s.score} pontos.`
      : `Você bateu na parede da arena com ${s.score} pontos.`, killer);
  },
  spawn(s) { names.set(s.id, s.name); },
};
const playback = createPlayback(S.TICK_RATE, m => applyTick(st, m, hooks));

const menu = createMenu((name, skin) => { net.send({ t: 'join', name, skin }); spectateId = 0; });
const syncGlow = setupGlow(eng);
const net = connect('/ws/slither', {
  onInit(m) {
    applyInit(st, m);
    playback.reset(m.n);
    for (const s of st.snakes.values()) names.set(s.id, s.name);
    if (myId) died('A conexão caiu e sua cobra ficou para trás.', 0); // reconectou
  },
  onTick(m) {
    playback.push(m);
    if (playback.size > S.TICK_RATE * 20) net.reconnect(); // aba ficou escondida muito tempo: pega o estado novo
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
const V = new THREE.Vector3(), H = new THREE.Vector3(), D = new THREE.Vector3(), E = new THREE.Vector3();
const side = new THREE.Vector3(), eyeUp = new THREE.Vector3(), tmpC = new THREE.Color();

// posição do gomo i (índice no array plano) suavizada entre o tick anterior e o atual
function pt(s, i, out) {
  const b = s.body, p = s.prev;
  if (!p || i + 2 >= p.length) return out.set(b[i], b[i + 1], b[i + 2]);
  return out.set(p[i] + (b[i] - p[i]) * alpha, p[i + 1] + (b[i + 1] - p[i + 1]) * alpha, p[i + 2] + (b[i + 2] - p[i + 2]) * alpha);
}
// direção da cabeça = para onde ela andou no último tick
function heading(s, out) {
  const b = s.body, p = s.prev;
  if (p) out.set(b[0] - p[0], b[1] - p[1], b[2] - p[2]);
  if (!p || out.lengthSq() < 1e-8) out.set(b[0] - b[3], b[1] - b[4], b[2] - b[5]);
  return out.lengthSq() < 1e-8 ? out.set(0, 0, -1) : out.normalize();
}

function drawSnakes() {
  bodyB.begin(); ghostB.begin(); eyeB.begin(); pupilB.begin(); shieldB.begin();
  const tags = [];
  for (const s of st.snakes.values()) {
    const mine = s.id === myId, ghost = s.flags & S.FX.GHOST, r = S.radius(s.score), cs = skinColors[s.skin];
    const batch = ghost ? ghostB : bodyB, boost = s.flags & S.FX.BOOST;
    pt(s, 0, H);
    const far = H.distanceToSquared(camera.position) > 50 * 50; // longe: metade dos gomos basta
    for (let i = s.body.length - 3; i >= 0; i -= far ? 6 : 3) {
      pt(s, i, V);
      const c = cs[Math.floor(i / 9) % cs.length];
      batch.add(V.x, V.y, V.z, i === 0 ? r * 1.12 : r, boost ? tmpC.copy(c).multiplyScalar(1.8) : c);
    }
    if (boost && Math.random() < 0.5) { const t = s.body.length - 3; bursts.emit(s.body[t], s.body[t + 1], s.body[t + 2], cs[0], 1, 1.5); }
    if (ghost && !mine) continue; // invisível: sem olhos, escudo nem nome para entregar
    if (!mine) tags.push([s.name, H.x, H.y, H.z, r * 1.8]);
    heading(s, D);
    side.crossVectors(D, camera.up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    eyeUp.crossVectors(side, D);
    for (const sg of [-1, 1]) {
      E.copy(H).addScaledVector(D, r * 0.55).addScaledVector(side, sg * r * 0.48).addScaledVector(eyeUp, r * 0.42);
      eyeB.add(E.x, E.y, E.z, r * 0.36, WHITE);
      E.addScaledVector(D, r * 0.2);
      pupilB.add(E.x, E.y, E.z, r * 0.2, BLACK);
    }
    if (s.flags & S.FX.SHIELD) shieldB.add(H.x, H.y, H.z, r * (2.3 + Math.sin(time * 6) * 0.15), SHIELD);
  }
  bodyB.end(); ghostB.end(); eyeB.end(); pupilB.end(); shieldB.end();
  labels.draw(tags);
}

function hud() {
  syncGlow();
  const ranked = [...st.snakes.values()].sort((a, b) => b.score - a.score);
  renderBoard(ranked, st.snakes.get(myId));
  renderPowers(st.snakes.get(myId)?.flags ?? 0, myPowers, time);
}

// ---------- loop ----------
let sendT = 0, hudT = 1, orbit = 0; // hudT = 1: ranking já aparece no 1º quadro
eng.run((dt, now) => {
  time = now;
  alpha = playback.update(dt);
  bursts.update(dt);

  const me = st.snakes.get(myId);
  const focus = me ?? st.snakes.get(spectateId) ?? [...st.snakes.values()].sort((a, b) => b.score - a.score)[0];
  if (focus) {
    pt(focus, 0, H);
    cam.update(H, heading(focus, D), S.radius(focus.score), dt, me ? 1 : 1.6);
  } else {
    orbit += dt * 0.1;
    camera.position.set(Math.sin(orbit) * S.R * 0.8, 10, Math.cos(orbit) * S.R * 0.8);
    camera.lookAt(0, 0, 0);
  }
  eng.setWallFocus(me ? H : camera.position);
  $('warn').style.opacity = me ? Math.max(0, Math.min(1, (H.length() - (S.R - 14)) / 10)) : 0;

  if (me && (sendT += dt) >= S.DT) {
    sendT = 0;
    const { x, y, primary } = input.get(), u = cam.up;
    net.send({ t: 'in', x: +x.toFixed(3), y: +y.toFixed(3), u: [+u.x.toFixed(3), +u.y.toFixed(3), +u.z.toFixed(3)], b: primary ? 1 : 0 });
  }

  drawSnakes();
  pellets.draw(st.pellets, time, dt);
  if ((hudT += dt) > 0.25) { hudT = 0; hud(); }
});
