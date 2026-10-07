# Eval research B: tools, platforms and how app-building agent companies evaluate

Written 2026-09-29. Read only web research. Every quote below was returned by a page fetch or a search result in this session. Where a fetch was blocked or a page gave no detail, the text says so. Dates are the publication dates the pages showed; "date not shown" means the page did not show one.

## 1. Comparison table of platforms

| Platform | Data model | Parallel and sandbox | Online scoring on traces | Human review | Open source and self host |
|---|---|---|---|---|---|
| Mastra evals | Dataset (versioned) with items: input, groundTruth, expectedTrajectory, scorerIds. Experiment runs an agent, workflow or scorer over a dataset version. Item result has output, error, scores (scorerName, score, reason). | `maxConcurrency` default 5, `itemTimeout`, `maxRetries`. No sandbox of its own. | Yes. `sampling.rate` 0 to 1, decided by trace ID. Historical traces can be scored too. | Studio: score review, experiment compare side by side. No queue found in the pages read. | Core is Apache 2.0. Folders named `ee/` are under a separate enterprise license. Storage: LibSQL, Postgres, MySQL, MongoDB, Spanner. |
| Braintrust | Dataset, experiment ("immutable, comparable record of your eval runs"), scorer, classifier. | Not covered in the page read. | Yes: "evaluates production traces automatically as they're logged, running asynchronously". | Not covered in the pages read. | Autoevals scorer library is MIT. Platform: "Self-hosting is only available on the Enterprise plan". Docs do not say the platform is open source. |
| LangSmith | Dataset, evaluator, experiment. Datasets come from manual cases, production traces or synthetic data. | Not covered in the page read. | Yes, with "filters and sampling rates". | Annotation queues: single run or pairwise, rubrics, reviewer locks. | Self hosted is "an add-on to the Enterprise plan" with a license key. Not shown as open source. |
| Arize Phoenix | Versioned datasets, experiments, evals, annotations. | Not covered in the page read. | Traces plus LLM evals. Detail not read. | Annotations exist. Detail not read. | Source available, Elastic License 2.0, not OSI open source. Docker, Helm, cloud templates. |
| Langfuse | Dataset, dataset run, experiment, score. | Not covered in the page read. | Yes: LLM as judge that will "Automatically score live production traces". | Annotation queues with open ended notes. | MIT "except for the `ee` folders". Docker Compose, Helm, AWS, Azure, GCP templates. |
| promptfoo | Declarative config with tests and assertions. | Local CLI, cache, CI. | Not its focus. | Not covered. | MIT. "LLM evals run 100% locally". The README says it stays open source after the OpenAI acquisition. |
| DeepEval | `LLMTestCase` with input, actual_output, expected_output, retrieval_context. Metrics include agent ones: Task Completion, Tool Correctness, Goal Accuracy, Step Efficiency, Plan Adherence. | Not covered. | Cloud product (Confident AI) only. | Cloud product only. | Apache 2.0 library. The platform is separate and commercial. |
| Ragas | Samples plus metrics, synthetic test set generation. | Not covered. | Not covered. | Not covered. | Apache 2.0. The README lists agent evals as "Coming Soon". Mostly RAG. |
| OpenAI Evals | Registry of eval templates with samples in Git-LFS under `evals/registry/data`. Basic, model graded, and completion functions "for prompt chains or tool-using agents". | Local Python runner. | No. | No. | MIT. The README also points users to the OpenAI Dashboard for running evals. |
| UK AISI Inspect | Task = dataset + solver + scorer. Sample has input, target, sandbox, files, setup. Log `EvalLog` has status, eval, plan, results, stats, samples. | One sandbox per sample. Docker, Kubernetes, Modal, Proxmox, Vagrant. `max_sandboxes` defaults to twice the CPU count for Docker. | No. It is an offline runner with a log viewer. | Log viewer. Logs keep an edit history with provenance (`log_updates`). | MIT. Over 200 ready evals. Self hosted by design. |
| Harbor (Terminal-Bench team) | Task folder: `instruction.md`, `task.toml`, `environment/`, `solution/`, `tests/`. Verifier writes `/logs/verifier/reward.txt` or `reward.json`. | "thousands of environments in parallel" on Daytona, Modal, LangSmith, Blaxel, Novita, Tensorlake, Runta, or local Docker. | No. | No. | Apache 2.0. |

Notes on gaps. Braintrust and LangSmith pages did not cover parallelism in the parts fetched. The Arize docs page returned 403, so Phoenix facts come from its GitHub README. I did not read the Phoenix experiment docs.

