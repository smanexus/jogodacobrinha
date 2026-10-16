// Motor visual compartilhado pelos jogos: cena espacial, arena esférica,
// brilho neon, desenho em massa (InstancedMesh), partículas, câmera e controles.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
export { THREE };

// localStorage pode falhar (aba anônima, bloqueio): nunca deixa isso quebrar o jogo
export const store = {
  get(k, fallback) { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: tudo bem */ } },
};

// cores 0xRRGGBB → THREE.Color, criadas uma vez só
const palette = new Map();
export const col = hex => palette.get(hex) ?? palette.set(hex, new THREE.Color(hex)).get(hex);

const randomDir = v => {
  const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return v.set(Math.cos(a) * s, Math.sin(a) * s, z);
};

export function createEngine(R) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const touchScreen = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, touchScreen ? 1.5 : 2)); // celular: menos pixels, mais quadros
  renderer.toneMapping = THREE.NeutralToneMapping; // mantém as cores saturadas (ACES deixava tudo pastel)
  document.body.prepend(renderer.domElement);

  const BG = 0x0e0628;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 20, R * 2.3);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 3000);
  camera.position.set(0, 0, R * 0.9);
  scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x2a1050, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.8);
  sun.position.set(0.4, 1, 0.3);
  scene.add(sun);

  // estrelas lá fora
  const v = new THREE.Vector3(), starPos = new Float32Array(2500 * 3);
  for (let i = 0; i < 2500; i++) randomDir(v).multiplyScalar(R * (3 + Math.random() * 5)).toArray(starPos, i * 3);
  const starGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xfff6e0, size: 1.5, sizeAttenuation: false, fog: false })));

  // arena: malha geodésica (dá noção de direção) + parede que acende quando você chega perto
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(R, 8)),
    new THREE.LineBasicMaterial({ color: 0x7a5cff, transparent: true, opacity: 0.45 }),
  );
  scene.add(wire);
  const wall = new THREE.ShaderMaterial({
    uniforms: { uHead: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0xff4f9a) } },
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uHead; uniform vec3 uColor; varying vec3 vPos;
      void main() {
        float near = smoothstep(20.0, 2.0, distance(vPos, uHead));
        vec3 f = abs(fract(vPos * 0.25) - 0.5);
        float line = 1.0 - smoothstep(0.0, 0.06, min(min(f.x, f.y), f.z));
        gl_FragColor = vec4(uColor * near * (0.1 + line * 0.8), 1.0);
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48), wall));

  // brilho neon (bloom); dá para desligar no botão ✨ se o celular sofrer
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.45, 0.7));
  composer.addPass(new OutputPass());
  let glow = store.get('glow', '1') === '1', autoGlow = true, slow = 0;

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 0.8 ? 85 : 70; // celular em pé: vê mais dos lados
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  return {
    scene, camera, renderer,
    setWallFocus: p => wall.uniforms.uHead.value.copy(p),
    get glow() { return glow; },
    toggleGlow() { glow = !glow; autoGlow = false; store.set('glow', glow ? '1' : '0'); return glow; },
    run(fn) {
      let last = performance.now();
      renderer.setAnimationLoop(now => {
        const dt = (now - last) / 1000;
        last = now;
        // aparelho fraco (abaixo de ~35 fps por 3 s): desliga o brilho sozinho, uma vez
        if (glow && autoGlow && dt < 0.5) { // dt enorme = voltou de outra aba, não é lentidão
          slow = dt > 1 / 35 ? slow + dt : Math.max(0, slow - dt);
          if (slow > 3) { glow = autoGlow = false; store.set('glow', '0'); }
        }
        fn(Math.min(0.1, dt), now / 1000);
        if (glow) composer.render(); else renderer.render(scene, camera);
      });
    },
  };
}

