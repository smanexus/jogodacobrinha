// Regras da Cobrinha 3D. Este arquivo roda no SERVIDOR e no NAVEGADOR:
// os dois precisam calcular o corpo das cobras exatamente igual.
// Mexeu aqui? Rode `npm test`.

export const R = 70;               // raio da arena (uma esfera)
export const TICK_RATE = 20;       // ticks por segundo do servidor
export const DT = 1 / TICK_RATE;
export const MAX_PLAYERS = 20;     // bots completam a sala até aqui
export const MAX_CLIENTS = 60;     // conexões (jogando + assistindo)
export const START_SCORE = 10;
export const SPEED = 9;            // unidades por segundo
export const BOOST_SPEED = 18;
export const BOOST_MIN = 15;       // pontos mínimos para usar o turbo
export const BOOST_COST = 5;       // pontos por segundo gastos no turbo
export const FOOD = 2500;          // bolinhas de comida mantidas na arena
export const POWERUP_COUNT = 8;
export const EAT_REACH = 1.4;      // alcance da boca além do raio
export const MAGNET_REACH = 9;
export const DROP_LIFE = 60;       // segundos até a comida de cobra morta sumir

// bits do campo "flags" de cada cobra
export const FX = { BOOST: 1, SHIELD: 2, SPEED: 4, GHOST: 8, MAGNET: 16 };

// power-ups: o índice é o "kind" da bolinha (0 = comida comum)
export const POWER = [
  null,
  { fx: 'MAGNET', secs: 10, name: 'Ímã', icon: '🧲', color: 0xff3d71 },
  { fx: 'SHIELD', secs: 8, name: 'Escudo', icon: '🛡️', color: 0x3fd8ff },
  { fx: 'SPEED', secs: 8, name: 'Turbo grátis', icon: '⚡', color: 0xffd23f },
  { fx: 'GHOST', secs: 8, name: 'Invisível', icon: '👻', color: 0xe8e4ff },
];

export const FOOD_COLORS = [0x19e68c, 0xffd23f, 0x3fd8ff, 0xff4f9a, 0xff8a3d, 0xb68cff];

export const SKINS = [
  { name: 'Canarinho', colors: [0x19e68c, 0xffd23f] },
  { name: 'Arara', colors: [0xff3d4f, 0x3f7bff, 0xffd23f] },
  { name: 'Capivara', colors: [0xb5793f, 0xffb36b] },
  { name: 'Boto-rosa', colors: [0xff7eb6, 0xffd0e6] },
  { name: 'Céu de Brasília', colors: [0x3f7bff, 0xf2f6ff] },
  { name: 'Sucuri', colors: [0x2f8f3a, 0xc7ff4f, 0x1a3d1f] },
  { name: 'Saci', colors: [0xe02040, 0x2a1b3d] },
  { name: 'Tucano', colors: [0x2a1b3d, 0xff8a3d, 0xffd23f] },
  { name: 'Iara', colors: [0x3fd8ff, 0x19e6c4, 0xb68cff] },
];

export const BOT_NAMES = ['Capivara', 'Saci', 'Curupira', 'Boitatá', 'Iara', 'Boto', 'Cuca', 'Mula-sem-cabeça',
  'Tatu-bola', 'Jabuti', 'Mico-leão', 'Tucano', 'Sucuri', 'Jiboia', 'Arara', 'Sabiá', 'Paçoca', 'Coxinha',
  'Brigadeiro', 'Pão de queijo', 'Açaí', 'Tapioca', 'Quindim', 'Caipora', 'Lobisomem'];

export const radius = score => 0.8 + Math.min(2.2, score / 500);
export const segCount = score => Math.min(250, 10 + Math.floor(score / 4));
export const spacing = r => r * 0.55;
export const turnRate = r => 3.4 / (1 + (r - 0.8) * 0.35); // rad/s, cobra grande vira mais devagar

// Corpo = array plano [x0,y0,z0, x1,y1,z1, ...]; o índice 0 é a cabeça.
// Depois de mover a cabeça, puxa cada gomo para perto do anterior e
// ajusta o tamanho conforme os pontos. `score` precisa ser inteiro.
// Use só + - * / e Math.sqrt: resultado idêntico em qualquer navegador.
export function follow(body, score) {
  const sp = spacing(radius(score));
  for (let i = 3; i < body.length; i += 3) {
    const dx = body[i] - body[i - 3], dy = body[i + 1] - body[i - 2], dz = body[i + 2] - body[i - 1];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > sp) {
      const k = sp / d;
      body[i] = body[i - 3] + dx * k;
      body[i + 1] = body[i - 2] + dy * k;
      body[i + 2] = body[i - 1] + dz * k;
    }
  }
  const n = segCount(score) * 3;
  while (body.length < n) body.push(body[body.length - 3], body[body.length - 2], body[body.length - 1]);
  body.length = Math.min(body.length, n);
}
