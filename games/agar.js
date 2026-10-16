// Sala das Bolhas 3D (estilo agar.io). O servidor é a autoridade, como na Cobrinha.
//
// Cada jogador tem uma direção (vira com o mesmo controle da Cobrinha) e de 1 a 16 células.
// Células andam sempre para a frente; as menores são mais rápidas.
//
// Protocolo (JSON):
//   cliente → servidor
//     {t:'join', name, skin}
//     {t:'in', x, y, u:[ux,uy,uz]}          direção (igual à Cobrinha)
//     {t:'split'} / {t:'eject'}              dividir / ejetar massa (uma vez por toque)
//   servidor → cliente
//     {t:'init', n, players, cells, pellets}
//     {t:'tick', n, p, c, join?, born?, add?, eat?, gone?, die?}
//         p:    [id, dx, dy, dz, flags, massaTotal]  todo jogador vivo
//         c:    [id, x, y, z, massa]                 só células que mudaram
//         join: [id, nome, skin]                     jogador entrou
//         born: [id, dono, x, y, z, massa, cor]      célula nova (dono: id do jogador, 0 = massa ejetada, -1 = ouriço)
//         add:  [id, x, y, z, valor, tipo, cor]      bolinha nova (tipo 0 = comida, 1..4 = power-up)
//         eat:  [bolinhaId, célulaId]
//         gone: [célulaId, quemEngoliuId]            (0 = sumiu)
//         die:  [jogadorId, assassinoId]             (0 = sumiu, -1 = saiu do jogo)
//     {t:'you', id}                                seu jogador nasceu com esse id
//   O navegador aplica nesta ordem: join, born, p, c, add, eat, gone, die (criar → mexer → remover).
import * as A from '../public/shared/agar-rules.js';
import { pick, dot, norm, randomDir, randomPoint, turn, steerDir, parseSteer, cleanName } from './vec.js';

const q = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const VIRUS_COLOR = 0x19e68c;

// grade das bolinhas de comida (são muitas e quase não se mexem)
const PG = 8;
const pkey = (ix, iy, iz) => ((ix + 64) * 128 + iy + 64) * 128 + iz + 64;
const cellOf = v => Math.floor(v / PG);

