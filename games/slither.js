// Sala da Cobrinha 3D. O servidor é a autoridade: move as cobras, decide
// colisões e comida, roda os bots e manda um "tick" para todo mundo.
//
// Protocolo (JSON):
//   cliente → servidor
//     {t:'join', name, skin}               entrar no jogo
//     {t:'in', x, y, u:[ux,uy,uz], b}      direção (-1..1, relativa à câmera; u = "cima" da câmera) e turbo
//   servidor → cliente
//     {t:'init', n, snakes, pellets}       estado completo ao conectar
//     {t:'tick', n, s, eat?, die?, spawn?, add?}
//         s:     [id, x, y, z, pontos, flags]   cabeça de cada cobra viva
//         eat:   [pelletId, cobraId]            (cobraId 0 = sumiu sozinha)
//         die:   [cobraId, assassinoId]         (0 = bateu na parede, -1 = saiu do jogo)
//         spawn: [id, nome, skin, pontos, flags, corpo]
//         add:   [id, x, y, z, valor, tipo, cor]
//     {t:'you', id}                        sua cobra nasceu com esse id
import * as S from '../public/shared/slither-rules.js';
import { rnd, pick, dot, cross, norm, perp, randomDir, randomPoint, turn, steerDir, parseSteer, cleanName } from './vec.js';

const q = v => Math.round(v * 100) / 100; // cabeças vão arredondadas: o cliente recebe o mesmo número

// grade espacial: acha gomos perto de um ponto sem testar todos
const CELL = 5;
const key = (x, y, z) => ((Math.floor(x / CELL) + 64) * 128 + Math.floor(y / CELL) + 64) * 128 + Math.floor(z / CELL) + 64;

