# Voz e texto da interface

A interface do Conexus é só em português do Brasil. Este arquivo vale para todo texto que uma pessoa lê: rótulos, botões, títulos, mensagens de erro, estados vazios, o que o agente diz no chat e o texto alternativo.

## Quem lê

Duas pessoas leem a mesma tela. Uma é da operação, de vendas ou de pessoas, não é técnica e descreve o app em português. A outra é desenvolvedora e lê o código e as alterações de cada execução. Todo texto tem um sentido simples para a primeira, e a segunda sempre consegue abrir o que está por trás.

## Tom

- Simples, calmo e responsável. Diga o que aconteceu e o que continua valendo.
- Nunca animado, nunca com desculpas vazias, nunca com ponto de exclamação.
- Sem emoji. Os únicos símbolos no texto são o separador `·` e as reticências `…` (um caractere só, não três pontos).
- Sem nomes de clientes, depoimentos ou números inventados. `PRODUCT.md` proíbe isso.

## Pessoa e nomes

- O produto trata a pessoa por **você**.
- O agente fala na primeira pessoa: "Vou abrir um campo de motivo…", "Pronto. Troquei o destaque da página."
- No chat, o agente se chama **Conexus**. No texto do sistema, é **o agente**: "O agente quer executar um comando."
- Os substantivos do produto são nomes próprios, com maiúscula: **Workspace**, **Projeto**, **Prévia**, **Construir**. As lentes são **Prévia**, **Código**, **Alterações** e **Sobre**.
- O código ainda mistura "Projeto" e "Project" (por exemplo, "Abrindo o Project…"). Em texto novo, use **Projeto**. Ao mexer numa tela que diz "Project", troque na mesma alteração.

## Maiúsculas

Só a primeira letra da frase, em todo lugar: botões, títulos, abas ("Criar e começar", "Minhas contas de modelo"). Caixa alta só nos rótulos pequenos de grupo (eyebrow), e mesmo o cabeçalho de seção do trilho lateral fica em caixa normal ("Em breve").

## Ações são verbos

Um botão diz o que acontece quando alguém clica: "Tentar de novo", "Permitir", "Recusar", "Responder", "Ver aplicativo", "Entrar de novo", "Desconectar", "Criar e começar". Nunca "OK", "Confirmar" ou "Enviar" sozinho quando existe um verbo mais exato.

## Falhas dizem o motivo e o que foi preservado

Toda mensagem de falha tem duas partes: o que deu errado, e o que continua de pé. O pedido da pessoa nunca se perde.

- "A última alteração não compilou. A prévia continua na versão anterior."
- "Seus Projetos continuam onde estavam. O servidor não respondeu desta vez."
- "Outra conversa mudou o app antes. Nada foi sobrescrito."
- "O servidor não respondeu. Nada foi perdido; envie de novo."

Quando uma execução falha, a tela mostra o pedido original da pessoa, o motivo em linguagem do produto e o código interno em fonte mono, com a ação de recuperação ao lado.

## Atividade do agente

Cada ferramenta vira uma frase simples, com uma forma enquanto roda e outra quando termina. A fonte da verdade é `apps/web/src/features/builder/construir/tool-sentences.ts`.

- "Lendo um arquivo" → "Leu um arquivo"
- "Executando um comando" → "Executou um comando"
- As chamadas se agrupam como "4 ações concluídas". Um passo que falhou mantém o ponto redondo e a palavra "falhou".
- Pedido de permissão: "O agente quer executar um comando: `npm install date-fns`. Permitir?" A aprovação oferece só **Permitir** e **Recusar**. Nada que amplie a política.

Ao ligar uma ferramenta nova, adicione a frase dela em `tool-sentences.ts`. Não mostre o nome técnico da ferramenta no lugar da frase.

## Honestidade sobre o que não existe

- O que ainda não foi construído leva a etiqueta "em breve": "Anexar arquivo chega em breve".
- Nunca mostre uma ação falsa, um número inventado ou um progresso que não vem de um fato. Se um dado não existe, diga que não está disponível.

## Fatos em mono

Prosa é sans. Fato é mono (`var(--cx-font-mono)`): id de modelo (`gemini-3.1-pro-low`), caminho (`app/pedidos.tsx`), comando (`npm install date-fns`), hora (`12:10`), duração (`8,4 s`), revisão (`a3f9c21`), código de erro (`BUILD_TYPECHECK_FAILED`), contagem (`+3`). Números seguem o formato brasileiro: vírgula decimal, e unidade separada por espaço.

## Exemplos de ideia

Quando a tela precisa de exemplo, use pedidos reais de uma empresa: "Controle de pedidos de férias", "Checklist de abertura de loja com fotos", "Cadastro de visitas a clientes", "Simulador de orçamento".

## Textos que vêm do Mastra

Alguns componentes do `@mastra/playground-ui` trazem texto em inglês fixo. Substitua sempre. Os textos em português que substituem esses componentes ficam num lugar só: `apps/web/src/features/builder/construir/builder-copy.ts`. Antes de publicar uma tela, procure texto em inglês que tenha vazado de um componente da biblioteca, inclusive em `aria-label` e `title`.
