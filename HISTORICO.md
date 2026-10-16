# Histórico do projeto

Diário de decisões e mudanças, o mais recente primeiro. Serve para continuar o trabalho num chat novo
(com o Claude, com o ChatGPT ou com uma pessoa): leia isto antes de mexer no código.

---

## 2026-10-16 · Claude · Base do projeto + Cobrinha 3D jogável online

### O que foi pedido
Um site que funcione no celular com dois jogos, um no estilo agar.io e outro no estilo slither.io,
"do nosso jeito" e em 3D, publicado no Railway. O repositório é compartilhado entre o Claude e o ChatGPT.

### Decisões tomadas com o dono do projeto (perguntas e respostas)
| Pergunta | Resposta |
|---|---|
| Multiplayer? | **Online de verdade + bots** completando a sala (servidor Node + WebSocket no Railway) |
| Tipo de 3D | **Arena 3D de verdade**: movimento livre nos 3 eixos |
| Formato da arena | **Esfera grande** |
| Controle no celular | **Arrastar o dedo** (joystick flutuante) + botão de turbo |
| Salas | **Uma sala por jogo, ~20 vagas** (bots completam) |
| Diferenciais | **Power-ups**, **visual neon/espacial**, **tema brasileiro** |
| Tecnologia | **JS puro + Three.js**, sem build (fácil para as duas IAs editarem) |
| Contas | **Só apelido**, sem login e sem ranking salvo |
| Divisão do trabalho | Claude faz a base; depois Claude e ChatGPT pegam melhorias por partes |
| Prioridade | **Cobrinha primeiro**, Bolhas (agar) depois |
| Nome do site | **Jogo da Cobrinha do Otávio** |

### O que foi feito
- `server.js`: um único servidor Node entrega o site e roda as salas via WebSocket (`/ws/slither`) a 20 ticks/s.
  Tem `/health` para o Railway, derruba conexões mortas a cada 15 s e bloqueia acesso fora da pasta `public/`.
- `games/slither.js`: a sala da Cobrinha 3D (protocolo documentado no topo do arquivo).
  - Arena esférica de raio 70. Bater na parede mata, exceto com escudo, que faz quicar.
  - Cabeça bate no corpo de outra cobra = morre e vira comida (que some em 60 s).
  - Turbo gasta pontos e larga comida atrás.
  - Power-ups: ímã, escudo, turbo grátis e invisível. Bots não enxergam cobras invisíveis.
  - 20 bots com nomes do folclore e da comida brasileira. Eles procuram comida, desviam de corpos e
    da parede (testam 10 direções) e tentam cortar a frente de cobras menores.
  - O jogador vira de forma **relativa** (o servidor recebe x/y de -1 a 1 mais o "cima" da câmera).
    Assim soltar o controle segue reto, sem o "puxão de volta" que o atraso da rede causaria.
- `public/shared/`: regras e aplicação de ticks usadas pelo servidor e pelo navegador. O corpo é
  reconstruído no cliente de forma **determinística**, garantida por teste.
- `public/js/engine.js`:
  - visual: cena espacial, malha geodésica da arena e parede que acende em rosa quando você chega perto;
  - desempenho: bloom neon (desliga sozinho abaixo de ~35 fps), `Batch` (InstancedMesh com brilho por cor), partículas;
  - câmera em terceira pessoa com horizonte estável;
  - controles: mouse, toque, teclado.
- `public/js/slither.js`: cliente do jogo.
  - Interface: menu com apelido e 9 skins brasileiras (Canarinho, Arara, Capivara, Boto-rosa,
    Céu de Brasília, Sucuri, Saci, Tucano, Iara), HUD com pontos, posição, ranking, power-ups ativos e
    feed de mortes ("X e Y bateram de frente").
  - Mundo 3D: nomes sobre as cobras próximas e aviso de parede.
  - Leveza: cobras distantes desenhadas com metade dos gomos.
- Visual: fundo violeta-noite, amarelo/verde/rosa/ciano. Fontes Bungee (títulos) e Atkinson Hyperlegible (textos).
- Testes (`npm test`): 60 s de jogo simulado com um cliente falso (o corpo das cobras no cliente fica
  idêntico ao do servidor), colisão e regras.
- Testado no Chromium headless em desktop (1280×800) e celular (390×844 com toque): menu, jogar,
  turbo, joystick com dois dedos, morte e "Jogar de novo", sem erros no console.

### Números medidos
- Servidor: ~1 ms de CPU por tick com 20 cobras e 2.500 comidas.
- Rede: ~700 bytes por tick (~14 KB/s por jogador). O estado inicial (~100 KB) vai comprimido.
- Em 5 min simulados, os bots não bateram na parede e houve ~10 mortes por minuto.

### Limitações conhecidas / próximos passos
- [ ] **Bolhas 3D (agar.io)**: criar `games/agar.js` + `public/agar.html` + `public/js/agar.js`, reaproveitando
      `engine.js` (arena, câmera, controles, `Batch`) e o loop de `server.js`. Ideia: células-esfera, dividir
      (botão de ação) e ejetar massa.
- [ ] Previsão local da própria cobra: hoje a resposta ao controle tem o atraso da rede + ~100 ms de suavização.
- [ ] Ainda não foi medido o FPS em celulares reais: no teste só havia renderização por software.
      Se pesar, as alavancas são `Batch` com menos gomos, menos comida (`FOOD`) e `setPixelRatio`.
- [ ] Sons (comer, turbo, morrer) e vibração no celular.
- [ ] Mais de uma sala quando lotar (hoje: 1 sala, até 60 conexões).
- [ ] Minimapa ou indicador de onde estão as cobras grandes.
- [ ] PWA (ícone na tela inicial, tela cheia no celular).