Sources for the table are in section 5.

## 2. What app-building and coding agent companies do

Each item lists what they publish. Nothing here is from private knowledge.

**Replit Agent** (blog "Closing the loop: Evaluating and improving Replit Agent at scale", date not shown).
- Three layers: offline benchmark, online A/B tests, trace analysis. Quote: "benchmarks catch regressions before release, A/B tests show whether production behavior moved, trace clusters explain failures".
- Benchmark is ViBench. Tasks come from plain English product requirements documents derived from anonymized production traces. Each task pairs the document with "a set of natural-language test plans". A Playwright based evaluation agent explores the built app.
- Parallel runs: "snapshot" capabilities on the same sandbox infrastructure as production "run much of the evaluation in parallel, without risking cross-evaluation contamination".
- Trace analysis tool called Telescope clusters failures.
- Humans keep hypothesis choice, eval curation and launch approval.

**Cursor** (blog "How we compare model quality in Cursor", search result dated around March 2026).
- Hybrid online and offline. Offline is CursorBench, built from real sessions.
- Task source: "We source tasks for CursorBench using Cursor Blame, which traces committed code back to the agent request that produced it." Tasks refresh every few months.
- Measures "solution correctness, code quality, efficiency, and interaction behavior". Uses "agentic graders". Task text is short on purpose, unlike GitHub issues.
- Online evals catch cases where output "looks correct to a grader but feels worse to a developer".

**Lovable** (blog on GPT-5.5, 2026-04-24). Runs "every candidate model against Lovable's internal benchmark suite, which measures end-to-end app-building performance". Areas: production readiness (security, reliability, edge cases), agentic task completion, common build scenarios, unblocking hard tasks. A search result also says they track token efficiency and self verification, but I did not confirm that on the page. No task format or results schema is published.

**Vercel v0** (blog "Eval-driven development", 2024-10-17). Older but concrete. Mix of "fast, reliable code checks, end user and internal human feedback, and LLM-based grading". Quote: "An automated script runs the entire eval test suite and reports pass/fail rates, regressions, and improvements. Braintrust logs everything for manual review. Every GitHub pull request that impacts the output pipeline includes eval results." A search result says the main v0 metric is the rate of error-free generations, but I did not fetch that page.

**Bolt.new**: no first party eval writing found. Search returned only third party reviews. Treat as unknown.

**Cognition (Devin)**. SWE-bench technical report, 2024-03-15. Sandbox: "We only keep the base commit and its ancestors in the git history to prevent information leakage". Runtime capped at 45 minutes. Pass rule: tests pass after "we reset all of the test files to the original state, in case the agent modified the tests". Result 79 of 570 issues (13.86 percent), per the search summary. Repo `CognitionAI/devin-swebench-results` has `harness` and `output_diffs` folders. Old, but shows the anti-cheat steps.

**Factory.ai** (Terminal-Bench post, 2025-09-25). "For each model, we ran Terminal-Bench five times and submitted all runs." Droid scored 58.8 percent. Learning: "the right agent framework can lead to greater improvements than model selection" and "tool reliability emerged as the primary bottleneck". Also Agent Readiness (2026-01-20): LLM graded repo checks. Non determinism was reduced by grounding each run on the previous report (search result summary).

**Sourcegraph** (blog "How to evaluate Sourcegraph on your own codebase", date not shown). Best practical guide for a paired A/B on agents. Controls: mine real work from repo history, drop tasks that name the answer location, pin revisions for both arms, "at least three repeats per task", audit tool adoption. Start with 40 tasks, expand to 80 or more paired tasks. Finding: retrieval F1 rose from 0.091 to 0.240 while "aggregate task-completion reward was effectively unchanged". So measure retrieval, completion and cost separately. Amp itself: I found no Amp specific eval post.

**GitHub Copilot** (blog "Evaluating performance and efficiency of the GitHub Copilot agentic harness", date not shown; it names GPT-5.5 so it is 2026). Benchmarks: SWE-bench Verified, SWE-bench Pro, SkillsBench, TerminalBench, Win-Hill. "Two-hour limit per task", "Minimum five independent runs per model-agent pair", medium reasoning effort, normalized tools. "Infrastructure failures were re-run; model-generated errors retained." Measures token efficiency as well as completion. A search result names an internal benchmark, CheckpointBench, built from real Copilot sessions. I did not fetch that page.