export function createSlitherRoom() {
  let tick = 0, ids = 0, pids = 0, foodCount = 0, powerCount = 0, ev = null;
  const snakes = new Map(), pellets = new Map(), clients = new Set(), grid = new Map();
  const joins = [], leaving = [];

  const on = (s, fx) => s.fx[fx] > tick;
  const flags = s => Object.keys(S.FX).reduce((f, k) => (k === 'BOOST' ? s.boosting : on(s, k)) ? f | S.FX[k] : f, 0);
  const packSnake = s => [s.id, s.name, s.skin, Math.floor(s.score), flags(s), s.body];
  const packPellet = p => [p.id, p.x, p.y, p.z, p.v, p.k, p.c];
  const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };

  function addPellet(x, y, z, v, k, c, life = 0) {
    const p = { id: ++pids, x: q(x), y: q(y), z: q(z), v, k, c, born: tick, exp: life ? tick + life * S.TICK_RATE : 0 };
    pellets.set(p.id, p);
    if (k) powerCount++; else if (!life) foodCount++;
    ev?.add.push(packPellet(p));
  }

  function removePellet(p, by) {
    pellets.delete(p.id);
    if (p.k) powerCount--; else if (!p.exp) foodCount--;
    ev?.eat.push([p.id, by]);
  }

  function spawnSnake({ name, skin, bot = false, ws = null }) {
    // o lugar mais longe das outras cobras entre algumas tentativas
    let pos, best = -1;
    for (let t = 0; t < 12; t++) {
      const p = randomPoint(S.R * 0.6);
      let m = Infinity;
      for (const o of snakes.values()) for (let i = 0; i < o.body.length; i += 9) {
        m = Math.min(m, (o.body[i] - p[0]) ** 2 + (o.body[i + 1] - p[1]) ** 2 + (o.body[i + 2] - p[2]) ** 2);
      }
      if (m > best) { best = m; pos = p; }
    }
    const score = bot ? Math.floor(S.START_SCORE + Math.random() ** 3 * 400) : S.START_SCORE;
    const head = pos.map(q);
    const body = [];
    for (let i = 0; i < S.segCount(score); i++) body.push(...head); // nasce enrolada e se estica ao andar
    const dir = norm(randomDir().map((v, i) => v - pos[i] / S.R)); // de leve para o centro
    const s = { id: ++ids, name, skin, bot, ws, body, dir, aim: null, steer: null, boost: false, boosting: false,
      score, r: S.radius(score), fx: {}, drop: 0, alive: true };
    snakes.set(s.id, s);
    ev?.spawn.push(packSnake(s));
    return s;
  }

  function kill(s, killer, code = 0) {
    if (!s.alive) return;
    s.alive = false;
    snakes.delete(s.id);
    if (s.ws) s.ws.snake = null;
    ev.die.push([s.id, killer ? killer.id : code]);
    if (pellets.size > S.FOOD * 2) return; // arena lotada de comida: não larga mais
    const b = s.body, n = b.length / 3, count = Math.min(80, Math.ceil(n / 2));
    const v = Math.max(1, Math.round(Math.floor(s.score) * 0.7 / count));
    const colors = S.SKINS[s.skin].colors;
    for (let j = 0; j < count; j++) {
      const i = Math.floor(j * n / count) * 3, J = s.r * 0.7;
      addPellet(b[i] + rnd(-J, J), b[i + 1] + rnd(-J, J), b[i + 2] + rnd(-J, J), v, 0, colors[j % colors.length], S.DROP_LIFE);
    }
  }

  function eat(s) {
    const reach = s.r + (on(s, 'MAGNET') ? S.MAGNET_REACH : S.EAT_REACH), r2 = reach * reach;
    const [x, y, z] = s.body;
    for (const p of pellets.values()) { // ponytail: varre tudo (~3k); usar a grade se a comida passar de ~20k
      const dx = p.x - x, dy = p.y - y, dz = p.z - z;
      if (dx * dx + dy * dy + dz * dz > r2 || p.born === tick) continue; // nascida neste tick: o cliente ainda não sabe dela
      removePellet(p, s.id);
      s.score += p.v;
      if (p.k) s.fx[S.POWER[p.k].fx] = tick + S.POWER[p.k].secs * S.TICK_RATE;
    }
  }

  function move(s) {
    const b = s.body;
    let d = s.dir;
    const rate = S.turnRate(s.r) * S.DT;
    if (s.steer) d = steerDir(d, s.steer, rate); // humano: relativo à câmera dele
    else if (s.aim) d = turn(d, s.aim, rate);     // bot: mira absoluta
    s.dir = d;

    const free = on(s, 'SPEED');
    s.boosting = s.boost && (free || s.score >= S.BOOST_MIN);
    const v = (s.boosting ? S.BOOST_SPEED * (free ? 1.15 : 1) : S.SPEED) * S.DT;
    let x = b[0] + d[0] * v, y = b[1] + d[1] * v, z = b[2] + d[2] * v;
    const dist = Math.sqrt(x * x + y * y + z * z), lim = S.R - s.r;
    if (dist > lim && on(s, 'SHIELD')) { // escudo: quica na parede em vez de morrer
      const n = [x / dist, y / dist, z / dist], dn = dot(d, n);
      x = n[0] * lim; y = n[1] * lim; z = n[2] * lim;
      if (dn > 0) s.dir = norm([d[0] - 2 * dn * n[0], d[1] - 2 * dn * n[1], d[2] - 2 * dn * n[2]]);
    }
    b[0] = q(x); b[1] = q(y); b[2] = q(z);

    if (s.boosting && !free) {
      s.score -= S.BOOST_COST * S.DT;
      s.drop += S.BOOST_COST * S.DT;
      if (s.drop >= 2) { // o que gasta vira comida atrás do rabo
        s.drop -= 2;
        const t = b.length - 3;
        addPellet(b[t], b[t + 1], b[t + 2], 2, 0, S.SKINS[s.skin].colors[0], S.DROP_LIFE);
      }
    }
    eat(s);
    S.follow(b, Math.floor(s.score));
    s.r = S.radius(Math.floor(s.score));
  }

  function buildGrid() {
    grid.clear();
    for (const s of snakes.values()) {
      const b = s.body;
      for (let i = 0; i < b.length; i += 3) {
        const k = key(b[i], b[i + 1], b[i + 2]);
        const c = grid.get(k);
        if (c) c.push(s, i); else grid.set(k, [s, i]);
      }
    }
  }

  // chama fn(cobra, índice) para cada gomo nas 27 células em volta do ponto
  function near(x, y, z, fn) {
    const k0 = key(x, y, z);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const cell = grid.get(k0 + a * 16384 + b * 128 + c);
      if (cell) for (let i = 0; i < cell.length; i += 2) fn(cell[i], cell[i + 1]);
    }
  }

  // false = vivo; null = parede; cobra = quem matou
  function hit(s) {
    const [x, y, z] = s.body;
    if (x * x + y * y + z * z > (S.R - s.r * 0.5) ** 2) return null;
    if (on(s, 'SHIELD')) return false;
    let killer = false;
    near(x, y, z, (o, i) => {
      if (o === s || killer) return;
      const lim = (s.r + o.r) * 0.8;
      if ((o.body[i] - x) ** 2 + (o.body[i + 1] - y) ** 2 + (o.body[i + 2] - z) ** 2 < lim * lim) killer = o;
    });
    return killer;
  }

  function think(s) {
    const [hx, hy, hz] = s.body;
    let goal = null, best = 0, hunt = false;
    for (const p of pellets.values()) {
      const dx = p.x - hx, dy = p.y - hy, dz = p.z - hz;
      if (Math.abs(dx) > 25 || Math.abs(dy) > 25 || Math.abs(dz) > 25) continue;
      const w = (p.k ? 8 : p.v) / (dx * dx + dy * dy + dz * dz + 9);
      if (w > best) { best = w; goal = [dx, dy, dz]; }
    }
    for (const o of snakes.values()) { // cortar a frente de uma cobra menor
      if (o === s || on(o, 'GHOST') || o.score * 1.3 > s.score) continue;
      const t = [o.body[0] + o.dir[0] * 6 - hx, o.body[1] + o.dir[1] * 6 - hy, o.body[2] + o.dir[2] * 6 - hz];
      const w = 0.25 / (dot(t, t) + 9);
      if (w > best) { best = w; goal = t; hunt = true; }
    }
    const want = goal ? norm(goal) : s.dir;
    const u = perp(s.dir), w = cross(s.dir, u), cands = [want, s.dir];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, cu = Math.cos(a) * 1.2, cw = Math.sin(a) * 1.2;
      cands.push(norm([s.dir[0] + u[0] * cu + w[0] * cw, s.dir[1] + u[1] * cu + w[1] * cw, s.dir[2] + u[2] * cu + w[2] * cw]));
    }
    let choice = s.dir, top = -Infinity;
    for (const c of cands) {
      let score = dot(c, want) * 2;
      for (let j = 1; j <= 4; j++) {
        const t = j * (2 + s.r * 1.5), x = hx + c[0] * t, y = hy + c[1] * t, z = hz + c[2] * t;
        if (x * x + y * y + z * z > (S.R - s.r - 2) ** 2) score -= 6 / j;
        let danger = false;
        near(x, y, z, (o, i) => {
          if (danger || o === s || on(o, 'GHOST')) return; // bot não enxerga cobra invisível
          const lim = s.r + o.r + 1;
          danger = (o.body[i] - x) ** 2 + (o.body[i + 1] - y) ** 2 + (o.body[i + 2] - z) ** 2 < lim * lim;
        });
        if (danger) score -= 8 / j;
      }
      if (score > top) { top = score; choice = c; }
    }
    s.aim = choice;
    s.boost = (hunt && s.score > 40 && top > 0) || Math.random() < 0.01;
  }

  function populate() {
    for (const j of joins.splice(0)) {
      if (j.ws.readyState !== 1 || j.ws.snake) continue;
      j.ws.snake = spawnSnake(j);
      send(j.ws, { t: 'you', id: j.ws.snake.id });
    }
    if (snakes.size < S.MAX_PLAYERS && tick % 10 === 0) {
      const used = new Set([...snakes.values()].map(s => s.name));
      spawnSnake({ name: pick(S.BOT_NAMES.filter(n => !used.has(n))) ?? pick(S.BOT_NAMES), skin: Math.floor(Math.random() * S.SKINS.length), bot: true });
    }
    while (foodCount < S.FOOD) addPellet(...randomPoint(S.R - 2), 1, 0, pick(S.FOOD_COLORS));
    if (powerCount < S.POWERUP_COUNT && Math.random() < 0.02) {
      const k = 1 + Math.floor(Math.random() * (S.POWER.length - 1));
      addPellet(...randomPoint(S.R * 0.8), 5, k, S.POWER[k].color);
    }
    if (tick % S.TICK_RATE === 0) for (const p of pellets.values()) if (p.exp && p.exp <= tick) removePellet(p, 0);
  }

  function step() {
    tick++;
    ev = { eat: [], die: [], spawn: [], add: [] };
    for (const s of leaving.splice(0)) kill(s, null, -1);
    for (const s of snakes.values()) if (s.bot && (tick + s.id) % 4 === 0) think(s);
    for (const s of snakes.values()) move(s);
    buildGrid();
    const dead = [];
    for (const s of snakes.values()) { const k = hit(s); if (k !== false) dead.push([s, k]); }
    for (const [s, k] of dead) kill(s, k);
    const list = [...snakes.values()].map(s => [s.id, s.body[0], s.body[1], s.body[2], Math.floor(s.score), flags(s)]);
    populate();
    const m = { t: 'tick', n: tick, s: list };
    for (const k in ev) if (ev[k].length) m[k] = ev[k];
    ev = null;
    const msg = JSON.stringify(m);
    for (const ws of clients) {
      if (ws.readyState !== 1) continue;
      // cliente travado não pode perder tick (o corpo sairia de sincronia): derruba e ele reconecta do zero
      if (ws.bufferedAmount > 512 * 1024) ws.terminate(); else ws.send(msg);
    }
    return m;
  }

  function handle(ws, m) {
    if (m?.t === 'join') {
      if (ws.snake || joins.some(j => j.ws === ws)) return;
      const name = cleanName(m.name);
      const skin = Number.isInteger(m.skin) && m.skin >= 0 && m.skin < S.SKINS.length ? m.skin : 0;
      joins.push({ ws, name, skin });
    } else if (m?.t === 'in' && ws.snake) {
      ws.snake.boost = !!m.b;
      ws.snake.steer = parseSteer(m) ?? ws.snake.steer;
    }
  }

  function connect(ws) {
    if (clients.size >= S.MAX_CLIENTS) return ws.close(1013, 'Sala cheia');
    clients.add(ws);
    send(ws, { t: 'init', n: tick, snakes: [...snakes.values()].map(packSnake), pellets: [...pellets.values()].map(packPellet) });
    ws.on('message', data => { try { handle(ws, JSON.parse(data)); } catch { /* mensagem inválida: ignora */ } });
    ws.on('close', () => { clients.delete(ws); if (ws.snake) leaving.push(ws.snake); });
  }

  // sala nasce cheia de bots e comida
  for (let i = 0; i < S.MAX_PLAYERS; i++) spawnSnake({ name: S.BOT_NAMES[i % S.BOT_NAMES.length], skin: i % S.SKINS.length, bot: true });
  populate();

  return { step, connect, snakes, pellets, get tick() { return tick; } };
}
