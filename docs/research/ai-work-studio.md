# Ideia futura: estúdio de sistemas de trabalho com IA

**Status:** IDEIA / PESQUISA EXPLORATÓRIA. Não é decisão arquitetural, task executável ou compromisso de entrega.
**Registrado em:** 2026-09-24.
**Origem:** proposta do operador na conversa de continuidade do Conexus.
**Escopo desta mudança:** preservar a ideia e referências verificadas, sem mudar o roadmap, a task atual, dependências ou runtime.

## Intenção do operador

Criar, no futuro, uma experiência em que alguém constrói um sistema de trabalho com IA, não apenas configura um prompt ou escolhe um modelo. Esse sistema pode reunir Skills, workflows, integrações, agentes, conhecimento e outros recursos necessários ao resultado.

O exemplo dado foi produção de criativos para um time de marketing. Gerar uma imagem não basta: o processo precisa usar identidade visual, referências, um método de criação e etapas que a pessoa consiga ver e testar. O usuário imagina conversar com um creator/estúdio enquanto o fluxo aparece e evolui visualmente.

“Estúdio” é nome provisório. O operador não decidiu se isso será o Agent Studio já discutido, uma ampliação dele ou outra superfície. Marketing é exemplo inicial, não limite da ideia.

## Hipótese de produto, ainda não validada

Transformar o conhecimento sobre como executar uma tarefa em um processo reutilizável, inspecionável e testável por outras pessoas da empresa.

Há duas experiências candidatas, não dois produtos obrigatórios:

- **Montar e melhorar:** conversar sobre o objetivo, visualizar etapas e dependências, examinar entradas e resultados, testar uma etapa e comparar alternativas.
- **Usar:** preencher um briefing e executar o processo aprovado, sem precisar administrar seu grafo, prompts ou código.

A segunda experiência poderia ser um aplicativo gerado pelo próprio Conexus. Isso conectaria o Builder de software à construção de processos com IA. É uma inferência desta pesquisa, não requisito já aprovado.

Um workflow descreve a execução. Skills ensinam procedimentos; conhecimento e arquivos fornecem contexto; integrações dão acesso; modelos/agentes participam onde há geração ou julgamento. Nem todo recurso precisa virar um nó executável. O estúdio pode mostrar referências e configurações associadas às etapas.

## Exemplo ilustrativo: criativos de marketing

O fluxo abaixo expande o exemplo do operador; não é um desenho aprovado:

```text
Briefing da campanha
  -> consultar identidade visual e materiais autorizados
  -> selecionar referências e direção criativa
  -> aprovar a direção quando necessário
  -> gerar imagem/copy com a ferramenta apropriada
  -> compor logo, texto e formatos com regras determinísticas
  -> verificar requisitos e revisar qualidade visual
  -> aprovar e exportar
```

A interface de montagem poderia mostrar qual versão da orientação foi usada, referências escolhidas, resultado de cada etapa e custo observado. A pessoa poderia corrigir uma etapa sem começar tudo novamente.

Inserir um logo oficial, redimensionar e verificar formato não precisam ser decisões de um agente. A avaliação estética não deve ser apresentada como garantia automática por existir outro modelo “revisor”. Testes mecânicos e revisão humana respondem a perguntas diferentes.

Exportar não significa publicar em redes sociais ou gastar verba de mídia. Esses efeitos exigiriam autorização própria. Uma reexecução também precisa distinguir etapas de geração de ações externas que não podem ser repetidas inadvertidamente.

## Referências públicas verificadas nesta pesquisa

Consulta documental em 2026-09-24. Não houve instalação, benchmark ou teste de produto. Os itens abaixo descrevem superfícies documentadas pelos fornecedores, não conformidade demonstrada com o Conexus.

