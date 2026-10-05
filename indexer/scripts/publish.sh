#!/usr/bin/env bash
# Sync this folder to the standalone public repo hugothomas9/ancre-indexer (Envio Cloud reads it).
#   scripts/publish.sh <clone-dir> [--deploy]
# Copies the indexer (no secrets, no node_modules, no monorepo-only analytics) plus the solver's normative vectors
# into test/vectors, runs codegen + typecheck + tests there, commits on main and pushes. With --deploy, also pushes
# main to the `envio` branch, which triggers an Envio Cloud deployment (3 per indexer on the free plan: use sparingly).
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="${1:?usage: scripts/publish.sh <clone-dir> [--deploy]}"
DEPLOY="${2:-}"
rsync -a --delete --exclude .git --exclude node_modules --exclude .envio --exclude .env --exclude .claude \
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
git -c user.name="Hugo Thomas" commit -qm "${PUBLISH_MESSAGE:-Sync from the ANCRE monorepo}" || echo "nothing to commit"
git push -u origin HEAD:main
if [ "$DEPLOY" = "--deploy" ]; then git push origin HEAD:envio; fi
