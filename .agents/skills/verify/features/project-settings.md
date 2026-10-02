# Project settings and integrations

A Project's settings page, `Sobre o Projeto`, says where its code lives and lets the person delete the Project. Its `Integrações` page adds the Workspace's Sankhya connections and binds them to the Project under a Project-local name.

## Sub-features

- `project-about` shows `Sobre o Projeto` at `/projects/<id>/settings`, with `Nome`, `Código`, `Internet`, the link `Acesso ao aplicativo` and the region `Zona de risco`.
- `project-delete` deletes the Project after the person types its exact name. Not reachable under this harness.
- `integrations-add` adds a Sankhya connection to the Workspace at `/projects/<id>/integrations`.
- `integrations-test` tests a connection with `Testar`.
- `integrations-bind` binds a connection to the Project with `Nome no Projeto` and `Vincular`, and unbinds it with `Desvincular`.

## How to get to it (user POV)

- In a Project, the rail's `Configurações do projeto` and `Integrações`.
- Open `/projects/<id>/settings` or `/projects/<id>/integrations`.

## Driving it with control.mjs

Preconditions:

- Signed in, with a Project (see [projects](./projects.md)).

- **About.** Run `$C browser click --role link --name "Configurações do projeto"` and `$C browser snapshot project-settings`. The heading `Sobre o Projeto` shows, with `Código` reading `Guardado no próprio Conexus.` and the button `Excluir Projeto`.
- **Delete.** Choose `Excluir Projeto`. The dialog `Excluir <name>?` keeps `Excluir para sempre` disabled until `Nome do Projeto` holds the exact name. Under this harness, confirming shows the alert `A exclusão não terminou. O que já foi apagado não volta atrás; tente de novo para concluir.`, and `hub.log` logs `APPLICATION_RUNNER_NOT_CONFIGURED`. The card on the Workspace home then reads `Exclusão pendente`. Report `project-delete` as verified-unreachable, with the unmet precondition "no application runner".
- **Add a connection.** Run `$C browser click --role link --name "Integrações"`. Fill `Nome da conexão`, `Client id`, `Client secret` and `X-Token` with obviously fake values, such as `verify-fake-secret`, and choose `Adicionar conexão Sankhya`. The status reads `Conexão adicionada.`, and `Conexões do Workspace 1` lists the connection with `Testar` and `Desativar`.
- **Test.** Choose `Testar`. The status reads `O conector ainda não está configurado no servidor.`, because the run sets no Sankhya gateway, so nothing leaves the machine.
- **Bind.** Under `Disponíveis para vincular`, run `$C browser fill --label "Nome no Projeto" --value "erp"` and `$C browser click --role button --name "Vincular"`. `Vinculadas 1` lists the connection with `erp` and `Desvincular`.
- **Proof.** Run `$C db "select c.label, c.connector_id, c.disabled_at is null as active, b.name as project_name, b.environment, b.unbound_at is null as bound from connector.connection c left join connector.project_binding b using (connection_id)" --save integrations`. One row: `sankhya`, active, `erp`, `preview`, bound. Search `hub.log`, `browser.log` and `aria/` for the fake secret values: none of them may contain one.

## Gotchas

- Never type a real Sankhya credential here. The harness has no gateway, and a real credential would be sealed into a throwaway database for nothing.
- Delete a Project created with the form, not the one a recipe still needs. A failed deletion leaves the Project pending for good in this run.
