# Observabilidade, isolamento e publicação

Memória de R12–R13 e da revisão posterior que reduziu o primeiro perfil. É explicação histórica, não um plano novo. [Fontes](sources-and-revalidation.md#s6-observabilidade-isolamento-e-hosting).

## R12 Observabilidade auditoria e diagnosticos

A conversa separou quatro necessidades: observability para entender lentidão/falhas; audit para registrar ações relevantes; runtime safety para limitar autoridade; e diagnostics para o Builder conseguir reparar o app.

OpenTelemetry foi o candidato para não inventar formatos próprios de traces, métricas e logs. A hipótese incluía correlação entre request, handler, query, job e Connector. Um Collector poderia fazer transporte e processamento sem cada app conhecer o backend final. Sentry apareceu para erros, source maps e correlação; Grafana, Datadog e Axiom foram citados como destinos, sem comparação equivalente.

Mastra Observability e um exporter OTel foram discutidos para integrar traces de Agent, Workflow, Tool e modelo. A disponibilidade exata e o encaixe com o runtime instalado continuavam por verificar. Não se propôs substituir os mecanismos nativos de observação do Builder.

O runtime poderia instrumentar transporte e dependências sem o agente configurar logging em cada Project. Pino foi considerado para logs estruturados e redaction. A conversa queria registrar operação, build, Project, duração e erro, sem capturar por padrão payloads inteiros, tokens ou linhas do banco.

Audit foi separado de telemetry porque amostragem, expiração ou falha de exportação não deveriam produzir falsa evidência de negócio. O envelope actor/action/time/result poderia ser automático; o significado de “pedido aprovado” ainda precisaria de confirmação da operação. Um retorno HTTP não prova, sozinho, o efeito empresarial ou externo.

Para integração, a conversa preservou o estado **OUTCOME_UNKNOWN** quando o fornecedor pode ter aceitado uma escrita antes de a resposta se perder. Timeout não permitiria afirmar “falhou” nem repetir cegamente uma operação não idempotente.

### Runtime safety e a correcao sobre segredos

R04 havia atribuído muita proteção ao bootstrap e aos checks de import. R12 corrigiu isso. Código gerado no mesmo processo que segredos privilegiados não fica isolado por instruções, types ou lint. A autoridade disponível ao processo deveria ser limitada ao que aquele app poderia legitimamente fazer.

Connector Runtime e ingresso de identidade ganharam importância porque manteriam credenciais privilegiadas fora do código gerado. Dados do próprio Project eram outra fronteira: a conversa considerou papéis DML limitados, sem DDL ou acesso ao Hub. Isso não congelou a mecânica atual de relay e workers.

Node Permission Model foi candidato de defesa adicional, não sandbox suficiente por si só. Foram discutidos limites de CPU, memória, filesystem, processos, rede, concorrência, tamanho e duração. `@fastify/rate-limit` e Cockatiel apareceram como mecanismos existentes para limites/resiliência. Retry continuaria dependente da operação; circuit breaker não resolve resultado externo ambíguo.

### Diagnosticos para o Builder

A hipótese era uma Tool como `inspect_runtime_diagnostics`, que receberia só o Project autorizado e devolveria uma projeção segura: erro, trecho de trace, dependência, versão e localização do código. Não seria acesso irrestrito a logs de produção.

Um Signal poderia avisar “há um diagnóstico”. A evidência permaneceria em seu dono. O ciclo imaginado era falha → diagnóstico → investigação → correção de source → build/teste. O objetivo era evitar que a pessoa tivesse de copiar dumps para o chat.

Probes sugeridos: backend de telemetry indisponível sem parar o app; erro ligado à versão correta; dado sensível removido da projeção; falha externa ambígua sem retry cego; tentativa de alcançar segredo ou dado de outro Project recusada. São intenções de teste arquivadas, não uma declaração de resultados.

## R13 Isolamento hosting e Release

A rodada explorou Published App como workload isolado, stateless, montado a partir de Release imutável. Comparou runtime genérico que carrega bundles com imagem OCI por Release. OCI por digest parecia facilitar reprodução e separar código verificado de credenciais de deployment.

E2B era candidato para desenvolvimento/Preview. Cloud Run ganhou preferência provisória para containers/revisions e promoção de tráfego. Fly Machines foi considerado para controle de máquinas, redes e isolamento. Kubernetes e um orquestrador próprio foram julgados complexidade sem necessidade imediata. Limites, versões e características comerciais dos hosts não foram qualificados nesta recuperação.

A arquitetura explorada separava ingresso confiável e workload de código gerado. O primeiro cuidaria de identidade, sessão, TLS e routing. O segundo teria dados/capacidades limitados e sem segredos do Hub, Factory ou fornecedor. Egress limitado para Project DB, Connector Runtime e serviços necessários reduziria a superfície de saída de dados.

A publicação imaginada preparava uma versão sem tráfego, verificava saúde e migrations e depois promovia. A própria discussão deixou a ordem migration/deploy aberta. **Preparar sem tráfego não implica ausência de efeitos em produção**, especialmente se uma migration já rodou. Reverter ponteiro/código também não reverte dados ou efeitos externos. A simplificação posterior não removeu essa questão.

O probe proposto incluía app funcionando, isolamento negativo, telemetry fora e versão nova quebrada sem substituir a publicada. A hipótese não obrigava Preview e Published a usarem o mesmo host, mas queria compatibilidade do contrato de runtime.

## Convergencia para managed apps

O operador interrompeu o desenho porque parecia uma mini-cloud maior que a necessidade real. O objetivo inicial era criar apps internos úteis, deixando software complexo e independente para um horizonte posterior. Pediu olhar o Mitra e reduzir a explicação e a arquitetura.

O SDK público do Mitra e o relatório enviado mostravam superfícies de autenticação, entities, queries, Functions e integrações acessadas via plataforma. Isso sustentava considerar um modelo gerenciado. **Não demonstrava a topologia de servidores por trás do gateway**, como isolamento, quotas ou inexistência de backend por app. O próprio relatório `mitra-sdk-evidence.md`, seções 6, 8 e 9, marcou essas partes como inferência e listou arquivos não lidos.

Também não se poderia concluir que Functions só existem como metadata sem source em Git apenas porque o SDK as chama por id. A contribuição útil da referência era a superfície de consumo, não uma prova de como copiar seu deployment ou armazenamento de código.

A revisão Claude/Astra fornecida pelo operador convergiu para frontend Vite estático, handlers fora do Hub, dados Postgres limitados, acesso de usuário de app, Connector estreito e publicação de bundle imutável. Ela preservou Git com código, migrations e manifesto para não fechar a evolução futura.

As divergências importantes foram mantidas:

| Tema | Alternativas discutidas | Convergência posterior |
| --- | --- | --- |
| Data | Data service tipado versus handler com SQL parametrizado | SQL/pg como baseline; alternativa exige dor observada |
| Runner | Processo compartilhado versus execução isolada por invocação | Fronteira precisa de prova; a implementação posterior é registrada em Q1 |
| Primeiro teste | SDK + Publish versus handler + dados na Preview | Risco de execução/dados primeiro; Publish depois |
| App de prova | Solicitação com alçada versus acompanhamento de compras | Caderno menor, ERP somente leitura, como proposta inicial |
| Identidade | AppUser separado versus `iam.account` sem Workspace | Reuso da identidade não pode conceder plano de controle por consequência |
| Versões | Artefato atual versus manifesto com handlers/API por build | Aba antiga não deve chamar silenciosamente handler incompatível |
| Operação mínima | Adiar observabilidade inteira versus logs/health/registro mínimo | Adiar plataforma genérica não elimina diagnóstico e registros necessários |

O modelo adotado para o primeiro perfil não exigia um backend permanente, imagem ou deployment de cloud por Project. Isso não eliminava isolamento da execução de handlers. Confundir essas duas coisas recriaria a falha que R12 identificou.

## Correcao posterior de topologia dos bancos

Após Q1 começar, o operador trouxe um risco mais concreto: SQL de apps poderia esgotar recursos do servidor PostgreSQL compartilhado com o Hub. A discussão mudou para dois clusters, controle e aplicações, com storage e memória delimitados; schemas por Project × ambiente continuariam dentro de aplicações.

Foram distinguidos privilégio de dados e isolamento de recursos, volume Docker e quota real, quota periódica e hard bound. O primeiro Publish deveria reexaminar Preview versus dados publicados. Isso é posterior a R01–R13 e não deve ser apagado por uma preferência antiga de database por Project.

A [referência atual](../../reference/stage2-managed-application-platform.md#database-topology) e a [evidência de Q1](../../evidence/stage2-q1/README.md#verdict) possuem a decisão e seus limites. Este arquivo não repete a configuração do host nem oferece garantia de imunidade a qualquer falha compartilhada.

## O que foi adiado sem perder a pesquisa

OCI por app, Cloud Run/Fly por Project, adapter universal de host, rollout sofisticado de observabilidade, audit engine genérico e deployment independente saíram do primeiro núcleo. Os candidatos continuam úteis caso um consumidor real os justifique.

O horizonte futuro preservado foi software factory mais geral, não outro modo a implementar imediatamente. A condição discutida era manter source normal, contratos explícitos e dados exportáveis. A sequência executável permanece no [roadmap](../../roadmap.md), não nesta retrospectiva.
