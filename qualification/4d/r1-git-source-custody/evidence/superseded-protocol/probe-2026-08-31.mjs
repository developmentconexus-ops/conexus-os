import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { admitProviderNeutralLocator, resolveCanonicalRepositoryPath } from "./admission.mjs";

const git = "/usr/local/bin/git";
const qualificationRoot = "/qualification";
const workRoot = process.env.R1C14_WORK_ROOT ?? "/work/r1c14";
const candidatePath = process.env.R1C14_CANDIDATE_PATH ?? "/evidence/candidate-results.json";
const zeroOid = "0".repeat(40);
const checks = [];
let secretCanary;

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function record(id, claim, proof = {}) { checks.push({ id, verdict: "PASS", claim, ...proof }); }
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8", env: { ...process.env, ...options.env } });
  assert.equal(result.status, options.expectedStatus ?? 0, `${command} ${args.join(" ")} status=${result.status}\n${result.stderr}`);
  if (options.stderrPattern) assert.match(result.stderr, options.stderrPattern, `${command} refusal class mismatch`);
  return result;
}
function runAsync(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (status) => resolve({ status, stdout, stderr }));
  });
}
function safeGitEnv({ protocols = "file", askpass } = {}) {
  return { HOME: join(workRoot, "empty-home"), XDG_CONFIG_HOME: join(workRoot, "empty-xdg"), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "true", GIT_TERMINAL_PROMPT: "false", GIT_ASKPASS: askpass ?? join(workRoot, "deny-askpass.sh"), GIT_ALLOW_PROTOCOL: protocols };
}
function gitRun(args, options = {}) { return run(git, args, { ...options, env: { ...safeGitEnv(options), ...options.env } }); }
async function expectMissing(path) { await assert.rejects(stat(path), { code: "ENOENT" }); }
async function filesBelow(path) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`SECRET_SCAN_NON_REGULAR_REFUSED:${child}`);
  }
  return files;
}

async function createSource(path, marker, complete = true) {
  await mkdir(join(path, "platform"), { recursive: true });
  gitRun(["init", "-b", "main", path]);
  gitRun(["config", "user.name", "Conexus Qualification"], { cwd: path });
  gitRun(["config", "user.email", "qualification@conexus.invalid"], { cwd: path });
  await writeFile(join(path, "platform", "contract.txt"), `platform:${marker}\n`);
  if (complete) { await mkdir(join(path, "generated")); await writeFile(join(path, "generated", "manifest.txt"), `generated:${marker}\n`); }
  gitRun(["add", "--all"], { cwd: path });
  gitRun(["commit", "-m", `fixture ${marker}`], { cwd: path, env: { GIT_AUTHOR_DATE: "2026-08-31T00:00:00Z", GIT_COMMITTER_DATE: "2026-08-31T00:00:00Z" } });
  return gitRun(["rev-parse", "HEAD"], { cwd: path }).stdout.trim();
}
function requireCompleteCommitTree(repository, oid) {
  for (const path of ["platform/contract.txt", "generated/manifest.txt"]) gitRun(["cat-file", "-e", `${oid}:${path}`], { cwd: repository });
}
function assertExecutablePin(actual, expected) { if (actual !== expected) throw new Error("EXECUTABLE_PIN_MISMATCH"); }
function requireNoAlternates(repository) { if (spawnSync("test", ["!", "-s", join(repository, "objects", "info", "alternates")]).status !== 0) throw new Error("ALTERNATES_POLICY_DENIED"); }
async function waitForFile(path) {
  for (let attempt = 0; attempt < 200; attempt += 1) { try { return JSON.parse(await readFile(path, "utf8")); } catch { await new Promise((resolve) => setTimeout(resolve, 25)); } }
  throw new Error(`fixture did not become ready: ${path}`);
}
async function waitForPaths(paths) {
  for (let attempt = 0; attempt < 200; attempt += 1) { try { await Promise.all(paths.map((path) => stat(path))); return; } catch {} await new Promise((resolve) => setTimeout(resolve, 10)); }
  throw new Error("CAS contenders did not reach barrier");
}

