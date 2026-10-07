# Repertório de perguntas técnicas

Use somente os ângulos relacionados à mudança. As perguntas são sementes: adapte-as ao fluxo, aos nomes e às decisões que encontrar. Não prescreva um padrão, biblioteca ou camada por ele aparecer aqui.

As seções não afirmam que essas capacidades existem no Conexus. As regras e decisões moram nos guias do `conexus-os`; este arquivo não cria regra; para Mastra, siga a skill `mastra`. Explique a solução encontrada, inclusive suas limitações, em vez de redesenhá-la silenciosamente.

## 01. Arquitetura e módulos

**Quando:** responsabilidades, arquivos ou dependências são criados ou reorganizados.

**Termos:** coesão, acoplamento, fronteiras de módulos, propriedade do estado, separação de efeitos.

**Perguntas:** "Qual responsabilidade pertence a cada módulo e por quê?"; "Quem mantém o estado e quais partes apenas o consultam ou derivam?"

**Mostrar:** interfaces principais, direção das dependências e um fluxo entre módulos. Uma árvore de pastas ou arquivos menores, sozinhos, não explicam a divisão.

## 02. Tipos, funções e estados

**Quando:** IDs, variantes, funções, unions ou dados externos estão no centro da mudança.

**Termos:** união discriminada, exaustividade, branded IDs, tipos derivados, validação na fronteira.

**Perguntas:** "Quais estados e resultados os tipos representam, e quais combinações inválidas impedem?"; "Onde o dado externo é validado e como chega às funções?"

**Mostrar:** tipos e assinaturas representativos, origem dos tipos reutilizados e um caso válido/inválido. `unknown` pode ser correto antes da validação; `as` e branded IDs não validam dados nem concedem acesso.

## 03. API, backend e falhas

**Quando:** rotas, operações, respostas ou tratamento de erros mudam.

**Termos:** contrato de API, schema, caso de uso, formato de transporte, vocabulário de falhas.

**Perguntas:** "O que pertence ao adaptador HTTP e o que pertence à operação?"; "Como entrada, saída e erros permanecem compatíveis entre cliente e servidor?"

**Mostrar:** contrato e fluxo de uma chamada, incluindo um erro; fonte dos tipos, validação e mapeamentos necessários. Consulte a fonte atual dos códigos de falha, sem criar um catálogo paralelo.

## 04. Banco de dados e migrations

**Quando:** persistência, tabelas, consultas ou evolução dos dados são afetadas.

**Termos:** chaves, cardinalidade, integridade, constraints, transação, isolamento, migration.

**Perguntas:** "Como as relações representam o problema e quais regras o banco garante?"; "O que acontece se duas operações disputarem o registro ou a mudança parar pela metade?"

**Mostrar:** schema ou SQL representativo, fronteira transacional e efeito sobre dados existentes. Uma transação no PostgreSQL não torna um efeito remoto automaticamente atômico; reverter código não desfaz uma migration.

## 05. Jobs, limpeza e ciclo de vida

**Quando:** timers, execução periódica, sessões, sandboxes ou encerramento de recursos mudam.

**Termos:** runner, reaper, propriedade dos recursos, sobreposição, idempotência, reconciliação, graceful shutdown.

**Perguntas:** "Quem agenda, executa e decide o que pode ser removido?"; "O que impede uma limpeza antiga de atingir um recurso em uso, e como termina o trabalho ativo no shutdown?"

**Mostrar:** interfaces, duração dos recursos e sequência com repetição ou interrupção. Distinga parar o timer de aguardar a tarefa ativa. Explique claim, lease ou fencing apenas quando a solução ou o risco os tornar pertinentes.

## 06. Eventos e comunicação assíncrona

**Quando:** partes se comunicam sem uma resposta imediata ou trabalho precisa sobreviver ao processo.

**Termos:** comando, evento, job, semântica de entrega, ordenação, deduplicação, outbox.

**Perguntas:** "Isto pede uma ação ou registra um fato, e quem publica e consome?"; "Como o consumidor permanece correto diante de repetição, atraso ou falha entre gravação e publicação?"

