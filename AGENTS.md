# Regras do projeto (para pessoas e IAs: Claude, ChatGPT/Codex)

Este repositório é editado por mais de uma IA. Para ninguém atropelar ninguém:

1. **Antes de começar, leia `HISTORICO.md`.** Ao terminar, acrescente uma entrada no topo dele: data, quem fez (ex.: "Claude", "ChatGPT"), o que mudou, o que ficou pendente.
2. **JavaScript puro, sem etapa de build.** Módulos ES no navegador, Node 20+ no servidor. Dependências: só `ws` e `three`. Não adicione outra sem necessidade real.
3. **Português** nos textos da tela (pt-BR), nos comentários e nas mensagens de commit.
4. **Celular primeiro.** Toda mudança de controle ou HUD precisa funcionar com toque e numa tela de 390 px de largura. Use `InstancedMesh` (classe `Batch`) para desenhar muitos objetos.
5. **O servidor é a autoridade.** O navegador nunca decide colisão, pontos ou morte.
6. **`public/shared/` roda nos dois lados.** O corpo das cobras é recalculado no navegador e precisa sair idêntico ao do servidor:
   - em `follow()` use só `+ - * /` e `Math.sqrt` (nada de `Math.hypot`, `sin` ou `cos`);
   - mudou regra, protocolo ou a ordem do tick? Rode `npm test`.
7. **Protocolo:** está documentado no topo de `games/slither.js` e `games/agar.js`. Se mudar, atualize o comentário e o `public/shared/*-state.js` correspondente juntos.
8. **Reaproveite antes de escrever:** `engine.js` (cena, câmera, controles, `Batch`), `ui.js` (menu, ranking, feed, nomes), `pellets.js`, `shared/theme.js` e `games/vec.js` já servem aos dois jogos.
9. Valide tudo o que chega do cliente (já existe `handle()` nas salas e `parseSteer`/`cleanName` em `games/vec.js`). Nomes de jogador vão para a tela sempre por `textContent`, nunca por `innerHTML`.
10. Antes de subir: `npm test` passando e o jogo aberto no navegador sem erros no console.
