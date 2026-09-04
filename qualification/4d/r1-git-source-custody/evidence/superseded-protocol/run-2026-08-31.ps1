$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$qualificationRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = (Resolve-Path (Join-Path $qualificationRoot "..\..\..")).Path
$evidenceRoot = Join-Path $qualificationRoot "evidence"
$workRoot = Join-Path $env:TEMP "conexus-r1c14-work"
$imageTag = "conexus-r1c14-git:2.55.0-qualified"
$expectedIndex = "sha256:44ad647a10c0a9659e3cfebb28e6b384ac8af15ac53fc2d0cd662cd30d7817b0"
$expectedManifest = "sha256:800f870caa890432f5955cf2c4545af3ead7f3cd6bcc74b419cfd9934e8876e2"
$expectedMetadataSha = "bd2f37cf76a7307a1d66bee226708386573f75c48c14d9d2304d8a414e384531"
$expectedGitSha = "b5d1f9f76f9805ce8721accc9d8bbff9af9b7407e182ab07a5677dafa6c22201"
$expectedRootfs = '["sha256:cd482426e5675a31e31f2bddad58815b83b309a587bf56b46a308586d9fd6eb5","sha256:ffc8aa3c6d1eee538ec70f1c9d749b8bebe8f016bfd4b16ee45c623c9cffa402","sha256:74a032b83597c9456f0d3bc320e33b56a52127ce0027d313a80e31a32ab99a42","sha256:3ae67b6c3bdf10cd6600d5cf69601a33d304b74372b690fd736562f67d3a5f41","sha256:491a4b8c316a73dbfd8d1abe2130d70284801ce8255206f900037604a931e18d","sha256:fbfe4a3372927cee81452ee2d3d853b3be07ad478a74b074a6941b11afaad5e8","sha256:30f8742377fe325048abf083d2c3f3735e5f72a1ed038dc01bccf9bbd0316db4","sha256:f6a9135a676c69f7066d1c4ac8803ddf6dc4eb696c8b60d95ae22b3cb3c82303","sha256:458737e3c4a90b3966469eb8656979a20ce80c8276ce27adeb6ea4f656c20338","sha256:1f392afba4c254b4f4c245947b33faa3a2e085de058b5508875e2122c6f9d234","sha256:d4786ca09bd818b5ffdadd91cc50258840223232af3cd38085114bbc689ccec9","sha256:9075cdde0cadf69abaac874fe6227931def74901a9b02c748c3f468ffd1acab7","sha256:0fa0bf75999c479b0103a0c483a415a27c4186576a7cb2377a85280fef957dc6","sha256:661d428e5ce33b092ac7ceaebeb579bf31596df64e26376fdef990aefa6fa79f"]'
$expectedRootfsClosure = "737d2733325ab0d6c49e102d16dc4892c5ca35a92dffe6c838dbe77c44f93fba"
$expectedDependencyClosure = "07ddbd90e07c40f18482f4cbf35c0587d6197b5e7563b96062d00ae86784959c"
$expectedCheckIds = @("PIN", "PIN_NEGATIVE", "BUILD_OPTIONS", "NEW", "CAS", "ISOLATION", "EXISTING_GIT", "PROTOCOL", "REDIRECT", "MISSING_REF", "PARTIAL", "CREDENTIAL_CONFIG", "BUNDLE_NEW", "CORRUPT_BUNDLE", "BUNDLE_EXISTING_GIT") | ConvertTo-Json -Compress
$candidatePath = Join-Path $evidenceRoot "candidate-results.json"
$resultPath = Join-Path $evidenceRoot "results.json"
$preCensusPath = Join-Path $evidenceRoot "product-census-before.json"
$postCensusPath = Join-Path $evidenceRoot "product-census-after.json"
$metadataPath = Join-Path $evidenceRoot "build-metadata.json"

New-Item -ItemType Directory -Force -Path $evidenceRoot, $workRoot | Out-Null
Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $candidatePath, $resultPath, $preCensusPath, $postCensusPath

