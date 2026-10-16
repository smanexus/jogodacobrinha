// Matemática de vetores 3D ([x, y, z]) usada pelas salas do servidor.
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = v => { const l = Math.sqrt(dot(v, v)) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const perp = d => norm(cross(d, Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
export const randomDir = () => { const z = rnd(-1, 1), a = rnd(0, Math.PI * 2), s = Math.sqrt(1 - z * z); return [Math.cos(a) * s, Math.sin(a) * s, z]; };
export const randomPoint = maxR => { const d = randomDir(), k = maxR * Math.cbrt(Math.random()); return [d[0] * k, d[1] * k, d[2] * k]; };

// gira a direção d rumo a `a`, no máximo `max` radianos
export function turn(d, a, max) {
  const c = Math.max(-1, Math.min(1, dot(d, a)));
  if (Math.acos(c) <= max) return a;
  let p = [a[0] - d[0] * c, a[1] - d[1] * c, a[2] - d[2] * c];
  p = dot(p, p) < 1e-9 ? perp(d) : norm(p);
  const cs = Math.cos(max), sn = Math.sin(max);
  return norm([d[0] * cs + p[0] * sn, d[1] * cs + p[1] * sn, d[2] * cs + p[2] * sn]);
}

// Controle do jogador: x/y (-1..1) relativos à câmera dele, u = "cima" da câmera.
// Vira relativo à direção ATUAL, então o atraso da rede não puxa o jogador de volta.
export function steerDir(d, { x, y, u }, rate) {
  const mag = Math.min(1, Math.hypot(x, y));
  if (mag <= 0.02) return d;
  const c = dot(u, d);
  let up = [u[0] - d[0] * c, u[1] - d[1] * c, u[2] - d[2] * c];
  up = dot(up, up) < 1e-6 ? perp(d) : norm(up);
  const right = cross(d, up);
  const side = norm([right[0] * x + up[0] * y, right[1] * x + up[1] * y, right[2] * x + up[2] * y]);
  return turn(d, norm([d[0] + side[0] * 10, d[1] + side[1] * 10, d[2] + side[2] * 10]), mag * rate);
}

// valida a mensagem {x, y, u} do cliente; devolve null se vier lixo
export function parseSteer(m) {
  const x = Number(m.x), y = Number(m.y), u = Array.isArray(m.u) ? m.u.slice(0, 3).map(Number) : [];
  if (u.length !== 3 || ![x, y, ...u].every(Number.isFinite) || dot(u, u) < 1e-6) return null;
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), u: norm(u) };
}

// limpa o apelido que vem do cliente
export const cleanName = n => String(n ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16) || 'Anônimo';
