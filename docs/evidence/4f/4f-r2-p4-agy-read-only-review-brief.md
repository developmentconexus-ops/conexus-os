# P4 review — permitted read-only command form

Use the exact subject, authority route, claims and output contract in
[`4f-r2-p4-authority-review-brief.md`](4f-r2-p4-authority-review-brief.md).
Implementation subject remains `9c99384` relative to `d2f18f9`; later commits
contain only review orientation. No other review output is supplied.

The first AGY headless attempt returned no review because a command permission
could not be prompted. Existing host permissions already admit repository
`read_file`, standalone `pwd`, `rg`, `sed`, `cat`, `ls`, `head`, `tail`,
`sha256sum`, and `git status/diff/rev-parse/ls-files/log/show/grep/branch/remote/rev-list`.
Use native file reads or those already-permitted standalone commands from the
existing repository working directory. Do not prefix them with `cd`, shell
launchers, environment assignments or other compound shell operations. Do not
fetch, run suites, request new permissions or change settings. If a necessary
read remains denied, report the exact unavailable observation as UNKNOWN.

This is a retry of the same incomplete lane under existing restrictions, not
a second challenge round. Remain in plan mode and sandbox; no writes or effects.