| Referência | Evidência encontrada | O que estudar depois |
| --- | --- | --- |
| Figma Weave | A página de criativos descreve workflows reutilizáveis com referências/regras de marca e uma interface simplificada para o time executar o processo | Composição de geração e edição, reutilização do processo e separação entre autor e operador |
| Dify Workflow Studio | Documenta canvas com modelos, conhecimento, tools, código, controle de fluxo e revisão humana. A documentação de debug permite rodar nós individualmente e examinar valores intermediários | Experiência de testar, inspecionar e iterar sem repetir todo o fluxo |
| n8n | A página de AI descreve composição de agentes e automações, revisão humana e criação de workflows por linguagem natural | Reuso de integrações, fronteiras de efeitos e construção assistida |
| Mastra Studio | A documentação de Workflows mostra grafo, formulário de entrada, status por etapa, resultados e replay de etapas | Reutilizar mecanismos já existentes em vez de manter outro estado de execução |
| Mastra Agent Builder | A documentação descreve criação/operação de agentes, Workspace, Skills, tool providers e canais. Exige licença Enterprise Edition para produção | Qualificação de edição, APIs públicas, licença, integração com IAM e compatibilidade com a versão instalada |

Fontes:

- Figma Weave: https://www.figma.com/solutions/ai-ad-generator-weave/
- Figma Weave, interface simplificada: https://www.figma.com/solutions/figma-ai-design-tool/
- Dify Workflow Studio: https://www.dify.ai/workflows
- Dify, teste por nó: https://docs.dify.ai/en/cloud/use-dify/debug/step-run
- n8n AI: https://n8n.io/ai/
- Mastra Workflows, seção Studio: https://mastra.ai/docs/workflows/overview
- Mastra Agent Builder: https://agent-builder.mastra.ai/

A categoria já existe. Esta consulta não demonstra que o Conexus seria único. Não é suficiente diferenciar o produto por “caixas conectadas”, criação por chat ou teste por etapa.

## Hipótese de diferenciação do Conexus

O valor a investigar é permitir que uma empresa componha seu próprio método de trabalho, com contexto aprovado, integrações autorizadas e uma interface adequada a quem executa. Um resultado satisfatório seria outra pessoa reproduzir o processo sem depender de quem escreveu os prompts originais.

Isso poderia reunir Builder, Brain, Skills, Connectors, agentes e automações já discutidos. Não justifica criar novos donos para conceitos existentes. O desenho visual e a definição executável precisariam permanecer coerentes; editar um não pode manter uma segunda verdade silenciosa sobre o outro.

O caminho que parece menor é qualificar primeiro a composição com o que Mastra e outras ferramentas já oferecem. A documentação pública não prova disponibilidade na versão instalada, possibilidade de embutir componentes, licença adequada ou respeito às regras de autorização do Conexus. Dynamic Workflows permanece candidato histórico, não requisito para esta ideia.

## Riscos e perguntas preservadas

O risco de produto é construir um editor visual genérico caro, quando uma solução existente já resolve a necessidade. O risco de experiência é trocar um prompt difícil por um grafo difícil. O time que usa o resultado não deve necessariamente aprender nomes como Tool, Skill ou Workflow.

Também ficam abertas a representação canônica (código, configuração ou composição), publicação de versões, tratamento de arquivos de marca, acesso aos dados, orçamento de geração, cache e invalidação quando uma etapa anterior muda. Essas questões não são decididas neste registro.

A oportunidade não exige uma equipe de subagentes em toda execução. Passos determinísticos, um agente com ferramentas ou um workflow pequeno podem ser suficientes. Quantidade de modelos/agentes não é medida de qualidade.

## Gatilho para retomar, sem antecipar implementação

Retomar quando a base de aplicativos estiver operacional e existir um processo repetido cujo proprietário queira reproduzir e testar pela plataforma. Antes de construir um estúdio amplo, comparar uma composição nativa de Mastra ou ferramenta existente com a menor interface Conexus que acrescente valor real.

Um experimento futuro possível é executar alguns briefings reais de uma mesma marca e observar se outra pessoa consegue usá-los, inspecionar um erro, corrigir somente a parte necessária e repetir com qualidade aceitável. Medir esforço humano, fidelidade às regras, tempo e custo por entrega, além de erros e efeitos indevidos.

Este registro não cria esse experimento como task, não altera a ordem Q1–Q5 e não autoriza instalar ferramentas, gerar criativos ou publicar conteúdo. O roadmap e os contratos atuais continuam sendo a autoridade.