async function main() {
  assert.deepEqual({ os: process.platform, arch: process.arch }, { os: "linux", arch: "x64" });
  await rm(workRoot, { recursive: true, force: true });
  const secretFile = process.env.R1C14_SYNTHETIC_SECRET_FILE;
  assert(secretFile?.startsWith("/work/"), "synthetic secret file slot is required");
  secretCanary = (await readFile(secretFile, "utf8")).trim();
  assert(secretCanary.length >= 32, "synthetic secret is too short");
  await unlink(secretFile);
  await mkdir(join(workRoot, "empty-home"), { recursive: true }); await mkdir(join(workRoot, "empty-xdg"), { recursive: true });
  const denyAskpass = join(workRoot, "deny-askpass.sh"); const controlledAskpass = join(workRoot, "controlled-askpass.sh");
  const askpassLog = join(workRoot, "controlled-askpass-fired"); const helperLog = join(workRoot, "ambient-helper-fired"); const helperPath = join(workRoot, "ambient-helper.sh");
  await writeFile(denyAskpass, "#!/bin/sh\nexit 91\n");
  await writeFile(controlledAskpass, `#!/bin/sh\nprintf 'fired\\n' >> '${askpassLog}'\ncase "$1" in *Username*) printf 'fixture\\n';; *) printf '%s\\n' "$R1C14_SYNTHETIC_SECRET";; esac\n`);
  await writeFile(helperPath, `#!/bin/sh\nprintf 'fired\\n' >> '${helperLog}'\nexit 92\n`);
  await Promise.all([denyAskpass, controlledAskpass, helperPath].map((path) => chmod(path, 0o700)));
  await writeFile("/root/.gitconfig", `[credential]\n\thelper = !${helperPath}\n`);

  const gitVersion = gitRun(["version"]).stdout.trim(); assert.equal(gitVersion, "git version 2.55.0");
  const gitSha256 = sha256(await readFile(git)); assertExecutablePin(gitSha256, process.env.R1C14_EXPECTED_GIT_SHA256);
  assert.throws(() => assertExecutablePin(gitSha256, "0".repeat(64)), /EXECUTABLE_PIN_MISMATCH/);
  record("PIN", "external exact executable pin admitted", { gitVersion, gitSha256 });
  record("PIN_NEGATIVE", "wrong executable pin fired refusal", { refusalClass: "EXECUTABLE_PIN_MISMATCH" });
  const buildFlags = (await readFile("/opt/conexus/git-2.55.0/share/conexus/build-flags", "utf8")).trim().split("\n");
  assert.deepEqual(buildFlags, ["NO_TCLTK=YesPlease", "NO_GETTEXT=YesPlease", "NO_RUST=YesPlease"]);
  const buildOptions = gitRun(["version", "--build-options"]).stdout.trim().split("\n");
  assert.equal(buildOptions.includes("rust: disabled"), true);
  await expectMissing("/opt/conexus/git-2.55.0/bin/gitk"); await expectMissing("/opt/conexus/git-2.55.0/bin/git-gui"); await expectMissing("/opt/conexus/git-2.55.0/share/locale");
  record("BUILD_OPTIONS", "recognized build flags and excluded components observed", { buildFlags, buildOptions });

  const canonicalRoot = join(workRoot, "canonical"); const newSource = join(workRoot, "new-source"); const newOid = await createSource(newSource, "new");
  const projectA = resolveCanonicalRepositoryPath(canonicalRoot, "018f47a2-7b20-4e52-8a30-786f52ea6e0f").path;
  gitRun(["init", "--bare", projectA]); gitRun(["fetch", "--no-write-fetch-head", newSource, newOid], { cwd: projectA }); requireCompleteCommitTree(projectA, newOid);
  gitRun(["update-ref", "refs/heads/main", newOid, zeroOid], { cwd: projectA }); record("NEW", "complete staged NEW tree became one immutable canonical revision", { sourceRevision: newOid });

  await writeFile(join(newSource, "platform", "contract.txt"), "loser\n"); gitRun(["add", "--all"], { cwd: newSource });
  gitRun(["commit", "-m", "CAS loser"], { cwd: newSource, env: { GIT_AUTHOR_DATE: "2026-08-31T00:01:00Z", GIT_COMMITTER_DATE: "2026-08-31T00:01:00Z" } });
  const loserOid = gitRun(["rev-parse", "HEAD"], { cwd: newSource }).stdout.trim(); const raceRepo = join(workRoot, "cas-race.git");
  gitRun(["init", "--bare", raceRepo]); gitRun(["fetch", "--no-write-fetch-head", newSource, newOid, loserOid], { cwd: raceRepo });
  const readyA = join(workRoot, "cas-ready-a"); const readyB = join(workRoot, "cas-ready-b"); const go = join(workRoot, "cas-go"); const wrapper = join(workRoot, "cas-wrapper.sh");
  await writeFile(wrapper, `#!/bin/sh\nprintf 'ready\\n' > "$1"\nwhile [ ! -e "$2" ]; do sleep 0.01; done\nexec /usr/local/bin/git update-ref refs/heads/main "$3" ${zeroOid}\n`); await chmod(wrapper, 0o700);
  const contendersPromise = Promise.all([runAsync(wrapper, [readyA, go, newOid], { cwd: raceRepo, env: safeGitEnv() }), runAsync(wrapper, [readyB, go, loserOid], { cwd: raceRepo, env: safeGitEnv() })]);
  await waitForPaths([readyA, readyB]); await writeFile(go, "go\n"); const contenders = await contendersPromise;
  assert.equal(contenders.filter(({ status }) => status === 0).length, 1); const casLoser = contenders.find(({ status }) => status !== 0);
  const refusalClass = /reference already exists|expected/i.test(casLoser.stderr) ? "EXPECTED_OLD_REF_MISMATCH" : /unable to create .*\.lock.*file exists/i.test(casLoser.stderr) ? "REF_LOCK_CONTENTION" : null;
  assert(refusalClass, `unclassified CAS refusal: ${casLoser.stderr}`);
  record("CAS", "barrier-overlapped expected-old-zero CAS admitted one winner", { winner: gitRun(["rev-parse", "refs/heads/main"], { cwd: raceRepo }).stdout.trim(), refusalClass, loserStderr: casLoser.stderr.trim(), exitStatuses: contenders.map(({ status }) => status) });

  const projectB = resolveCanonicalRepositoryPath(canonicalRoot, "018f47a2-7b20-4e52-8a30-786f52ea6e10").path; gitRun(["init", "--bare", projectB]);
  const alternatesPath = join(projectB, "objects", "info", "alternates"); await writeFile(alternatesPath, `${join(projectA, "objects")}\n`);
  gitRun(["cat-file", "-e", `${newOid}^{commit}`], { cwd: projectB });
  assert.throws(() => requireNoAlternates(projectB), /ALTERNATES_POLICY_DENIED/); await unlink(alternatesPath); requireNoAlternates(projectB);
  gitRun(["cat-file", "-e", `${newOid}^{commit}`], { cwd: projectB, expectedStatus: 128, stderrPattern: /not a valid object|could not get object|bad object/i });
  record("ISOLATION", "planted cross-Project alternates refused and foreign object stayed unreachable", { refusalClass: "ALTERNATES_POLICY_DENIED" });

  const importWork = join(workRoot, "import-work"); const importSource = join(workRoot, "import-source.git"); const importOid = await createSource(importWork, "existing");
  gitRun(["clone", "--bare", "--no-hardlinks", importWork, importSource]); gitRun(["update-server-info"], { cwd: importSource });
  const partialWork = join(workRoot, "partial-work"); const partialSource = join(workRoot, "partial-source.git"); const partialOid = await createSource(partialWork, "partial", false);
  gitRun(["clone", "--bare", "--no-hardlinks", partialWork, partialSource]); gitRun(["update-server-info"], { cwd: partialSource });
  const certPath = join(workRoot, "fixture.crt"); const keyPath = join(workRoot, "fixture.key"); const configPath = join(workRoot, "openssl.cnf");
  await writeFile(configPath, "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=git.allowed.test\n[ext]\nsubjectAltName=DNS:git.allowed.test\n");
  run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-config", configPath, "-keyout", keyPath, "-out", certPath]);
  await writeFile("/etc/hosts", `${await readFile("/etc/hosts", "utf8")}\n127.0.0.1 git.allowed.test\n`);
  const readyPath = join(workRoot, "https-ready.json"); const requestLogPath = join(workRoot, "https-requests.json");
  const server = spawn("node", [join(qualificationRoot, "https-fixture.mjs"), importSource, partialSource, certPath, keyPath, readyPath, requestLogPath], { env: { ...process.env, R1C14_SYNTHETIC_SECRET: secretCanary }, stdio: "inherit" }); let serverStopped = false;
  try {
    await waitForFile(readyPath); const importUrl = "https://git.allowed.test/admitted/repo.git"; assert.equal(admitProviderNeutralLocator(importUrl).admitted, true);
    const httpsEnv = { ...safeGitEnv({ protocols: "https" }), GIT_SSL_CAINFO: certPath, NO_PROXY: "git.allowed.test,127.0.0.1", no_proxy: "git.allowed.test,127.0.0.1" };
    const projectExisting = resolveCanonicalRepositoryPath(canonicalRoot, "018f47a2-7b20-4e52-8a30-786f52ea6e11").path; gitRun(["init", "--bare", projectExisting]);
    gitRun(["-c", "http.followRedirects=false", "fetch", "--no-write-fetch-head", importUrl, importOid], { cwd: projectExisting, env: httpsEnv }); requireCompleteCommitTree(projectExisting, importOid);
    gitRun(["update-ref", "refs/heads/main", importOid, zeroOid], { cwd: projectExisting }); gitRun(["config", "--get-regexp", "^remote\\."], { cwd: projectExisting, expectedStatus: 1 });
    record("EXISTING_GIT", "admitted HTTPS import resolved one complete immutable commit into owner custody", { sourceRevision: importOid });
    gitRun(["clone", `file://${importSource}`, join(workRoot, "forbidden-file-clone")], { env: safeGitEnv({ protocols: "https" }), expectedStatus: 128, stderrPattern: /transport 'file' not allowed/i }); record("PROTOCOL", "transport allowlist fired file refusal", { refusalClass: "PROTOCOL_NOT_ALLOWED" });
    gitRun(["-c", "http.followRedirects=false", "ls-remote", "https://git.allowed.test/redirect.git"], { env: httpsEnv, expectedStatus: 128, stderrPattern: /redirect|requested URL returned error|unable to access/i }); record("REDIRECT", "redirect refused before forbidden destination", { refusalClass: "REDIRECT_DENIED" });
    const beforeMissing = gitRun(["rev-parse", "refs/heads/main"], { cwd: projectExisting }).stdout.trim(); const missing = gitRun(["ls-remote", importUrl, "refs/heads/missing"], { env: httpsEnv }); assert.equal(missing.stdout, "");
    gitRun(["fetch", "--no-write-fetch-head", importUrl, "refs/heads/missing"], { cwd: projectExisting, env: httpsEnv, expectedStatus: 128, stderrPattern: /couldn't find remote ref|not our ref/i }); assert.equal(gitRun(["rev-parse", "refs/heads/main"], { cwd: projectExisting }).stdout.trim(), beforeMissing);
    record("MISSING_REF", "missing ref returned empty discovery and no canonical mutation", { refusalClass: "REMOTE_REF_MISSING" });
    const partialStage = join(workRoot, "partial-stage.git"); gitRun(["init", "--bare", partialStage]); gitRun(["fetch", "--no-write-fetch-head", "https://git.allowed.test/admitted/partial.git", partialOid], { cwd: partialStage, env: httpsEnv });
    assert.throws(() => requireCompleteCommitTree(partialStage, partialOid)); gitRun(["show-ref", "--verify", "refs/heads/main"], { cwd: partialStage, expectedStatus: 128, stderrPattern: /not a valid ref/i }); record("PARTIAL", "partial tree failed completeness before ref mutation", { refusalClass: "REQUIRED_TREE_PATH_MISSING" });
    const privateUrl = "https://git.allowed.test/admitted/private/repo.git";
    run(git, ["-c", `http.sslCAInfo=${certPath}`, "ls-remote", privateUrl], { env: { HOME: "/root", GIT_TERMINAL_PROMPT: "false", GIT_ALLOW_PROTOCOL: "https", NO_PROXY: "git.allowed.test,127.0.0.1", no_proxy: "git.allowed.test,127.0.0.1" }, expectedStatus: 128, stderrPattern: /credential|authentication|terminal prompts disabled|unable to access/i }); await stat(helperLog); await unlink(helperLog);
    const authenticated = gitRun(["ls-remote", privateUrl, "refs/heads/main"], { env: { ...httpsEnv, GIT_ASKPASS: controlledAskpass, R1C14_SYNTHETIC_SECRET: secretCanary } }); assert.match(authenticated.stdout, new RegExp(`^${importOid}`)); await stat(askpassLog); await expectMissing(helperLog);
    record("CREDENTIAL_CONFIG", "401 fired ambient helper; isolated config blocked it and controlled secret slot succeeded", { refusalClass: "AMBIENT_HELPER_ISOLATED" });
    for (const [mode, canonical, oid] of [["NEW", projectA, newOid], ["EXISTING_GIT", projectExisting, importOid]]) {
      const bundle = join(workRoot, `${mode}.bundle`); const restored = join(workRoot, `${mode}-restored.git`); gitRun(["bundle", "create", bundle, "--all"], { cwd: canonical }); gitRun(["bundle", "verify", bundle], { cwd: canonical }); gitRun(["clone", "--bare", "--no-hardlinks", bundle, restored]);
      assert.equal(gitRun(["rev-parse", "refs/heads/main"], { cwd: restored }).stdout.trim(), oid); requireCompleteCommitTree(restored, oid); gitRun(["fsck", "--full", "--no-dangling"], { cwd: restored }); record(`BUNDLE_${mode}`, "verified bundle restored complete tree and identical object ID", { sourceRevision: oid });
      if (mode === "NEW") { const corrupt = join(workRoot, "corrupt.bundle"); const bytes = await readFile(bundle); bytes[bytes.length - 1] ^= 0xff; await writeFile(corrupt, bytes); gitRun(["clone", "--bare", "--no-hardlinks", corrupt, join(workRoot, "corrupt-restored.git")], { expectedStatus: 128, stderrPattern: /early EOF|invalid|corrupt|index-pack failed|fetch-pack/i }); record("CORRUPT_BUNDLE", "corrupt pack fired isolated-restore refusal", { refusalClass: "CORRUPT_PACK" }); }
    }
  } finally { server.kill("SIGTERM"); await new Promise((resolve) => server.once("exit", resolve)); serverStopped = true; }

  const requests = JSON.parse(await readFile(requestLogPath, "utf8")); assert.equal(requests.some(({ path }) => path.startsWith("/forbidden/")), false); assert.equal(JSON.stringify(requests).includes(secretCanary), false);
  const secretScanRoots = [workRoot, "/root", "/tmp", "/evidence"];
  const secretBytes = Buffer.from(secretCanary); const scannedFiles = (await Promise.all(secretScanRoots.map(filesBelow))).flat(); const contaminatedFiles = [];
  for (const path of scannedFiles) if ((await readFile(path)).includes(secretBytes)) contaminatedFiles.push(path);
  assert.deepEqual(contaminatedFiles, []);
  const packages = run("dpkg-query", ["-W", "-f=${Package}=${Version}\\n"]).stdout.trim().split("\n").filter(Boolean).sort(); const rootfsLayers = JSON.parse(process.env.R1C14_ROOTFS_LAYERS);
  assert.equal(sha256(`${rootfsLayers.join("\n")}\n`), process.env.R1C14_EXPECTED_ROOTFS_CLOSURE); assert.equal(sha256(`${packages.join("\n")}\n`), process.env.R1C14_EXPECTED_DEPENDENCY_CLOSURE);
  const protocolPaths = ["Dockerfile", "admission.mjs", "admission.test.mjs", "https-fixture.mjs", "probe.mjs", "product-census.mjs", "finalize-result.mjs", "run.ps1"];
  const protocolDigests = Object.fromEntries(await Promise.all(protocolPaths.map(async (path) => [path, sha256(await readFile(join(qualificationRoot, path)))])));
  await rm(workRoot, { recursive: true, force: true }); await expectMissing(workRoot);
  const requestLogSecretAbsent = !JSON.stringify(requests).includes(secretCanary); const secretCanaryAbsent = contaminatedFiles.length === 0;
  const candidate = { kind: "conexus.r1c14.git-source-custody-results/v2", observedOn: "2026-08-31", verdict: "PROVISIONAL", predecessors: { s2GenerationReceiptSha256: process.env.R1C14_S2_RECEIPT_SHA256, s2OwnershipManifestSha256: process.env.R1C14_S2_MANIFEST_SHA256 }, provenance: { platform: { os: process.platform, arch: process.arch }, baseImage: "node@sha256:be23f54a88d34e8824c741b19b91064094f92c1c97b194144bfc8b50d67258e2", imageIndexDigest: process.env.R1C14_IMAGE_ID, linuxAmd64ManifestDigest: process.env.R1C14_IMAGE_MANIFEST_DIGEST, buildMetadataSha256: process.env.R1C14_BUILD_METADATA_SHA256, buildRecipeSha256: protocolDigests.Dockerfile, rootfsLayers, rootfsClosureSha256: process.env.R1C14_EXPECTED_ROOTFS_CLOSURE, dependencyClosureSha256: process.env.R1C14_EXPECTED_DEPENDENCY_CLOSURE, executable: { path: git, execPath: gitRun(["--exec-path"]).stdout.trim(), version: gitVersion, sha256: gitSha256, buildFlags, buildOptions }, source: { version: "2.55.0", archiveSha256: "457fdb04dc8728e007d4688695e6912e6f680727920f2a40bf11eacc17505357", signatureSha256: "8673501946204c38ebfed09603c1f3a041ed8d12b31f0aa06a474d41e359e254", releasePrimaryKeyFingerprint: "96E07AF25771955980DAD10020D04E5A713660A7", releaseSigningSubkeyFingerprint: "E1F036B1FEE7221FC778ECEFB0B5E88696AFE6CB" }, packages }, protocolDigests, checks, secretScan: { roots: secretScanRoots, scannedFileCount: scannedFiles.length, contaminatedFileCount: contaminatedFiles.length }, cleanup: { temporaryRootRemoved: true, serverStopped, requestLogSecretAbsent, secretCanaryAbsent } };
  assert.equal(JSON.stringify(candidate).includes(secretCanary), false); await mkdir(dirname(candidatePath), { recursive: true }); await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
}
await main();
