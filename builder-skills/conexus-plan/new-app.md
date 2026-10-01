# Plan for a new app

Adapt the sections to the app; this shape is the default:

```markdown
# <Nome do app>

## Para a pessoa
- Para que serve: quem usa, em que momento, e o que vê primeiro.
- O que você vai ver na Prévia: cada tela em uma ou duas linhas, começando pela primeira.
- O que você pediu: cada item com a origem, ou "não encontrado".
- Sugestões: o que um bom app deste tipo tem e você não pediu, cada uma com o porquê. Aprovar o plano inclui as sugestões; peça ajustes para tirar alguma.
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
- Telas: start with the screen the person opens first and what it answers. For each screen: its pattern from `conexus-app`, what it shows and where each value comes from, how the person finds their work (filters, counts, statuses), its actions, and what it says when empty or when a read fails.
- Dados das Conexões: each read with its Conexão, fields, filters, pages and the counts from your sample; and how you will test the call: a read with a known result, a read that returns nothing, and a refused read.
- Tabelas do app: what people save, with fields, links between tables, and change history when it matters.
- Operações: each `conexus/` operation with its input, output, who may call it, and the source of each value it returns.
- Regras e acesso: each business rule and where it applies; who sees what.
- Verificações: for each thing the person asked, a check you can run that shows it works.
- Ordem: first one thin path end to end (one screen, one operation, one Conexão read, passing the check), then one slice at a time, each ending in a passing check.
