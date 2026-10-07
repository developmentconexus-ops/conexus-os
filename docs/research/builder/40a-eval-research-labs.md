# Eval research: what the labs and research groups say

Written 2026-09-29. Read only web research for the Conexus eval platform.

How to trust this file. Quotes marked "fetched" came back from WebFetch on the page itself. The fetch tool summarizes with a small model, so a quote can differ slightly from the page. Check any quote before you put it in a public doc. Numbers marked "search only" came from a search result summary, not from the page. Pages that failed to load are listed at the end.

## 1. Principles most sources agree on

### 1.1 Grade the outcome in the environment, not only the final message

- Anthropic says to prefer state checks. Coding agents: tests pass, files change. Source: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents (2026-01-09). The post separates the transcript (the full trace) from the outcome (the end state). Search summary only for that split. Fetched quote on graders: code graders are "Fast • Cheap • Objective • Reproducible • Easy to debug".
- Microsoft splits "System evaluation" (end result) from "Process evaluation" (each step). Source: https://learn.microsoft.com/en-us/azure/foundry/concepts/evaluation-evaluators/agent-evaluators (page dated 2026-09-25). Fetched quote: "you need to evaluate not just the final output, but also the quality and efficiency of each step in the workflow."
- Google Cloud says the same about trajectories. Source: https://cloud.google.com/blog/topics/developers-practitioners/from-vibe-checks-to-continuous-evaluation-engineering-reliable-ai-agents (2026-02-27). Fetched quote: an agent that calls `get_weather("Tokyo")` for a population question "has failed fundamentally, even if it hallucinates the correct population number."
- GAIA grades the answer and also looks at the method (search summary only). Source: https://arxiv.org/abs/2311.12983 (2023).

### 1.2 Run each task many times and report reliability, not one lucky pass

- Anthropic defines both metrics. Fetched: "pass@k measures the likelihood that an agent gets at least one correct solution in k attempts." and "pass^k measures the probability that all k trials succeed." Also: "Each task has its own success rate—maybe 90% on one task, 50% on another." Source: same Anthropic post, 2026-01-09.
- tau-bench introduced pass^k. Fetched abstract: agents "succeed on <50% of the tasks, and are quite inconsistent (pass^8 <25% in retail)." Source: https://arxiv.org/abs/2406.12045 (2024-06-17).
- The Holistic Agent Leaderboard ran "21,730 agent rollouts across 9 models and 9 benchmarks" for about $40,000. Source: https://arxiv.org/abs/2510.11977 (2025-10-13). Fetched. Cost of repeated runs is real and must be budgeted.
- Infrastructure adds its own noise. Anthropic reran Terminal-Bench 2.0 under six resource settings. Fetched: "the gap between the most- and least-resourced setups on Terminal-Bench 2.0 was 6 percentage points (p < 0.01)". Infra error rate fell "from 5.8% at strict enforcement to 0.5% when uncapped". Source: https://www.anthropic.com/engineering/infrastructure-noise (2026-02-05).

### 1.3 Read the transcripts. Graders lie.

- Anthropic, fetched: "You won't know if your graders are working well unless you read the transcripts and grades from many trials." Source: demystifying-evals post above.
- Anthropic on tools, fetched: "Review the raw transcripts (including tool calls and tool responses) to catch any behavior not explicitly described in the agent's CoT." Source: https://www.anthropic.com/engineering/writing-tools-for-agents (2025-09-11).
- Hamel Husain, fetched: "Error analysis is the most important activity in evals. Error analysis helps you decide what evals to write in the first place." Source: https://hamel.dev/blog/posts/evals-faq/ (published 2026-09-18 per the page).
- Agents cheat when the grader lets them. The Holistic Agent Leaderboard found agents "searching for the benchmark on HuggingFace instead of solving a task, or misusing credit cards in flight booking tasks" (fetched, arXiv 2510.11977).

### 1.4 Start small, from real failures, then grow

