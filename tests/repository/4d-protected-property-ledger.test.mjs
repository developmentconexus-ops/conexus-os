import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('4D-01 compiles consumer-backed protected properties without selecting technology', () => {
  const ledger = read('docs/evidence/4d/4d-01-protected-property-ledger.md')
  const phase = read('docs/phases/4d-project-paved-road-and-runtime-realization.md')
  const opportunities = read('docs/evidence/4d/4d-01r-strategic-opportunity-challenge.md')
  const consolidation = read('docs/evidence/4d/4d-01r-consolidated-adjudication.md')
  const agentExperience = read('docs/evidence/4d/4d-opp-a01-agent-experience-comparative-study.md')
  const generatedConsumption = read('docs/evidence/4d/4d-opp-a02-generated-consumption-comparative-study.md')
  const traceability = read('docs/evidence/4d/4d-opp-a03-traceability-impact-drift-study.md')
  const projectionReview = read('docs/evidence/4d/4d-opp-a04-projection-review-mechanism-study.md')
  const backendRouter = read('docs/evidence/4d/4d-opp-b01-backend-router-module-study.md')
  const postgresMigrations = read('docs/evidence/4d/4d-opp-b02-postgresql-migrations-cr1-study.md')
  const managedSync = read('docs/evidence/4d/4d-opp-b03-governed-sync-mar-study.md')
  const sankhyaOracle = read('docs/evidence/4d/4d-opp-b04-sankhya-oracle-reconciliation-study.md')
  const scaffoldDistribution = read('docs/evidence/4d/4d-opp-b05-scaffold-generation-distribution-study.md')
  const supplyChain = read('docs/evidence/4d/4d-opp-b06-conformance-dependency-supply-chain-study.md')
  const releaseServing = read('docs/evidence/4d/4d-opp-b07-release-serving-config-study.md')
  const durableExecution = read('docs/evidence/4d/4d-opp-c01-durable-execution-workflow-runtimes-study.md')
  const agentMemory = read('docs/evidence/4d/4d-opp-c02-agent-memory-reconnect-learning-study.md')
  const builderProbe = read('docs/evidence/4d/4d-c02r-current-mastra-builder-capability-probe.md')
  const builderAdjudication = read('docs/evidence/4d/4d-c02r-builder-capability-falsifier-adjudication.md')
  const builderQualification = read('qualification/4d/mastra-builder-capability/README.md')
  const agentComposition = read('docs/evidence/4d/4d-opp-c03-agent-composition-and-protocols-study.md')
  const evaluationObservability = read('docs/evidence/4d/4d-opp-c04-evaluation-trace-intelligence-observability-study.md')
  const dataPipelines = read('docs/evidence/4d/4d-opp-c05-data-pipelines-transformation-reconciliation-study.md')
  const policySecurity = read('docs/evidence/4d/4d-opp-c06-policy-security-compliance-constraints-study.md')
  const brownfieldAssessment = read('docs/evidence/4d/4d-opp-c07-brownfield-assessment-study.md')
  const dedicatedReachability = read('docs/evidence/4d/4d-opp-c08-saas-private-reachability-dedicated-deployment-study.md')
  const designSystem = read('docs/evidence/4d/4d-opp-c09-design-system-headless-primitives-study.md')
  const realization = read('docs/phases/realization-planning.md')

  for (const token of [
    '4D-01R CLOSED / OPERATOR APPROVED / 117 PROTECTED PROPERTIES / NO TECHNOLOGY SELECTION',
    'GENERATED | PLATFORM-CONTRACT | APP-OWNED',
    'REALIZE | PRESERVE_SEAM | DEFER | STOP',
    'Scaffold and ownership',
    'Canonical wire and generated consumption',
    'Authentication, authority and backend request boundary',
    'Frontend Paved Road and P13 conformance',
    'Data and persistence',
    'Connections, Gateway and enterprise data',
    'Artifact, Release, serving and configuration',
    'Runtime-family applicability',
    'Verification, evidence and operations',
    'Versioning, escape hatch and evaluation',
    'CURRENT AUTHORITY SUFFICIENT FOR 4D-A/B DERIVATION AFTER 4D-01R',
    'technology selections admitted by 4D-01 = 0',
  ]) assert.ok(ledger.includes(token), `4D-01 ledger missing ${token}`)

  const rowPattern = /^\| `((?:SCF|WIR|AUT|FE|DAT|DPL|INT|REL|RUN|DXE|MEM|LRN|CMP|IOP|EVA|TEL|VER|CON)-\d{2})` \|/gm
  const rowLinePattern = /^\| `(?:SCF|WIR|AUT|FE|DAT|DPL|INT|REL|RUN|DXE|MEM|LRN|CMP|IOP|EVA|TEL|VER|CON)-\d{2}` \|/
  const ids = [...ledger.matchAll(rowPattern)].map(match => match[1])
  assert.equal(new Set(ids).size, ids.length, '4D-01 property IDs must be unique')

  for (const family of ['SCF', 'WIR', 'AUT', 'FE', 'DAT', 'DPL', 'INT', 'REL', 'RUN', 'DXE', 'MEM', 'LRN', 'CMP', 'IOP', 'EVA', 'TEL', 'VER', 'CON']) {
    assert.ok(ids.some(id => id.startsWith(`${family}-`)), `4D-01 ledger missing ${family} family`)
  }

  const rows = ledger.split(/\r?\n/).filter(line => rowLinePattern.test(line))
  for (const row of rows) {
    const columns = row.split('|').slice(1, -1).map(value => value.trim())
    assert.equal(columns.length, 7, `4D-01 malformed row: ${row}`)
    assert.match(columns[4], /^`(?:GENERATED|PLATFORM-CONTRACT|APP-OWNED)`$/, `invalid ownership class in ${columns[0]}`)
    assert.match(columns[5], /^`(?:REALIZE|PRESERVE_SEAM|DEFER|STOP)`$/, `invalid disposition in ${columns[0]}`)
    assert.match(columns[6], /;/, `proof and firing falsifier must both be explicit in ${columns[0]}`)
  }

  for (const disposition of ['`REALIZE`', '`PRESERVE_SEAM`', '`DEFER`']) {
    assert.ok(rows.some(row => row.includes(`| ${disposition} |`)), `4D-01 has no ${disposition} row`)
  }
  for (const ownership of ['`GENERATED`', '`PLATFORM-CONTRACT`', '`APP-OWNED`']) {
    assert.ok(rows.some(row => row.includes(`| ${ownership} |`)), `4D-01 has no ${ownership} row`)
  }

  assert.match(phase,/Mutable status and exact next action.*owned only by/s)
  assert.match(ledger,/`DXE-01`.*durable runtime remains subordinate/)
  assert.match(ledger,/`DXE-02`.*single-winner, version-compatible/)
  assert.match(ledger,/`DXE-03`.*never authorizes external-effect replay/)
  assert.match(ledger,/exact scaffold\/profile schema and physical tree/)
  assert.match(ledger,/exact supported Keycloak and Node OIDC-client versions/)
  assert.match(ledger,/first-slice PAR\/Product Agent\/ParMastra instantiation/)
  assert.match(ledger,/`RUN-05`.*Builder-generated\/evolved Budget Analyzer.*`REALIZE`/)
  assert.match(ledger,/`CON-04`.*first operational Builder.*`REALIZE`/)
  assert.match(ledger,/`FE-09`.*Published Apps need one reusable Product Agent experience road/)
  assert.match(ledger,/`SCF-09`.*authority traceability/)
  assert.match(ledger,/`VER-10`.*SHARE authority-drift evidence/)
  assert.doesNotMatch(ledger,/`VER-07`/)
  assert.match(ledger,/`TEL-01`.*instantiates no `obs\.\*` Product path/)
  assert.match(ledger,/`CMP-06`.*serial by default.*no concurrent-writer machinery/)
  assert.match(ledger,/`RUN-08`.*Dormant Product-Agent runtime families/)
  assert.match(realization,/bld: change \/ contract_revision \/ plan_revision \/ work_unit \/ actor_run \/ coding_session \/ finding \/ change_acceptance/)
  assert.match(realization,/first Budget Analyzer now instantiates \*\*BuilderMastra as an exact\s+Builder consumer\*\*/)
  for (const token of [
    'YAGNI blocks strategic inquiry',
    'PROMOTE_TO_4D_PROPERTY',
    'OPP-A01',
    'Mastra client / @mastra/ai-sdk',
    'Vercel AI SDK UI',
    'assistant-ui',
    'CopilotKit',
    'OPP-A02',
    'Kubb = empirically viable ADOPT candidate',
    'OPP-A03',
    'OPP-A04',
    'Wave C — strategic horizon studies',
    'technology selection = BLOCKED',
  ]) assert.ok(opportunities.includes(token), `4D-01R opportunity challenge missing ${token}`)

  for (const token of [
    '4D-01R CLOSED / OPERATOR APPROVED / GLOBAL-COHERENCE CORRECTIONS APPLIED',
    'protected properties                     = 117 unique',
    'REALIZE                                  = 96',
    'PRESERVE_SEAM                            = 18',
    'DEFER                                    = 3',
    'exact technology selections              = 0/21',
    'new Product owners/operations/records     = 0',
    'Builder durable classes and exact Mastra consumer were restored',
    'VER-07 was removed',
    'FE-09 now requires an executed bounded contract prototype',
    'The independent recheck returned `CLEAR`',
    'It does not select a dependency or authorize implementation.',
  ]) assert.ok(consolidation.includes(token), `4D-01R consolidation missing ${token}`)

  for (const token of [
    'Incremental-value law',
    'build the smallest truthful operational increment',
  ]) assert.ok(phase.includes(token), `4D phase missing incremental-value law ${token}`)
  assert.match(phase,/`REALIZE` means “required when its consumer becomes\s+reachable,”/)
  assert.match(realization,/Incremental-value delivery law/)
  assert.match(realization,/usable internal capability exercised by its named company consumer/)

  for (const token of [
    'PASS 1 COMPLETE / LEADING STRUCTURAL HYPOTHESIS / NO PACKAGE SELECTION',
    'IAM-13  current Published-App access context',
    'PAR-10  ALLOW_ONCE | DENY with expectedSubjectDigest',
    'TI-03   optional incremental projection',
    'generated Conexus Product Agent client + bounded React headless layer',
    'KEEP_AS_IMPLEMENTATION_ALTERNATIVE',
    'assistant-ui External Store Runtime',
    'KEEP_REFERENCE_ONLY',
    '`REJECT` direct Mastra Client/React Product authority',
    'exact package/version selection = 0',
  ]) assert.ok(agentExperience.includes(token), `OPP-A01 study missing ${token}`)

  for (const token of [
    'PASS 1 COMPLETE / KUBB LEADING CANDIDATE / NO PACKAGE SELECTION',
    'current 128 exact method+path pairs',
    'tool-neutral `conexus-wire-projection/v1` manifest',
    'Kubb TypeScript + Fetch base',
    'Kubb React Query plugin',
    'Kubb Zod plugin',
    'Orval',
    'Hey API OpenAPI TypeScript',
    'PROMOTE_TO_4D_PROPERTY / KEEP',
    'exact package/version selection = 0',
  ]) assert.ok(generatedConsumption.includes(token), `OPP-A02 study missing ${token}`)

  for (const token of [
    'PASS 1 COMPLETE / MINIMAL GENERATED TRACEABILITY SELECTED AS LEADING HYPOTHESIS / NO TOOL SELECTION',
    'generated digest-pinned authority traceability projection',
    'REOPEN_CANDIDATE',
    'NO_DRIFT_DETECTED_IN_DECLARED_CLASSES',
    'generic traceability owner/graph service = REJECT',
    'exact tool/storage selection = 0',
  ]) assert.ok(traceability.includes(token), `OPP-A03 study missing ${token}`)

  for (const token of [
    'PASS 1 COMPLETE / BOUNDED MECHANICS PROMOTED / UNIVERSAL REVIEW FRAMEWORK REJECTED',
    'bounded projection protocol + owner adapters + shared rendering kernel',
    'projection version / stale-anchor mismatch = REQUIRED 4D REALIZATION',
    'universal ReviewProjection Product owner/API = REJECT',
    'exact rendering package selection = 0',
  ]) assert.ok(projectionReview.includes(token), `OPP-A04 study missing ${token}`)

  for (const token of [
    'PASS 1 OPERATOR APPROVED / FASTIFY LEADING CANDIDATE / NO PACKAGE SELECTION',
    'generated Product route bindings from canonical 4B wire',
    'Fastify',
    'default AJV settings coerce array types, apply defaults and remove additional',
    'Hono',
    'NestJS',
    'REJECT FOR CURRENT F1',
    'B01-P9',
    'exact package/version selection = 0',
  ]) assert.ok(backendRouter.includes(token), `OPP-B01 study missing ${token}`)

  for (const token of [
    'PASS 1 OPERATOR APPROVED / PG + NARROW I&A GUARD LEADING / MIGRATION TOOLING UNSELECTED',
    'narrow I&A `SECURITY DEFINER` guard in the same transaction',
    'REVOKE ALL ... FROM PUBLIC',
    'node-postgres',
    'Kysely',
    'Atlas versioned migrations',
    'Flyway',
    'Sqitch',
    'B02-P3',
    'exact driver/query/migration selection = 0',
  ]) assert.ok(postgresMigrations.includes(token), `OPP-B02 study missing ${token}`)

  for (const token of [
    'PASS 1 OPERATOR APPROVED / PG-BOSS INCUMBENT CONFIRMED / NO DEPENDENCY SELECTION',
    'same transaction commits `mar.job_run` and queue projection',
    'Graphile Worker',
    'BullMQ PostgreSQL backend',
    'Temporal',
    'Microsoft `pg_durable`',
    'process-local wake tick',
    'B03-P6',
    'exact dependency/version selection = 0',
  ]) assert.ok(managedSync.includes(token), `OPP-B03 study missing ${token}`)

  for (const token of [
    'PASS 1 CORRECTED / OPERATOR APPROVED',
    'Live provider execution:',
    'Sankhya API connector != Oracle Database connector',
    'Official business operations',
    'DB Explorer through Sankhya Gateway',
    'Direct Oracle access as the Sankhya adapter',
    'Oracle SCN/Flashback as inferred Sankhya coordinate = REJECT',
    'B04-P9',
    'live provider proof = REQUIRED FOR NAMED CLAIMS / NOT EXECUTED',
    'exact dependency/transport/coordinate selection = 0',
  ]) assert.ok(sankhyaOracle.includes(token), `OPP-B04 study missing ${token}`)

  for (const token of [
    'PASS 1 OPERATOR APPROVED / PROFILE COMPILER + OWNERSHIP MANIFEST LEADING',
    'Conexus profile compiler with a small tree abstraction',
    'Nx Devkit generators',
    'Copier',
    'Plop',
    'Skills, hooks and rules distribution',
    'B05-P12',
    'local skills/hooks/rules = DIGEST-PINNED GENERATED PROJECTIONS',
    'exact generator dependency/profile schema/physical tree = 0',
  ]) assert.ok(scaffoldDistribution.includes(token), `OPP-B05 study missing ${token}`)

  for (const token of [
    'PASS 1 OPERATOR APPROVED / LAYERED EVIDENCE CHAIN LEADING',
    'Non-collapsible truths',
    'npm incumbent',
    'Registry signatures and package provenance',
    'CycloneDX',
    'SPDX',
    'SLSA v1.2',
    'Sigstore/Cosign',
    'B06-P14',
    'generic policy/governance platform = REJECT CURRENT F1',
    'exact tools/versions/policies/SLSA level = 0',
  ]) assert.ok(supplyChain.includes(token), `OPP-B06 study missing ${token}`)

  for (const token of [
    'PASS 1 OPERATOR APPROVED / THREE-PLANE COMPOSITION + REAL SERVING PROBE LEADING',
    'Three planes that must not collapse',
    'Local content-addressed store',
    'OCI artifacts',
    'native immutable Hub bundle + systemd',
    'OCI images + Docker Compose',
    'Podman/Quadlet',
    'Real serving verification',
    'B07-P14',
    'Kubernetes/Nomad = REJECT CURRENT F1',
    'exact artifact store/process manager/container runtime/config schema = 0',
  ]) assert.ok(releaseServing.includes(token), `OPP-B07 study missing ${token}`)

  for (const token of [
    'PASS 1 OPERATOR APPROVED / STRATEGIC SEAMS PROMOTED / CURRENT ADOPTION DEFERRED',
    'Temporal',
    'Restate',
    'DBOS TypeScript',
    'Mastra DurableAgent',
    'Inngest',
    'Trigger.dev',
    'DXE-01..03 = PROMOTE TO 4D PROPERTY CONTRACTS',
    'C01-P12',
    'exact runtime/dependency/version selection = 0',
  ]) assert.ok(durableExecution.includes(token), `OPP-C01 study missing ${token}`)

  assert.match(ledger,/`MEM-01`.*exact Workspace\/Project\/Agent\/subject\/class\/purpose scope/)
  assert.match(ledger,/`MEM-02`.*owner sequence plus opaque delivery cursor/)
  assert.match(ledger,/`MEM-03`.*inspect, correct and forget lifecycle/)
  assert.match(ledger,/`MEM-04`.*cannot grant tools, Permissions, bindings, effects or publication/)
  assert.match(ledger,/`LRN-01`.*existing owner acceptance and Release/)

  for (const token of [
    'PASS 2 REVISED / OPERATOR APPROVED / BUILDER FALSIFIER ROUTED',
    'Reconnect architecture',
    'Mastra Working Memory',
    'Semantic Recall',
    'Observational Memory and Extractors',
    'Mem0',
    'Zep / Graphiti',
    'Governed learning',
    'MEM-01..04 + LRN-01 = PROMOTE TO 4D PROPERTY CONTRACTS',
    'C02-P14',
    'exact memory/vector/model/runtime selection = 0',
  ]) assert.ok(agentMemory.includes(token), `OPP-C02 study missing ${token}`)

  for (const token of [
    'MECHANICAL PROBE COMPLETE / MODEL-QUALITY PROOF OPEN',
    '@mastra/core         1.63.2',
    'mastra_workspace_execute_command',
    'Mechanical probe B',
    'What the probe falsifies',
    'What remains open',
  ]) assert.ok(builderProbe.includes(token), `C02R probe missing ${token}`)

  for (const token of [
    'REVISE SELECTED / OPERATOR APPROVED / BUILDER MUST ENTER FIRST OPERATIONAL PRODUCT PROOF',
    'manual platform bootstrap = allowed',
    'first operational Conexus Product proof = must traverse Builder',
    'Minimum capable Builder baseline',
    'native Mastra = INCUMBENT CANDIDATE',
    'Mastra host + SDK/ACP = REQUIRED CHALLENGER',
    'selection = Worker Eval, not feature count',
  ]) assert.ok(builderAdjudication.includes(token), `C02R adjudication missing ${token}`)

  assert.match(builderQualification,/Evidence-only/)
  assert.match(builderQualification,/npm ci/)
  assert.match(realization,/4D BUILDER APPLICABILITY REVISED/)
  assert.match(realization,/\| `RB` \| minimum capable Builder/)
  assert.match(realization,/first operational Budget Analyzer = must traverse real Builder authority\/runtime/)

  assert.match(ledger,/`CMP-01`.*implement\/verify ActorRuns/)
  assert.match(ledger,/`CMP-02`.*fresh context and fresh immutable candidate materialization/)
  assert.match(ledger,/`CMP-08`.*Product-Agent\/external agent composition remains absent/)
  assert.match(ledger,/`IOP-01`.*Protocol projection never becomes/)
  assert.match(ledger,/`IOP-07`.*Protocol revision and extensions are exact-pinned/)

  for (const token of [
    'BOUNDED BUILDER ROLE COMPOSITION PROMOTED',
    'OPP-C03 PASS 1 = OPERATOR APPROVED',
    'capable implementation ActorRun',
    'AgentController constrained subagents',
    'Agent Networks',
    'MCP `latest` specification is `2026-07-28`',
    'A2A Task       != ActorRun',
    'ACP = REQUIRED BUILDER CHALLENGER',
    'CMP-01..08 + IOP-01..07 = PROMOTE TO 4D PROPERTY CONTRACTS',
    'C03-P15',
    'exact agent/protocol/dependency selection = 0',
  ]) assert.ok(agentComposition.includes(token), `OPP-C03 study missing ${token}`)

  assert.match(ledger,/`EVA-01`.*exact subject\/candidate/)
  assert.match(ledger,/`EVA-07`.*immutable Evidence/)
  assert.match(ledger,/`TEL-01`.*correlation only/)
  assert.match(ledger,/`TEL-05`.*pinned and replaceable/)
  assert.match(ledger,/`LRN-02`.*Trace Intelligence is optional discovery/)

  for (const token of [
    'CONEXUS WORKER EVAL + EVIDENCE ENVELOPE PROMOTED',
    'OPP-C04 PASS 1 = OPERATOR APPROVED',
    'private versioned Conexus Worker Eval = REQUIRED',
    'deterministic gates + independent verifier = ACCEPTANCE FLOOR',
    'Mastra datasets/experiments/runEvals = IMPLEMENTATION CANDIDATES',
    'Trace Intelligence = DEFER / REFERENCE_ONLY',
    'OTLP + pinned translation = PORTABILITY SEAM',
    'Phoenix OSS = SOVEREIGN BAKEOFF INCUMBENT',
    'Braintrust/LangSmith = MANAGED CHALLENGERS',
    'EVA-01..07 + TEL-01..05 + LRN-02 = PROMOTE TO 4D PROPERTY CONTRACTS',
    'C04-P18',
    'exact eval/telemetry platform selection = 0',
  ]) assert.ok(evaluationObservability.includes(token), `OPP-C04 study missing ${token}`)

  assert.match(ledger,/`DPL-01`.*data-path manifest/)
  assert.match(ledger,/`DPL-04`.*cursor\/checkpoint advances atomically/)
  assert.match(ledger,/`DPL-06`.*first Builder-generated Budget Analyzer/)

  for (const token of [
    'GOVERNED PROJECT DATA PATH PROMOTED',
    'OPP-C05 PASS 1 = OPERATOR APPROVED',
    'governed Project data-path profile = REQUIRED FIRST BUILDER CAPABILITY',
    'dlt = STRONGEST EXTRACTION/LOAD LIBRARY CHALLENGER',
    'Debezium = REJECT FOR SANKHYA',
    'native SQL/TypeScript vs dbt Core vs SQLMesh = REQUIRED TRANSFORMATION COMPARISON',
    'independent Conexus live-source reconciliation = REQUIRED',
    'DPL-01..06 = PROMOTE TO 4D PROPERTY CONTRACTS',
    'DAT-08 + INT-06 + VER-05 + 3O-P1..P7 = REUSE / NO DUPLICATE RCN FAMILY',
    'C05-P17',
    'exact pipeline/transform/quality dependency selection = 0',
  ]) assert.ok(dataPipelines.includes(token), `OPP-C05 study missing ${token}`)

  assert.match(ledger,/`SCF-11`.*can never grant authority.*`REALIZE`/)
  assert.match(ledger,/`SCF-11`.*exact deny-only set/)

  for (const token of [
    'SCF-11 REALIZE + DENY-ONLY CONSTRAINT ENVELOPE PROMOTED',
    'OPP-C06 PASS 1 = OPERATOR APPROVED',
    'SCF-11 deny-only digest-pinned constraint seam = REALIZE',
    'JSON Schema + owner-local checks = LEADING CURRENT BASELINE',
    'OPA/Rego = BROAD IMPLEMENTATION ALTERNATIVE / TRIGGER REQUIRED',
    'CEL = NARROW CHALLENGER / TRIGGER REQUIRED',
    'Cedar/OpenFGA = REJECT CURRENT C06',
    'Semgrep = BOUNDED STRUCTURAL SECURITY CANDIDATE',
    'CodeQL = CROSS-FILE DATAFLOW CHALLENGER',
    'OWASP ASVS = BOUNDED REQUIREMENTS-VOCABULARY CANDIDATE',
    'B06/B07 supply-chain admission = REUSE / NO DUPLICATION',
    'new ledger IDs = 0 / SCF-11 REFINED',
    'C06-P17',
    'exact engine/scanner/standard mapping/version = 0',
  ]) assert.ok(policySecurity.includes(token), `OPP-C06 study missing ${token}`)

  for (const token of [
    'SOURCE-PINNED EVIDENCE MAP + SAFE LAYERED ASSESSMENT PRESERVED',
    'OPP-C07 PASS 1 = OPERATOR APPROVED',
    'brownfield Evidence Map + claim ledger = REQUIRED AT FIRST REAL TRIGGER',
    'exact Git/submodule/LFS/source closure = REQUIRED BASELINE',
    'non-executing static pass before isolated semantic/runtime proof = REQUIRED',
    'Tree-sitter = SYNTAX SUBSTRATE CANDIDATE',
    'SCIP = LEADING OPEN SEMANTIC INDEX INTERCHANGE CANDIDATE',
    'CodeQL = DEEP DATAFLOW/SECURITY TRIGGER',
    'Sourcegraph = STRATEGIC SCALE/CROSS-REPO CANDIDATE',
    'AI/Factory/Mitra output = CITED HYPOTHESIS / NEVER AUTHORITY',
    'composite health/readiness/migration score = REJECT AS DECISION AUTHORITY',
    'new ledger IDs = 0 / FIRST REAL BROWNFIELD PROJECT MAY REOPEN',
    'C07-P18',
    'exact analyzer/indexer/platform/version = 0',
  ]) assert.ok(brownfieldAssessment.includes(token), `OPP-C07 study missing ${token}`)

  assert.match(ledger,/`SCF-08`.*DedicatedApplicationPrincipal.*`PRESERVE_SEAM`/)
  assert.match(ledger,/`SCF-08`.*offline artifact delivery cannot imply offline Conexus capability use/)

  for (const token of [
    'DEDICATED CONTRACT CONFIRMED + SCF-08 ENRICHED',
    'OPP-C08 PASS 1 = OPERATOR APPROVED',
    'DEDICATED and SaaS/private reachability = ORTHOGONAL REQUIREMENT CLASSES',
    'current DEDICATED semantic/trust contract = CONFIRMED',
    'SCF-08 = ENRICHED / PRESERVE_SEAM',
    'offline artifact delivery != offline Platform Service capability use',
    'mTLS/DPoP = FIRST-CONSUMER SENDER-CONSTRAINT CHALLENGERS IF THREAT MODEL FIRES',
    'SaaS→private/on-prem reachability = DEFER WITH COMPOUND REAL-TOPOLOGY TRIGGER',
    'outbound application-scoped connector/relay = LEADING FUTURE DEFAULT HYPOTHESIS',
    'site-to-site VPN = REJECT AS DEFAULT / CUSTOMER-STANDARD TRIGGER',
    'new ledger IDs = 0 / SCF-08 REFINED',
    'C08-P20',
    'exact deployment/reachability/identity mechanism/version = 0',
  ]) assert.ok(dedicatedReachability.includes(token), `OPP-C08 study missing ${token}`)

  assert.match(ledger,/`FE-06`.*reduced-motion behavior/)
  assert.match(ledger,/`FE-07`.*visual composition, brand\/theme/)
  assert.match(ledger,/`FE-11`.*accessible presentation mechanics only.*`REALIZE`/)

  for (const token of [
    'TWO-TIER VISUAL ROAD + FE-11 PROMOTED',
    'two-tier Platform visual system + Project visual foundation = REQUIRED',
    'FE-06/FE-07 = REFINED',
    'FE-11 = PROMOTE TO 4D PROPERTY CONTRACTS',
    'React Aria Components = LEADING BEHAVIORAL PROTOTYPE',
    'Base UI = LEADING LOW-LEVEL PROTOTYPE',
    'Radix Primitives = MATURE CONTROL',
    'Ark Plus = REJECT FOR BUILDER DISTRIBUTION',
    'shadcn/ui = PROJECT SOURCE-DISTRIBUTION CHALLENGER / NOT BEHAVIOR AUTHORITY',
    'CSS custom properties + CSS Modules = REFERENCE BASELINE',
    'Tailwind CSS v4 = STRONG GENERATED-APP CHALLENGER',
    'Storybook/Testing Library/axe/Playwright = COMPLEMENTARY EVIDENCE MECHANISMS',
    'C09-P18',
    'exact headless/styling/token/proof package/version = 0',
  ]) assert.ok(designSystem.includes(token), `OPP-C09 study missing ${token}`)
})
