#!/usr/bin/env bash
# Export a scrubbed copy of this repo for the public (hackathon) mirror.
# Usage: scripts/export-public.sh <src-repo> <dest-dir>
# - drops private/ (handover, internal notes), env files, build output
# - fails loudly if anything that looks like a secret / personal info survives
set -euo pipefail
SRC="${1:?src}"; DEST="${2:?dest}"
mkdir -p "$DEST"
# Mirror only git-tracked files (untracked junk never leaks), minus private paths.
find "$DEST" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
git -C "$SRC" ls-files -z | while IFS= read -r -d '' f; do
  case "$f" in
    private/*|.env|.env.*) [ "$f" = ".env.example" ] || continue ;;
  esac
  mkdir -p "$DEST/$(dirname "$f")"
  cp -p "$SRC/$f" "$DEST/$f"
done
# Patterns live in private/scrub-patterns.txt (one ERE per line) so the list itself stays private.
PATTERNS="$SRC/private/scrub-patterns.txt"
[ -f "$PATTERNS" ] || { echo "missing $PATTERNS" >&2; exit 1; }
if grep -rIniE -f "$PATTERNS" "$DEST" --exclude-dir=node_modules --exclude=package-lock.json; then
  echo "SCRUB FAILED: sensitive pattern found in public export" >&2
  exit 1
fi
echo "public export ok: $DEST"
