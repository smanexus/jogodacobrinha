# Jogo da Cobrinha do Otávio

Jogos de arena em 3D para jogar online, no navegador do PC ou do celular.

- **Cobrinha 3D** (pronto): estilo slither.io, numa arena esférica com movimento livre nos 3 eixos.
- **Bolhas 3D** (pronto): estilo agar.io, na mesma arena, com divisão, massa ejetada e ouriços.

Sem login: escolhe um apelido e joga. Quando tem pouca gente, bots com nomes brasileiros completam a sala.

## Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
npm start
```

Abra http://localhost:3000. Para testar no celular na mesma rede Wi-Fi, abra `http://IP-DO-COMPUTADOR:3000`.

`npm test` confere que os dois jogos rodam no servidor e que o navegador fica com o mesmo estado do servidor.

## Publicar no Railway

1. Em [railway.com](https://railway.com), crie um projeto com **Deploy from GitHub repo** e escolha este repositório.
2. O Railway detecta o Node sozinho, roda `npm install` e `npm start`, e testa a rota `/health` (configurado em `railway.json`).
3. Em **Settings → Networking**, clique em **Generate Domain** para ter o endereço público.
4. Cada `git push` na branch configurada publica de novo.

Deixe **1 réplica só**: cada sala vive na memória do servidor.

## Estrutura

```
server.js                   servidor HTTP (site) + WebSocket (/ws/slither e /ws/agar) + loop de 20 ticks/s
games/
  vec.js                    matemática 3D e validação do controle, usadas pelas duas salas
  slither.js                sala da Cobrinha: física, colisões, comida, power-ups, bots
  agar.js                   sala das Bolhas: células, dividir, ejetar, ouriços, power-ups, bots
public/
  index.html                página inicial
  slither.html, agar.html   telas dos jogos
  css/style.css             visual de todas as páginas
  js/engine.js              motor 3D compartilhado: cena, arena, brilho, câmera, controles
  js/ui.js                  menu, ranking, power-ups, feed e nomes (iguais nos dois jogos)
  js/pellets.js             comida e power-ups na tela
  js/net.js                 conexão e suavização dos ticks
  js/slither.js, js/agar.js clientes de cada jogo
  shared/theme.js           skins, nomes dos bots, cores e power-ups (servidor e navegador)
  shared/*-rules.js         regras de cada jogo (servidor e navegador)
  shared/*-state.js         como o navegador aplica cada tick (os testes usam o mesmo arquivo)
test/                       testes (`npm test`)
```

O Three.js vem do `npm` e é servido em `/vendor/three/`, sem CDN e sem etapa de build.

## Como a Cobrinha funciona

- O **servidor manda em tudo**: move as cobras, decide quem comeu e quem morreu. O navegador só desenha e envia os controles. Isso dificulta trapaça.
- Para economizar internet, cada tick leva só **a cabeça** de cada cobra (~700 bytes). O navegador refaz o corpo com a mesma função `follow()` do servidor. Por isso `slither-rules.js` precisa dar resultado idêntico nos dois lados.
- O navegador toca os ticks ~100 ms atrás e interpola. Assim o movimento fica liso mesmo com a internet do celular oscilando.
- **Controles:** no PC, o mouse aponta para onde virar e o clique ou o espaço dá turbo (setas e WASD também funcionam). No celular, um joystick aparece onde o dedo encosta, e o botão ⚡ dá turbo.
- **Power-ups:** 🧲 ímã (come de longe), 🛡️ escudo (atravessa corpos e quica na parede), ⚡ turbo grátis, 👻 invisível (bots não te veem).

## Como as Bolhas funcionam

- Cada jogador tem uma direção (vira com o mesmo controle da Cobrinha) e de 1 a 16 células. As células andam sempre para a frente, e as pequenas são mais rápidas.
- Para engolir, uma célula precisa ter 25% a mais de massa e cobrir quase toda a outra. A parede não mata.
- **Dividir** (clique, espaço ou ✂️): cada célula com 30 ou mais de massa lança uma metade para a frente. As metades se juntam depois de 10 s ou mais (mais tempo quanto maior).
- **Soltar massa** (botão direito, E ou 💧; segurar solta várias): serve para alimentar alguém ou um ouriço.
- **Ouriços** (bolas verdes com espinhos):
  - uma célula grande que encosta num ouriço come ele e explode em pedaços;
  - uma célula pequena se esconde dentro dele;
  - alimentado com massa, o ouriço dispara um filhote na direção do tiro.
- Células enormes murcham mais rápido e cada célula tem no máximo 3.000 de massa. Assim a arena (raio 55) nunca fica tomada por um planeta.
- Cada tick manda só as células que mudaram (~1 KB, ~0,5 KB comprimido).

Mais detalhes e o histórico de decisões estão em [HISTORICO.md](HISTORICO.md). As regras para quem mexe no código (pessoas e IAs) estão em [AGENTS.md](AGENTS.md).
