#!/bin/bash
# Capture the whole preview in chunks: shoot-all.sh <width> <mobile 0|1> <out-dir>
cd "$(dirname "$0")"
U=http://127.0.0.1:8765/Case-Studyer-UI-Elemente.html
i=0
for r in "#system #fakten" "#kapitel #vergleich" "#empathy #journey" "#ableitung #alternativen" "#iterationen #vorher" "#flow #flow" "#screen #kernsatz" "#ergebnisse #statistik" "#beleg #tokens"; do
  set -- $r; i=$((i+1))
  node shoot.mjs "$U" "$WIDTH" "$MOBILE" "$OUT/w$WIDTH-$i" "$1" "$2" | python3 -c "import json,sys;d=json.load(sys.stdin);print($i,'overflow',d['pageOverflow'],'broken',d['brokenImages'],'errs',d['errors'],'h',round(d['bottom']-d['top']))"
done
