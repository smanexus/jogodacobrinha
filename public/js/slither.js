// Cobrinha 3D — lado do navegador: recebe o estado do servidor, desenha e manda os controles.
import { THREE, createEngine, Batch, Bursts, ChaseCam, createInput, store } from './engine.js';
import * as S from '../shared/slither-rules.js';
import { createState, applyInit, applyTick } from '../shared/slither-state.js';
import { connect, createPlayback } from './net.js';

const $ = id => document.getElementById(id);
const eng = createEngine(S.R);
const { scene, camera } = eng;
const st = createState();
const names = new Map(); // id → nome, guardado mesmo depois que a cobra morre (para o "quem te pegou")
let myId = 0, spectateId = 0, alpha = 1, time = 0;
const myPowers = {}; // fx → segundo (relógio local) em que acaba, só para o contador do HUD

const palette = new Map();
const col = hex => palette.get(hex) ?? palette.set(hex, new THREE.Color(hex)).get(hex);
const skinColors = S.SKINS.map(s => s.colors.map(col));
const WHITE = col(0xffffff), BLACK = col(0x05020d), SHIELD = col(0x3fd8ff);

// ---------- malhas ----------
const bodyB = new Batch(scene, new THREE.SphereGeometry(1, 16, 12), 14000, { glow: 0.22 });
const ghostB = new Batch(scene, new THREE.SphereGeometry(1, 12, 8), 4000, { glow: 0.6, opacity: 0.1 });
const eyeB = new Batch(scene, new THREE.SphereGeometry(1, 12, 8), 300, { glow: 0.15 });
const pupilB = new Batch(scene, new THREE.SphereGeometry(1, 8, 6), 300, { glow: 0 });
const foodB = new Batch(scene, new THREE.IcosahedronGeometry(1, 0), 8000, { glow: 1 });
const shieldB = new Batch(scene, new THREE.IcosahedronGeometry(1, 2), 64, { glow: 0.6, opacity: 0.22, additive: true });
const powerGeo = [null, new THREE.TorusGeometry(0.8, 0.32, 8, 24), new THREE.OctahedronGeometry(1.1),
  new THREE.ConeGeometry(0.75, 1.7, 6), new THREE.IcosahedronGeometry(1, 1)];
const powerB = powerGeo.map(g => g && new Batch(scene, g, 32, { glow: 1.4 }));
const bursts = new Bursts(scene);
const cam = new ChaseCam(camera);
const input = createInput({ boostBtn: $('boost'), stick: $('stick'), knob: $('knob') });

// ---------- rede ----------
const flying = []; // comida sendo engolida (animação de 0,18 s)
let killsTick = 0;
const killedBy = new Map(); // mortes do tick atual, para juntar batidas de frente numa frase só
const hooks = {
  eat(p, sid) {
    flying.push({ x: p.x, y: p.y, z: p.z, c: col(p.c), s: pelletSize(p), sid, t: 0 });
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
    if (s.id === myId) died(s, killer);
  },
  spawn(s) { names.set(s.id, s.name); },
};
const playback = createPlayback(S.TICK_RATE, m => applyTick(st, m, hooks));

const STATUS = {
  connecting: 'Conectando ao servidor…',
  online: '',
  full: 'A sala está cheia. Tentando de novo em instantes…',
  offline: 'Sem conexão com o servidor. Tentando de novo…',
};
const net = connect('/ws/slither', {
  onInit(m) {
    applyInit(st, m);
    playback.reset(m.n);
    for (const s of st.snakes.values()) names.set(s.id, s.name);
    if (myId) died(null, -2); // reconectou: a cobra antiga ficou para trás
  },
  onTick(m) {
    playback.push(m);
    if (playback.size > S.TICK_RATE * 20) net.reconnect(); // aba ficou escondida muito tempo: pega o estado novo
  },
  onYou(m) { myId = m.id; },
  onStatus(s) {
    $('status').textContent = STATUS[s];
    $('play').disabled = s !== 'online';
  },
});

// ---------- menu ----------
const nameInput = $('name');
nameInput.value = store.get('nome', '');
let skin = Math.min(S.SKINS.length - 1, Number(store.get('skin', 0)) || 0);
$('skins').replaceChildren(...S.SKINS.map((sk, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'skin';
  b.style.setProperty('--stripes', `repeating-linear-gradient(90deg, ${sk.colors.map((c, j) =>
    `#${c.toString(16).padStart(6, '0')} ${j * 14}px ${(j + 1) * 14}px`).join(', ')})`);
  b.innerHTML = '<span class="swatch"></span>';
  b.append(sk.name);
  b.setAttribute('aria-pressed', i === skin);
  b.onclick = () => {
    skin = i;
    store.set('skin', i);
    for (const o of $('skins').children) o.setAttribute('aria-pressed', o === b);
  };
  return b;
}));

function play() {
  const name = nameInput.value.trim();
  store.set('nome', name);
  net.send({ t: 'join', name: name || 'Anônimo', skin });
  $('menu').hidden = true;
  document.body.classList.add('playing');
  spectateId = 0;
}
$('play').onclick = play;
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !$('play').disabled) play(); });
$('glow').onclick = () => $('glow').setAttribute('aria-pressed', eng.toggleGlow());
$('glow').setAttribute('aria-pressed', eng.glow);

