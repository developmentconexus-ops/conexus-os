// The exact tree Git materializes for a new (not imported) Project source: object
// class, path, digest and base64 bytes for every file, plus the tree/commit ids
// project/git-execution.ts must produce. Ordinary checked-in source; changing what
// a new Project's Git history contains means editing this file directly.
//
// This used to ship a copy of Conexus's own internal R1 operation ledger and
// platform contract into every new customer Project's Git history: files the
// Builder (apps/hub/src/builder/source.ts) never reads and has no format
// expectation for. That coupling is retired along with the R1 apparatus that
// produced those files. The seed now carries a single, self-authored README so
// stageNewProjectSource has a deterministic non-empty tree to write.
export const R1_NEW_PROJECT_SEED = {
  "kind": "conexus.r1-s3-new-project-seed/v1",
  "appOwnedPathCount": 0,
  "expectedTree": "912c26f3049eec45dbe279be0f21859d75c22fef",
  "expectedSourceRevision": "238dd5dbfee3d30b97d9a856e0ba83d6e3cb02d3",
  "entries": [
    {
      "class": "GENERATED",
      "path": "README.md",
      "sha256": "06ef132259c8a5503783204883ed7ea9b37afc8594892d4d239cafc0c475f765",
      "bytesBase64": "IyBOZXcgQ29uZXh1cyBwcm9qZWN0CgpUaGlzIHJlcG9zaXRvcnkgd2FzIGNyZWF0ZWQgYnkgQ29uZXh1cyBPUyBmb3IgYSBuZXcgUHJvamVjdC4gUHVzaCB5b3VyCmFwcGxpY2F0aW9uIHNvdXJjZSB0byBpdCB0byBnZXQgc3RhcnRlZDsgdGhlIEJ1aWxkZXIgcmVhZHMgd2hhdGV2ZXIgaXMgaGVyZS4K"
    }
  ]
} as const
