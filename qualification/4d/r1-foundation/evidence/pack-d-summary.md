# R1 Foundation Pack D summary

Status: **PASS / P08 GREEN / CHROMIUM+FIREFOX+WEBKIT 12/12**

A minimal React `19.2.8` + Vite `8.2.2` + TanStack Router/Query fixture built
inside an exact Playwright `1.62.1` container with admitted Node `24.20.0` and
npm `12.0.2`. Vite emitted a manifest and hashed JS/CSS assets. The synthetic
server secret and server-only Project/Workspace grant identities were absent
from all browser bytes.

The HTTPS fixture issued an opaque `HttpOnly`, `Secure`, `SameSite=Lax` cookie
and a server-controlled CSRF token. URL/search/localStorage changes remained
references only. A deliberately forged TanStack Query cache could change local
pixels, but the server denied the command, mutation count remained unchanged and
refetch restored `Access denied`. Missing Origin/Fetch-Metadata/CSRF and a second
HTTPS origin also could not mutate.

The same four paths passed in Chromium, Firefox and WebKit. The first cold
Firefox launch exposed a navigation timing issue; waiting for `DOMContentLoaded`
under a 60-second browser-start envelope removed the fixture flake without
weakening a security assertion.

All containers, tmpfs installs/builds, certificates, keys and browser profiles
were removed. Only exact removable image caches remain. This is qualification
harness code, not Product frontend implementation.
