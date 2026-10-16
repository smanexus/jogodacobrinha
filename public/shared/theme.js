// Tema comum aos dois jogos (servidor e navegador): skins, nomes dos bots, cores e power-ups.

// bits do campo "flags" de cada jogador
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
