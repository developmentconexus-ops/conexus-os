# Plan for a change

Size the plan to the change. Default shape:

```markdown
# <O que muda>

## Para a pessoa
- O que muda na tela.
- O que continua igual.
- Dados salvos: o que muda ou pode se perder, ou "nenhum".
- O que eu supus, e o que fica de fora.

## Para construir
### Como está hoje
### O que depende disso
### Caminho
### Desenho
### Dados salvos
### Verificações
### Ordem
```

In "Para construir":
- Como está hoje: how it works as you read it, not as it was meant to.
- O que depende disso: every screen, operation, table and saved data that uses what changes.
- Caminho: fix in place, redesign or replace, with your recommendation and why. Fixing in place is often right. Redesign when the request would otherwise need a patch: an extra branch, a second flag kept in step with the first, a second way of doing one thing.
- Desenho: what the code would be if this request had existed from the start, and what that deletes. Settle the data shape before the logic.
- Dados salvos: when a table with saved data changes, migrate in safe steps: add the new fields as optional, copy the data, check it, and only then remove the old fields.
- Verificações: checks that the new behavior works, and that what should stay the same still does; write these before you change the structure.
- Ordem: remove and simplify first, then add, one step at a time, each ending in a passing check. Move every use of the old way to the new one and delete the old way in the same change; never leave both.
