// `npm test` — Bolhas 3D: servidor roda, o navegador espelha o estado, dividir/ejetar/comer funcionam.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createAgarRoom } from '../games/agar.js';
import { createState, applyInit, applyTick } from '../public/shared/agar-state.js';
import * as A from '../public/shared/agar-rules.js';

const q = v => Math.round(v * 10) / 10;

function fakeClient(room) {
  const ws = Object.assign(new EventEmitter(), { readyState: 1, bufferedAmount: 0, inbox: [] });
  ws.send = msg => ws.inbox.push(JSON.parse(msg));
  ws.say = m => ws.emit('message', JSON.stringify(m));
  room.connect(ws);
  return ws;
}

test('sala roda e o cliente espelha jogadores, células e bolinhas', () => {
  const room = createAgarRoom();
  const ws = fakeClient(room);
  const st = createState();
  let deaths = 0;
  for (let i = 0; i < 2400; i++) {
    if (!ws.player) ws.say({ t: 'join', name: 'Teste', skin: 3 });
    ws.say({ t: 'in', x: Math.sin(i / 20), y: 0.3, u: [0, 1, 0] });
    if (i % 50 === 0) ws.say({ t: 'split' });
    if (i % 30 === 0) ws.say({ t: 'eject' });
    room.step();
    for (const m of ws.inbox.splice(0)) {
      if (m.t === 'init') applyInit(st, m);
      if (m.t === 'tick') applyTick(st, m, { die: () => deaths++ });
    }
  }
  assert.ok(deaths > 0, 'ninguém morreu em 2 minutos?');
  assert.deepEqual([...st.players.keys()].sort(), [...room.players.keys()].sort());
  assert.deepEqual([...st.cells.keys()].sort(), [...room.cells.keys()].sort());
  for (const [id, c] of room.cells) {
    const mine = st.cells.get(id);
    assert.deepEqual([mine.x, mine.y, mine.z, mine.m], [q(c.x), q(c.y), q(c.z), Math.round(c.m)], `célula ${id} divergiu`);
  }
  assert.deepEqual([...st.pellets.keys()].sort(), [...room.pellets.keys()].sort());
});

test('dividir, ejetar e engolir', () => {
  const room = createAgarRoom();
  const ws = fakeClient(room);
  ws.say({ t: 'join', name: 'Teste' });
  room.step();
  const me = ws.player;
  const [cell] = me.cells;
  // tira todo mundo de perto para o teste não sofrer interferência
  for (const c of [...room.cells.values()]) if (c !== cell) room.cells.delete(c.id);
  for (const p of [...room.players.values()]) if (p !== me) room.players.delete(p.id);
  Object.assign(cell, { x: 0, y: 0, z: 0, m: 200 });

  ws.say({ t: 'split' });
  room.step();
  assert.equal(me.cells.size, 2, 'não dividiu');
  ws.say({ t: 'eject' });
  const m = room.step();
  assert.ok(m.born.some(b => b[1] === 0), 'não ejetou massa');

  // uma célula grande engole uma pequena de outro jogador que esteja dentro dela
  const big = [...me.cells][0];
  const before = big.m;
  const victimWs = fakeClient(room);
  victimWs.say({ t: 'join', name: 'Vítima' });
  room.step();
  const [vc] = victimWs.player.cells;
  Object.assign(vc, { x: big.x, y: big.y, z: big.z, m: A.START_MASS });
  const m2 = room.step();
  assert.ok(m2.die?.some(([id]) => id === vc.owner.id), 'vítima não morreu');
  assert.ok(big.m > before, 'não cresceu ao engolir');
});
