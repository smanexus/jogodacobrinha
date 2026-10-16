// Estado do jogo como o navegador vê, montado a partir das mensagens do servidor.
// Aplica cada tick na mesma ordem do servidor: mover → comer → morrer → nascer.
import { follow } from './slither-rules.js';

export const createState = () => ({ tick: 0, snakes: new Map(), pellets: new Map() });

// efeito visual com erro não pode interromper o tick (o corpo das cobras sairia de sincronia)
const call = (fn, ...args) => { try { fn?.(...args); } catch (e) { console.error(e); } };

const unpackSnake = ([id, name, skin, score, flags, body]) => ({ id, name, skin, score, flags, body, prev: null });
const unpackPellet = ([id, x, y, z, v, k, c]) => ({ id, x, y, z, v, k, c });

export function applyInit(st, m) {
  st.tick = m.n;
  st.snakes.clear();
  st.pellets.clear();
  for (const s of m.snakes) st.snakes.set(s[0], unpackSnake(s));
  for (const p of m.pellets) st.pellets.set(p[0], unpackPellet(p));
}

// hooks opcionais (efeitos visuais): eat(pellet, snakeId), die(snake, killerId), spawn(snake)
export function applyTick(st, m, hooks = {}) {
  st.tick = m.n;
  for (const [id, x, y, z, score, flags] of m.s) {
    const s = st.snakes.get(id);
    if (!s) continue;
    s.prev = s.body.slice(); // usado para suavizar o desenho entre ticks
    s.body[0] = x; s.body[1] = y; s.body[2] = z;
    s.score = score;
    s.flags = flags;
    follow(s.body, score);
  }
  for (const [pid, sid] of m.eat ?? []) {
    const p = st.pellets.get(pid);
    if (p) { st.pellets.delete(pid); call(hooks.eat, p, sid); }
  }
  for (const [id, killer] of m.die ?? []) {
    const s = st.snakes.get(id);
    if (s) { st.snakes.delete(id); call(hooks.die, s, killer); }
  }
  for (const raw of m.spawn ?? []) {
    const s = unpackSnake(raw);
    st.snakes.set(s.id, s);
    call(hooks.spawn, s);
  }
  for (const p of m.add ?? []) st.pellets.set(p[0], unpackPellet(p));
}