function died(s, killer) {
  myId = 0;
  spectateId = killer > 0 ? killer : 0;
  for (const k in myPowers) delete myPowers[k];
  $('death').hidden = false;
  $('death').textContent =
    killer > 0 ? `${names.get(killer) ?? 'Alguém'} pegou você com ${s.score} pontos.`
    : killer === 0 ? `Você bateu na parede da arena com ${s.score} pontos.`
    : 'A conexão caiu e sua cobra ficou para trás.';
  $('play').textContent = 'Jogar de novo';
  $('menu').hidden = false;
  document.body.classList.remove('playing');
}

function feed(text) {
  const li = document.createElement('li');
  li.textContent = text;
  $('feed').prepend(li);
  while ($('feed').children.length > 4) $('feed').lastChild.remove();
  setTimeout(() => li.remove(), 6000);
}

// ---------- desenho ----------
const V = new THREE.Vector3(), H = new THREE.Vector3(), D = new THREE.Vector3(), E = new THREE.Vector3();
const side = new THREE.Vector3(), eyeUp = new THREE.Vector3(), tmpC = new THREE.Color();
const Q = new THREE.Quaternion(), EUL = new THREE.Euler();
const pelletSize = p => 0.22 + Math.sqrt(p.v) * 0.14;

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
    if (ghost && !mine) continue; // invisível: sem olhos nem escudo para entregar
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
}

function drawPellets(dt) {
  foodB.begin();
  for (const b of powerB) b?.begin();
  for (const p of st.pellets.values()) {
    if (p.k) {
      Q.setFromEuler(EUL.set(time * 1.3 + p.id, time * 2 + p.id, 0));
      powerB[p.k].add(p.x, p.y, p.z, 1 + 0.15 * Math.sin(time * 4 + p.id), col(p.c), Q);
    } else foodB.add(p.x, p.y, p.z, pelletSize(p) * (1 + 0.18 * Math.sin(time * 3 + p.id)), col(p.c));
  }
  for (let i = flying.length - 1; i >= 0; i--) { // comida voando para a boca de quem comeu
    const f = flying[i], s = st.snakes.get(f.sid);
    f.t += dt / 0.18;
    if (f.t >= 1 || !s) { flying.splice(i, 1); continue; }
    pt(s, 0, V);
    f.x += (V.x - f.x) * f.t; f.y += (V.y - f.y) * f.t; f.z += (V.z - f.z) * f.t;
    foodB.add(f.x, f.y, f.z, f.s * (1 - f.t), f.c);
  }
  foodB.end();
  for (const b of powerB) b?.end();
}

// nomes em cima das cobras próximas (div posicionada na tela, mais barato que texto 3D)
const labelEls = [];
function drawLabels() {
  camera.updateMatrixWorld();
  let n = 0;
  for (const s of st.snakes.values()) {
    if (n >= 12 || s.id === myId || s.flags & S.FX.GHOST) continue;
    pt(s, 0, V).addScaledVector(camera.up, S.radius(s.score) * 1.8);
    if (V.distanceToSquared(camera.position) > 45 * 45) continue;
    if (E.copy(V).applyMatrix4(camera.matrixWorldInverse).z > -1) continue; // atrás da câmera
    V.project(camera);
    const el = labelEls[n] ?? (labelEls[n] = $('labels').appendChild(document.createElement('span')));
    if (el.textContent !== s.name) el.textContent = s.name;
    el.style.transform = `translate(${(V.x + 1) * innerWidth / 2}px, ${(1 - V.y) * innerHeight / 2}px) translate(-50%, -100%)`;
    el.hidden = false;
    n++;
  }
  for (let i = n; i < labelEls.length; i++) labelEls[i].hidden = true;
}

// ---------- HUD ----------
const fmt = n => n.toLocaleString('pt-BR');
function hud() {
  $('glow').setAttribute('aria-pressed', eng.glow); // pode ter desligado sozinho
  const me = st.snakes.get(myId);
  const ranked = [...st.snakes.values()].sort((a, b) => b.score - a.score);
  $('score').textContent = me ? fmt(me.score) : '';
  $('rank').textContent = me ? `${ranked.indexOf(me) + 1}º de ${ranked.length}` : '';
  $('board').replaceChildren(...ranked.slice(0, 8).map(s => {
    const li = document.createElement('li');
    li.textContent = s.name;
    const b = document.createElement('b');
    b.textContent = fmt(s.score);
    li.append(b);
    if (s === me) li.className = 'me';
    return li;
  }));
  $('powers').replaceChildren(...S.POWER.filter(p => p && me && me.flags & S.FX[p.fx]).map(p => {
    const li = document.createElement('li');
    li.textContent = `${p.icon} ${p.name} ${Math.max(0, Math.ceil((myPowers[p.fx] ?? time) - time))}s`;
    return li;
  }));
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
    const { x, y, boost } = input.get(), u = cam.up;
    net.send({ t: 'in', x: +x.toFixed(3), y: +y.toFixed(3), u: [+u.x.toFixed(3), +u.y.toFixed(3), +u.z.toFixed(3)], b: boost ? 1 : 0 });
  }

  drawSnakes();
  drawPellets(dt);
  drawLabels();
  if ((hudT += dt) > 0.25) { hudT = 0; hud(); }
});
