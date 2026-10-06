# Product contract

What Conexus is for, who it serves, and the promises it keeps. Each section gives a rule, why it
holds, and a right and a wrong example. [The roadmap](../roadmap.md) holds what is delivered,
[security](../reference/security-and-authority.md#2-who-may-act) who may do what,
[DESIGN.md](../../DESIGN.md) how screens look, [the wire contract](wire-contract.md) the routes, and
`apps/web/src/app/router.tsx` the exact list of screens. Exact values live in code, and this guide
points to them. A product rule changes only by an operator decision in
[the decisions register](../decisions/index.md).

## 1. Purpose and capabilities

Conexus exists so a company turns its own data and knowledge into results, selling more and
spending less, without depending on a technical team. A capability enters Conexus only when it
serves that result.

**Why.** Today that result takes an integrator to connect the company's systems, someone paid to
build each app, and no safe way to put AI agents to work. Conexus puts all of it in one platform.

**Right.** An app that crosses ERP sales with stock and shows what sits idle and where margin falls.

**Wrong.** An AI demo that touches no company data and moves no number.

1. **Integrations.** The company connects the systems it uses, such as its ERP, CRM or online
   store, once, and everything in Conexus uses that connection. Today: reads only.
2. **Company knowledge.** Rules, processes and what the company knows, kept in one governed place so
   the Builder and agents act correctly. Destination.
3. **Builder.** A person talks to it about the company, and it builds the app on whichever model the
   company chooses. Today.
4. **Apps on the data.** Apps work on the company's data to decide and operate better. Conexus hosts
   them and shares each with the people who need it. Today.
5. **Agents and workflows.** They automate processes, wake on events from the company's systems, and
   use the same data, apps and knowledge. Destination.
6. **Security.** Each person, app and agent sees and does only what it was given. A credential never
   shows, and company data never leaves. Today, in part.

## 2. People

Every screen and decision knows which of these five people it works for:

- **The creator**, a non-technical person in operations, sales or finance, talks to the Builder.
- **The company developer** builds too, using the Builder as a development harness, and reads the
  code and every change. The code screens are read-only today.
- **The Workspace owner** invites people and decides what each one receives.
- **The installation administrator** connects the company's systems and shared model accounts.
- **The app user**, inside or outside the company, uses what was built without seeing how.

**Why.** One Project serves the creator and the developer with equal weight. Built for one alone, it
loses the other.

**Right.** A build fails. The screen says in plain Portuguese what failed, and the developer opens
the exact error from there.

**Wrong.** The raw technical error is the only message, or the code is hidden from the developer.

An agent is not a person. A person creates it, and it acts on their behalf.

## 3. Scope and what Conexus is not

The scope is the six capabilities of section 1. Conexus is not:

- an ERP replacement. The official data stays in the company's systems.
- a drag-and-drop low-code tool. People create by conversation, and the result is real code.
- a chat that hides what it did. The code, the run and the app stay in view.
- a database console. Nobody edits company data directly.
- a service shared between companies. One installation serves one company.

**Why.** Each looks close to the product but pulls away from section 1 or puts company data at risk.

**Right.** Asked for "a place to edit the ERP tables", the Builder offers an app that reads the data
and writes through the system's authorized path.

**Wrong.** Conexus keeps its own customer register as the official copy, and it drifts from the ERP.

## 4. Concepts

Each concept has one name per language: Portuguese on screen, English in code and here. This section
gives the meaning, and code holds the exact values. A name is for people, never identity or
authority.

**Why.** Two names for one thing, or one name for two things, confuse the person, the developer and
the agent.

**Right.** "One run at a time per Project; its states are in
`contracts/technical/builder-run-vocabulary.json`."

**Wrong.** The guide copies "an invitation lasts 14 days", the code changes, and the guide lies.

- **Account** (Conta). One person. Email is not identity, and an Account is disabled, never deleted.
- **Workspace.** A team's people and Projects. Belonging to one grants nothing in another.
- **Invitation** (Convite). Calls an email into a Workspace with a role. It expires
  (`INVITATION_DAYS` in `apps/hub/src/platform/lifetimes.ts`), and nothing is emailed.
- **Project** (Projeto). One thing the company builds and puts live, with its code, conversations,
  data and integrations.
- **Conversation** (Conversa). Where a person asks the Builder, continuing where it stopped. Private
  to the person who started it is destination.
- **Run** (Execução). One attempt to answer one request, one at a time per Project. Stop cancels the
  real run.
- **Working source** (Fonte). The Project's current code. Every request starts from it, and a change
  built on an older revision never overwrites newer work.
- **Preview.** The app running for its builders after it passes its checks. A failed build may leave
  none.
- **App access** (Acesso ao app). Lets a person use the app without building it.
- **Integration** (Integração). A company system connected to Conexus. In code, a connector is the
  kind of system and a connection is one configured account of it.
- **Model account** (Conta de modelo). An AI account a person or the installation connects, never
  called a connection. The model is chosen per conversation, over an installation default and a
  personal one.
- **Publication** (Publicação). Only an explicit act publishes an app to its users. Destination.

## 5. Journeys

Every journey has a happy path and what the person sees when it goes wrong. Every failure says what
happened, how things were left, and what to do. The texts live in `contracts/technical/failures.json`.

**Why.** A non-technical person trusts Conexus only when a failure leaves no doubt about what was lost
and what comes next.

**Right.** "O código do Projeto mudou enquanto esta execução trabalhava, então o resultado não foi
aplicado e nada foi sobrescrito."

**Wrong.** "Erro 409", a spinner that never ends, or "Falhou" without saying whether anything changed.

1. **First access.** The installation administrator signs in and creates the first Workspace. Still
   being built.
2. **Invite.** An owner invites an email with a role, and the person joins by signing in with that
   address. An expired invitation says so.
3. **Connect.** The installation connects systems and model accounts, and an owner binds an
   integration to a Project. With no model account, nothing is sent, and the screen says where to
   connect one.
4. **Build.** A person asks, follows the real work, uses the Preview, and continues the same
   conversation. A failed build still advances the source and shows the error for the next request
   to repair. When the source moved during the run, nothing is applied. A stopped run is cancelled.
5. **Use an app.** An owner gives a person access, and they open the app's address and sign in. Once
   access is removed, their next request is refused.
6. **Empty first time.** A Workspace with no Project, a Project with no conversation, or an Account
   with no model account shows the next step and never looks broken.

## 6. What the product never does

Conexus never:

- **invents or simulates.** A value shown as coming from a system came from a real read. With no
  integration bound, the Builder says what to bind and builds nothing in its place. Fake replies,
  simulated runs and fake progress never ship.
- **mixes up states.** Loading, empty, failed and partial differ. Unknown is not zero. Waiting for
  you, blocked and done differ. A missing fact shows as unavailable.
- **lets the model say the work is done.** Conexus owns the run state, and narration is not progress.
- **shows the process instead of the result.** The creator gets the app, not branches or pipeline
  steps. The developer finds them when they want to.
- **overwrites someone else's work.** When someone changed the thing first, the screen says so and
  keeps both.
- **exposes what belongs to the company.** No credential shows, no internal id is put in front of a
  person to decide on, and company data does not leave.
- **publishes on its own.** Editing, a run finishing or an agent completing work never publishes.
  Destination.

**Why.** A person decides by what the screen says. One invented zero, and they stop trusting every
number.

**Right.** The ERP read fails, and the app says "Não foi possível ler os pedidos do ERP".

**Wrong.** The same app shows "Nenhum pedido", and the person concludes they sold nothing.

## 7. How we know it works

Conexus works when what a person created is in use by the people who received it and moved a number
the company follows, such as sales, cost or time. The first step is a conversation that ends with a
working app in the Preview, usable at once, with no technical help.

**Why.** A creation nobody uses is worth nothing. Counting what is easy to count pulls the product
away from the result.

**Right.** The purchasing team opens the stock app every week, and idle stock fell.

**Wrong.** Counting apps created, conversations opened or tokens spent.
