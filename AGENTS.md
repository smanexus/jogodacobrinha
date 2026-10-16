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
7. **Protocolo:** está documentado no topo de `games/slither.js`. Se mudar, atualize esse comentário e `public/shared/slither-state.js` juntos.
8. Valide tudo o que chega do cliente (já existe `handle()` em `games/slither.js`). Nomes de jogador vão para a tela sempre por `textContent`, nunca por `innerHTML`.
9. Antes de subir: `npm test` passando e o jogo aberto no navegador sem erros no console.