- Anthropic, fetched: "20-50 simple tasks drawn from real failures is a great start."
- Google, fetched: two modes. Discovery mode is 1 to 10 inputs with vibe checks. Defense mode is 50 to 10,000 inputs with strict gating. Fetched quote on vibe checks: "subjective, unscalable, and susceptible to confirmation bias."
- Anthropic docs say "Prioritize volume over quality" for automated grading (fetched, https://platform.claude.com/docs/en/docs/test-and-evaluate/develop-tests, undated page). Note that this older docs page pushes volume, while the 2026 agent post pushes reading transcripts. Use both: many cheap checks plus a small set read by a human.

### 1.5 Two kinds of suite: capability and regression

- Anthropic, fetched: "Capability or 'quality' evals ask, 'What can this agent do well?'" and "Regression evals ask, 'Does the agent still handle all the tasks it used to?'"
- Google frames the same as a "quality firewall" in CI (fetched): "bad code can't physically reach production users."
- OpenAI agent evals guide moves from traces to datasets (fetched, https://developers.openai.com/api/docs/guides/agent-evals, undated): "Once you know what 'good' looks like, move from individual traces to repeatable datasets and eval runs."

### 1.6 Test both sides and isolate each trial

- Anthropic, fetched: "Test both the cases where a behavior should occur and where it shouldn't." and "Each trial should be 'isolated' by starting from a clean environment."

### 1.7 Benchmarks rot: contamination and broken tests

- OpenAI stopped reporting SWE-bench Verified in early 2026. Search only (the page returned HTTP 403): an audit of 138 problems that o3 failed found 59.4% had flawed tests, and tested frontier models could reproduce gold patches. Source: https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/. Do not quote it before you read it yourself.
- SWE-Bench Pro (Scale, 2025-09-21, revised 2025-11-14) uses "41 actively maintained repositories" and a "contamination-resistant testbed" (fetched, https://arxiv.org/abs/2509.16941). Search only: best models under 45% on the public set and under 20% on the commercial private set, against over 70% on Verified. A private set is the strongest defense.
- Terminal-Bench 2.0 (2026-01-17): "89 tasks", each with "a unique environment, human-written solution, and comprehensive tests for verification". Frontier agents "score less than 65%". Fetched, https://arxiv.org/abs/2601.11868. Every task ships a solution that proves the task is solvable.
- Anthropic tools post, fetched: "Avoid overly strict verifiers that reject correct responses due to spurious differences like formatting, punctuation, or valid alternative phrasings."

### 1.8 Judges need calibration against humans

- MT-Bench paper, fetched: strong judges "achieving over 80% agreement" with human preferences, but with "position, verbosity, and self-enhancement biases, as well as limited reasoning ability." Source: https://arxiv.org/abs/2306.05685 (2023-06, final 2023-12).
- Anthropic, fetched: human graders are the "Gold standard quality" and are "Used to calibrate model-based graders". Model graders are "Flexible • Scalable • Captures nuance • Handles open-ended tasks".
- Anthropic docs, fetched: "Use a different model for evaluation than the model being evaluated to avoid bias."
- Shankar et al., "Who Validates the Validators?" (2024-04-18), fetched: "users need criteria to grade outputs, but grading outputs helps users define criteria." Lesson: your rubric will change once you read outputs. Plan for it. Source: https://arxiv.org/abs/2404.12272.
- Hamel Husain on judges, fetched from https://hamel.dev/blog/posts/llm-judge/ (2024-10-29, modified 2026-09-01): "A binary decision forces everyone to consider what truly matters." Use a domain expert and a written critique with each verdict.
- Hamel FAQ, fetched: "Use a code-based eval when a deterministic rule can identify the failure." and "Track both rates as you make changes. Catching more failures can come at the cost of more false alarms." (true positive rate and true negative rate of the judge.)
- Microsoft's agent judges output binary Pass/Fail or a 1 to 5 score turned into pass or fail by a threshold (fetched). Its composite judges pass "only when every applicable component passes".

### 1.9 Measure cost and time next to accuracy

- Anthropic tools post, fetched: collect "the total runtime of individual tool calls and tasks, the total number of tool calls, the total token consumption, and tool errors."
- HELM measures "7 metrics (accuracy, calibration, robustness, fairness, bias, toxicity, and efficiency)" (fetched, https://arxiv.org/abs/2211.09110, 2022). Accuracy alone hides tradeoffs.
- Holistic Agent Leaderboard, fetched: "higher reasoning effort reducing accuracy in the majority of runs". More spend does not always mean a better result.

### 1.10 Tooling shape

- UK AISI Inspect, fetched from https://inspect.aisi.org.uk/: "An Inspect evaluation is a Task that brings together three things: Dataset that provides labelled samples, Solver that produces an answer for each sample, and Scorer that evaluates the output." It has sandboxing in "Docker, Kubernetes, Modal, Proxmox, Vagrant" and it can run "external agents like Claude Code, Codex CLI, and Gemini CLI". Mastra's dataset, experiment and scorer parts map onto this shape.
- OpenAI trace grading, fetched: "A trace captures the end-to-end record of model calls, tool calls, guardrails, and handoffs for one run." Graders score traces "so you can find regressions and failure modes at scale."

### 1.11 What each benchmark teaches

| Benchmark | Lesson for us | Source and date |
|---|---|---|
| SWE-bench Verified and Pro | Hidden tests can be wrong. Public tasks leak into training. Keep a private set. | see 1.7 |
| Terminal-Bench 2.0 | Every task needs an environment, a human solution and tests. Simple scaffold (Terminus 2) to reduce scaffold bias (search only). | arXiv 2601.11868, 2026-01 |
| METR time horizon | Report task length in human time at a chosen success rate. Human baselines predict model success. Authors flag "external validity concerns, which are responsible for the majority of our uncertainty" (fetched). | https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/ , 2025-03-19 |
| tau-bench | Simulated user plus policy plus tool API. Use pass^k for reliability. | arXiv 2406.12045, 2024-06 |
| WebArena | Real, self-hosted apps and functional checks. Best GPT-4 agent 14.41% vs human 78.24% (search only). | https://arxiv.org/abs/2307.13854 , 2023-07 |
| GAIA | Vague-looking questions with one checkable answer. Humans 92%, GPT-4 with plugins 15% at release (search only). | arXiv 2311.12983, 2023-11 |
| AgentBench | Failure causes were long-term reasoning, decision making and instruction following (fetched). | https://arxiv.org/abs/2308.03688 , 2023-08 |
| HELM | Many metrics, one shared setup, raw prompts and outputs released. | arXiv 2211.09110 |
| Inspect | Task, solver, scorer, sandbox, log viewer. | inspect.aisi.org.uk |

Note on dates. Several of these are 2023 or 2024. They are older, but they define the vocabulary (pass^k, functional checks, holistic metrics).

## 2. What matters most for Conexus's Builder

The Builder takes a vague Portuguese request and produces a running app on real company data. The sources above were mostly written for other agent types. These are my inferences, marked as such, from the evidence.

1. **Grade the running app, not the code or the chat.** Follows from 1.1. Build the app in a clean sandbox, start it, and check the outcome with code: does it start, does it show the right rows from a seeded database, does a write persist. This is a state check, the type Anthropic prefers. Drive it with a browser script for user-visible checks.
2. **Seed known data and check exact values.** Follows from 1.1 and 1.7. Use a fixture database with known rows, so a code check can assert literal numbers. This avoids a judge for the most important question (is the data right).
3. **Reserve the LLM judge for what code cannot see.** Follows from 1.8. Examples: did the Builder ask a good clarifying question, does the screen match the intent in the request. Make each judge binary, one criterion, with a written reason. Calibrate against a human labeled set and track true positive and true negative rates (Hamel). Use a different model family or model from the Builder as judge (Anthropic docs).
4. **Model the vague request.** Follows from tau-bench and GAIA. A vague request needs a simulated user who answers questions from a hidden spec. tau-bench uses a simulated user for this reason. Decide early whether the Builder may ask questions and score that separately.
5. **Repeat trials and report pass^k next to pass@k.** Follows from 1.2. A company user needs the app to work every time, so pass^k matters more than pass@k. Start with k of 3 to 5 for the core tasks and budget the cost (HAL spent about $40,000 on 21,730 rollouts).
6. **Start with 20 to 50 tasks from real failures.** Follows from 1.4. Take them from pilot traces and Factory issues. Do error analysis first: read traces, name the failure types, then write one check per type.
7. **Keep two suites.** Follows from 1.5. A regression suite that must stay green in CI (cheap, deterministic, code checks) and a capability suite that is hard and tracked over time. Retire tasks when they saturate (Anthropic covers saturation, not fetched in detail).
8. **Isolate and pin the environment.** Follows from 1.6 and 1.2. Clean sandbox per trial, fixed resource limits, recorded versions. Anthropic measured a 6 point swing from resources alone, so log CPU, memory and timeouts with each run.
9. **Hold out a private set.** Follows from 1.7. Once tasks come from public repos or from our own prompts, the Builder's prompts and skills can overfit them. Keep tasks the Builder team never sees while tuning.
10. **Grade the process on guardrails.** Follows from Microsoft's process evaluators and the HAL credit card finding. Check with code that the Builder used only allowed tools, did not read data it should not read, and did not touch other tenants. Company data raises the cost of a silent bad action.
11. **Record cost and time per run.** Follows from 1.9. Tokens, tool calls, wall time and tool errors per task, kept in the trace.
12. **Use traces as the source of truth.** Follows from OpenAI trace grading and 1.3. Every score links to a trace a human can open. Mastra traces and scorers fit here. The method (what to check, what pass means) must still be ours.
13. **Online checks later.** Google mentions shadow deployments and tracing for production (search summary). After the pilot, score sampled real sessions with the same graders that passed offline calibration. I found no primary source with measured results on online versus offline agreement, so treat this as unproven.

## 3. Pitfalls

- **Trusting a benchmark score.** Contamination and broken hidden tests (OpenAI, search only) mean a public leaderboard number may not describe your case.
- **Grader too strict.** Correct apps fail on formatting or on a different valid layout (Anthropic tools post). Check outcomes, not exact strings or exact pixels.
- **Grader too loose.** A judge that passes anything that looks plausible. Calibrate with human labels (1.8).
- **One trial per task.** Hides the 90% versus 50% spread per task (Anthropic).
- **Likert scores from a judge.** Hamel argues for binary. Microsoft still uses 1 to 5 but thresholds to pass or fail.
- **Generic metrics.** Hamel, fetched: "These metrics measure abstract qualities that may not matter for your use case."
- **Fixed criteria written before you read outputs.** Criteria drift (Shankar). Read first, then write the rubric, then revise.
- **Noisy infrastructure counted as model quality.** Anthropic infra post. Fix resources or report them.
- **Agents finding shortcuts.** Search for the answer key, misuse tools (HAL). Sandbox the network and hide the hidden checks from the agent.
- **Only end-to-end scores.** Say nothing about where it broke. Keep step level checks (Microsoft process evaluation, Google trajectory).
- **Vibe checks as the only method.** Fine for discovery, not for gating (Google).
- **Judge and Builder on the same model.** Self enhancement bias (MT-Bench).
- **Overlong or cost blind suites.** More reasoning effort can lower accuracy and raise cost (HAL). Track cost per pass.
- **Extrapolating a benchmark to real work.** METR itself says external validity is the main uncertainty.

## 4. Reading list

Anthropic
- Demystifying evals for AI agents, 2026-01-09: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents (fetched)
- Quantifying infrastructure noise in agentic coding evals, 2026-02-05: https://www.anthropic.com/engineering/infrastructure-noise (fetched)
- Writing effective tools for AI agents, 2025-09-11: https://www.anthropic.com/engineering/writing-tools-for-agents (fetched)
- Develop test cases (docs, undated): https://platform.claude.com/docs/en/docs/test-and-evaluate/develop-tests (fetched)

OpenAI
- Agent evals and trace grading guide (undated): https://developers.openai.com/api/docs/guides/agent-evals (fetched)
- Why SWE-bench Verified no longer measures frontier coding capabilities (early 2026): https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/ (not fetched, HTTP 403)
- Separating signal from noise in coding evaluations: https://openai.com/index/separating-signal-from-noise-coding-evaluations/ (listed by search, HTTP 403, not read)

Google
- From "Vibe Checks" to Continuous Evaluation, 2026-02-27: https://cloud.google.com/blog/topics/developers-practitioners/from-vibe-checks-to-continuous-evaluation-engineering-reliable-ai-agents (fetched)
- Evaluate Gen AI agents (Vertex docs): https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-agents (search result only, not fetched)

Microsoft
- Agent evaluators, page dated 2026-09-25: https://learn.microsoft.com/en-us/azure/foundry/concepts/evaluation-evaluators/agent-evaluators (fetched)

Meta
- GAIA (Meta co-authored), 2023: https://arxiv.org/abs/2311.12983 (search only). I found no Meta engineering post on agent evals in this pass.

Benchmarks and groups
- SWE-Bench Pro, 2025: https://arxiv.org/abs/2509.16941 (fetched)
- Terminal-Bench 2.0, 2026-01: https://arxiv.org/abs/2601.11868 (fetched)
- METR time horizon, 2025-03-19: https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/ (fetched); paper https://arxiv.org/abs/2503.14499
- tau-bench, 2024-06: https://arxiv.org/abs/2406.12045 (fetched)
- WebArena, 2023: https://arxiv.org/abs/2307.13854 (search only)
- AgentBench, 2023: https://arxiv.org/abs/2308.03688 (fetched)
- HELM, 2022: https://arxiv.org/abs/2211.09110 (fetched)
- Holistic Agent Leaderboard, 2025-10-13: https://arxiv.org/abs/2510.11977 (fetched)
- UK AISI Inspect: https://inspect.aisi.org.uk/ (fetched); repo https://github.com/UKGovernmentBEIS/inspect_ai

Judges and error analysis
- Judging LLM-as-a-Judge (MT-Bench), 2023: https://arxiv.org/abs/2306.05685 (fetched)
- Who Validates the Validators, 2024: https://arxiv.org/abs/2404.12272 (fetched)
- Hamel Husain, AI Evals FAQ, 2026-09: https://hamel.dev/blog/posts/evals-faq/ (fetched)
- Hamel Husain, Creating a LLM-as-a-Judge, 2024-10-29: https://hamel.dev/blog/posts/llm-judge/ (fetched)

## 5. Gaps

- OpenAI's SWE-bench Verified post and its signal versus noise post could not be fetched (HTTP 403). Numbers about them are from search summaries.
- No Meta primary source on agent evals found. No Google DeepMind post read beyond Google Cloud.
- Shreya Shankar's own recent posts and the Husain and Shankar course material were not read beyond the papers and pages above.
- Anthropic's post says more about eval saturation, non-coding agents and rubric design than I quoted. Read it in full before designing the method.
- Evidence on online versus offline agreement, and on judge calibration for app building, is thin. Expect to measure it ourselves.
