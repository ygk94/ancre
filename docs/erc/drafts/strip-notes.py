import re,sys
s=open(sys.argv[1]).read()
s=re.sub(r'\n⟦.*?⟧\n', '\n', s, flags=re.S)
s=re.sub(r'\n{3,}', '\n\n', s)
s=s.replace('eip: TBD','eip: 0000').replace('author: TBD','author: Hugo Thomas (@hugothomas9)').replace('discussions-to: TBD','discussions-to: https://ethereum-magicians.org/t/erc-0000-anchored-reputation-for-trustless-agents/99999')
s=s.replace('../assets/erc-0000/','../assets/erc-0000/')
assert '⟦' not in s, [l for l in s.split('\n') if '⟦' in l][:3]
open(sys.argv[2],'w').write(s)