**Anthropic** (Claude Code maker).
- "Demystifying evals for AI agents", 2026-01-09. Terms: task, trial, grader, transcript, outcome, harness, suite. Three grader kinds: code, model, human. Metrics pass@k and pass^k. Start with "20-50 simple tasks drawn from real failures". Quote: "You won't know if your graders are working well unless you read the transcripts and grades from many trials."
- "Quantifying infrastructure noise in agentic coding evals", 2026-02-05. Resource settings alone moved Terminal-Bench 2.0 by 6 points (p < 0.01). Infra error rate fell from 5.8 percent to 0.5 percent when uncapped. Advice: set a guaranteed allocation and a separate kill threshold, and treat gaps under 3 points with suspicion.
- Search result also lists "Harness design for long-running application development" (2026-03-24). Not fetched.

**OpenAI Codex**. The blog "Separating signal from noise in coding evaluations" (2026-07-08) came back through search only. The page itself returned 403. Search summary: an audit found about 30 percent of SWE-bench Pro public tasks "broken", and OpenAI retracted its recommendation of it. Lesson: audit your own tasks. I found no first party Codex eval harness doc.

**LangChain Deep Agents** (not an app builder, but a coding agent with a clear method). Per task metrics: correctness, step ratio, tool call ratio, solve rate. Evals are tagged by capability. pytest plus GitHub Actions. Quote: "Every error becomes an opportunity to write an eval". Date not shown.

## 3. The data model most of them share

Almost every source converges on the same seven objects.

1. **Task** (also case, sample, item). An input plus a way to judge success. Harbor: `instruction.md` plus `tests/`. Inspect: `Sample`. Mastra: dataset item with `input` and `groundTruth`. Anthropic: "a single test with defined inputs and success criteria".
2. **Environment**. What the agent runs in, fresh per trial. Harbor `environment/`, Inspect per sample sandbox, Replit snapshots. Anthropic: "Each trial should be isolated by starting from a clean environment."
3. **Dataset** (also suite, benchmark). A versioned set of tasks. Mastra keeps SCD-2 history so an experiment can pin a version.
4. **Trial** (also run). One attempt at one task. Several per task because outputs vary. Factory used 5, GitHub at least 5, Sourcegraph at least 3.
5. **Trace** (also transcript, trajectory). Full record: messages, tool calls, outputs, cost, time. Graders and humans read it.
6. **Grader** (also scorer, verifier, evaluator). Code, model, or human. Returns a score plus a reason. Mastra: `scorerName`, `score`, `reason`. Autoevals: `name`, `score` 0 to 1 or null, `metadata`. Harbor: `reward.txt` or `reward.json`. Replit and Cursor use agent graders that drive the built app.
7. **Experiment** (also dataset run, job). One configuration (model, prompt, harness version) run over one dataset version, with aggregate results, comparable side by side with another experiment.

Two extra habits show up repeatedly.
- Online scoring: the same graders run on a sampled share of production traces (Mastra, Braintrust, LangSmith, Langfuse, Cursor, Replit).
- Failures become tasks: production or dogfood failures are turned into new tasks (Anthropic, LangChain, Vercel, Replit).

What most of them measure: task success first, then cost or tokens, time, steps and tool calls, and a human or user signal from online tests. Build passing is a code grader inside success, not a separate score in any source I read.

## 4. What fits a self hosted Mastra Hub

These are proposals for the operator to accept or change. The evidence is above.

- **Use Mastra as the shell where it already matches.** Datasets with versioning, `startExperiment` with `maxConcurrency`, scorers, live sampling by trace ID, and Studio compare cover objects 3, 5 to 7 and online scoring. Storage is already Postgres capable. Apache 2.0 core, so self hosting is allowed. Avoid anything under `ee/`.
- **Build what Mastra pages did not show.** I found nothing about per task sandboxes, a per trial environment, or a human review queue in the Mastra pages read. Verify in `the inspected Mastra source tree` before building. The Conexus method needs these:
  1. A task folder in the Harbor shape: instruction, environment spec, tests, reference solution, and a reward file with several numbers (success, cost, time, steps). It works without any framework, per Harbor.
  2. A fresh sandbox per trial, with a guaranteed and a kill resource limit set apart (Anthropic).
  3. Repeats per task, and pass@k plus pass^k reporting.
  4. Reset test files and hide answer history (Cognition).
  5. Grader types in order of cost: code checks, then a browser driving agent for "does the app do what the person asked" (Replit, Cursor), then a human queue for a sample.
  6. A task audit step, since OpenAI found about 30 percent of one public set broken.
