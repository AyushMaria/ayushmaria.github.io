"""Apply a town-placements.json (downloaded from docs/town-map-editor.html)
to town-world.js in place.

    python3 tools/apply-placements.py path/to/town-placements.json

Rewrites: BUILDINGS numbers (per label, other props kept), TREES, hand-placed
BUSHES, hand-placed LAMPS, NPCs, wild flowers, stalls, tables, campfire,
barrels, BED_SLOTS, rocks, signboards and ZONES spawns. Generated items
(derived: true) and removed items are skipped. Prints a summary of what
changed. Run tools/make-town-map.py afterwards to refresh the map + editor.
"""
import json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TW = os.path.join(ROOT, 'town-world.js')
src = open(TW, encoding='utf-8').read()
data = json.load(open(sys.argv[1], encoding='utf-8'))
changes = []

def num(v):
    return ('%.2f' % v).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)

def rot_expr(deg):
    d = (deg % 360 + 360) % 360
    return {0: '0', 90: 'Math.PI / 2', 180: 'Math.PI', 270: '-Math.PI / 2'}.get(d, '%.4f' % (d * math.pi / 180))

def live(key):
    return [it for it in data.get(key, []) if not it.get('removed') and not it.get('derived')]

def replace_block(start_marker, end_marker, new_body, label):
    global src
    a = src.index(start_marker) + len(start_marker)
    b = src.index(end_marker, a)
    old = src[a:b]
    if old.strip() != new_body.strip():
        src = src[:a] + new_body + src[b:]
        changes.append(label)

# ── BUILDINGS ──────────────────────────────────────────────────────
for b in live('buildings'):
    lab = re.escape(b['label'])
    pat = re.compile(r"(\{ x: )(-?[\d.]+)(, z: )(-?[\d.]+)(, w: )([\d.]+)(, h: )([\d.]+)(, d: )([\d.]+)(,[^}]*?label: (?:'|\")" + lab + r"(?:'|\")[^}]*?zone: ')(\w+)(')", re.S)
    m = pat.search(src)
    if not m:
        print('  ! building not found in town-world.js:', b['label']); continue
    old = (float(m.group(2)), float(m.group(4)), float(m.group(6)), float(m.group(8)), float(m.group(10)), m.group(12))
    new = (b['x'], b['z'], b['w'], b['h'], b['d'], b['zone'])
    if old != new:
        src = src[:m.start()] + f"{m.group(1)}{num(b['x'])}{m.group(3)}{num(b['z'])}{m.group(5)}{num(b['w'])}{m.group(7)}{num(b['h'])}{m.group(9)}{num(b['d'])}{m.group(11)}{b['zone']}{m.group(13)}" + src[m.end():]
        changes.append(f"{b['label']}: ({num(old[0])}, {num(old[1])}) → ({num(b['x'])}, {num(b['z'])})" + (f", zone {old[5]} → {b['zone']}" if old[5] != b['zone'] else ''))

# ── TREES ──────────────────────────────────────────────────────────
body = '\n' + ''.join(f"    [{num(t['x'])}, {num(t['z'])}, '{t['species']}'],\n" for t in live('trees')) + '  '
replace_block('const TREES = [', '].map(([x, z, sp], i)', body, f"TREES ({len(live('trees'))} trees)")

# ── BUSHES (hand-placed) ───────────────────────────────────────────
body = '\n' + ''.join(f"    [{num(b['x'])}, {num(b['z'])}, {num(b.get('scale', 0.7))}, '{b['species']}'],\n" for b in live('bushes'))
replace_block('BUSHES.push(\n', '  );', body, f"BUSHES ({len(live('bushes'))} bushes)")

# ── LAMPS (hand-placed) ────────────────────────────────────────────
body = '\n' + ''.join(f"    [{num(l['x'])}, {num(l['z'])}],\n" for l in live('lamps')) + '  '
replace_block('const LAMPS = [', '];', body, f"LAMPS ({len(live('lamps'))} lamps)")

# ── NPCs ───────────────────────────────────────────────────────────
body = '\n' + ''.join(f"      [{num(n['x'])}, {num(n['z'])}, {int(n.get('variant', 0))}],\n" for n in live('npcs')) + '    '
replace_block('buildNpcs(scene, [', ']);', body, f"NPCs ({len(live('npcs'))})")

# ── Wild flowers ───────────────────────────────────────────────────
body = '\n      ' + ', '.join(f"[{num(f['x'])}, {num(f['z'])}]" for f in live('flowers')) + ',\n    '
replace_block('buildWildFlowers(scene, [', ']);', body, f"flowers ({len(live('flowers'))} clusters)")

