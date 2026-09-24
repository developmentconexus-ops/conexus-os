# Eventos, jobs e automações

Memória de R08, retomando os candidatos de R01. Nada aqui seleciona um engine ou autoriza sua instalação. [Proveniência](README.md) e [fontes da rodada](sources-and-revalidation.md#s4-eventos-jobs-e-automacoes).

## R08 Conceitos que nao sao equivalentes

| Conceito | Significado usado na conversa | Exemplo |
| --- | --- | --- |
| Domain Event | Fato que aconteceu no negócio | Solicitação aprovada |
| Background Job | Trabalho fora da request | Gerar um PDF |
| Durable Workflow | Processo com passos, falhas e espera | Integrar pedido, aguardar confirmação, notificar |
| Automation | Configuração persistente de trigger e comportamento | Todo dia consultar pedidos atrasados |
| Agent step | Parte que exige julgamento | Analisar uma exceção |
| Signal | Informação/contexto entregue a um agente | CI terminou ou diagnóstico disponível |

Essa distinção respondia à tentação de usar Dynamic Workflow para tudo. Um evento não precisava conhecer seus consumidores, e uma automação podia existir sem modelo de linguagem. Enviar uma notificação após aprovação não justificava pagar por raciocínio de agente.

## Evento junto da transação

A falha examinada era salvar a aprovação, confirmar a transação e cair antes de emitir o evento. O inverso também era ruim: emitir e depois falhar ao salvar a aprovação. A hipótese foi registrar alteração de negócio e outbox/job na mesma transação, distribuindo o trabalho após o commit.

```text
mutation + outbox/job na mesma transação
    -> commit
    -> despacho
    -> consumidores potencialmente repetidos
    -> efeito idempotente ou reconciliação
```

Outbox não foi tratada como event sourcing universal. Era uma resposta específica ao dual write. Um fato imutável, uma linha de fila e o estado de uma automação ainda teriam donos diferentes.

## Bibliotecas e o papel imaginado

**pg-boss.** Ganhou força por usar PostgreSQL, já necessário aos apps, e pela possibilidade apresentada de enfileirar no contexto da transação do negócio. A conversa citou retries, delays, scheduling, concorrência e dead letter. A integração transacional com o cliente efetivo precisaria ser provada. Não basta ambas as operações usarem PostgreSQL se forem transações distintas.

A expressão “exactly-once delivery” apareceu no material discutido. Ela não foi aceita como garantia de efeito externo exatamente uma vez. Retry, queda após o efeito e resposta perdida continuariam exigindo idempotência ou reconciliação. O teste relevante seria provocar a queda nesse intervalo e observar o resultado.

**Inngest.** Candidato para funções disparadas por eventos/cron e execução por steps com checkpoints, espera, replay e limites de concorrência. Parecia responder melhor que uma fila simples ao processo “criar no ERP → esperar → verificar → notificar”. Permaneciam custo operacional, integração com os bancos do app e semântica real de repetição.

**Trigger.dev.** Considerado para tarefas longas, retries, queues, schedules, waitpoints/aprovação e acompanhamento de execução pela UI. A vantagem imaginada era reduzir trabalho para mostrar progresso de um relatório. Não foi selecionado por um exemplo visual ou por um changelog.

**Temporal.** Referência para durabilidade e processos longos, com atividades externas separadas da orquestração. O custo discutido era adotar e operar outro sistema antes de ter um processo que precisasse dele. Não entrou como default de cada aplicação.

A comparação era por classe de problema, não “qual engine vence todos”. O caminho pequeno considerado foi começar com trabalho PostgreSQL-backed e reavaliar quando espera longa, callbacks, compensações ou coordenação excedesse esse mecanismo.

## Mastra Workflows e Dynamic Workflows

A conversa apresentou Workflows como composição de passos conhecidos, com branches, paralelismo, retries, suspend/resume e persistência. Dynamic Workflows foi descrito como definição JSON persistida que referencia Tools, Agents, Workflows e controle de fluxo registrados. Isso sugeriu um engine possível para automações criadas na plataforma.

Exemplo de intenção preservado:

```text
Todo dia às 8h:
    consultar pedidos atrasados
    filtrar os relevantes
    pedir análise ao agente somente se necessário
    enviar uma notificação
```

A hipótese era que Conexus possuísse quem cria, publica, habilita e concede capacidades; Mastra poderia possuir a execução. O JSON gerado por um modelo não ganharia acesso a tudo que estivesse registrado no engine.

O estudo deixou perguntas materiais: versão da definição por run, mudança enquanto existem execuções, isolamento de Project, escolha de credenciais, retries, idempotência, cancelamento, waits, timeout, gatilhos, inspeção e efeitos externos. “Persistir JSON” não responde automaticamente a essas perguntas.

Schedules nativos e um PubSub com adapters foram citados como possibilidades de reaproveitamento. Não se comprovou nessa conversa que todas essas superfícies chegassem pela composição instalada da Factory. O [guia Mastra](../../../.agents/skills/mastra/SKILL.md) orienta a verificação do pacote exato.

## Signals e background tasks nao substituem a plataforma de jobs

Signals foram considerados para wake/notify/steer e atualização de contexto de agentes. Um webhook poderia originar um evento empresarial e depois avisar um agente; guardar só o Signal não era o modelo proposto para a verdade do negócio.

Background Tasks de Tools foram descritas como um mecanismo de trabalho longo iniciado por um agente. Isso não estabelecia seu uso como fila de todos os aplicativos. Também foram citadas integrações Mastra com Inngest e Temporal. A alegação de suporte ou de estado experimental precisa ser verificada por versão, sem presumir troca transparente de engine.

## Superficie do SDK imaginada

O app poderia registrar um fato ou solicitar um trabalho por uma interface pequena; um adapter ligaria isso ao engine escolhido. O estudo não fechou `ctx.events`, nomes de schemas ou uma API genérica de execução. Evitar reinventar filas não significava entregar a um fornecedor a autoridade sobre Automation, Project ou concessões.

Uma operação conhecida permaneceria determinística. Um Agent seria chamado quando classificação, análise ou decisão contextual justificasse o custo. Essa separação também orientaria a Skill que ensina o Builder: quando continuar na request, quando enfileirar e quando realmente envolver um modelo.

## Experimentos sugeridos e ponto de retomada

O teste transversal imaginado era aprovar uma solicitação, registrar trabalho atomicamente, derrubar o processo após commit e retomá-lo. Outros casos eram evento duplicado, callback repetido, cancelamento durante espera, permissão revogada e resposta externa perdida.

As medidas propostas eram efeitos duplicados/perdidos, recuperação, visibilidade para o operador, custo de dependências e código próprio necessário. Nenhuma matriz desta página foi executada nesta recuperação.

Na convergência do Stage 2, jobs, eventos e automações saíram do primeiro núcleo porque o app de acompanhamento poderia ser síncrono. A [fila de qualificação](../../reference/stage2-managed-application-platform.md#7-technology-qualification-queue) mantém os gatilhos de retorno. Esta página preserva por que esses candidatos existem, não pede que Q2 os teste.
