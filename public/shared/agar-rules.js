// Regras das Bolhas 3D (estilo agar.io). Usado pelo servidor e pelo navegador.

export { FX, POWER, FOOD_COLORS, SKINS, BOT_NAMES } from './theme.js';

export const R = 55;               // raio da arena (uma esfera; pequena para os encontros acontecerem)
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const MAX_PLAYERS = 16;     // bots completam a sala até aqui
export const MAX_CLIENTS = 60;
export const START_MASS = 15;
export const MAX_MASS = 3000;      // por célula (arena pequena: ninguém vira um planeta)
export const FOOD = 2500;          // bolinhas de massa 1
export const POWERUP_COUNT = 6;
export const VIRUSES = 14;         // ouriços
export const VIRUS_MASS = 100;
export const VIRUS_MAX = 180;      // alimentado até aqui, o ouriço dispara um filhote
export const MAX_CELLS = 16;       // células por jogador
export const SPLIT_MIN = 30;       // massa mínima para dividir
export const SPLIT_SPEED = 32;     // impulso da metade lançada
export const EJECT_MIN = 30;
export const EJECT_LOSS = 14;      // a célula perde isso...
export const EJECT_MASS = 12;      // ...e solta uma bolha deste tamanho
export const EAT_RATIO = 1.25;     // precisa ser 25% maior para engolir
export const TURN = 2.8;           // rad/s
export const MAGNET_REACH = 6;

export const radius = m => 0.55 * Math.pow(m, 0.4);
export const speed = m => 13 * Math.pow(m, -0.15);
export const decay = m => 0.002 * Math.sqrt(m / 500);                 // fração da massa perdida por segundo
export const mergeTicks = m => Math.round((10 + m * 0.02) * TICK_RATE); // depois de dividir, quanto até poder juntar
