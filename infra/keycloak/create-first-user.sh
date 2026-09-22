#!/usr/bin/env bash
# Create the first person of a new installation in Keycloak and make them the Hub's bootstrap
# identity. Their first sign-in lands on /setup, which creates their Account and makes it the
# installation administrator.
#
# Usage:
#   infra/keycloak/create-first-user.sh --email you@company.com --name "Your Name" [--hub-env path/to/hub.env]
#
# The password is typed at the prompt, never passed as an argument or written anywhere. It is
# temporary: Keycloak asks for a new one at the first sign-in. With --hub-env, the new user's id
# replaces CONEXUS_BOOTSTRAP_SUBJECT there; restart the Hub afterwards.
#
# Environment: KEYCLOAK_CONTAINER (default conexus-s7-keycloak), KEYCLOAK_REALM (default r1f).

set -euo pipefail

CONTAINER="${KEYCLOAK_CONTAINER:-conexus-s7-keycloak}"
REALM="${KEYCLOAK_REALM:-r1f}"
email=""
name=""
hub_env=""

while [ $# -gt 0 ]; do
  case "$1" in
    --email) email="$2"; shift 2 ;;
    --name) name="$2"; shift 2 ;;
    --hub-env) hub_env="$2"; shift 2 ;;
    *) echo "usage: $0 --email <email> --name <name> [--hub-env <path>]" >&2; exit 2 ;;
  esac
done
[ -n "$email" ] && [ -n "$name" ] || { echo "usage: $0 --email <email> --name <name> [--hub-env <path>]" >&2; exit 2; }
[ -z "$hub_env" ] || [ -f "$hub_env" ] || { echo "error: $hub_env not found" >&2; exit 1; }
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "error: container $CONTAINER is not running" >&2; exit 1; }

kcadm() {
  # Admin auth comes from the container's own KC_BOOTSTRAP_ADMIN_* variables, as in install-theme.sh.
  docker exec -i "$CONTAINER" bash -c '
    /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master \
      --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
    /opt/keycloak/bin/kcadm.sh "$@"
  ' kcadm "$@"
}

existing=$(kcadm get users -r "$REALM" -q "email=$email" -q exact=true --fields id --format csv --noquotes </dev/null)
if [ -n "$existing" ]; then
  echo "error: realm $REALM already has a user with $email" >&2
  exit 1
fi

read -rsp "Senha temporária para $email: " password; echo
read -rsp "Repita a senha: " confirm; echo
[ -n "$password" ] || { echo "error: empty password" >&2; exit 1; }
[ "$password" = "$confirm" ] || { echo "error: passwords differ" >&2; exit 1; }
unset confirm

user_json=$(CX_EMAIL="$email" CX_NAME="$name" CX_PASSWORD="$password" node -e '
  const [firstName, ...rest] = process.env.CX_NAME.trim().split(/\s+/)
  process.stdout.write(JSON.stringify({
    username: process.env.CX_EMAIL, email: process.env.CX_EMAIL, emailVerified: true, enabled: true,
    firstName, lastName: rest.join(" "),
    credentials: [{ type: "password", value: process.env.CX_PASSWORD, temporary: true }],
  }))')
unset password

subject=$(printf '%s' "$user_json" | kcadm create users -r "$REALM" -f - -i)
unset user_json
echo "Criado em $REALM: $email (id $subject)"

if [ -n "$hub_env" ]; then
  if grep -q '^CONEXUS_BOOTSTRAP_SUBJECT=' "$hub_env"; then
    sed -i "s/^CONEXUS_BOOTSTRAP_SUBJECT=.*/CONEXUS_BOOTSTRAP_SUBJECT=$subject/" "$hub_env"
  else
    printf 'CONEXUS_BOOTSTRAP_SUBJECT=%s\n' "$subject" >> "$hub_env"
  fi
  echo "CONEXUS_BOOTSTRAP_SUBJECT atualizado em $hub_env. Reinicie o Hub."
else
  echo "Coloque CONEXUS_BOOTSTRAP_SUBJECT=$subject no hub.env e reinicie o Hub."
fi