// Desenha milhares de objetos iguais numa única chamada (essencial no celular).
// `glow` faz a cor de cada instância também emitir luz (vira neon com o bloom);
// `rim` acende a borda (efeito de bolha).
const M4 = new THREE.Matrix4(), POS = new THREE.Vector3(), SCALE = new THREE.Vector3();
export class Batch {
  constructor(scene, geo, max, { glow = 0.3, rim = 0, opacity = 1, additive = false } = {}) {
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.35, metalness: 0.05, opacity,
      transparent: opacity < 1 || additive, depthWrite: opacity === 1 && !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mat.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimLight = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
        totalEmissiveRadiance += vColor.rgb * (${glow.toFixed(3)} + rimLight * ${rim.toFixed(3)});`);
    };
    mat.customProgramCacheKey = () => `glow${glow}rim${rim}`;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color()); // cria o buffer de cor antes do 1º desenho
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.max = max;
    this.n = 0;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(x, y, z, s, color, quat) {
    if (this.n >= this.max) return;
    if (quat) M4.compose(POS.set(x, y, z), quat, SCALE.set(s, s, s));
    else M4.makeScale(s, s, s).setPosition(x, y, z);
    this.mesh.setMatrixAt(this.n, M4);
    this.mesh.setColorAt(this.n++, color);
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// Explosões de partículas (morte, turbo). Buffer circular fixo.
export class Bursts {
  constructor(scene, max = 5000) {
    this.max = max;
    this.i = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.3, 'rgba(255,255,255,.6)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 1.1, map: new THREE.CanvasTexture(c), vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, color, n = 12, speed = 6) {
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const i = this.i++ % this.max, j = i * 3;
      randomDir(v).multiplyScalar(speed * (0.3 + Math.random()));
      this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
      this.vel[j] = v.x; this.vel[j + 1] = v.y; this.vel[j + 2] = v.z;
      this.base[j] = color.r * 2; this.base[j + 1] = color.g * 2; this.base[j + 2] = color.b * 2;
      this.life[i] = 1;
    }
  }
  update(dt) {
    const drag = Math.exp(-dt * 2);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3, l = (this.life[i] = Math.max(0, this.life[i] - dt * 0.8));
      for (let a = 0; a < 3; a++) {
        this.pos[j + a] += this.vel[j + a] * dt;
        this.vel[j + a] *= drag;
        this.col[j + a] = this.base[j + a] * l;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// Câmera atrás do jogador. Sem gravidade não existe "cima": usamos o cima
// anterior (transporte paralelo) puxado de leve para o +Y do mundo, o que
// mantém um horizonte estável sem nunca virar de ponta-cabeça de repente.
export class ChaseCam {
  constructor(camera) {
    this.camera = camera;
    this.dir = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.t = new THREE.Vector3();
    this.w = new THREE.Vector3();
  }
  update(head, dir, r, dt, far = 1) {
    const { up, t, w } = this;
    this.dir.lerp(dir, 1 - Math.exp(-dt * 7)).normalize();
    const d = this.dir;
    up.addScaledVector(d, -up.dot(d));
    if (up.lengthSq() < 1e-6) up.set(d.y, d.z, d.x).cross(d); // degenerado: qualquer perpendicular
    up.normalize();
    w.set(0, 1, 0).addScaledVector(d, -d.y);
    if (w.lengthSq() > 0.09) up.lerp(w.normalize(), 1 - Math.exp(-dt * 1.2)).addScaledVector(d, -up.dot(d)).normalize();
    t.copy(head).addScaledVector(d, -(9 + r * 6) * far).addScaledVector(up, (3.5 + r * 2.5) * far);
    this.camera.position.lerp(t, 1 - Math.exp(-dt * 10));
    this.camera.up.copy(up);
    this.camera.lookAt(t.copy(head).addScaledVector(d, 6 + r * 2));
  }
}

// Controles. Mouse: a distância do centro da tela diz para onde e quanto virar.
// Toque: joystick flutuante (arrasta a partir de onde encostou). Teclado: setas/WASD.
// Duas ações por jogo:
//   primary   = clique esquerdo, espaço ou o botão `primary` (Cobrinha: turbo; Bolhas: dividir)
//   secondary = clique direito, E ou o botão `secondary` (Bolhas: ejetar massa)
// get() devolve o estado segurado; onPress(nome) avisa no instante do aperto.
export function createInput({ stick, knob, primary, secondary, onPress = () => {} }) {
  const s = { x: 0, y: 0, keys: new Set(), mouse: [false, false], key: [false, false], btn: [false, false] };
  let touch = null, x0 = 0, y0 = 0, lastTouch = -1e9;
  const NAMES = ['primary', 'secondary'];
  const press = (src, i) => { if (!src[i]) { src[i] = true; onPress(NAMES[i]); } };
  const isUI = e => e.target.closest?.('button, a, input, label, .panel');
  const clamp = (x, y) => { const l = Math.hypot(x, y); return l > 1 ? [x / l, y / l] : l < 0.06 ? [0, 0] : [x, y]; };
  const mouseAim = e => {
    const k = Math.min(innerWidth, innerHeight) * 0.35;
    [s.x, s.y] = clamp((e.clientX - innerWidth / 2) / k, -(e.clientY - innerHeight / 2) / k);
  };
  const release = () => { touch = null; s.x = s.y = 0; stick.hidden = true; };

  addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return void (isUI(e) || mouseAim(e));
    lastTouch = performance.now();
    document.body.classList.add('touch'); // mostra os botões de ação
    if (isUI(e) || touch !== null) return;
    touch = e.pointerId; x0 = e.clientX; y0 = e.clientY;
    stick.style.left = `${x0}px`; stick.style.top = `${y0}px`;
    knob.style.transform = '';
    stick.hidden = false;
  });
  addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') return void mouseAim(e);
    if (e.pointerId !== touch) return;
    const k = Math.min(innerWidth, innerHeight) * 0.14;
    [s.x, s.y] = clamp((e.clientX - x0) / k, -(e.clientY - y0) / k);
    knob.style.transform = `translate(${s.x * 40}px, ${-s.y * 40}px)`;
  });
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, e => { if (e.pointerId === touch) release(); });
  // botões do mouse por mousedown: o pointerdown não avisa o 2º botão apertado junto
  addEventListener('mousedown', e => {
    if (isUI(e) || performance.now() - lastTouch < 800) return; // toque também gera mousedown "de mentira"
    if (e.button === 0) press(s.mouse, 0);
    if (e.button === 2) press(s.mouse, 1);
  });
  addEventListener('mouseup', e => { if (e.button === 0) s.mouse[0] = false; if (e.button === 2) s.mouse[1] = false; });
  addEventListener('blur', () => { s.mouse.fill(false); s.key.fill(false); s.btn.fill(false); s.keys.clear(); release(); });
  addEventListener('contextmenu', e => { if (!isUI(e)) e.preventDefault(); });

  const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
  addEventListener('keydown', e => {
    if (e.target.closest?.('input')) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) press(s.key, 0); }
    if (e.code === 'KeyE' && !e.repeat) press(s.key, 1);
    if (KEYS[e.code]) { s.keys.add(KEYS[e.code]); e.preventDefault(); }
  });
  addEventListener('keyup', e => {
    if (e.code === 'Space') s.key[0] = false;
    if (e.code === 'KeyE') s.key[1] = false;
    s.keys.delete(KEYS[e.code]);
  });

  [primary, secondary].forEach((btn, i) => {
    if (!btn) return;
    btn.addEventListener('pointerdown', e => { btn.setPointerCapture(e.pointerId); press(s.btn, i); });
    for (const ev of ['pointerup', 'pointercancel']) btn.addEventListener(ev, () => { s.btn[i] = false; });
  });

  return {
    get() {
      const k = s.keys;
      const kx = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0), ky = (k.has('u') ? 1 : 0) - (k.has('d') ? 1 : 0);
      const [x, y] = kx || ky ? clamp(kx, ky) : [s.x, s.y];
      return { x, y, primary: s.mouse[0] || s.key[0] || s.btn[0], secondary: s.mouse[1] || s.key[1] || s.btn[1] };
    },
  };
}
