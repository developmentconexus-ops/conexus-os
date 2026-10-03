# Voz e texto da interface

A interface do Conexus é só em português do Brasil. Vale para todo texto que uma pessoa lê: rótulos, botões, títulos, falhas, estados vazios, o que o agente diz no chat e o texto alternativo.

## Quem lê

Duas pessoas leem a mesma tela. Uma é da operação, de vendas ou de pessoas, não é técnica e descreve o app em português. A outra é desenvolvedora e lê o código e as alterações de cada execução. Todo texto tem um sentido simples para a primeira, e a segunda sempre consegue abrir o que está por trás.

## Tom

- Simples, calmo e responsável. Diga o que aconteceu e o que continua valendo.
- Nunca animado, nunca com desculpas vazias, nunca com ponto de exclamação.
- Sem emoji. Os únicos símbolos no texto são o separador `·` e as reticências `…` (um caractere só).
- Sem nomes de clientes, depoimentos ou números inventados. `PRODUCT.md` proíbe.

## Pessoa e nomes

- O produto trata a pessoa por **você**. O agente fala na primeira pessoa: "Vou abrir um campo de motivo…", "Pronto. Troquei o destaque da página."
- No chat, o agente se chama **Conexus**. No texto do sistema, é **o agente**: "O agente quer executar um comando."
- Os substantivos do produto são nomes próprios, com maiúscula: **Workspace**, **Projeto**, **Prévia**, **Construir**. As lentes são **Prévia**, **Código**, **Alterações** e **Sobre**.
- Em texto novo, use **Projeto**, nunca "Project". Ao mexer numa tela que ainda diz "Project", troque na mesma alteração.

## Maiúsculas

Só a primeira letra da frase, em todo lugar: botões, títulos, abas. Caixa alta só nos rótulos pequenos de grupo.

## Ações são verbos

Um botão diz o que acontece quando alguém clica: "Permitir", "Recusar", "Responder", "Ver aplicativo", "Desconectar", "Criar e começar". Nunca "OK", "Confirmar" ou "Enviar" sozinho quando existe um verbo mais exato.

## Falhas

O texto de uma falha vem da tabela única de falhas do código (`apps/web/src/features/builder/failure-reasons.ts`). Não escreva um texto de falha numa tela: use a entrada da tabela, ou acrescente a entrada lá.

- Toda falha diz o que deu errado e o que continua de pé. O pedido da pessoa nunca se perde: a tela o mostra de novo, com o motivo em linguagem do produto e o código interno em mono.
- Falha da Conexus (erro nosso, serviço fora, plataforma) nunca pede "tente de novo" nem oferece um botão para repetir. A falha é consertada no código e a tela diz o que está preservado.
- O que a pessoa pode corrigir, como um nome em uso ou um campo vazio, diz o que mudar.

## Atividade do agente

Cada ferramenta vira uma frase, uma enquanto roda e outra quando termina ("Lendo um arquivo" → "Leu um arquivo"). A fonte é `apps/web/src/features/builder/construir/tool-sentences.ts`; ao ligar uma ferramenta nova, acrescente a frase lá. Nunca mostre o nome técnico no lugar dela.

- Três ou mais chamadas seguidas viram uma linha: rodando, nomeia a atual e mostra "2/5"; terminada, resume ("Editou 4 arquivos, executou 1 comando"). Uma chamada que falhou entra como "1 falhou".
- O raciocínio do modelo aparece só como "Pensando…" e some depois.
- Pedido de permissão: "O agente quer executar um comando: `npm install date-fns`. Permitir?", com só **Permitir** e **Recusar**.

## Honestidade

O que não foi construído leva "em breve": "Anexar arquivo chega em breve". Nunca mostre ação falsa, número inventado ou progresso que não vem de um fato; se o dado não existe, diga que não está disponível.

## Fatos em mono

Prosa é sans. Fato é mono (`var(--cx-font-mono)`): id de modelo, caminho, comando, hora, duração, revisão, código de erro, contagem. Números seguem o formato brasileiro: vírgula decimal e unidade separada por espaço ("8,4 s").

## Exemplos

Quando a tela precisa de exemplo, use pedidos reais de uma empresa: "Controle de pedidos de férias", "Checklist de abertura de loja com fotos", "Cadastro de visitas a clientes".

## Textos que vêm do Mastra

Alguns componentes do `@mastra/playground-ui` trazem inglês fixo. Substitua sempre, em `apps/web/src/features/builder/construir/builder-copy.ts`. Antes de publicar uma tela, procure inglês vazado, inclusive em `aria-label`, `title` e placeholder.
