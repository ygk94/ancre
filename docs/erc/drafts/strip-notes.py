"""Prepare the ERC text for eipw and for submission (chantier 08, 2026-10-01; 08-bis, 2026-10-07).

    python3 strip-notes.py IN OUT                 # drops the internal notes and every DISCLOSURE-GATE block
    python3 strip-notes.py IN OUT --keep-gated    # drops the notes, keeps the gated text, removes only the markers

The default is the safe one: without --keep-gated, nothing that depends on the disclosure to the ERC-8004
maintainers (decision D29) survives. Use --keep-gated only once Hugo has sent the disclosure.
The preamble placeholders are replaced by lint-only values; the real ones come from the editors and the thread.
"""
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
keep = "--keep-gated" in sys.argv[3:]
s = open(src).read()
s = re.sub(r'\n⟦.*?⟧\n', '\n', s, flags=re.S)  # notes first: they may quote the markers
gate = r'<!-- DISCLOSURE-GATE:start.*?-->\n(.*?)<!-- DISCLOSURE-GATE:end -->\n'
s = re.sub(gate, (lambda m: m.group(1)) if keep else '', s, flags=re.S)
assert 'DISCLOSURE-GATE' not in s, 'unbalanced DISCLOSURE-GATE markers'
s = re.sub(r'\n{3,}', '\n\n', s)
s = s.replace('eip: TBD', 'eip: 0000').replace('author: TBD', 'author: Hugo Thomas (@ygk94)').replace(
    'discussions-to: TBD',
    'discussions-to: https://ethereum-magicians.org/t/erc-0000-anchored-reputation-for-trustless-agents/99999')
assert '⟦' not in s, [line for line in s.split('\n') if '⟦' in line][:3]
open(dst, 'w').write(s)