- **Two sources of tasks.** Real Builder sessions and failures (Cursor Blame style, Replit production PRDs), plus a small seed of 20 to 50 tasks first (Anthropic).
- **Do not adopt as the base.** Braintrust and LangSmith self hosting is Enterprise only. Phoenix is source available, not open source. Langfuse (MIT, self hostable) is the best external option if we want a trace UI and annotation queues later. Inspect and Harbor are good references for task and log shape, and Harbor could run our tasks directly if we keep the folder format.
- **Result schema to copy.** Inspect's `EvalLog` (status, eval spec, plan, results, stats, samples) plus Mastra's item result (itemId, output, error, scores with reason).

## 5. Reading list with URLs

Fetched and quoted from:
- Mastra evals overview: https://mastra.ai/docs/evals/overview
- Mastra datasets: https://mastra.ai/docs/evals/datasets/overview
- Mastra running experiments: https://mastra.ai/docs/evals/datasets/running-experiments
- Mastra repo (license): https://github.com/mastra-ai/mastra
- Inspect docs: https://inspect.aisi.org.uk/
- Inspect sandboxing: https://inspect.aisi.org.uk/sandboxing.html
- Inspect logs: https://inspect.aisi.org.uk/eval-logs.html
- Inspect repo: https://github.com/UKGovernmentBEIS/inspect_ai
- Harbor repo: https://github.com/laude-institute/harbor
- Harbor task format: https://docs.harborframework.com/core-concepts/tasks/overview
- Terminal-Bench repo: https://github.com/harbor-framework/terminal-bench
- Braintrust evaluate: https://www.braintrust.dev/docs/evaluate
- Braintrust self hosting: https://www.braintrust.dev/docs/guides/self-hosting
- Autoevals: https://github.com/braintrustdata/autoevals
- LangSmith evaluation: https://docs.langchain.com/langsmith/evaluation
- LangSmith annotation queues: https://docs.langchain.com/langsmith/annotation-queues
- LangSmith self hosted: https://docs.langchain.com/langsmith/self-hosted
- Phoenix repo: https://github.com/Arize-ai/phoenix
- Langfuse evaluation: https://langfuse.com/docs/evaluation/overview
- Langfuse repo: https://github.com/langfuse/langfuse
- promptfoo: https://github.com/promptfoo/promptfoo
- DeepEval: https://github.com/confident-ai/deepeval
- Ragas: https://github.com/explodinggradients/ragas
- OpenAI Evals: https://github.com/openai/evals
- Anthropic, Demystifying evals: https://anthropic.com/engineering/demystifying-evals-for-ai-agents
- Anthropic, infrastructure noise: https://www.anthropic.com/engineering/infrastructure-noise
- Cursor: https://cursor.com/blog/cursorbench
- Replit: https://replit.com/blog/evaluating-and-improving-agent-at-scale
- Vercel: https://vercel.com/blog/eval-driven-development-build-better-ai-faster
- LangChain Deep Agents evals: https://www.langchain.com/blog/how-we-build-evals-for-deep-agents
- Lovable GPT-5.5 post: https://lovable.dev/blog/gpt-5-5-now-in-lovable
- Cognition SWE-bench report: https://cognition.com/blog/swe-bench-technical-report
- Cognition results repo: https://github.com/CognitionAI/devin-swebench-results
- Factory Terminal-Bench: https://factory.com/news/terminal-bench
- Sourcegraph: https://sourcegraph.com/blog/how-to-evaluate-sourcegraph-on-your-own-codebase
- GitHub Copilot harness eval: https://github.blog/ai-and-ml/github-copilot/evaluating-performance-and-efficiency-of-the-github-copilot-agentic-harness-across-models-and-tasks/

Seen in search results only, not fetched (read before relying on them):
- OpenAI, Separating signal from noise (fetch returned 403): https://openai.com/index/separating-signal-from-noise-coding-evaluations/
- Vercel, how we made v0 an effective coding agent: https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent
- GitHub, how we evaluate models for Copilot: https://github.blog/ai-and-ml/generative-ai/how-we-evaluate-models-for-github-copilot/
- Anthropic, harness design for long running app development: listed in a search summary, no URL confirmed
- Curated list: https://github.com/benchflow-ai/awesome-evals

Could not fetch or not found: Arize Phoenix docs site (403), OpenAI blog page (403), any first party eval post from Bolt or Sourcegraph Amp, any Lovable task format, any OpenAI Codex harness doc.
