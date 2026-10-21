# Writes packages/core/src/font-catalog.ts from curate.py (style, roles, note) and meta.json
# (Fontsource metadata from npm, written by fetch.mjs). Run from anywhere: python3 scripts/fonts/gen.py
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from curate import C
meta = json.load(open(os.path.join(HERE, "meta.json")))
rows = []
for fid, (kind, style, roles, note) in C.items():
    m = meta[fid]
    assert m.get("license") == "OFL-1.1", f"{fid} is not OFL-1.1 (run fetch.mjs first if it is new)"
    variable = m["package"].startswith("@fontsource-variable/")
    rows.append({
        "id": fid, "family": f"{m['family']} Variable" if variable else m["family"], "google": m["family"],
        "package": m["package"], "available": m["weights"], "italic": "italic" in m["styles"],
        "kind": kind, "style": style, "roles": roles, "note": note,
    })
rows.sort(key=lambda r: r["id"])
lines = ['// @generated from Fontsource metadata (npm, October 2026). Every family is OFL-1.1 and ships on npm.',
         '// Edit packages/core/src/fonts.ts for behavior; regenerate this file to add families.',
         'import type { FontEntry } from "./fonts.js";', '',
         'export const FONT_CATALOG: FontEntry[] = [']
for r in rows:
    lines.append("  " + json.dumps({**r, "license": "OFL-1.1"}, ensure_ascii=False) + ",")
lines.append("];\n")
open(os.path.join(HERE, "..", "..", "packages", "core", "src", "font-catalog.ts"), "w").write("\n".join(lines))
from collections import Counter
print(len(rows), Counter(r["style"] for r in rows))