# ── Stalls ─────────────────────────────────────────────────────────
m = re.search(r"\n(  \[\[.*?\]\])\n\s*\.forEach\(\(\[x, z, r, red\]\)", src)
if m:
    new_line = '  [' + ', '.join(f"[{num(s['x'])}, {num(s['z'])}, {rot_expr(s['rot'])}, {'true' if s.get('red') else 'false'}]" for s in live('stalls')) + ']'
    if m.group(1) != new_line:
        src = src[:m.start(1)] + new_line + src[m.end(1):]; changes.append('stalls')
else:
    print('  ! stall list not found — skipped')

# ── Tables / campfire / barrels / beds / rocks ─────────────────────
def replace_line(regex, new, label):
    global src
    m = re.search(regex, src)
    if not m: print('  ! pattern not found:', label); return
    if m.group(0) != new:
        src = src[:m.start()] + new + src[m.end():]; changes.append(label)

replace_line(r"const TABLES = \[.*?\];", 'const TABLES = [' + ', '.join(f"[{num(t['x'])}, {num(t['z'])}]" for t in live('tables')) + '];', 'tables')
cf = live('campfire')
if cf: replace_line(r"const CAMPFIRE = \{ x: -?[\d.]+, z: -?[\d.]+ \};", f"const CAMPFIRE = {{ x: {num(cf[0]['x'])}, z: {num(cf[0]['z'])} }};", 'campfire')
replace_line(r"\[\[-?[\d.]+, -?[\d.]+\](?:, \[-?[\d.]+, -?[\d.]+\])*\]\.forEach\(\(\[x,z\]\) => \{\n    const barrel",
             '[' + ', '.join(f"[{num(b['x'])}, {num(b['z'])}]" for b in live('barrels')) + '].forEach(([x,z]) => {\n    const barrel', 'barrels')
replace_line(r"const BED_SLOTS = \[.*?\];", 'const BED_SLOTS = [' + ', '.join(f"[{num(b['x'])}, {num(b['z'])}]" for b in live('beds')) + '];', 'beds')
rk = live('rocks')
if rk:
    a = src.index('  // ── Rocks'); b = src.index('].forEach(([x, z]) => scene.add(createRock', a)
    old = src[a:b]
    new = '  // ── Rocks ───────────────────────────────────────────────────\n  [\n    ' + ',\n    '.join(', '.join(f"[{num(r['x'])}, {num(r['z'])}]" for r in rk[i:i + 4]) for i in range(0, len(rk), 4)) + ',\n  '
    if old.strip() != new.strip():
        src = src[:a] + new + src[b:]; changes.append(f'rocks ({len(rk)})')

# ── Signboards ─────────────────────────────────────────────────────
signs = live('signs')
calls = list(re.finditer(r"  addSignboard\([^;]*\);[^\n]*", src))
if len(calls) == len(signs):
    for m, s in zip(reversed(calls), reversed(signs)):
        new = f"  addSignboard({num(s['x'])}, {num(s['z'])}, {json.dumps(s['text'], ensure_ascii=False)}, {rot_expr(s['rot'])});"
        old = m.group(0)
        # keep an existing trailing comment
        cm = re.search(r"\);\s*(//.*)$", old)
        if cm: new += '  ' + cm.group(1)
        if old.strip() != new.strip():
            src = src[:m.start()] + new + src[m.end():]; changes.append(f"signboard '{s['text'][:22]}…'")
else:
    print(f'  ! signboard count mismatch ({len(calls)} in code, {len(signs)} in json) — skipped')

# ── ZONES spawns ───────────────────────────────────────────────────
for sp in live('spawns'):
    pat = re.compile(r"(" + sp['key'] + r":\s*\{ name: ')([^']+)(',\s*spawn: \{ x: )(-?[\d.]+)(,\s*z: )(-?[\d.]+)(,\s*rot:\s*)([^}]+?)(\s*\} \})")
    m = pat.search(src)
    if not m: print('  ! zone not found:', sp['key']); continue
    new = f"{m.group(1)}{sp['name']}{m.group(3)}{num(sp['x'])}{m.group(5)}{num(sp['z'])}{m.group(7)}{rot_expr(sp['rotDeg'])}{m.group(9)}"
    if m.group(0) != new:
        src = src[:m.start()] + new + src[m.end():]; changes.append(f"spawn {sp['key']}")

open(TW, 'w', encoding='utf-8').write(src)
print('Applied to town-world.js:' if changes else 'No differences — town-world.js unchanged.')
for c in changes: print('  •', c)
