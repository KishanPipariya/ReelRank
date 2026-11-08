import json
from pathlib import Path
from reelrank.snapshot import validate_snapshot, write_snapshot
root=Path('/tmp/reelrank-working-audit')
base=json.loads(Path('tests/fixtures/browser-snapshot.json').read_text())
text=('The archive programme includes a restoration and a new introduction. '*400)
records=[]
for name,overview in [('ascii-control',text[:20000]),('ascii-overflow',text[:20001]),('unicode-boundary',text[:19999]+'🎬')]:
 snapshot=json.loads(json.dumps(base))
 snapshot['films'][0]['overview']=overview
 validate_snapshot(snapshot)
 directory=root/name;directory.mkdir(exist_ok=True)
 write_snapshot(snapshot,directory/'snapshot.json')
 records.append({'case':name,'pythonAccepted':True,'written':(directory/'snapshot.json').exists(),'codePoints':len(overview),'utf16Units':len(overview.encode('utf-16-le'))//2,'declaredMaximum':20000})
(root/'contract-python.json').write_text(json.dumps(records,indent=2))
print(json.dumps(records,indent=2))
