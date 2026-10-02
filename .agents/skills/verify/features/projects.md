# Workspaces and Projects

A person creates a Workspace, describes an app in the Workspace's composer to start a Project, and finds their Projects listed on the Workspace home.

## Sub-features

- `ws-create` creates a Workspace from `/workspaces/new`.
- `project-start` starts a Project from the Workspace home's composer, through the `Nome do Projeto` step.
- `project-new-form` creates a Project from `Novo projeto` without a first message.
- `project-list` lists the Workspace's Projects as cards that open the Project.

## How to get to it (user POV)

- The first sign-in with no Workspace lands on `Novo Workspace`.
- The left rail's `Novo Workspace` and `Workspaces` links.
- The Workspace home, `/workspaces/<id>/projects`: the composer `O que vamos construir?`, the section `Projetos`, and the link `Novo projeto`.

## Driving it with control.mjs

Preconditions:

- Signed in (see [sign-in](./sign-in.md)).
- For `project-start`, a connected model account (see [model accounts](./settings-models.md)). Without one, the composer placeholder reads `Escolha um modelo para começar` and `Enviar` stays disabled.

- **Create a Workspace.** Run `$C browser fill --label "Nome do Workspace" --value "Verificação"` and `$C browser click --role button --name "Criar Workspace"`. The URL becomes `/workspaces/<id>/projects` and the heading `O que vamos construir?` shows `Workspace Verificação`.
- **Start a Project.** Run `$C browser fill --label "Mensagem para o agente" --value "Crie um contador simples com um botão de somar"` and `$C browser click --role button --name "Enviar"`. A `Nome do Projeto` textbox appears, prefilled from the message. Run `$C browser click --role button --name "Criar e começar"`. The URL becomes `/projects/<id>/c/<conversation id>` and Construir opens with the message as the first turn.
- **List.** Run `$C browser goto /workspaces/<id>/projects` and `$C browser snapshot project-list`. The section `Projetos` counts the Project and shows its card.
- **Proof.** Run `$C db "select p.name, w.name as workspace, r.project_id is not null as has_repository from project.project p join workspace.workspace w using (workspace_id) left join builder.project_repository r using (project_id)" --save project`. One row, with `has_repository` true: the Project got its Conexus Git repository.

## Gotchas

- Starting a Project also sends the first message, which starts a Builder turn. Under this harness that turn fails (see [Construir](./construir.md)). The Project and its repository still exist.
- The Workspace id is only in the URL. Read it from the URL each command prints.
- A suggestion button under the composer, such as `Controle de pedidos de férias`, fills the composer. It does not send.
- During the `Nome do Projeto` step the ARIA snapshot shows the composer placeholder `O repositório está inacessível`. The draft text hides it on screen, so it is not a finding by itself.
