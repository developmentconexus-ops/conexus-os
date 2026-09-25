# Backlog de funcionalidades a partir do Linear e do Mastra Factory

Levantamento de 2026-09-24. Fontes: 5 imagens do onboarding do Linear e 3 do Factory (guardadas pelo
operador fora do repositório), e o Mastra Factory 0.17 rodando em
`localhost:5873`, lido tela por tela sem mudar nada.

O foco é funcionalidade, não visual. Cada item traz o que vimos, o que o Conexus tem hoje, o veredito
e onde ele entra no roadmap ("Depois da Stage 2", passos 1 a 10). Os vereditos são críticos: copiar
não é o objetivo. O objetivo é o que serve a quem constrói e a quem usa os apps de uma empresa.

## 1. Modelos e raciocínio

| O que vimos | Conexus hoje | Veredito | Onde |
| --- | --- | --- | --- |
| **Modelo padrão da empresa**, separado do padrão pessoal. As execuções automáticas usam o da empresa e as conversas usam o seu | Temos o padrão da instalação e contas por pessoa | **Adaptar.** Separar em "padrão do Builder por Project ou Workspace" e "padrão pessoal nas conversas". Hoje o padrão de uma execução automática fica ambíguo | Passo 1 |
| **Raciocínio padrão por modo**: um nível base e níveis de Build, Plan e Fast, que seguem o base ou sobrescrevem | Só o seletor no composer (Baixo a Máximo), por conversa | **Adotar.** Padrão de raciocínio da instalação e do Project, com sobrescrita por conversa. Evita cada pessoa ter que lembrar de subir o nível | Passo 1 |
| **"Pacotes" de modelo por provedor**: um conjunto de modelos favoritos, com "definir padrão" | Não | **Não por enquanto.** Resolve um problema de quem usa muitos provedores. Nosso seletor com busca já basta | — |
| **Aviso de credencial pessoal**: "colegas sem credencial própria não rodam este modelo" | Temos contas por pessoa e compartilhadas, sem esse aviso no momento da escolha | **Adotar.** Mostrar, ao escolher o modelo, quem mais consegue rodar aquela escolha. Evita a execução automática que falha para outra pessoa | Passo 1 |
| **Login por assinatura com código colado** (Anthropic) e três botões de assinatura em destaque | Temos login por assinatura (dispositivo e código) e chave de API | **Já temos.** Conferir se o nosso fluxo do código colado está tão claro quanto o deles | — |
| **Provedores personalizados**: qualquer endpoint compatível com OpenAI, para a organização toda | Temos o Google AI Pro via proxy, montado por nós | **Adotar como tela.** Hoje isso exige linha de comando. Um admin deveria poder cadastrar um endpoint | Passo 1 |

## 2. Memória

| O que vimos | Conexus hoje | Veredito | Onde |
| --- | --- | --- | --- |
| **Memória observacional configurável**: modelo observador, modelo refletor, limites de tokens e "observar anexos" (automático, sim ou não) | Existe a tela de memória da instalação | **Conferir e completar.** Expor os limites e a regra dos anexos. Isso afeta o custo: a execução do Q3 gastou 2,6 milhões de tokens de entrada | Junto com tracing e evals |
| **Medidor de memória no composer** ("0/30k", quanto falta até a próxima observação) | Não | **Adotar.** A pessoa vê quanto contexto a conversa já carrega. Ajuda a explicar lentidão e custo | Passo 1 |

## 3. Permissões do agente e comportamento

| O que vimos | Conexus hoje | Veredito | Onde |
| --- | --- | --- | --- |
| **Permissões por categoria de ferramenta**: ler, editar, executar, MCP e outros, cada uma permitir, perguntar ou negar. Mais um "YOLO", que aprova tudo | O Builder roda sem perguntar, dentro do sandbox | **Adaptar com cuidado.** No Builder do Conexus, "perguntar" atrapalha quem não é técnico. A regra deve ser da plataforma e segura por padrão, com "perguntar" só para ações externas (Connectors e publicar). **Não** copiar o "YOLO" como opção de usuário | Passos 4 e 7 |
| **Edição inteligente** (edições pela estrutura do código, AST) | Não controlado | **Não expor.** É detalhe interno. Se valer, é ligado pela plataforma | — |
| **Aviso de conclusão** (som, sino, notificação do sistema) | Não | **Adotar o simples.** Aviso quando uma execução do Builder termina, porque elas levam minutos | Passo 1 |

## 4. Quadro de trabalho, supervisor e fluxo

