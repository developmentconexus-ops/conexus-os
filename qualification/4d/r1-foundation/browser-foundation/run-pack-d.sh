#!/usr/bin/env bash
set -euo pipefail

DOCKER='/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe'
SOURCE_ROOT=/mnt/c/Users/leandro.theodoro/Documents/conexus-os/qualification/4d/r1-foundation
SOURCE_ROOT_WIN=$(wslpath -w "$SOURCE_ROOT")
IMAGE_TAG=conexus-r1f-playwright:1.62.1-node24.20.0
EXPECTED_IMAGE_ID=sha256:fd3b87c0e3ccb67da347e896702fbce1ab7f01d6875a6f2a2faa3839d4dff23b

"$DOCKER" build \
  --provenance=false \
  --file "$SOURCE_ROOT_WIN\\browser-foundation\\playwright-node24.Dockerfile" \
  --tag "$IMAGE_TAG" \
  "$SOURCE_ROOT_WIN\\browser-foundation"

IMAGE_ID=$("$DOCKER" image inspect --format '{{.Id}}' "$IMAGE_TAG")
if [ "$IMAGE_ID" != "$EXPECTED_IMAGE_ID" ]; then
  printf 'unadmitted Playwright qualification image\n' >&2
  exit 1
fi
"$DOCKER" run --rm \
  --name conexus-r1f-pack-d \
  --ipc=host \
  --shm-size=1gb \
  --user pwuser \
  --tmpfs /work:rw,exec,mode=1777,size=2147483648 \
  --mount "type=bind,src=$SOURCE_ROOT_WIN,dst=/source,readonly" \
  "$IMAGE_ID" bash /source/browser-foundation/run-inside.sh

printf 'image-id=%s\ncontainer=removed\n' "$IMAGE_ID"
