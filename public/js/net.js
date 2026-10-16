// Conexão com o servidor + "relógio de reprodução" que deixa o movimento liso
// mesmo com a internet do celular oscilando.

export function connect(path, { onInit, onTick, onYou, onStatus }) {
  let ws, retry = 0;
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`);
    onStatus('connecting');
    ws.onopen = () => { retry = 0; onStatus('online'); };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.t === 'init') onInit(m);
      else if (m.t === 'tick') onTick(m);
      else if (m.t === 'you') onYou(m);
    };
    ws.onclose = e => {
      onStatus(e.code === 1013 ? 'full' : 'offline');
      setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
    };
  };
  open();
  return {
    send(m) { if (ws.readyState === 1) ws.send(JSON.stringify(m)); },
    reconnect() { ws.close(); }, // o servidor manda o estado completo de novo
  };
}

// Toca os ticks ~2 ticks atrás do mais recente que chegou. Devolve `alpha`
// (0..1) para interpolar o desenho entre o tick anterior e o atual.
export function createPlayback(rate, apply) {
  let queue = [], cur = 0, clock = 0;
  return {
    get size() { return queue.length; },
    reset(n) { queue = []; cur = clock = n; },
    push(m) { queue.push(m); },
    update(dt) {
      const latest = queue.length ? queue[queue.length - 1].n : cur;
      if (latest - clock > rate) clock = latest - 2; // ficou muito para trás: pula
      const lag = latest - clock;
      clock += dt * rate * (1 + Math.max(-0.3, Math.min(0.3, (lag - 2) * 0.15)));
      while (clock > cur && queue.length) { apply(queue.shift()); cur++; }
      if (clock > cur) clock = cur; // sem tick novo: espera parado
      return clock - (cur - 1);
    },
  };
}