| O que vimos | Conexus hoje | Veredito | Onde |
| --- | --- | --- | --- |
| **Quadro de trabalho**: entrada, triagem, planejamento, construção, revisão, pronto e cancelado. Com "iniciar execuções sozinho" e "aprovar planos sozinho" | Não. O Builder trabalha por conversa | **Adaptar para "pedidos de mudança" de um app.** Quando um funcionário reporta um problema ou pede algo num app publicado, isso vira cartão, com triagem e plano antes de mexer no código. É o passo 9 (reportar problema). Não trocar a conversa pelo quadro: a conversa continua sendo o jeito de construir | Passo 9 |
| **Ação sugerida no cartão** ("Investigar") | Não | **Adotar junto com o quadro.** | Passo 9 |
| **Supervisor**: um agente que olha o todo, com atalhos "O que precisa de mim?", "Explique o trabalho parado" e "Resumo da noite", mais uma lista de achados | Não | **Adotar depois.** Tem valor quando houver muitos apps e pedidos. O "resumo da noite" casa com o modo noturno | Passos 7 e 9 |
| **Visão geral**: fluxo dos últimos 30 dias, trabalho parado, o que está rodando, últimos commits, o que precisa de mim | A lista de Projects e o histórico por Project | **Adotar uma versão por Workspace**: o que está rodando, o que falhou, o que espera você. Hoje não existe um lugar que responda "o que precisa de mim?" | Passo 1 |
| **Atividade** ("tudo que a fábrica fez") e **auditoria** com filtros (itens, execuções, git, agente, entrada) | O histórico de execuções por Project. Auditoria não | **Adotar a auditoria.** Uma empresa precisa saber quem liberou o quê, quem publicou e quem revogou. O Q3 já grava liberações e revogações, falta mostrar | Passo 1 (harness: auditoria) |
| **Busca e navegação** (paleta de comandos) | Não | **Adotar.** Pular para um Project, uma conversa ou uma configuração | Passo 1 |

## 5. Repositórios, sandbox e entrada de trabalho

| O que vimos | Conexus hoje | Veredito | Onde |
| --- | --- | --- | --- |
| **Comandos de preparo e desmonte** do sandbox por repositório | O preparo é fixo, feito pela plataforma | **Não expor.** No Conexus quem define o ambiente é a plataforma, e é isso que torna os apps previsíveis | — |
| **Tokens do GitHub separados para quem faz e quem revisa**, para a revisão vir de outra conta | Não se aplica hoje | **Anotar para o passo 9.** Revisão por outra identidade é boa prática | Passo 9 |
| **Entrada de trabalho por várias fontes** (issues do GitHub, GitLab, Linear, Jira, incident.io) e **roteamento por etiqueta** para quadros diferentes | Não | **Só o necessário.** Primeiro, pedidos feitos dentro do próprio app ou do Conexus. Ferramentas externas só com cliente real | Passos 4 e 9 |
| **Vários "Factories"** (seletor) e **zona de perigo** (apagar) | Vários Workspaces e Projects. Apagar Project, não sei | **Conferir** se existe arquivar e apagar Project com confirmação forte | Passo 1 |

## 6. Pessoas e entrada (do Linear)

| O que vimos | Conexus hoje | Veredito | Onde |
| --- | --- | --- | --- |
| **Perfil com nome, foto e cargo** | Nome vindo do Keycloak | **Adotar o cargo (e a foto).** O cargo ajuda a saber quem aprova o quê, e aparece nas notas e nas liberações de app | Passo 1 |
| **Convidar por vários emails de uma vez** e **"copiar link de convite"** | Convite um por vez, com "copiar link de entrada" | **Adotar o convite em lote.** O link de convite aberto (qualquer um com o link entra) **não** para o Workspace. Para apps de parceiros, é o cadastro aberto do passo 10 | Passos 1 e 10 |
| **Integrar GitHub**: revisar e fazer merge de PR dentro do Linear, atualizar o status da tarefa pela atividade do PR, contexto do código para a IA | Não se aplica | **Anotar para o passo 9.** Útil quando pedidos de mudança virarem cartões | Passo 9 |
| **Integrar Slack**: criar tarefa a partir de uma mensagem, notificações por canal, notificações pessoais (atribuição, menção, comentário) | Não | **Adotar como "Notificações", passo 6.** Para a Metal Nobre, provavelmente WhatsApp ou email antes do Slack. Confirmar o canal que a empresa usa | Passo 6 |
| **Assinar novidades** (changelog, emails de ajuda) | Não | **Baixa prioridade.** Um "o que mudou" dentro do Conexus serve melhor que email | — |
| **Onboarding em passos** (perfil, convidar pessoas, conectar ferramentas, pular) | Existe o `/setup` | **Adotar para o primeiro uso de um Workspace**: perfil, convidar pessoas, conectar o primeiro sistema (Sankhya) e escolher o modelo. Cada passo pode ser pulado | Passo 1 |

## O que eu faria primeiro (passo 1, harness)

1. Padrão de modelo e de raciocínio por instalação e Project, com o aviso de quem mais consegue rodar.
2. "O que precisa de mim?": uma visão por Workspace do que está rodando, falhou ou espera você.
3. Auditoria visível: quem liberou, revogou, publicou ou mudou.
4. Aviso quando uma execução termina.
5. Paleta de busca e navegação.
6. Perfil com cargo, e convite em lote.
7. Medidor de contexto e custo no composer. Ele conversa com o alerta dos 2,6 milhões de tokens.

## O que eu não copiaria

- Aprovar ferramentas "YOLO" como opção de usuário.
- Comandos de preparo do sandbox editáveis pelo usuário.
- Pacotes de modelo.
- Link de convite aberto para Workspaces.
- Integrar Linear e Jira antes de haver cliente.

## Achados do próprio Factory

- O Google AI Pro ainda não aparece nos modelos. O agente está terminando o cadastro.
- A tela do Supervisor mostrou "Failed to load messages: Thread not found" ao abrir. Parece o mesmo
  tipo de problema de thread do issue que abrimos no Mastra (#24893).
- A lista de modelos da OpenAI mistura modelos de imagem, voz e embeddings com modelos de chat. No
  Conexus, filtrar para o que serve ao Builder.