$index = docker image inspect $imageTag --format "{{.Id}}"
if ($LASTEXITCODE -ne 0) { throw "R1C-14 image inspect failed" }
$manifest = docker image inspect --platform linux/amd64 $imageTag --format "{{.Id}}"
if ($LASTEXITCODE -ne 0) { throw "R1C-14 Linux manifest inspect failed" }
$rootfs = docker image inspect --platform linux/amd64 $imageTag --format "{{json .RootFS.Layers}}"
if ($LASTEXITCODE -ne 0) { throw "R1C-14 rootfs inspect failed" }
$metadataSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $metadataPath).Hash.ToLowerInvariant()
if ($index -ne $expectedIndex) { throw "R1C-14 image-index pin mismatch" }
if ($manifest -ne $expectedManifest) { throw "R1C-14 linux/amd64 manifest pin mismatch" }
if ($rootfs -ne $expectedRootfs) { throw "R1C-14 exact rootfs layer closure mismatch" }
if ($metadataSha -ne $expectedMetadataSha) { throw "R1C-14 provenance metadata pin mismatch" }
if (Select-String -Quiet -SimpleMatch -LiteralPath $metadataPath -Pattern "vcs:revision") { throw "R1C-14 uncommitted recipe falsely claims VCS revision" }

docker run --rm --platform linux/amd64 --entrypoint node --volume "${qualificationRoot}:/qualification:ro" $imageTag --test /qualification/admission.test.mjs
if ($LASTEXITCODE -ne 0) { throw "R1C-14 admission unit suite failed" }

node (Join-Path $qualificationRoot "product-census.mjs") --root $repositoryRoot --output $preCensusPath | Out-Null
if ($LASTEXITCODE -ne 0) { throw "R1C-14 Product pre-census failed" }
$syntheticSecret = "R1C14_SYNTHETIC_" + ([Guid]::NewGuid().ToString("N")) + ([Guid]::NewGuid().ToString("N"))
$secretFile = Join-Path $workRoot "synthetic-secret"
[System.IO.File]::WriteAllText($secretFile, $syntheticSecret, [System.Text.UTF8Encoding]::new($false))

docker run --rm --platform linux/amd64 --entrypoint node `
  --env "R1C14_IMAGE_ID=$expectedIndex" `
  --env "R1C14_IMAGE_MANIFEST_DIGEST=$expectedManifest" `
  --env "R1C14_BUILD_METADATA_SHA256=$expectedMetadataSha" `
  --env "R1C14_EXPECTED_GIT_SHA256=$expectedGitSha" `
  --env "R1C14_ROOTFS_LAYERS=$rootfs" `
  --env "R1C14_EXPECTED_ROOTFS_CLOSURE=$expectedRootfsClosure" `
  --env "R1C14_EXPECTED_DEPENDENCY_CLOSURE=$expectedDependencyClosure" `
  --env "R1C14_SYNTHETIC_SECRET_FILE=/work/synthetic-secret" `
  --env "R1C14_S2_RECEIPT_SHA256=f505e67f1e31f2f94ab7268e31dee6882f5e0d58975b878f3e2ecbdb8aa487e7" `
  --env "R1C14_S2_MANIFEST_SHA256=f3a132e9ab3ef6e682ebf25da73f0318e2a55b74c53557d1957241fe2b6d1242" `
  --env "R1C14_WORK_ROOT=/work/r1c14" `
  --env "R1C14_CANDIDATE_PATH=/evidence/candidate-results.json" `
  --volume "${qualificationRoot}:/qualification:ro" `
  --volume "${evidenceRoot}:/evidence" `
  --volume "${workRoot}:/work" `
  $imageTag /qualification/probe.mjs
if ($LASTEXITCODE -ne 0) { throw "R1C-14 probe failed" }

node (Join-Path $qualificationRoot "product-census.mjs") --root $repositoryRoot --output $postCensusPath | Out-Null
if ($LASTEXITCODE -ne 0) { throw "R1C-14 Product post-census failed" }
$env:R1C14_SYNTHETIC_SECRET = $syntheticSecret
node (Join-Path $qualificationRoot "finalize-result.mjs") --candidate $candidatePath --final $resultPath --pre-census $preCensusPath --post-census $postCensusPath --expected-check-ids $expectedCheckIds | Out-Null
if ($LASTEXITCODE -ne 0) { throw "R1C-14 result finalization failed" }
Remove-Item Env:R1C14_SYNTHETIC_SECRET
$syntheticSecret = $null

if (Get-ChildItem -Force -LiteralPath $workRoot) { throw "R1C-14 temporary root is not empty after probe" }
