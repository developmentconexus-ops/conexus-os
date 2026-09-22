#!/usr/bin/env bash
# Build the Conexus Keycloakify theme and install it into the running
# pilot container (conexus-s7-keycloak). Read infra/keycloak/README.md
# first: this touches the running container (jar copy + restart) but
# never its database or other worktrees.
#
# Usage:
#   infra/keycloak/install-theme.sh install   # build, mount, set theme, restart (default)
#   infra/keycloak/install-theme.sh revert    # unset theme, remove jar, restart
#
# Requires on PATH: docker, node/npm (repo's Node 24.20.0), and for
# `install` a JDK 17+ and Maven (keycloakify build shells out to `mvn`).
# If you don't have Maven/a JDK installed system-wide, install a local
# copy with no sudo the same way this branch's session did:
#   curl -fsSL -o /tmp/maven.tar.gz.sha512 https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz.sha512
#   curl -fsSL -o /tmp/maven.tar.gz https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz
#   echo "$(cat /tmp/maven.tar.gz.sha512)  /tmp/maven.tar.gz" | sha512sum -c -
#   mkdir -p ~/.local/opt && tar xzf /tmp/maven.tar.gz -C ~/.local/opt && mv ~/.local/opt/apache-maven-3.9.9 ~/.local/opt/maven
#   # JDK 21 (Temurin), verified against Adoptium's published sha256:
#   curl -fsSL -o /tmp/jdk.tar.gz 'https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk'
#   mkdir -p ~/.local/opt && tar xzf /tmp/jdk.tar.gz -C ~/.local/opt && mv ~/.local/opt/jdk-* ~/.local/opt/jdk
#   export PATH="$HOME/.local/opt/maven/bin:$HOME/.local/opt/jdk/bin:$PATH" JAVA_HOME="$HOME/.local/opt/jdk"

set -euo pipefail

CONTAINER="conexus-s7-keycloak"
REALM="r1f"
THEME_NAME="conexus"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
THEME_DIR="$REPO_ROOT/apps/keycloak-theme"
JAR_NAME="keycloak-theme-for-kc-all-other-versions.jar"
PROVIDER_JAR="conexus-keycloak-theme.jar"

action="${1:-install}"

require_container() {
  if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "error: container $CONTAINER is not running. This script only touches an already-running pilot." >&2
    exit 1
  fi
}

kcadm() {
  # Auth comes from the container's own bootstrap admin env vars
  # (KC_BOOTSTRAP_ADMIN_USERNAME / KC_BOOTSTRAP_ADMIN_PASSWORD); nothing
  # is typed or stored outside the container.
  docker exec "$CONTAINER" bash -lc '
    /opt/keycloak/bin/kcadm.sh config credentials \
      --server http://localhost:8080 --realm master \
      --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
    /opt/keycloak/bin/kcadm.sh '"$*"'
  '
}

do_install() {
  require_container

  echo "==> Building the theme jar"
  ( cd "$THEME_DIR" && npm ci && npm run build-keycloak-theme )

  local jar_path="$THEME_DIR/dist_keycloak/$JAR_NAME"
  if [ ! -f "$jar_path" ]; then
    echo "error: expected jar not found at $jar_path" >&2
    exit 1
  fi

  echo "==> Copying the jar into $CONTAINER:/opt/keycloak/providers/"
  docker cp "$jar_path" "$CONTAINER:/opt/keycloak/providers/$PROVIDER_JAR"

  echo "==> Setting realm '$REALM' loginTheme=$THEME_NAME and enabling pt-BR"
  kcadm "update realms/$REALM -s loginTheme=$THEME_NAME -s internationalizationEnabled=true -s 'supportedLocales=[\"pt-BR\"]' -s defaultLocale=pt-BR"

  echo "==> Restarting $CONTAINER to pick up the new provider jar"
  docker restart "$CONTAINER" >/dev/null

  echo "==> Done. https://hub.conexus.localhost:8443/realms/$REALM/account should now render the Conexus theme."
}

do_revert() {
  require_container

  echo "==> Unsetting realm '$REALM' loginTheme (falls back to Keycloak's built-in default)"
  kcadm "update realms/$REALM -s loginTheme=" || true

  echo "==> Removing the provider jar from $CONTAINER"
  docker exec "$CONTAINER" rm -f "/opt/keycloak/providers/$PROVIDER_JAR"

  echo "==> Restarting $CONTAINER"
  docker restart "$CONTAINER" >/dev/null

  echo "==> Reverted."
}

case "$action" in
  install) do_install ;;
  revert) do_revert ;;
  *)
    echo "usage: $0 [install|revert]" >&2
    exit 1
    ;;
esac
