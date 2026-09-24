# Dados, runtime e autenticação

Memória de R02–R07. Os nomes de APIs abaixo são hipóteses históricas, não contratos atuais. As [fontes](sources-and-revalidation.md#s2-dados-e-migrations) são pistas para retomada; versões e garantias não foram requalificadas nesta recuperação.

## R02 Project Data e alternativas

O problema não era apenas escolher um ORM. O starter observado na conversa produzia um frontend React/Vite estático. Um app empresarial precisava persistir, relacionar, consultar e alterar dados sem obter o banco de IAM, Projects ou Factory.

A primeira distinção foi **dados da plataforma versus dados do aplicativo**. Depois surgiram duas escolhas diferentes: como o código consulta dados e onde esses dados ficam fisicamente. A discussão de schema por Project, database por Project e servidor por Project não deveria ser confundida com Prisma versus Drizzle.

Database por Project apareceu inicialmente à frente por limitar o espaço acessível por uma conexão. Schema por Project apareceu como opção operacionalmente menor, dependendo de grants e papéis corretos. Ambas deixavam perguntas de provisionamento, pooling, backup, restore e quantidade de Projects. A topologia evoluiu depois; nenhuma preferência de R02 substitui a [topologia registrada na referência atual](../../reference/stage2-managed-application-platform.md#database-topology).

Os candidatos foram discutidos assim:

| Candidato | O que a conversa procurava reaproveitar | Custo ou pergunta em aberto |
| --- | --- | --- |
| PostgreSQL + Drizzle | Schema TypeScript próximo de SQL, inferência de tipos, geração de migrations e representação de RLS | Segurança de migrations, escape hatches e maturidade da versão considerada |
| PostgreSQL + Prisma | Cliente gerado, relações e fluxo de schema/migration | Quantidade de modelo próprio, compatibilidade e claims de Prisma 8/Next não confirmados |
| Kysely | Query builder tipado mantendo SQL reconhecível | Mais escolhas de schema, relações e migrations ficam com quem desenvolve |
| Supabase | Pacote de banco, API, autenticação, storage e realtime | Duplicação de autoridade com Keycloak/Conexus e compatibilidade concreta de auth |
| Hasura | CRUD/query API gerada, permissões, ações e eventos | Nova plataforma de metadata/GraphQL para operar e ensinar ao Builder |
| Neon | Branching e ambientes de dados para testes/Preview | Dependência de fornecedor, custo e necessidade real de preservar ambientes |
| Atlas | Revisão e validação de mudanças de schema | Recursos por edição/licença e sobreposição com o gerador de migration |
| Convex | Alternativa de runtime/data model | Apenas citado para estudo posterior; a conversa não contém análise suficiente |

Não existiu benchmark equivalente entre essas opções nessa rodada. O entusiasmo por uma API pequena não foi uma escolha de stack.

## R03 Runtime e dados de Preview

Três formas foram comparadas: frontend chamando backend central Conexus; app full-stack com backend gerado por Project; e funções independentes. A conversa inicialmente favoreceu full-stack, receando que um backend central virasse uma linguagem low-code. Mais tarde essa conclusão foi reaberta. O primeiro perfil convergiu para frontend estático e handlers gerenciados fora do Hub.

A hipótese de artefato full-stack reunia client bundle, server bundle, contrato de dados, migrations, versão do runtime e health contract. Separar o sandbox de edição de um ambiente de execução verificado parecia proteger a identidade do que estava sendo testado. E2B foi considerado para um Preview limpo; isso não estabelecia E2B como hosting de produção.

Uma ideia de teste era instalar PostgreSQL descartável no ambiente de desenvolvimento, aplicar migrations, seed e executar o fluxo completo. PGlite entrou como candidato para testes rápidos, mas não como prova final de equivalência ao PostgreSQL usado no alvo. “Banco real da mesma versão” era a referência de comparação, não um comando de instalação aprovado.

O requisito de last-good Preview criou a hipótese de um banco por candidato: artefato A com banco A; candidato B com banco B; falha de B não destrói A. Neon branching pareceu útil principalmente por esse requisito. **O operador retirou a obrigação de manter last-good Preview.** Isso removeu a justificativa de tornar branching, rollback ou histórico de ambientes pré-requisitos. Preview poderia quebrar e ser reconstruída pelo Builder. A separação de dados de produção permaneceu.

Prisma Compute foi citado como referência de app e banco por ambiente. Datas de GA, status comercial e recursos desse produto ficaram sem comprovação preservada; estão em [pendências de verificação](sources-and-revalidation.md#afirmacoes-que-nao-podem-ser-promovidas-a-fatos).

## R04 Procedures e o primeiro SDK

A pergunta passou de “qual servidor?” para “qual unidade o agente deve programar?”. A hipótese foi uma procedure de negócio com entrada, saída, contexto e erro definidos. O Runtime cuidaria de transporte, bootstrap, autenticação, limites e observação.

```text
Exemplo conceitual, não API existente:
procedure approveRequest(input, context)
    valida a solicitação
    executa a regra de negócio
    devolve um resultado tipado
```

Hono foi estudado como shell HTTP baseado em Web APIs e RPC com tipos derivados. Fastify entrou como host já conhecido no Conexus, com plugins, encapsulação e validação. oRPC pareceu interessante por colocar procedure, contexto, erros e contrato antes de route/request/response. Contract-first e tipos derivados de implementação ficaram como alternativas, não duas fontes para manter manualmente. [Fontes HTTP/RPC](sources-and-revalidation.md#s3-runtime-auth-e-autorizacao).

O probe imaginado comparava o mesmo app de solicitações em Fastify, Hono e oRPC com shell fino. Mediria código gerado, decisões inventadas, erros, esforço de auth/audit, tipos e capacidade de contornar a política. Na convergência posterior, esse torneio deixou de ser obrigação: uma biblioteca já instalada seria baseline até surgir limitação concreta.

O `context` foi desenhado como possível ponto de acesso a usuário, dados, permissões, eventos, integrações e notificações. Isso não implicava um pacote separado para cada campo. O estudo deliberadamente recuou de dez SDKs para uma interface menor. Audit técnico e tracing poderiam ser automáticos; fatos de negócio ainda precisariam de significado explícito.

## R05 Cliente de dados sem ORM próprio

A hipótese de R05 era injetar um cliente tipado existente como `ctx.db`, sem inventar um “Conexus ORM”. Conexus cuidaria de provisionamento, conexão, papel, ambiente e autoridade de migration. O Project manteria schema, queries e lógica em Git.

Repository Pattern obrigatório foi rejeitado como hipótese inicial. A cadeia Procedure → Repository → Conexus Data → ORM duplicaria abstrações para CRUD. Um repository continuaria fazendo sentido quando representasse domínio real, como disponibilidade combinando ERP, reservas e pedidos, não apenas renomeando `findMany`.

**Prisma 8/Prisma Next apareceu com alegações muito específicas:** `contract.prisma`, `contract.json`, `contract.d.ts`, planejamento offline, `db.orm`, `db.sql`, `db.raw.sql`, lints e Skills oficiais. A conversa também o chamou de release candidate. Este arquivo conserva por que a ideia atraiu atenção, mas não confirma produto, assinatura, compatibilidade ou release status. Essas alegações não são base para copiar código.

Drizzle foi considerado próximo do SQL, com queries parametrizadas e um caminho raw. A conversa quis restringir SQL raw inseguro, mas os checks de import foram entendidos depois como prevenção de erro, não fronteira contra execução arbitrária. ZenStack apareceu por reunir schema, cliente e políticas de acesso; o risco discutido era adotar de uma vez uma autoridade grande para dados, authz e geração de API.

O experimento de Data imaginado usava Employee, Supplier, Request, RequestItem e Approval. Precisava de CRUD, relação, transação, agregação, join, índice e evolução do schema. Prisma, Drizzle e uma Data API genérica seriam comparados. A API genérica era um controle para medir o custo de uma camada própria, não uma implementação autorizada.

Depois da revisão managed-app, o fork mudou para **handlers com SQL parametrizado versus Data service tipado**. O baseline que avançou foi SQL/`pg`; Kysely ou Data API dependeriam de falha observada. Preservar as alternativas não obriga reabrir esse fork. A [fila atual](../../reference/stage2-managed-application-platform.md#7-technology-qualification-queue) define o que está diferido.

## R06 Migrations e ciclo de dados

A distinção central era entre gerar uma migration e ter autoridade para aplicá-la. O Builder produziria um candidato versionado; desenvolvimento aplicaria em espaço isolado; Publish aplicaria o material já verificado. A frase “Publish não planeja migration” tratava de impedir uma diferença silenciosa entre o que foi testado e o que chega ao dado real.

A conversa separou validade SQL, perda de dados, compatibilidade com código anterior, locks, duração e efeitos dependentes dos registros existentes. Testar em banco vazio não responderia tudo. Por isso o probe incluía schema anterior, seed significativo, migration e asserts sobre o resultado.

| Ferramenta | Valor pesquisado | Por que não foi escolhida |
| --- | --- | --- |
| Atlas | Analyzers, revisão, banco efêmero e testes de migration | Parte da oferta poderia depender de licença; integração e alcance dos checks por provar |
| Squawk | Lint de SQL específico de PostgreSQL, menor que uma plataforma completa | Lint aprovado não demonstra segurança sobre dados, concorrência ou duração |
| pgroll | Expand/contract, backfill e coexistência de representações de schema | `search_path`, integração com ORMs, versões e migrações simultâneas exigiam qualificação |
| Bytebase | Fluxo de revisão, aprovação, promoção e rastreio de mudanças | Produto operacional maior que a necessidade inicial |
| ORM nativo | Geração e aplicação aproveitando o schema já escolhido | Não deveria competir com um segundo dono de schema |

O seed era o estado mínimo determinístico que torna uma aplicação testável, não um backup de produção. Exemplo: um gerente, dois funcionários, fornecedores e solicitações. Dados sintéticos eram preferidos a copiar informações reais automaticamente.

A discussão chegou a bloquear mudanças destrutivas por padrão e a usar expand → migrate/backfill → contract. Depois do comentário sobre Preview, ficou explícito que um banco descartável pode ser recriado, enquanto produção exige uma avaliação diferente. Reverter código não desfaz dados, e-mail ou pedido enviado ao ERP. Nenhuma dessas heurísticas, sozinha, garante publicação segura.

## R07 Autenticacao e autorizacao

A conversa separou quatro perguntas: quem é a pessoa; pode entrar no app; o que pode fazer; quais registros pode acessar. Keycloak ficou como fonte de identidade, não dono de alçadas, regras comerciais ou acesso a cada registro.

A interface desejada para o app era uma identidade normalizada, sem implementar callbacks, JWKS, refresh ou OIDC a cada Project. Sessão server-side e cookie opaco foram comparados com token no browser. Client OIDC por aplicativo e sessão de Preview derivada do acesso Conexus eram hipóteses a testar, não uma topologia já escolhida.

A primeira proposta separava também os cadastros: Control Plane Account e AppUser em banco do Project. A revisão posterior preferiu reutilizar `iam.account`, com concessões de app independentes e elegibilidade explícita ao plano de controle. Ela encontrou o risco de uma conta só de app poder criar Workspace pela regra anterior. Não se deve restaurar a proposta de uma segunda tabela só porque aparece neste histórico.

A identificação por `(issuer, subject)` foi distinguida de e-mail. Pairwise subjects foram uma ressalva ao supor identidade global entre clients; um Directory unificado entre apps não era requisito do primeiro perfil.

| Candidato | Problema para o qual apareceu | Custo discutido |
| --- | --- | --- |
| Roles + permissions simples | Vocabulário de ações estável; papéis agrupam permissões | Regras por recurso podem exigir mais depois |
| CASL | Autorização em processo com condições e código TypeScript | Expressão de políticas, testes e aplicação em todos os caminhos |
| Cerbos | Principal/recurso/ação, RBAC/ABAC, políticas versionáveis e testáveis | Serviço/sidecar e outro ciclo operacional |
| OpenFGA | Sharing, hierarquias e autorização por relações | Complexidade sem necessidade para poucos papéis simples |
| PostgreSQL RLS | Restrições no banco mesmo quando uma query esquece filtro | Papel efetivo, pooling, contexto da sessão e duplicação de regras |

A hipótese `SET LOCAL`/`set_config` para levar identidade à sessão do banco foi apenas um mecanismo estudado. Não foi demonstrada como contexto impossível de falsificar por código gerado. Da mesma forma, policies no app e no banco precisariam de responsabilidades claras para não divergir.

Os testes sugeridos eram app-only user sem acesso ao Builder, revogação, tentativa de trocar identidade/Project e regras como “vendedor vê seus registros, gerente vê a equipe”. Papéis de banco separariam DML de migration; grants de app resolveriam autorização de produto. Essas duas proteções não substituem uma à outra.
