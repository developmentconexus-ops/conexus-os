#!/usr/bin/env python3
"""Idempotently set KEY=VALUE pairs in the Supabase docker/.env file.
Rerunnable: replaces existing keys, appends missing ones. No shell quoting
involved, so JWKS/JSON values with '/', '+', '$' are safe.
"""
import sys

env_path = sys.argv[1]
pairs_path = sys.argv[2]

with open(pairs_path, encoding="utf-8") as f:
    pairs = dict(
        line.rstrip("\n").split("=", 1)
        for line in f
        if line.strip() and not line.startswith("#")
    )

with open(env_path, encoding="utf-8") as f:
    lines = f.readlines()

seen = set()
out = []
for line in lines:
    stripped = line.rstrip("\n")
    if "=" in stripped and not stripped.startswith("#"):
        key = stripped.split("=", 1)[0]
        if key in pairs:
            out.append(f"{key}={pairs[key]}\n")
            seen.add(key)
            continue
    out.append(line)

for key, value in pairs.items():
    if key not in seen:
        out.append(f"{key}={value}\n")

with open(env_path, "w", encoding="utf-8") as f:
    f.writelines(out)

print(f"patched {len(pairs)} keys ({len(seen)} replaced, {len(pairs) - len(seen)} appended)")