**Mostrar:** payload, fluxo de entrega e resultado esperado após uma falha. Não confunda deduplicação da mensagem com idempotência do efeito nem prometa execução única sem delimitar a garantia.

## 07. Mastra e execução do agente

**Quando:** agentes, tools, memória, sessão, thread, run, streaming ou storage estão envolvidos.

**Termos:** capacidade nativa, API pública, ponto de extensão, propriedade do estado, RequestContext, tracing, evals.

**Perguntas:** "O que a versão instalada já oferece e por que Conexus precisa acrescentar este mecanismo?"; "Quem mantém cada estado, por quanto tempo, e o que realmente retoma após uma interrupção?"

**Mostrar:** API e tipos consultados, versão e divisão de responsabilidades. Confirme a semântica de sessão/thread/run nessa versão. Diferencie histórico persistido de execução retomável e avaliação do agente de teste determinístico da plataforma.

## 08. Runtime, acesso e segredos

**Quando:** código gerado, permissões, credenciais ou limites de execução atravessam componentes.

**Termos:** fronteira de confiança, autenticação, autorização, escopo, isolamento, custódia de segredos, admissão.

**Perguntas:** "De onde vêm identidade e escopo, e onde a ação é autorizada?"; "Quais recursos esse código pode acessar e quem impede acesso aos demais?"

**Mostrar:** caminhos permitidos e negados, local da imposição e alcance de credenciais. Use nomes e fluxos, nunca valores de segredos. Processo separado, tipo validado ou botão oculto não comprovam autorização nem isolamento.

## 09. Frontend e estado da tela

**Quando:** componentes, formulários, cache, polling ou streaming mudam.

**Termos:** composição, props, hooks, estado local/remoto, estado derivado, query keys, invalidação, acessibilidade.

**Perguntas:** "Quem mantém cada informação e o que a tela apenas deriva?"; "Como uma alteração, resposta atrasada ou reconexão afeta o que a pessoa vê?"

**Mostrar:** fluxo de estado, interfaces dos componentes e estados relevantes de carregamento, vazio, erro ou acesso negado. Relacione teclado, foco e design system quando a interação mudar; não transforme toda explicação em revisão visual.

## 10. Testes, refatoração e revisão

**Quando:** a estrutura muda ou é preciso compreender o alcance de uma garantia.

**Termos:** preservação de comportamento, impacto da mudança, regressão, teste de integração, E2E, injeção de falhas.

**Perguntas:** "O que muda internamente, o que permanece para o usuário e o que deixa de existir?"; "Qual comportamento os testes protegem e qual falha faria esses testes acusarem o problema?"

**Mostrar:** exemplo antes/depois, consumidores afetados e provas já existentes. Separe testes planejados, testes presentes e resultados observados; diga o que é simulado. A Explain não executa mudanças para obter aprovação.

## 11. SDK, packages e extensibilidade

**Quando:** aplicações ganham uma API reutilizável, biblioteca ou capacidade gerenciada.

**Termos:** API pública, contrato gerado, experiência de desenvolvimento, dependências, compatibilidade, admissão.

**Perguntas:** "O que o aplicativo recebe pronto e o que continua sendo responsabilidade do runtime?"; "Por que esta integração precisa de uma abstração própria, e como uma atualização afeta os consumidores?"

**Mostrar:** uso mínimo da API, origem dos contratos e requisitos do ambiente. Gerar um QR e gerir documentos com acesso e persistência são necessidades diferentes; não transforme toda biblioteca em serviço da plataforma.

## 12. Observabilidade, desempenho e publicação

**Quando:** diagnósticos, desempenho, configuração, releases ou recuperação são afetados.

**Termos:** logs, traces, métricas, auditoria, profiling, release imutável, compatibilidade, restauração.

**Perguntas:** "Como acompanhar uma execução e localizar a causa de uma falha?"; "Como a publicação ou recuperação preserva dados, permissões e compatibilidade?"

**Mostrar:** caminho de diagnóstico e artefato/configuração relevante, sem dados sensíveis. Distinga expectativa de medição; backup criado de restauração demonstrada; processo vivo de serviço pronto. Não declare melhora de desempenho apenas pela forma do código.
