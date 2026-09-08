# RB — exact source inspection stage code packet

Status: `CANDIDATE / TARGETED + POSTGRESQL + OCI + CHROMIUM GREEN / GPT-6 ASTRA REVIEW CLEAR / NOT YET PUBLISHED`

## Observable outcome and invariant

From the existing Project Build experience, a user with source-read authority
can choose the exact accepted source or current Change result, browse its tree
and read a complete textual file. Every response remains bound to one
`Project + sourceRevision + path`; possessing a Git SHA is not authorization.

```text
current Project + disclosed Change diff
-> choose exact base A or admitted result B/C
-> Hub rechecks project.source.read and Project/revision lineage
-> read-only, networkless OCI Git reader opens that immutable object
-> Product displays exact revision, tree and full text

foreign SHA / revoked authority / hostile path / symlink / binary / oversized
-X-> source disclosure
```

## Exact envelope

- Realize only `BLD-08 ListProjectSourceTree` and `BLD-09 GetProjectSourceFile` over the
  existing Project/Build surface and canonical Builder semantics.
- Admit the current approved Baseline revision and source revisions durably
  produced by Changes in the same Project, including an earlier rejected
  candidate retained in immutable WorkUnit lineage.
- Keep authorization in the Hub. The guest receives no account identity,
  credential, Hub database capability, Git remote write authority or state
  transition capability.
- Use the already admitted pinned R1 Git OCI image with a read-only repository
  mount, no network, all capabilities dropped and `no-new-privileges`.
- Return only safe literal regular files. Refuse unsafe paths, non-file entries,
  invalid UTF-8, NUL/binary content, files above 1 MiB and trees above 10,000
  files instead of truncating or inventing content.
- Key frontend reads by `Project + revision + path`, so a late response for B
  cannot replace the visible file from C.

## Material falsifiers

1. SHA possession discloses a foreign Project revision;
2. `project.source.read` revocation still permits a new read;
3. guest execution receives authority or secret-bearing caller context;
4. the reader mutates the repository, uses the network or follows a symlink;
5. a path expression resolves bytes other than the exact literal path;
6. candidate correction silently relabels B bytes as C;
7. binary/oversized content is silently truncated or decoded;
8. the Product exposes backend/runtime machinery instead of code and revision.

## Current Evidence

- PR #69 was squash-merged as `51677d73f865f0856a63bb802ff57ed59e8a0ed5`;
  post-merge Verify run `34280265609` is GREEN.
- Targeted Hub/Web typechecks, Biome, HTTP/service tests and two Chromium user
  journeys are GREEN on the working candidate.
- PostgreSQL 17 migration `001..022` is GREEN, including Baseline/current/old
  correction revision admission and foreign/revoked/executor refusals.
- The exact OCI source custody proof is GREEN in `87.7 s`: A/B trees and files
  retain exact identities; deleted and hostile paths refuse; a six-file tree
  with more than 10,000 expanded ancestors refuses without a partial result.
- GPT-6 Astra found one P2 resource-amplification gap in the first candidate.
  Total entry and disclosure-byte budgets plus the deep-tree negative control
  corrected it; bounded re-review is `CLEAR` with no other material finding.
- The clean Linux floor is GREEN: `npm ci`, Chromium installation and
  `npm run verify`, including the complete Builder and repository/wire checks.

## Deferred safely

`BLD-05` non-DIRECT plan editing, `BLD-10` executable Preview, `BLD-16`
contextual interaction, Product-Agent `BLD-18..20`, concurrent writers, ACP,
runtime tournaments, generic eval/telemetry, R3, Release and deployment remain
outside this increment. Preview is next only after its larger untrusted-app
serving/browser boundary is deliberately admitted.
