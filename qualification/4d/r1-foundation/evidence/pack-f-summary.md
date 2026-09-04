# R1 Foundation Pack F summary

Status: **PASS / P11+P12 GREEN / P01..P12 ALL GREEN**

Two clean deciding Linux installs reproduced the exact Pack-A tree SHA-256
`5f276d1cfa0f6c1b199230c9bf5553ca98fa9a8ebe5ca7d6477dcc7decf9ec57`.
The lock contains 37 optional packages: four are installed in Linux x64 and 33
are absent. Six Windows and eight macOS candidates are recorded as explicit,
non-authoritative developer-host deltas.

Seven independent gates each proved both directions: Biome, TypeScript, Vite,
Node test, bounded Ajv, Redocly and Playwright Chromium. Every defective fixture
returned non-zero; every clean fixture returned zero. The first clean Biome and
Redocly fixtures themselves fired RED until corrected, demonstrating the harness
was not hardcoded to claim success.

The container, two clean installs, build outputs and browser profiles were
destroyed with tmpfs. Exact removable image caches remain. Pack F completes the
operator-approved R1 Foundation probe batch; Product implementation authority
remains zero.
