#!/usr/bin/env bash
# Export a whole Keycloak realm, people and password hashes included, into one file, for the daily backup.
# The running container is never stopped or modified: its H2 database file is copied out and exported
# offline by a throwaway container of the same image, as export-users.sh does.
#
# Usage:
#   infra/keycloak/export-realm.sh --from-container conexus-keycloak --from-realm conexus --out <file>
#
# The output holds password hashes. It is written with mode 600.

set -euo pipefail

IMAGE="quay.io/keycloak/keycloak@sha256:c2a17fe407e892196d0b7cf9cef54e60952d6c372a9205f661a9efa0911463b0"
from_container=""
from_realm=""
out=""

usage() { echo "usage: $0 --from-container <name> --from-realm <realm> --out <file>" >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --from-container) from_container="${2:-}"; shift 2 ;;
    --from-realm) from_realm="${2:-}"; shift 2 ;;
    --out) out="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$from_container" ] && [ -n "$from_realm" ] && [ -n "$out" ] || usage
[ ! -e "$out" ] || { echo "REALM_EXPORT_OUT_EXISTS" >&2; exit 1; }

umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/h2" "$work/export"
docker cp "$from_container:/opt/keycloak/data/h2/keycloakdb.mv.db" "$work/h2/keycloakdb.mv.db" \
  || { echo "REALM_EXPORT_COPY_FAILED" >&2; exit 1; }

docker run --rm --user "$(id -u):0" -v "$work/h2:/opt/keycloak/data/h2" -v "$work/export:/export" "$IMAGE" \
  export --realm "$from_realm" --users same_file --file /export/realm.json >/dev/null \
  || { echo "REALM_EXPORT_FAILED" >&2; exit 1; }

install -m 600 "$work/export/realm.json" "$out"
