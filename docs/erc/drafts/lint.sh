#!/bin/sh
# Lint of the ERC with eipw 0.11.0 (npm package eipw-lint-js, the WebAssembly build of ethereum/eipw) and the
# config/eipw.toml of ethereum/ERCs. No docker, no cargo. Chantier 08-bis, 2026-10-07.
#   sh docs/erc/drafts/lint.sh [--keep-gated]      (run from the repository root; W = a scratch directory)
set -e
W=${W:-$(mktemp -d)}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$W/pkg" "$W/ercs/ERCS" "$W/ercs/assets"
( cd "$W/pkg" && [ -d node_modules/eipw-lint-js ] || { npm init -y >/dev/null && npm install --ignore-scripts eipw-lint-js@0.11.0 >/dev/null; } )
curl -sSfL https://raw.githubusercontent.com/ethereum/ERCs/master/config/eipw.toml -o "$W/ercs/eipw.toml"
python3 -c "import tomllib,json,sys; c=tomllib.load(open(sys.argv[1],'rb')); json.dump({'default_lints':c.get('lints',{}),'default_modifiers':c.get('modifiers',[])},open(sys.argv[2],'w'))" "$W/ercs/eipw.toml" "$W/ercs/opts.json"
for n in 721 165 1967 6093 8004; do curl -sSfL "https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-$n.md" -o "$W/ercs/ERCS/eip-$n.md"; done
for n in 170 7702 7825; do curl -sSfL "https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-$n.md" -o "$W/ercs/ERCS/eip-$n.md"; done
python3 "$HERE/strip-notes.py" "$HERE/../anchored-reputation.md" "$W/erc.md" "$@"
# provisional number: the file name must match `eip`, and the assets directory follows it
sed 's/^eip: 0000/eip: 9999/; s#\.\./assets/erc-0000/#../assets/erc-9999/#g' "$W/erc.md" > "$W/ercs/ERCS/erc-9999.md"
rm -rf "$W/ercs/assets/erc-9999" && cp -R "$HERE/../assets/erc-0000" "$W/ercs/assets/erc-9999"
cd "$W/ercs" && PKG="$W/pkg" node "$HERE/eipw-run.mjs" opts.json ERCS/erc-9999.md
