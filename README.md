# Jogo da Cobrinha do Otávio

Jogos de arena em 3D para jogar online, no navegador do PC ou do celular.

- **Cobrinha 3D** (pronto): estilo slither.io, numa arena esférica com movimento livre nos 3 eixos.
- **Bolhas 3D** (em breve): estilo agar.io, na mesma arena.

Sem login: escolhe um apelido e joga. Quando tem pouca gente, bots com nomes brasileiros completam a sala.

## Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
npm start
```

Abra http://localhost:3000. Para testar no celular na mesma rede Wi-Fi, abra `http://IP-DO-COMPUTADOR:3000`.

`npm test` confere que o servidor roda e que o navegador reconstrói as cobras igualzinho ao servidor.

## Publicar no Railway

1. Em [railway.com](https://railway.com), crie um projeto com **Deploy from GitHub repo** e escolha este repositório.
2. O Railway detecta o Node sozinho, roda `npm install` e `npm start`, e testa a rota `/health` (configurado em `railway.json`).
3. Em **Settings → Networking**, clique em **Generate Domain** para ter o endereço público.
4. Cada `git push` na branch configurada publica de novo.

Deixe **1 réplica só**: cada sala vive na memória do servidor.

## Estrutura

```
server.js                   servidor HTTP (site) + WebSocket (salas) + loop de 20 ticks/s
games/slither.js            sala da Cobrinha: física, colisões, comida, power-ups, bots
public/
  index.html                página inicial
  slither.html              tela da Cobrinha 3D
  css/style.css             visual de todas as páginas
  js/engine.js              motor 3D compartilhado: cena, arena, brilho, câmera, controles
  js/net.js                 conexão e suavização dos ticks
  js/slither.js             cliente da Cobrinha: desenho, HUD, menu
  shared/slither-rules.js   regras usadas pelo servidor E pelo navegador
  shared/slither-state.js   como o navegador aplica cada tick (o teste usa o mesmo arquivo)
test/slither.test.js        testes (`npm test`)
```

O Three.js vem do `npm` e é servido em `/vendor/three/`, sem CDN e sem etapa de build.

## Como a Cobrinha funciona

- O **servidor manda em tudo**: move as cobras, decide quem comeu e quem morreu. O navegador só desenha e envia os controles. Isso dificulta trapaça.
- Para economizar internet, cada tick leva só **a cabeça** de cada cobra (~700 bytes). O navegador refaz o corpo com a mesma função `follow()` do servidor. Por isso `slither-rules.js` precisa dar resultado idêntico nos dois lados.
- O navegador toca os ticks ~100 ms atrás e interpola. Assim o movimento fica liso mesmo com a internet do celular oscilando.
- **Controles:** no PC, o mouse aponta para onde virar e o clique ou o espaço dá turbo (setas e WASD também funcionam). No celular, um joystick aparece onde o dedo encosta, e o botão ⚡ dá turbo.
- **Power-ups:** 🧲 ímã (come de longe), 🛡️ escudo (atravessa corpos e quica na parede), ⚡ turbo grátis, 👻 invisível (bots não te veem).

Mais detalhes e o histórico de decisões estão em [HISTORICO.md](HISTORICO.md). As regras para quem mexe no código (pessoas e IAs) estão em [AGENTS.md](AGENTS.md).
