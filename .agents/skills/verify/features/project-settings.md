# Project settings and integrations

A Project's settings page, `Sobre o Projeto`, says where its code lives and lets the person delete the Project. Its `Integrações` page adds the Workspace's Sankhya connections and binds them to the Project under a Project-local name.

## Sub-features

- `project-about` shows `Sobre o Projeto` at `/projects/<id>/settings`, with `Nome`, `Código`, `Internet`, the link `Acesso ao aplicativo` and the region `Zona de risco`.
- `project-delete` deletes the Project after the person types its exact name. The name check is reachable. The deletion itself isn't under this harness.
- `project-delete-recovery` shows `Exclusão de <name> não terminou` with `Terminar exclusão` for a Project whose deletion stopped.
- `integrations-permissions` gates the page: connections are for installation administrators, bindings for the Workspace Owner. Not reachable under this harness.
- `integrations-add` adds a Sankhya connection to the Workspace at `/projects/<id>/integrations`.
- `integrations-test` tests a connection with `Testar`.
- `integrations-bind` binds a connection to the Project with `Nome no Projeto` and `Vincular`, and unbinds it with `Desvincular`.

## How to get to it (user POV)

- In a Project, the rail's `Sobre`, `Integrações` and `Configurações do projeto`. `Dados` and `Capacidades` under `Em breve` are not links yet.
- Open `/projects/<id>/settings` or `/projects/<id>/integrations`.

## Driving it with control.mjs

Preconditions:

- Signed in, with a Project (see [projects](./projects.md)).

- **About.** Run `$C browser click --role link --name "Configurações do projeto"` and `$C browser snapshot project-settings`. The heading `Sobre o Projeto` shows, with `Código` reading `Guardado no próprio Conexus.` and the button `Excluir Projeto`.
- **Delete, name check.** Choose `Excluir Projeto`. The dialog `Excluir <name>?` keeps `Excluir para sempre` disabled while `Nome do Projeto` holds `<name>x` or the name in another case, and enables it on the exact name (`$C browser attr --role button --name "Excluir para sempre" --attr disabled` reads an empty string when disabled and `null` when enabled). `Cancelar` closes the dialog and the Project stays in `project.project`.
- **Delete, confirm.** On a spare Project, type its exact name and choose `Excluir para sempre`. Under this harness the alert reads `A exclusão não terminou. O que já foi apagado não volta atrás; tente de novo para concluir.`, and `hub.log` logs `APPLICATION_RUNNER_NOT_CONFIGURED`. Reopening `/projects/<id>/settings` shows the recovery screen: the alert `Exclusão de <name> não terminou` and `Terminar exclusão`, which fails the same way. The card on the Workspace home reads `Exclusão pendente`. Report the deletion as verified-unreachable, with the unmet precondition "no application runner".
- **Add a connection.** Run `$C browser click --role link --name "Integrações"`. Fill `Nome da conexão`, `Client id`, `Client secret` and `X-Token` with obviously fake values, such as `verify-fake-secret`, and choose `Adicionar conexão Sankhya`. The status reads `Conexão adicionada.`, and `Conexões do Workspace 1` lists the connection with its id and `Testar` and `Desativar`. `Desativar` opens the dialog `Desativar <name>?` with `Voltar` and `Desativar`; choose `Voltar` unless the recipe is done with the connection.
- **Test.** Choose `Testar`. The status reads `O conector ainda não está configurado no servidor.`, because the run sets no Sankhya gateway, so nothing leaves the machine.
- **Bind.** Under `Disponíveis para vincular`, run `$C browser fill --label "Nome no Projeto" --value "erp"` and `$C browser click --role button --name "Vincular"`. `Vinculadas 1` lists the connection with `erp` and `Desvincular`. `Desvincular` opens `Desvincular <name>?` with `Voltar` and `Desvincular`. Confirming returns the row to `Disponíveis para vincular`, and the DB row stays with `bound` false.
- **Proof.** Run `$C db "select c.label, c.connector_id, c.disabled_at is null as active, b.name as project_name, b.environment, b.unbound_at is null as bound from connector.connection c left join connector.project_binding b using (connection_id)" --save integrations`. One row: `sankhya`, active, `erp`, `preview`, bound. Search `hub.log`, `browser.log` and `aria/` for the fake secret values: none of them may contain one. `actions.log` does hold them, because it records the typed `fill` values.

## Gotchas

- The permission gates are source-only: a person who isn't an installation administrator sees `Só um administrador da instalação vê e administra as conexões do Workspace.`, and one who isn't the Workspace Owner sees `Só o Owner do Workspace vincula e desvincula conexões deste Projeto.` (`integrations-screen.tsx`). The run's only person is both. Skip with "needs a second signed-in person".
- Never type a real Sankhya credential here. The harness has no gateway, and a real credential would be sealed into a throwaway database for nothing.
- Delete a Project created with the form, not the one a recipe still needs. A failed deletion leaves the Project pending for good in this run.
