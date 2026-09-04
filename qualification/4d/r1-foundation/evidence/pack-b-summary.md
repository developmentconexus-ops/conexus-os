# R1 Foundation Pack B summary

Status: **PASS / P03+P04 GREEN / BOUNDED COMPILER MECHANICS GREEN**

Strict admission rejected invalid UTF-8, BOM, duplicate keys, comments, trailing
commas, lone surrogates, unsafe/floating numbers and schema violations before
canonicalization. The RFC 8785 sample reproduced the exact published UTF-8 bytes
with SHA-256 `2d5e01a318d0f0879ab568c4be289c8b1f64ef8921a53c6277d5e069978baacb`.

The fixture-only compiler produced stable profile/input/input-set/manifest/tree/
plan/receipt digests. It preserved edited APP-OWNED bytes, rejected protected
drift and ignored-path collisions, rejected symlink escape and cross-platform
unsafe/colliding paths, detected a forged/stale plan, preserved a foreign writer
lock and left the active receipt unchanged after injected partial failure.

This is qualification harness code, not Product or production compiler code. It
does not claim crash-atomic multi-file application, duplication, distributed-
asset/wire conformance or closure of every `RF01-P01..P14` obligation.
