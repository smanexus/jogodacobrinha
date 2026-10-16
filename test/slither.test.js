// `npm test` — garante que o servidor roda e que o navegador reconstrói os corpos igualzinho.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSlitherRoom } from '../games/slither.js';
import { createState, applyInit, applyTick } from '../public/shared/slither-state.js';
import * as S from '../public/shared/slither-rules.js';

// WebSocket de mentira: guarda o que o servidor mandou
function fakeClient(room) {
  const ws = Object.assign(new EventEmitter(), { readyState: 1, bufferedAmount: 0, inbox: [] });
  ws.send = msg => ws.inbox.push(JSON.parse(msg));
  ws.say = m => ws.emit('message', JSON.stringify(m));
  room.connect(ws);
  return ws;
}

test('sala roda muitos ticks e o cliente espelha o servidor exatamente', () => {
  const room = createSlitherRoom();
  const ws = fakeClient(room);
  ws.say({ t: 'join', name: '<b>Teste</b>\u0000 com nome comprido demais', skin: 99 });
  const st = createState();
  let deaths = 0, joined = 0;
  for (let i = 0; i < 1200; i++) {
    ws.say({ t: 'in', x: Math.sin(i / 30), y: Math.cos(i / 47), u: [0, 1, 0], b: i % 100 < 30 });
    room.step();
    for (const m of ws.inbox.splice(0)) {
      if (m.t === 'init') applyInit(st, m);
      if (m.t === 'tick') applyTick(st, m, { die: () => deaths++ });
      if (m.t === 'you' && joined++ === 0) { // primeiro nome passou pela limpeza
        const me = room.snakes.get(m.id);
        assert.equal(me.name, 'bTeste/b com nom');
        assert.equal(me.skin, 0);
      }
      if (m.t === 'tick' && !ws.snake) ws.say({ t: 'join', name: 'Teste' }); // renasce
    }
  }
  assert.ok(deaths > 0, 'ninguém morreu em 60s de jogo?');
  assert.ok(joined > 0);
  assert.equal(st.snakes.size, room.snakes.size);
  for (const [id, s] of room.snakes) assert.deepEqual(st.snakes.get(id).body, s.body, `corpo da cobra ${id} divergiu`);
  assert.deepEqual([...st.pellets.keys()].sort(), [...room.pellets.keys()].sort());
});

test('bater no corpo de outra cobra mata e vira comida', () => {
  const room = createSlitherRoom();
  const [a, b] = [...room.snakes.values()];
  for (const s of room.snakes.values()) if (s !== a && s !== b) room.snakes.delete(s.id);
  a.bot = b.bot = false;
  b.body.fill(0); b.body[0] = 0.1;                              // b parada no centro
  a.body = Array(a.body.length).fill(0).map((_, i) => i % 3 === 0 ? -1 : 0); // a vindo da esquerda
  a.dir = [1, 0, 0];
  const before = room.pellets.size;
  const m = room.step();
  assert.ok(m.die?.some(([id]) => id === a.id || id === b.id), 'colisão não matou ninguém');
  assert.ok(room.pellets.size > before - 5, 'cobra morta não largou comida');
});

test('regras: gomos e raio crescem com os pontos', () => {
  assert.ok(S.segCount(1000) > S.segCount(10));
  assert.ok(S.radius(1000) > S.radius(10));
  const body = [0, 0, 0];
  S.follow(body, 40);
  assert.equal(body.length, S.segCount(40) * 3);
});
