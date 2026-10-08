---
name: conexus-explain
description: Use quando o usuário quer entender tecnicamente uma spec, plano, refatoração ou implementação do Conexus, antes de aprovar ou depois de implementar, especialmente ao perguntar sobre responsabilidades, arquitetura, estrutura do código, tipos e contratos.
---

# Conexus explain

Explique o desenho técnico da mudança para que o usuário consiga entendê-lo e questioná-lo. Adapte a profundidade à pergunta e ao conhecimento que o usuário demonstrar.

Uma sessão Claude invoca `/<name>`; uma sessão Codex invoca `$<name>`. Para esta skill, use
`/conexus-explain` ou `$conexus-explain`, respectivamente.

## Preparação

1. Identifique o alvo pelo contexto: spec, plano, diff ou implementação. Leia o material pertinente, o código envolvido e os princípios aplicáveis do repositório. Reutilize contexto confirmado; não releia o projeto inteiro.
2. Distinga o previsto do implementado. Para uma proposta, explique o desenho pretendido; para uma implementação, confira o código. Aponte divergências e o que não conseguiu verificar. Não invente decisões ou motivos históricos.
3. Leia os guias que [`areas.json`](../../../docs/development/review/areas.json) associa aos caminhos
   do alvo. O [mapa da documentação](../../../docs/index.md) identifica seus donos. As perguntas saem das regras desses
   guias, das folhas do pstack que a spec nomeia e da mudança real. Use o repertório de
   [perguntas-tecnicas.md](references/perguntas-tecnicas.md) para dono, fluxo de dados, garantias,
   alternativas e limites da evidência. Um defeito demonstrado pode ser apontado sem citar guia.
4. Quando envolver Mastra, use a skill [`mastra`](../mastra/SKILL.md) e confira documentação e tipos da versão instalada. Identifique o que o framework mantém e o que Conexus acrescenta. Sem acesso à versão instalada, declare essa limitação; não conclua que uma API inexiste.

## Resposta no chat

### 1. Visão geral

Em poucas frases, explique o que muda e o fluxo entre as partes. Em uma refatoração, destaque a mudança de estrutura e o comportamento que deve permanecer.

### 2. Perguntas técnicas que importam nesta mudança

Formule e responda às perguntas como subtítulos, normalmente de três a cinco, proporcionais ao escopo. Responda você às perguntas; não transforme a explicação em um questionário para o usuário.

Em cada resposta, mostre como a solução funciona, por que a divisão faz sentido e a consequência da escolha. Use nomes reais de módulos, tipos, funções e interfaces, com trechos curtos ou assinaturas quando tornarem o desenho concreto. Identifique exemplos propostos como propostas.

Aponte as fontes relevantes na spec ou em `arquivo:linha`. Relacione as decisões aos princípios aplicáveis por meio do mecanismo concreto. Diferencie garantia pretendida, mecanismo implementado e evidência já observada. Uma inferência sobre o motivo da escolha deve aparecer como inferência.

### 3. O que merece questionamento

Destaque escolhas relevantes, limitações, conflitos ou decisões abertas. Separe problema demonstrado de risco ou dúvida; não invente achados para preencher a seção.

## Limites

Responda em português e explique brevemente os termos técnicos na primeira ocorrência. A referência oferece repertório, não regras novas: as fontes atuais do repositório prevalecem.

Atue somente em leitura. Não altere arquivos, execute mutações, implemente, instale ou conceda aprovação. A Explain apoia a compreensão; não substitui revisão de código, testes ou validação operacional.
