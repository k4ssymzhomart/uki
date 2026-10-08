#!/usr/bin/env bash
# Which development-only code a desktop build carries. Reads apps/desktop/out, the output of the last
# `electron-vite build`, and fails unless the build holds exactly its variant's extras:
#
#   production  `dist`, every shipped build   none: no developer overlay, no synthetic camera, no smoke marker
#   lab         `dist:lab`, the lab zip       the developer overlay only
#   smoke       `dist:smoke`, the smoke zip   the developer overlay, the synthetic camera and the smoke marker
#
# Each extra is behind Vite's build mode, a constant, so a production build must not even bundle it; no
# runtime flag can turn it on. The markers are strings in the code itself, so they survive minification:
#
#   overlay           "phone/s", a row label of src/renderer/overlay/overlay-panel.tsx
#   synthetic camera  "synthetic camera: no 2d context", thrown in src/renderer/integration/synthetic-camera.ts,
#                     and its pictures, assets named uki-evidence-*
#   smoke marker      "SMOKE BUILD": the label of src/renderer/overlay/smoke-marker.dev.tsx in the renderer and
#                     the window title in src/main/index.ts
#
# Run by the CI Windows and macOS jobs and by desktop-dist.yml after each build:
#
#   bash .github/scripts/desktop-variant-check.sh production|lab|smoke [apps/desktop/out]
set -euo pipefail

variant="${1:-}"
out="${2:-apps/desktop/out}"
case "$variant" in
  production) want_overlay=0 want_camera=0 want_marker=0 ;;
  lab) want_overlay=1 want_camera=0 want_marker=0 ;;
  smoke) want_overlay=1 want_camera=1 want_marker=1 ;;
  *)
    echo "usage: desktop-variant-check.sh production|lab|smoke [out folder]" >&2
    exit 2
    ;;
esac
for part in main preload renderer; do
  if [ ! -d "$out/$part" ]; then
    echo "::error::no $out/$part: run electron-vite build first"
    exit 1
  fi
done

# 1 when the text is anywhere under the folder, else 0.
has_text() { if grep -rqF -- "$2" "$1"; then echo 1; else echo 0; fi; }
has_file() { if [ -n "$(find "$1" -name "$2" -print -quit)" ]; then echo 1; else echo 0; fi; }

failures=0
expect() {
  local what="$1" want="$2" found="$3"
  if [ "$want" = "$found" ]; then
    if [ "$found" = 1 ]; then echo "$variant build: $what present, as it should be"; else echo "$variant build: no $what"; fi
  else
    if [ "$want" = 1 ]; then
      echo "::error::the $variant build has no $what"
    else
      echo "::error::the $what is in the $variant build"
    fi
    failures=$((failures + 1))
  fi
}

expect "developer overlay (phone/s)" "$want_overlay" "$(has_text "$out/renderer" "phone/s")"
expect "synthetic camera's code" "$want_camera" "$(has_text "$out/renderer" "synthetic camera: no 2d context")"
expect "synthetic camera's pictures (uki-evidence-*)" "$want_camera" "$(has_file "$out/renderer" "uki-evidence-*")"
expect "smoke marker in the renderer (SMOKE BUILD)" "$want_marker" "$(has_text "$out/renderer" "SMOKE BUILD")"
expect "smoke window title in the main process (SMOKE BUILD)" "$want_marker" "$(has_text "$out/main" "SMOKE BUILD")"
# The preload never carries any of them.
expect "smoke marker in the preload" 0 "$(has_text "$out/preload" "SMOKE BUILD")"

if [ "$failures" -gt 0 ]; then
  echo "desktop-variant-check: $failures problem(s) in the $variant build ($out)"
  exit 1
fi
echo "desktop-variant-check: the $variant build carries exactly its own extras"
