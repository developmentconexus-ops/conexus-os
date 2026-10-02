# Workspaces and Projects

A person creates a Workspace, starts Projects in it from the composer or a form, finds them on the Workspace home, and invites people to the Workspace.

## Sub-features

- `ws-create` creates a Workspace from `/workspaces/new`.
- `project-start` starts a Project from the Workspace home's composer, through the `Nome do Projeto` step, and sends the first message.
- `project-new-form` creates a Project from the `Novo Projeto` form. With no description it sends no message.
- `project-list` lists the Workspace's active Projects as cards with a thumbnail, a state chip and `Alterado …`. Archived Projects are left out. The chip reads `Construindo` while a run is queued or running, `Falhou: build do aplicativo` after a failed run, `Em uso` when a Preview exists, `Sem prévia ainda` otherwise, and `Exclusão pendente` for a Project whose deletion did not finish.
- `ws-people` lists the Workspace's members and invites someone by email and role, at `/workspaces/<id>/settings/people`.

## How to get to it (user POV)

- The first sign-in with no Workspace lands on `Novo Workspace`.
- The left rail's `Novo Workspace` and `Workspaces` links, and, inside a Workspace, `Projetos` and `Pessoas`.
- The Workspace home, `/workspaces/<id>/projects`: the composer `O que vamos construir?`. Once a Project exists, it also shows the section `Projetos` and the link `Novo projeto`.
- `/workspaces/<id>/projects/new` opens the form directly, which is the only way in while the Workspace has no Project.

## Driving it with control.mjs

Preconditions:

- Signed in (see [sign-in](./sign-in.md)).
- For `project-start`, a connected model account (see [model accounts](./settings-models.md)). Without one, the composer placeholder reads `Escolha um modelo para começar` and `Enviar` stays disabled.

- **Create a Workspace.** Run `$C browser fill --label "Nome do Workspace" --value "Verificação"` and `$C browser click --role button --name "Criar Workspace"`. Then `$C browser wait --role heading --name "O que vamos construir?"` prints `/workspaces/<id>/projects`, and the note above the heading reads `Workspace Verificação`.
- **Form.** Run `$C browser goto /workspaces/<id>/projects/new`, `$C browser fill --label "Nome do Projeto" --value "Contador"` and `$C browser click --role button --name "Criar Projeto"`. Construir opens on `/projects/<id>/c/<conversation id>` with `Conversa sem título` and no Builder run.
- **Start from the composer.** On the Workspace home, run `$C browser fill --label "Mensagem para o agente" --value "Crie um contador simples com um botão de somar"` and `$C browser click --role button --name "Enviar" --exact`. A `Nome do Projeto` textbox appears, prefilled from the message. Run `$C browser click --role button --name "Criar e começar"`. The app goes to `/projects/<id>`, which redirects to `/projects/<id>/c/<conversation id>` with the message as the first turn.
- **List.** Run `$C browser goto /workspaces/<id>/projects` and `$C browser snapshot project-list`. The heading reads `Projetos <n> em Verificação`, and each card is a link holding the Project name, its state chip and `Alterado …`. A new Project reads `Sem prévia ainda`, and one whose first turn failed reads `Falhou: build do aplicativo`.
- **People.** Choose `Pessoas` in the rail. The heading `Pessoas` shows `Membros 1` with `Verify Operator (você)` as `Owner`. Run `$C browser fill --label "Email" --value "colega@conexus.test"` and `$C browser click --role button --name "Convidar"`. The status reads `Convite criado para colega@conexus.test.`, and `Convites pendentes 1` lists it as `Membro`, `Pendente`.
- **Proof.** Run `$C db "select p.name, w.name as workspace, r.project_id is not null as has_repository from project.project p join workspace.workspace w using (workspace_id) left join builder.project_repository r using (project_id)" --save project`: one row per Project, each with `has_repository` true. Run `$C db "select i.email, i.role, w.name as workspace from iam.workspace_invitation i join workspace.workspace w using (workspace_id)" --save workspace-invitation`: one `member` row.

## Gotchas

- Under this harness only `Sem prévia ainda`, `Falhou: build do aplicativo` and `Exclusão pendente` show. `Construindo` (a run needs a sandbox), `Em uso` and the thumbnail image (`Prévia de <name>`; without a Preview the card shows only the Conexus mark) need a built app, and an archived Project (hidden from the list, `Arquivado` chip on its settings page) needs a screen that archives, which doesn't exist. These are source-only (`project-grid.tsx`, `workspace-projects.tsx`); report them as skipped with "no built app".
- The card for a Project named from the composer takes the message's first words as its name, such as `Crie um contador simples com um botão`.
- Starting a Project from the composer sends the first message, which starts a Builder turn. Under this harness that turn fails (see [Construir](./construir.md)). The Project and its repository still exist.
- The Workspace id is only in the URL. Read it from the URL that `wait` prints.
- `--name "Enviar"` without `--exact` also matches the form `Enviar pedido ao agente`.
- A suggestion button under the composer, such as `Controle de pedidos de férias`, fills the composer. It does not send.
- During the `Nome do Projeto` step, the ARIA snapshot shows the composer placeholder `O repositório está inacessível`. The draft text hides it on screen, so it is not a finding by itself.
- Nobody can accept a Workspace invitation in this run. Accepting needs a second Keycloak person with that email, and the run's realm has one person.
