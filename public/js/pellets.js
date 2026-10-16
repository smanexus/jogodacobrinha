// Comida e power-ups (iguais nos dois jogos), com a animação de serem engolidos.
import { THREE, Batch, col } from './engine.js';

export const pelletSize = p => 0.22 + Math.sqrt(p.v) * 0.14;

export function createPellets(scene, camera) {
  const foodB = new Batch(scene, new THREE.IcosahedronGeometry(1, 0), 8000, { glow: 1 });
  // um formato por power-up: ímã (anel), escudo (octaedro), turbo (cone), invisível (bola)
  const powerGeo = [null, new THREE.TorusGeometry(0.8, 0.32, 8, 24), new THREE.OctahedronGeometry(1.1),
    new THREE.ConeGeometry(0.75, 1.7, 6), new THREE.IcosahedronGeometry(1, 1)];
  const powerB = powerGeo.map(g => g && new Batch(scene, g, 32, { glow: 1.4 }));
  const flying = [], V = new THREE.Vector3(), Q = new THREE.Quaternion(), EUL = new THREE.Euler();

  return {
    // `target(out)` põe em `out` a posição de quem comeu e devolve false se ele sumiu
    eaten(p, target) { flying.push({ x: p.x, y: p.y, z: p.z, c: col(p.c), s: pelletSize(p), target, t: 0 }); },
    draw(pellets, time, dt) {
      foodB.begin();
      for (const b of powerB) b?.begin();
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      for (const p of pellets.values()) {
        if ((p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2 < 9) continue; // colada na câmera taparia a tela
        if (p.k) {
          Q.setFromEuler(EUL.set(time * 1.3 + p.id, time * 2 + p.id, 0));
          powerB[p.k].add(p.x, p.y, p.z, 1 + 0.15 * Math.sin(time * 4 + p.id), col(p.c), Q);
        } else foodB.add(p.x, p.y, p.z, pelletSize(p) * (1 + 0.18 * Math.sin(time * 3 + p.id)), col(p.c));
      }
      for (let i = flying.length - 1; i >= 0; i--) { // voando para a boca de quem comeu
        const f = flying[i];
        f.t += dt / 0.18;
        if (f.t >= 1 || !f.target(V)) { flying.splice(i, 1); continue; }
        f.x += (V.x - f.x) * f.t; f.y += (V.y - f.y) * f.t; f.z += (V.z - f.z) * f.t;
        foodB.add(f.x, f.y, f.z, f.s * (1 - f.t), f.c);
      }
      foodB.end();
      for (const b of powerB) b?.end();
    },
  };
}
