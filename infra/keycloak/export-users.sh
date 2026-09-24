#!/usr/bin/env bash
# Export the people of a Keycloak realm, with their password hashes, into a file for provision.sh --users-file.
# The running container is never stopped or modified: its H2 database file is copied out and exported
# offline by a throwaway container of the same image, as the README describes.
#
# Usage:
#   infra/keycloak/export-users.sh --from-container conexus-s7-keycloak --from-realm r1f --out <file>
#
# The output holds password hashes. It is written with mode 600 and must stay outside the repository.
# Every person gets the realm's default role and nothing else: no Keycloak role authorizes anything in
# Conexus (C-015), and the old realm's own roles are not carried over.

set -euo pipefail

IMAGE="quay.io/keycloak/keycloak@sha256:c2a17fe407e892196d0b7cf9cef54e60952d6c372a9205f661a9efa0911463b0"
NEW_REALM="conexus"
from_container=""
from_realm=""
out=""

while [ $# -gt 0 ]; do
  case "$1" in
    --from-container) from_container="$2"; shift 2 ;;
    --from-realm) from_realm="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    *) echo "usage: $0 --from-container <name> --from-realm <realm> --out <file>" >&2; exit 2 ;;
  esac
done
[ -n "$from_container" ] && [ -n "$from_realm" ] && [ -n "$out" ] || { echo "usage: $0 --from-container <name> --from-realm <realm> --out <file>" >&2; exit 2; }
case "$(cd "$(dirname "$out")" && pwd)/" in
  "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"/*) echo "error: --out must be outside the repository" >&2; exit 1 ;;
esac

# The copy of the database and the export hold password hashes: they stay private to this user, and the
# throwaway container runs as this user (group 0, which the Keycloak image grants its own directories).
umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/h2" "$work/export"
docker cp "$from_container:/opt/keycloak/data/h2/keycloakdb.mv.db" "$work/h2/keycloakdb.mv.db"

docker run --rm --user "$(id -u):0" -v "$work/h2:/opt/keycloak/data/h2" -v "$work/export:/export" "$IMAGE" \
  export --realm "$from_realm" --users same_file --file /export/realm.json >/dev/null

CX_OLD="$from_realm" CX_NEW="$NEW_REALM" node -e '
  const fs = require("node:fs")
  const realm = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  const users = (realm.users ?? []).map(({ realmRoles: _roles, clientRoles: _clientRoles, groups: _groups, ...user }) => ({
    ...user,
    realmRoles: [`default-roles-${process.env.CX_NEW}`],
  }))
  fs.writeFileSync(process.argv[2], JSON.stringify(users), { mode: 0o600 })
  console.log(`Exported ${users.length} people from ${process.env.CX_OLD}: ${users.map((user) => user.username).join(", ")}`)
' "$work/export/realm.json" "$out"