export function createAgarRoom() {
  let tick = 0, pids = 0, cids = 0, fids = 0, foodCount = 0, powerCount = 0, virusCount = 0, ev = null;
  const players = new Map(), cells = new Map(), pellets = new Map(), pgrid = new Map(), clients = new Set();
  const joins = [], leaving = [];

  const on = (p, fx) => p.fx[fx] > tick;
  const flags = p => ['SHIELD', 'SPEED', 'GHOST', 'MAGNET'].reduce((f, k) => on(p, k) ? f | A.FX[k] : f, 0);
  const totalMass = p => { let m = 0; for (const c of p.cells) m += c.m; return m; };
  const ownerCode = c => c.kind === 'player' ? c.owner.id : c.kind === 'mass' ? 0 : -1;
  const packPlayer = p => [p.id, p.name, p.skin, r2(p.dir[0]), r2(p.dir[1]), r2(p.dir[2]), flags(p), Math.round(totalMass(p))];
  const packCell = c => [c.id, ownerCode(c), q(c.x), q(c.y), q(c.z), Math.round(c.m), c.c];
  const packPellet = p => [p.id, p.x, p.y, p.z, p.v, p.k, p.c];
  const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };

  // ---------- bolinhas ----------
  function addPellet(x, y, z, v, k, c) {
    const p = { id: ++fids, x: q(x), y: q(y), z: q(z), v, k, c };
    p.key = pkey(cellOf(p.x), cellOf(p.y), cellOf(p.z));
    pellets.set(p.id, p);
    (pgrid.get(p.key) ?? pgrid.set(p.key, new Set()).get(p.key)).add(p);
    if (k) powerCount++; else foodCount++;
    ev?.add.push(packPellet(p));
  }
  function removePellet(p, by) {
    pellets.delete(p.id);
    pgrid.get(p.key).delete(p);
    if (p.k) powerCount--; else foodCount--;
    ev?.eat.push([p.id, by]);
  }
  function pelletsNear(x, y, z, r, fn) {
    const k = Math.ceil(r / PG), ix = cellOf(x), iy = cellOf(y), iz = cellOf(z);
    for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) for (let c = -k; c <= k; c++) {
      const set = pgrid.get(pkey(ix + a, iy + b, iz + c));
      if (set) for (const p of set) fn(p);
    }
  }

  // ---------- células ----------
  // kind: 'player' (de alguém), 'mass' (massa ejetada) ou 'virus' (ouriço)
  function addCell(kind, owner, x, y, z, m, c, v = [0, 0, 0]) {
    const cell = { id: ++cids, kind, owner, x, y, z, m, c, vx: v[0], vy: v[1], vz: v[2], r: A.radius(m), merge: 0, born: tick, dead: false };
    cells.set(cell.id, cell);
    if (owner) owner.cells.add(cell);
    if (kind === 'virus') virusCount++;
    const packed = packCell(cell);
    cell.sent = packed.slice(2, 6).join();
    ev?.born.push(packed);
    return cell;
  }
  function removeCell(cell, eater) {
    cell.dead = true;
    cells.delete(cell.id);
    if (cell.owner) cell.owner.cells.delete(cell);
    if (cell.kind === 'virus') virusCount--;
    ev?.gone.push([cell.id, eater ? eater.id : 0]);
  }
  const skinColor = p => { const cs = A.SKINS[p.skin].colors; return cs[p.n++ % cs.length]; };

  // ---------- jogadores ----------
  function spawnPlayer({ name, skin, bot = false, ws = null }) {
    let pos, best = -1;
    for (let t = 0; t < 12; t++) { // longe de quem é grande
      const pt = randomPoint(A.R * 0.75);
      let m = Infinity;
      for (const c of cells.values()) if (c.kind === 'player') m = Math.min(m, Math.hypot(c.x - pt[0], c.y - pt[1], c.z - pt[2]) - c.r);
      if (m > best) { best = m; pos = pt; }
    }
    const p = { id: ++pids, name, skin, bot, ws, cells: new Set(), dir: randomDir(), aim: null, steer: null, fx: {}, n: 0, actions: [], alive: true };
    players.set(p.id, p);
    ev?.join.push([p.id, name, skin]);
    addCell('player', p, ...pos, bot ? A.START_MASS + Math.floor(Math.random() ** 3 * 250) : A.START_MASS, skinColor(p));
    return p;
  }

  function killPlayer(p, killer, code = 0) {
    if (!p.alive) return;
    p.alive = false;
    players.delete(p.id);
    for (const c of [...p.cells]) removeCell(c, null);
    if (p.ws) p.ws.player = null;
    ev.die.push([p.id, killer ? killer.id : code]);
  }

  function split(p) {
    const d = p.dir;
    for (const c of [...p.cells].sort((a, b) => b.m - a.m)) {
      if (p.cells.size >= A.MAX_CELLS) break;
      if (c.m < A.SPLIT_MIN) continue;
      c.m /= 2;
      c.r = A.radius(c.m);
      const n = addCell('player', p, c.x + d[0] * c.r, c.y + d[1] * c.r, c.z + d[2] * c.r, c.m, skinColor(p),
        [d[0] * A.SPLIT_SPEED, d[1] * A.SPLIT_SPEED, d[2] * A.SPLIT_SPEED]);
      n.merge = c.merge = tick + A.mergeTicks(c.m);
    }
  }

  function eject(p) {
    const d = p.dir;
    for (const c of p.cells) {
      if (c.m < A.EJECT_MIN) continue;
      c.m -= A.EJECT_LOSS;
      c.r = A.radius(c.m);
      const k = c.r + A.radius(A.EJECT_MASS) + 0.5;
      addCell('mass', null, c.x + d[0] * k, c.y + d[1] * k, c.z + d[2] * k, A.EJECT_MASS, c.c, [d[0] * 28, d[1] * 28, d[2] * 28]);
    }
  }

  // engoliu: cresce, e o engolido some (se era a última célula do dono, ele morreu)
  function absorb(big, small) {
    big.m = Math.min(A.MAX_MASS, big.m + small.m);
    big.r = A.radius(big.m);
    removeCell(small, big);
    const victim = small.kind === 'player' ? small.owner : null;
    if (victim && victim.cells.size === 0) killPlayer(victim, big.owner);
  }

  // célula grande encostou num ouriço: come e explode em pedaços
  function popVirus(cell, virus) {
    absorb(cell, virus);
    const p = cell.owner, pieces = Math.min(A.MAX_CELLS - p.cells.size, Math.floor(cell.m / 25), 10);
    if (pieces <= 0) return;
    const m = cell.m / (pieces + 1);
    cell.m = m;
    cell.r = A.radius(m);
    cell.merge = tick + A.mergeTicks(m);
    for (let i = 0; i < pieces; i++) {
      const d = randomDir();
      const n = addCell('player', p, cell.x + d[0] * cell.r, cell.y + d[1] * cell.r, cell.z + d[2] * cell.r, m, skinColor(p),
        [d[0] * A.SPLIT_SPEED * 0.7, d[1] * A.SPLIT_SPEED * 0.7, d[2] * A.SPLIT_SPEED * 0.7]);
      n.merge = cell.merge;
    }
  }

  // massa ejetada alimenta o ouriço; cheio, ele dispara um filhote na direção do tiro
  function feedVirus(virus, mass) {
    virus.m += mass.m;
    removeCell(mass, virus);
    if (virus.m < A.VIRUS_MAX) return void (virus.r = A.radius(virus.m));
    virus.m = A.VIRUS_MASS;
    virus.r = A.radius(virus.m);
    if (virusCount >= A.VIRUSES * 2) return;
    const d = norm([mass.vx, mass.vy, mass.vz]), k = virus.r * 2;
    addCell('virus', null, virus.x + d[0] * k, virus.y + d[1] * k, virus.z + d[2] * k, A.VIRUS_MASS, VIRUS_COLOR, [d[0] * 30, d[1] * 30, d[2] * 30]);
  }

  // ---------- bots ----------
  function think(p) {
    let big = null;
    for (const c of p.cells) if (!big || c.m > big.m) big = c;
    const v = [0, 0, 0];
    const push = (dx, dy, dz, w) => { const d = Math.hypot(dx, dy, dz) || 1; v[0] += dx / d * w; v[1] += dy / d * w; v[2] += dz / d * w; };
    let target = null, targetD = Infinity;
    for (const c of cells.values()) {
      if (c.owner === p || c.kind === 'mass') continue;
      const dx = c.x - big.x, dy = c.y - big.y, dz = c.z - big.z, d = Math.hypot(dx, dy, dz);
      if (d > 30 + big.r + c.r) continue;
      if (c.kind === 'virus') { if (big.m > c.m * A.EAT_RATIO && d < big.r + c.r + 6) push(-dx, -dy, -dz, 3); continue; }
      if (on(c.owner, 'GHOST')) continue; // bot não enxerga quem está invisível
      if (c.m > big.m * A.EAT_RATIO) push(-dx, -dy, -dz, 6 + 60 / (d + 1)); // foge de quem pode te engolir
      else if (big.m > c.m * A.EAT_RATIO && !on(c.owner, 'SHIELD') && d < targetD) { target = c; targetD = d; }
    }
    if (target) {
      push(target.x - big.x, target.y - big.y, target.z - big.z, 4);
      // ataque: divide em cima da presa se cabe e está perto
      if (big.m / 2 > target.m * A.EAT_RATIO && targetD < big.r + 10 && p.cells.size < 4 && Math.random() < 0.3) p.actions.push('split');
    } else {
      let best = 0, goal = null;
      pelletsNear(big.x, big.y, big.z, 20, f => {
        const dx = f.x - big.x, dy = f.y - big.y, dz = f.z - big.z, w = (f.k ? 8 : f.v) / (dx * dx + dy * dy + dz * dz + 4);
        if (w > best) { best = w; goal = [dx, dy, dz]; }
      });
      if (goal) push(...goal, 2);
    }
    const dc = Math.hypot(big.x, big.y, big.z);
    if (dc > A.R - big.r - 8) push(-big.x, -big.y, -big.z, 5); // longe da parede
    p.aim = dot(v, v) > 1e-6 ? norm(v) : null;
  }

  // ---------- passo da simulação ----------
  function move() {
    const centers = new Map(); // centro de massa de cada jogador: as células se puxam para ele
    for (const p of players.values()) {
      if (p.cells.size < 2) continue;
      let x = 0, y = 0, z = 0, m = 0;
      for (const c of p.cells) { x += c.x * c.m; y += c.y * c.m; z += c.z * c.m; m += c.m; }
      centers.set(p, [x / m, y / m, z / m]);
    }
    const drag = Math.exp(-3 * A.DT);
    for (const c of cells.values()) {
      let vx = c.vx, vy = c.vy, vz = c.vz;
      if (c.kind === 'player') {
        const p = c.owner, s = A.speed(c.m) * (on(p, 'SPEED') ? 1.35 : 1);
        vx += p.dir[0] * s; vy += p.dir[1] * s; vz += p.dir[2] * s;
        const ctr = centers.get(p);
        if (ctr) { vx += (ctr[0] - c.x) * 0.8; vy += (ctr[1] - c.y) * 0.8; vz += (ctr[2] - c.z) * 0.8; }
        if (c.m > 150) c.m -= c.m * A.decay(c.m) * A.DT; // célula grande murcha (quanto maior, mais rápido)
      }
      c.x += vx * A.DT; c.y += vy * A.DT; c.z += vz * A.DT;
      c.vx *= drag; c.vy *= drag; c.vz *= drag;
      if (Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.vz) < 0.05) c.vx = c.vy = c.vz = 0;
      c.r = A.radius(c.m);
      const d = Math.hypot(c.x, c.y, c.z), lim = Math.max(0, A.R - c.r);
      if (d > lim) { c.x *= lim / d; c.y *= lim / d; c.z *= lim / d; } // parede segura (não mata)
    }
  }

  function eatPellets() {
    for (const c of cells.values()) {
      if (c.kind !== 'player') continue;
      const p = c.owner, reach = c.r + (on(p, 'MAGNET') ? A.MAGNET_REACH : 0.3), r2 = reach * reach;
      pelletsNear(c.x, c.y, c.z, reach, f => {
        if ((f.x - c.x) ** 2 + (f.y - c.y) ** 2 + (f.z - c.z) ** 2 > r2) return;
        removePellet(f, c.id);
        c.m = Math.min(A.MAX_MASS, c.m + f.v);
        if (f.k) p.fx[A.POWER[f.k].fx] = tick + A.POWER[f.k].secs * A.TICK_RATE;
      });
    }
  }

  function collide() {
    const list = [...cells.values()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, rr = a.r + b.r;
      if (Math.abs(dx) > rr || Math.abs(dy) > rr || Math.abs(dz) > rr) continue;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      if (a.kind === 'player' && b.kind === 'player' && a.owner === b.owner) {
        if (tick < a.merge || tick < b.merge) { // ainda não pode juntar: empurra para não sobrepor
          const k = (rr - d) / 2 / (d || 1), ex = d ? dx : 1;
          a.x -= ex * k; a.y -= dy * k; a.z -= dz * k;
          b.x += ex * k; b.y += dy * k; b.z += dz * k;
        } else if (d < Math.max(a.r, b.r) * 0.7) absorb(a.m >= b.m ? a : b, a.m >= b.m ? b : a);
        continue;
      }
      const [big, small] = a.m >= b.m ? [a, b] : [b, a];
      const inside = d < big.r - small.r * 0.35;
      if (big.kind === 'virus') { if (small.kind === 'mass' && d < big.r) feedVirus(big, small); continue; }
      if (big.kind !== 'player') continue;
      if (small.kind === 'virus') { if (big.m > small.m * A.EAT_RATIO && inside) popVirus(big, small); continue; }
      if (small.kind === 'mass' && tick - small.born < 10) continue; // acabou de ser ejetada
      if (small.kind === 'player' && on(small.owner, 'SHIELD')) continue;
      if (big.m >= small.m * A.EAT_RATIO && inside) absorb(big, small);
    }
  }

  function populate() {
    for (const j of joins.splice(0)) {
      if (j.ws.readyState !== 1 || j.ws.player) continue;
      j.ws.player = spawnPlayer(j);
      send(j.ws, { t: 'you', id: j.ws.player.id });
    }
    if (players.size < A.MAX_PLAYERS && tick % 10 === 0) {
      const used = new Set([...players.values()].map(p => p.name));
      spawnPlayer({ name: pick(A.BOT_NAMES.filter(n => !used.has(n))) ?? pick(A.BOT_NAMES), skin: Math.floor(Math.random() * A.SKINS.length), bot: true });
    }
    while (foodCount < A.FOOD) addPellet(...randomPoint(A.R - 1), 1, 0, pick(A.FOOD_COLORS));
    if (powerCount < A.POWERUP_COUNT && Math.random() < 0.02) {
      const k = 1 + Math.floor(Math.random() * (A.POWER.length - 1));
      addPellet(...randomPoint(A.R * 0.8), 5, k, A.POWER[k].color);
    }
    if (virusCount < A.VIRUSES && (tick % 20 === 0 || !ev)) addCell('virus', null, ...randomPoint(A.R * 0.85), A.VIRUS_MASS, VIRUS_COLOR);
  }

  function step() {
    tick++;
    ev = { join: [], born: [], add: [], eat: [], gone: [], die: [] };
    for (const p of leaving.splice(0)) killPlayer(p, null, -1);
    for (const p of players.values()) {
      if (p.bot && (tick + p.id) % 4 === 0) think(p);
      for (const a of p.actions.splice(0)) a === 'split' ? split(p) : eject(p);
      if (p.steer) p.dir = steerDir(p.dir, p.steer, A.TURN * A.DT);
      else if (p.aim) p.dir = turn(p.dir, p.aim, A.TURN * A.DT);
    }
    move();
    eatPellets();
    collide();
    populate();
    const c = [];
    for (const cell of cells.values()) {
      const packed = packCell(cell), key = packed.slice(2, 6).join();
      if (key !== cell.sent) { cell.sent = key; c.push([cell.id, ...packed.slice(2, 6)]); }
    }
    const m = { t: 'tick', n: tick, p: [...players.values()].map(p => packPlayer(p).filter((_, i) => i !== 1 && i !== 2)), c };
    for (const k in ev) if (ev[k].length) m[k] = ev[k];
    ev = null;
    const msg = JSON.stringify(m);
    for (const ws of clients) {
      if (ws.readyState !== 1) continue;
      if (ws.bufferedAmount > 512 * 1024) ws.terminate(); else ws.send(msg);
    }
    return m;
  }

  function handle(ws, m) {
    if (m?.t === 'join') {
      if (ws.player || joins.some(j => j.ws === ws)) return;
      const skin = Number.isInteger(m.skin) && m.skin >= 0 && m.skin < A.SKINS.length ? m.skin : 0;
      joins.push({ ws, name: cleanName(m.name), skin });
    } else if (!ws.player) {
      return;
    } else if (m?.t === 'in') {
      ws.player.steer = parseSteer(m) ?? ws.player.steer;
    } else if ((m?.t === 'split' || m?.t === 'eject') && ws.player.actions.length < 3) {
      ws.player.actions.push(m.t);
    }
  }

  function connect(ws) {
    if (clients.size >= A.MAX_CLIENTS) return ws.close(1013, 'Sala cheia');
    clients.add(ws);
    send(ws, { t: 'init', n: tick, players: [...players.values()].map(packPlayer), cells: [...cells.values()].map(packCell), pellets: [...pellets.values()].map(packPellet) });
    ws.on('message', data => { try { handle(ws, JSON.parse(data)); } catch { /* mensagem inválida: ignora */ } });
    ws.on('close', () => { clients.delete(ws); if (ws.player) leaving.push(ws.player); });
  }

  for (let i = 0; i < A.MAX_PLAYERS; i++) spawnPlayer({ name: A.BOT_NAMES[i % A.BOT_NAMES.length], skin: i % A.SKINS.length, bot: true });
  for (let i = 0; i < A.VIRUSES; i++) populate();

  return { step, connect, players, cells, pellets, get tick() { return tick; } };
}
