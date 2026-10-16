// Peças de interface iguais nos dois jogos: menu (apelido + skin), status da conexão,
// ranking, power-ups ativos, feed de acontecimentos e nomes sobre os jogadores.
import { THREE, store } from './engine.js';
import { SKINS, POWER, FX } from '../shared/theme.js';

export const $ = id => document.getElementById(id);
export const fmt = n => n.toLocaleString('pt-BR');

const STATUS = {
  connecting: 'Conectando ao servidor…',
  online: '',
  full: 'A sala está cheia. Tentando de novo em instantes…',
  offline: 'Sem conexão com o servidor. Tentando de novo…',
};

// onPlay(nome, skin) é chamado ao apertar Jogar
export function createMenu(onPlay) {
  const name = $('name'), play = $('play');
  name.value = store.get('nome', '');
  let skin = Math.min(SKINS.length - 1, Number(store.get('skin', 0)) || 0);
  $('skins').replaceChildren(...SKINS.map((sk, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skin';
    b.style.setProperty('--stripes', `repeating-linear-gradient(90deg, ${sk.colors.map((c, j) =>
      `#${c.toString(16).padStart(6, '0')} ${j * 14}px ${(j + 1) * 14}px`).join(', ')})`);
    b.innerHTML = '<span class="swatch"></span>';
    b.append(sk.name);
    b.setAttribute('aria-pressed', i === skin);
    b.onclick = () => {
      skin = i;
      store.set('skin', i);
      for (const o of $('skins').children) o.setAttribute('aria-pressed', o === b);
    };
    return b;
  }));
  const go = () => {
    if (play.disabled) return;
    store.set('nome', name.value.trim());
    onPlay(name.value.trim() || 'Anônimo', skin);
    $('menu').hidden = true;
    document.body.classList.add('playing');
  };
  play.onclick = go;
  name.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });

  return {
    status(s) { $('status').textContent = STATUS[s]; play.disabled = s !== 'online'; },
    // volta o menu, com a mensagem de por que você saiu do jogo
    show(text) {
      $('death').hidden = !text;
      $('death').textContent = text ?? '';
      play.textContent = 'Jogar de novo';
      $('menu').hidden = false;
      document.body.classList.remove('playing');
    },
  };
}

export function setupGlow(eng) {
  const b = $('glow');
  b.onclick = () => b.setAttribute('aria-pressed', eng.toggleGlow());
  return () => b.setAttribute('aria-pressed', eng.glow); // o brilho pode desligar sozinho
}

export function feed(text) {
  const li = document.createElement('li');
  li.textContent = text;
  $('feed').prepend(li);
  while ($('feed').children.length > 4) $('feed').lastChild.remove();
  setTimeout(() => li.remove(), 6000);
  return li;
}

// rows: [{ name, score }] já em ordem; me = a linha do jogador (ou undefined)
export function renderBoard(rows, me) {
  $('score').textContent = me ? fmt(me.score) : '';
  $('rank').textContent = me ? `${rows.indexOf(me) + 1}º de ${rows.length}` : '';
  $('board').replaceChildren(...rows.slice(0, 8).map(r => {
    const li = document.createElement('li');
    li.textContent = r.name;
    const b = document.createElement('b');
    b.textContent = fmt(r.score);
    li.append(b);
    if (r === me) li.className = 'me';
    return li;
  }));
}

// flags do jogador + `until` (fx → segundo em que acaba, no relógio local)
export function renderPowers(flags, until, time) {
  $('powers').replaceChildren(...POWER.filter(p => p && flags & FX[p.fx]).map(p => {
    const li = document.createElement('li');
    li.textContent = `${p.icon} ${p.name} ${Math.max(0, Math.ceil((until[p.fx] ?? time) - time))}s`;
    return li;
  }));
}

// nomes em cima dos jogadores próximos (div posicionada na tela, mais barato que texto 3D)
export function createLabels(camera) {
  const els = [], V = new THREE.Vector3(), E = new THREE.Vector3();
  return {
    // items: [nome, x, y, z, altura acima do ponto]
    draw(items) {
      camera.updateMatrixWorld();
      let n = 0;
      for (const [name, x, y, z, lift] of items) {
        if (n >= 12) break;
        V.set(x, y, z).addScaledVector(camera.up, lift);
        if (V.distanceToSquared(camera.position) > 50 * 50) continue;
        if (E.copy(V).applyMatrix4(camera.matrixWorldInverse).z > -1) continue; // atrás da câmera
        V.project(camera);
        const el = els[n] ?? (els[n] = $('labels').appendChild(document.createElement('span')));
        if (el.textContent !== name) el.textContent = name;
        el.style.transform = `translate(${(V.x + 1) * innerWidth / 2}px, ${(1 - V.y) * innerHeight / 2}px) translate(-50%, -100%)`;
        el.hidden = false;
        n++;
      }
      for (let i = n; i < els.length; i++) els[i].hidden = true;
    },
  };
}
