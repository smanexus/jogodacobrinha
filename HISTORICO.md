# Histórico do projeto

Diário de decisões e mudanças, o mais recente primeiro. Serve para continuar o trabalho num chat novo
(com o Claude, com o ChatGPT ou com uma pessoa): leia isto antes de mexer no código.

---

## 2026-10-16 · Claude · Bolhas 3D (estilo agar.io)

### O que foi pedido
O dono publicou a Cobrinha no Railway e pediu as Bolhas 3D.

### Decisões
- **Mesmo controle da Cobrinha:** a bolha anda sempre para a frente e o joystick/mouse vira. Num espaço 3D
  não há "apontar para um lugar na tela" como no agar 2D, e manter o mesmo controle nos dois jogos ajuda quem joga.
- **Ações:**
  - dividir: clique, espaço ou ✂️;
  - soltar massa: botão direito, E ou 💧, e segurar solta várias.
- **Ouriços** no lugar dos "vírus" do agar (tema brasileiro). Encostar sendo grande explode a célula em
  pedaços; pequeno se esconde nele; alimentado com massa, ele dispara um filhote.
- Os mesmos 4 power-ups da Cobrinha, adaptados:
  - 🛡️ escudo: ninguém te engole;
  - ⚡ turbo: +35% de velocidade;
  - 🧲 ímã: come comida de longe;
  - 👻 invisível: bots não te veem.
- **Balanceamento** feito com simulações de 5–10 min só com bots:
  - arena de raio 55;
  - célula de no máximo 3.000 de massa;
  - quanto maior a célula, mais rápido ela murcha.
  - Resultado: ~5 mortes por minuto, e o maior chega a ~3.800 sem dominar a arena.
    Com raio 80 quase ninguém se encontrava; com 50 um bot chegava a 16.000.

### O que foi feito
- `games/agar.js`: sala das Bolhas (protocolo no topo do arquivo), registrada em `/ws/agar` no `server.js`.
  - As bolinhas de comida ficam numa grade espacial.
  - Cada tick manda só as células que mudaram.
- `public/agar.html` + `public/js/agar.js`: cliente das Bolhas.
  - Bolhas com borda brilhante e olhos que olham para onde o dono vai.
  - Ouriços com 42 espinhos girando e animação de engolir.
  - Nomes sobre os jogadores e botões ✂️/💧 no celular.
- **Código comum aos dois jogos:**
  - `public/shared/theme.js`: skins, nomes, cores e power-ups;
  - `games/vec.js`: vetores 3D, o controle relativo `steerDir` e a validação `parseSteer`/`cleanName`;
  - `public/js/ui.js`: menu, ranking, power-ups, feed e nomes;
  - `public/js/pellets.js`: comida;
  - `engine.js`: agora tem duas ações (`primary`/`secondary`, com `onPress`) e a opção `rim` no `Batch`.
- `public/js/slither.js` reescrito em cima dessas peças, com o mesmo comportamento.
- Compressão WebSocket ligada para mensagens acima de 512 bytes, o que corta ~55% dos ticks.
- Correção: comida ou power-up colado na câmera tapava a tela inteira e agora não é desenhado.
- Testes: `test/agar.test.js`.
  - Em 2 min de jogo simulado, o cliente fica com exatamente os mesmos jogadores, células e bolinhas do servidor.
  - Também testa dividir, ejetar e engolir.
- Testado no Chromium headless, sem erros no console:
  - desktop e celular com toque, incluindo botões ✂️/💧 e dividir em 4 bolhas;
  - morte nos dois jogos ("Tucano engoliu você…") e "Jogar de novo".

### Pendências novas
- [ ] Previsão local nas Bolhas também (a resposta tem o atraso da rede + ~100 ms).
- [ ] Bots das Bolhas não usam ouriços nem soltam massa de propósito.
- [ ] Ninguém consegue parar (sempre anda para a frente). Se fizer falta, um botão de "freio" resolve.

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
- [x] **Bolhas 3D (agar.io)**: feito na entrada acima.
- [ ] Previsão local da própria cobra: hoje a resposta ao controle tem o atraso da rede + ~100 ms de suavização.
- [ ] Ainda não foi medido o FPS em celulares reais: no teste só havia renderização por software.
      Se pesar, as alavancas são `Batch` com menos gomos, menos comida (`FOOD`) e `setPixelRatio`.
- [ ] Sons (comer, turbo, morrer) e vibração no celular.
- [ ] Mais de uma sala quando lotar (hoje: 1 sala, até 60 conexões).
- [ ] Minimapa ou indicador de onde estão as cobras grandes.
- [ ] PWA (ícone na tela inicial, tela cheia no celular).
