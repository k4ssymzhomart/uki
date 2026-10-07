#!/bin/sh
# Serializes pnpm installs when several agents share one working tree.
# Usage: scripts/dev/pnpm-locked.sh add --filter @uki/ui some-package
LOCK="${TMPDIR:-/tmp}/uki-pnpm-install.lock"
i=0
until mkdir "$LOCK" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 600 ]; then echo "pnpm-locked: gave up waiting for $LOCK" >&2; exit 1; fi
  sleep 1
done
trap 'rmdir "$LOCK"' EXIT INT TERM
cd "$(dirname "$0")/../.." && pnpm "$@"
