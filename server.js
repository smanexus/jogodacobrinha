// Servidor único: entrega o site (pasta public/) e roda as salas de jogo via WebSocket.
// No Railway a porta vem de process.env.PORT.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createSlitherRoom } from './games/slither.js';
import { createAgarRoom } from './games/agar.js';
import { TICK_RATE } from './public/shared/slither-rules.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const THREE = join(ROOT, 'node_modules', 'three'); // servido em /vendor/three/
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer(async (req, res) => {
  let path, base = PUBLIC;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return res.writeHead(400).end(); }
  if (path === '/health') return res.end('ok');
  if (path.startsWith('/vendor/three/')) { base = THREE; path = path.slice('/vendor/three'.length); }
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(base, path));
  if (!file.startsWith(base + sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': base === THREE ? 'public, max-age=604800' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Página não encontrada');
  }
});

// todas as salas rodam a TICK_RATE (20/s)
const rooms = { '/ws/slither': createSlitherRoom(), '/ws/agar': createAgarRoom() };
// comprimir corta ~55% dos ticks: faz diferença no plano de dados do celular
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: { threshold: 512 } });

server.on('upgrade', (req, socket, head) => {
  const room = rooms[new URL(req.url, 'http://x').pathname];
  if (!room) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    room.connect(ws);
  });
});

// derruba conexões mortas (celular que perdeu sinal) para a cobra não ficar órfã
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 15000);

// loop com passo fixo: o corpo das cobras depende de ticks idênticos
const STEP = 1000 / TICK_RATE;
let next = performance.now();
(function loop() {
  const now = performance.now();
  if (now - next > 1000) next = now; // servidor engasgou: não tenta recuperar tudo de uma vez
  while (now >= next) {
    for (const room of Object.values(rooms)) room.step();
    next += STEP;
  }
  setTimeout(loop, next - performance.now());
})();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}`));
