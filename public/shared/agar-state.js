// Estado das Bolhas como o navegador vê, montado a partir das mensagens do servidor.
// Ordem de cada tick: criar (join, born) → mexer (p, c, add) → remover (eat, gone, die).

export const createState = () => ({ tick: 0, players: new Map(), cells: new Map(), pellets: new Map() });

// efeito visual com erro não pode interromper o tick
const call = (fn, ...args) => { try { fn?.(...args); } catch (e) { console.error(e); } };

const unpackPlayer = ([id, name, skin, dx = 0, dy = 0, dz = -1, flags = 0, mass = 0]) => ({ id, name, skin, dir: [dx, dy, dz], flags, mass });
// px/py/pz/pm = posição e massa no tick anterior, para suavizar o desenho; t = último tick em que mexeu
const unpackCell = ([id, owner, x, y, z, m, c]) => ({ id, owner, x, y, z, m, c, px: x, py: y, pz: z, pm: m, t: 0 });
const unpackPellet = ([id, x, y, z, v, k, c]) => ({ id, x, y, z, v, k, c });

export function applyInit(st, m) {
  st.tick = m.n;
  st.players.clear(); st.cells.clear(); st.pellets.clear();
  for (const p of m.players) st.players.set(p[0], unpackPlayer(p));
  for (const c of m.cells) st.cells.set(c[0], unpackCell(c));
  for (const p of m.pellets) st.pellets.set(p[0], unpackPellet(p));
}

// hooks opcionais (efeitos visuais): join(player), eat(pellet, cellId), gone(cell, eaterId), die(player, killerId)
export function applyTick(st, m, hooks = {}) {
  st.tick = m.n;
  for (const raw of m.join ?? []) { const p = unpackPlayer(raw); st.players.set(p.id, p); call(hooks.join, p); }
  for (const raw of m.born ?? []) st.cells.set(raw[0], unpackCell(raw));
  for (const [id, dx, dy, dz, flags, mass] of m.p) {
    const p = st.players.get(id);
    if (p) { p.dir = [dx, dy, dz]; p.flags = flags; p.mass = mass; }
  }
  for (const [id, x, y, z, mass] of m.c) {
    const c = st.cells.get(id);
    if (!c) continue;
    c.px = c.x; c.py = c.y; c.pz = c.z; c.pm = c.m;
    c.x = x; c.y = y; c.z = z; c.m = mass; c.t = m.n;
  }
  for (const p of m.add ?? []) st.pellets.set(p[0], unpackPellet(p));
  for (const [pid, cid] of m.eat ?? []) {
    const p = st.pellets.get(pid);
    if (p) { st.pellets.delete(pid); call(hooks.eat, p, cid); }
  }
  for (const [id, eater] of m.gone ?? []) {
    const c = st.cells.get(id);
    if (c) { st.cells.delete(id); call(hooks.gone, c, eater); }
  }
  for (const [id, killer] of m.die ?? []) {
    const p = st.players.get(id);
    if (p) { st.players.delete(id); call(hooks.die, p, killer); }
  }
}
