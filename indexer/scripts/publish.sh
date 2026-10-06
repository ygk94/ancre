#!/usr/bin/env bash
# Sync this folder to the standalone public repo ygk94/ancre-indexer (Envio Cloud reads it).
#   scripts/publish.sh <clone-dir> [--deploy]
# Copies the indexer (no secrets, no node_modules, no monorepo-only analytics) plus the solver's normative vectors
# into test/vectors, runs codegen + typecheck + tests there, commits on main and pushes. With --deploy, also pushes
# main to the `envio` branch, which triggers an Envio Cloud deployment (3 per indexer on the free plan: DOC Envio
# hosted-service-billing, read 2026-09-27, see docs/ressources/envio.md §5; use sparingly).
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="${1:?usage: scripts/publish.sh <clone-dir> [--deploy]}"
DEPLOY="${2:-}"
# Safety (rsync --delete below): DST must be the ROOT of the work tree of a clone whose origin is exactly
# ygk94/ancre-indexer. A sub-folder of the clone (its .git included) passed the old substring check (review 06/10, PUBLISH).
ORIGIN_RE='^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)ygk94/ancre-indexer(\.git)?/?$'
check_dst() {
  local dst="$1" root origin
  [ -d "$dst" ] || { echo "refusing: $dst is not a directory" >&2; return 1; }
  root="$(git -C "$dst" rev-parse --show-toplevel 2>/dev/null)" || { echo "refusing: $dst is not in a git work tree" >&2; return 1; }
  [ "$(cd "$root" && pwd -P)" = "$(cd "$dst" && pwd -P)" ] || { echo "refusing: $dst is not the root of its work tree ($root)" >&2; return 1; }
  origin="$(git -C "$dst" remote get-url origin 2>/dev/null)" || { echo "refusing: $dst has no origin" >&2; return 1; }
  printf '%s\n' "$origin" | grep -Eq "$ORIGIN_RE" || { echo "refusing: origin of $dst is $origin, not ygk94/ancre-indexer" >&2; return 1; }
}
if [ "${PUBLISH_CHECK_ONLY:-}" = 1 ]; then check_dst "$DST"; exit $?; fi   # used by test/publish.test.ts
check_dst "$DST" || exit 1
DST="$(cd "$DST" && pwd -P)"
rsync -a --delete --filter 'P .github/' --filter 'P test/vectors/'  --exclude .git --exclude node_modules --exclude .envio --exclude .env --exclude .claude \
  --exclude A-FAIRE-HUGO-ENVIO.txt --exclude analytics --exclude generated --exclude '*.log' --exclude scripts/publish.sh \
  "$SRC/" "$DST/"
mkdir -p "$DST/test/vectors/violations"
cp "$SRC"/../solver/vectors/*.json "$DST/test/vectors/"
cp "$SRC"/../solver/vectors/violations/*.json "$DST/test/vectors/violations/"
cat > "$DST/.gitignore" <<'IGN'
.env
.env.*
!.env.example
node_modules/
generated/
.envio/
.claude/
*.log
IGN
cd "$DST"
pnpm install --frozen-lockfile >/dev/null
pnpm codegen >/dev/null
npx tsc --noEmit
pnpm test
git add -A
if git diff --cached --quiet; then
  echo "nothing to commit"
else
  git commit -qm "${PUBLISH_MESSAGE:-Sync from the ANCRE monorepo}"   # fails loudly (set -e) before any push
fi
git push -u origin HEAD:main
if [ "$DEPLOY" = "--deploy" ]; then git push origin HEAD:envio; fi
