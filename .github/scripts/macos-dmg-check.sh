#!/usr/bin/env bash
# The macOS dmg check (P.12 in docs/phase-1-plan.md), run by the CI macOS job after electron-builder.
# For each dmg in apps/desktop/release it mounts the image read-only, checks that Uki.app's executable is
# built for the architecture in the dmg's name (arm64, or x64 = x86_64), starts the app from the image
# (the x64 one under Rosetta 2) and checks that it still runs after LAUNCH_SECONDS (20), then stops it and
# detaches the image. With a folder as $1 it also leaves each launch's log and a screenshot there.
#
#   bash .github/scripts/macos-dmg-check.sh "$RUNNER_TEMP/launch"
set -uo pipefail

seconds="${LAUNCH_SECONDS:-20}"
out="${1:-}"
[ -n "$out" ] && mkdir -p "$out"
status=0
found=0

for dmg in apps/desktop/release/Uki-*.dmg; do
  [ -e "$dmg" ] || continue
  found=$((found + 1))
  case "$dmg" in
    *-arm64.dmg) want=arm64 ;;
    *-x64.dmg) want=x86_64 ;;
    *) echo "::error::$dmg: the name says neither arm64 nor x64"; status=1; continue ;;
  esac

  mnt="$(mktemp -d)"
  if ! hdiutil attach "$dmg" -nobrowse -readonly -noautoopen -mountpoint "$mnt" > /dev/null; then
    echo "::error::$dmg: hdiutil could not mount it"; status=1; continue
  fi
  app="$mnt/Uki.app"
  bin="$app/Contents/MacOS/Uki"
  archs="$(lipo -archs "$bin" 2> /dev/null || echo none)"
  echo "$dmg: Uki.app is $archs"
  if [ "$archs" != "$want" ]; then
    echo "::error::$dmg holds a $archs app, not $want"; status=1
  fi

  log="${out:-$(mktemp -d)}/launch-$want.log"
  arch "-$want" "$bin" > "$log" 2>&1 &
  pid=$!
  sleep "$seconds"
  if kill -0 "$pid" 2> /dev/null; then
    echo "$dmg: Uki ($want, pid $pid) still runs after ${seconds} s"
    [ -n "$out" ] && { screencapture -x "$out/launch-$want.png" 2> /dev/null || echo "no screenshot"; }
    kill "$pid" 2> /dev/null
  else
    wait "$pid"
    echo "::error::$dmg: Uki ($want) exited with code $? within ${seconds} s; its log:"
    cat "$log"
    status=1
  fi
  sleep 3
  pkill -f "$app/" 2> /dev/null
  sleep 1
  hdiutil detach "$mnt" -force > /dev/null || echo "::warning::$dmg: could not detach $mnt"
done

if [ "$found" -ne 2 ]; then
  echo "::error::expected the arm64 and the x64 dmg, found $found"; status=1
fi
exit "$status"
