# Plan for a new app

Adapt the sections to the app; this shape is the default:

```markdown
# <Nome do app>

## Para a pessoa
- O que você vai ver na Prévia: 3 a 7 linhas curtas.
- O que você pediu: cada item com a origem, ou "não encontrado".
- O que eu supus: cada suposição, para confirmar.
- O que fica de fora nesta versão.

## Para construir
### O que a plataforma já dá
### Telas
### Dados das Conexões
### Tabelas do app
### Operações
### Regras e acesso
### Verificações
### Ordem
```

In "Para construir":
- O que a plataforma já dá: one line naming what you will not build or decide (sign-in, server, database, packages).
- Telas: each screen with its route, what it shows, where each value comes from, and its actions.
- Dados das Conexões: each read with its Conexão, fields, filters, pages and the counts from your sample; and how you will test the call: a read with a known result, a read that returns nothing, and a refused read.
- Tabelas do app: what people save, with fields, links between tables, and change history when it matters.
- Operações: each `conexus/` operation with its input, output, who may call it, and the source of each value it returns.
- Regras e acesso: each business rule and where it applies; who sees what.
- Verificações: for each thing the person asked, a check you can run that shows it works.
- Ordem: first one thin path end to end (one screen, one operation, one Conexão read, passing the check), then one slice at a time, each ending in a passing check.
