"""Generate docs/town-map.svg — a top-down reference map built from the
placement data in town-world.js (buildings, roads, wall, props, trees…).
World X → right, world Z → DOWN on the page (so north / -Z is at the top).

Run from the repo root after changing any placement:
    python3 tools/make-town-map.py
Outputs:
    docs/town-map.svg          — static reference map
    docs/town-map-editor.html  — drag-and-drop editor (open in a browser) that
                                 exports paste-ready snippets for town-world.js
"""
import re, math, os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = open(os.path.join(ROOT, 'town-world.js'), encoding='utf-8').read()

def block(start_marker, end_marker):
    a = SRC.index(start_marker); b = SRC.index(end_marker, a); return SRC[a:b]

# ── data ────────────────────────────────────────────────────────
buildings = []
building_srcs = re.findall(r"\{ x: -?[\d.]+, z: -?[\d.]+, w: [\d.]+.*?\},", block("const BUILDINGS = [", "];"), re.S)
for m in re.finditer(r"""\{ x: (-?[\d.]+), z: (-?[\d.]+), w: ([\d.]+), h: ([\d.]+), d: ([\d.]+),[^}]*?label: (?:'([^']+)'|"([^"]+)"), project: (?:'(\w+)'|null), zone: '(\w+)'""", SRC):
    x, z, w, h, d, l1, l2, project, zone = m.groups()
    buildings.append(dict(x=float(x), z=float(z), w=float(w), h=float(h), d=float(d), label=l1 or l2, project=project, zone=zone, src=building_srcs[len(buildings)]))

def tree_scale(i): return 0.85 + ((i * 7919) % 100) / 100 * 0.55
trees = [(float(x), float(z), s) for x, z, s in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+),\s*'(\w+)'\]", block("const TREES = [", "].map(([x, z, sp], i)"))]

LAMP_X = 6 + 1.5; RING_R = 50; SIGN_X = 6 + 1.8
def _ev(expr):
    return eval(expr.replace('SIGN_X', str(SIGN_X)).replace('RING_R', str(RING_R)).replace('Math.PI', 'math.pi'))
lamps = []
for x, z in re.findall(r"\[(-?[\w.]+),\s*(-?[\w.]+)\]", block("const LAMPS = [", "];")):
    ev = lambda v: eval(v.replace('LAMP_X', str(LAMP_X)))
    lamps.append((ev(x), ev(z)))
n_hand_lamps = len(lamps)
for i in range(6):
    a = i / 6 * math.pi * 2; lamps.append((math.sin(a) * (RING_R + 6), math.cos(a) * (RING_R + 6)))

bushes = [(float(x), float(z), float(s), sp) for x, z, s, sp in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+),\s*([\d.]+),\s*'(\w+)'\]", block("BUSHES.push(\n", "  );"))]
n_hand_bushes = len(bushes)
for i in range(14):
    a = i / 14 * math.pi * 2 + 0.15
    if abs(math.sin(a)) < 0.2 or abs(math.cos(a)) < 0.2: continue
    bushes.append((math.sin(a) * 59.5, math.cos(a) * 59.5, 0.8 + (i % 3) * 0.15, ['green', 'oak', 'birch'][i % 3]))
beds = [(float(x), float(z)) for x, z in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+)\]", block('const BED_SLOTS = [', '];'))]
for x, z in beds:
    for dx, dz in [(-0.55, -0.55), (0.55, -0.55), (-0.55, 0.55), (0.55, 0.55)]: bushes.append((x + dx, z + dz, 0.5, 'green'))

flowers = [(float(x), float(z)) for x, z in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+)\]", block("buildWildFlowers(scene, [", "]);"))]
npc_variants = [int(v) for _, _, v in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+),\s*(\d)\]", block("buildNpcs(scene, [", "]);"))]
npcs = [(float(x), float(z)) for x, z, _ in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+),\s*(\d)\]", block("buildNpcs(scene, [", "]);"))]
tables = [(float(x), float(z)) for x, z in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+)\]", block('const TABLES = [', '];'))]
campfire = tuple(float(v) for v in re.search(r"const CAMPFIRE = \{ x: (-?[\d.]+), z: (-?[\d.]+) \}", SRC).groups())
barrels = [(float(x), float(z)) for x, z in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+)\]", block('  // barrels', 'forEach'))] if '  // barrels' in SRC else [(float(x), float(z)) for x, z in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+)\]", block('const barrelMat', 'forEach'))]
_STALL_SRC = SRC[SRC.index('.forEach(([x, z, r, red])') - 400:SRC.index('.forEach(([x, z, r, red])')]
stalls = [(float(x), float(z), round(math.degrees(_ev(r)))) for x, z, r, _ in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+),\s*([^,]+),\s*(true|false)\]", _STALL_SRC)]
sign_full = []
# apply-placements.py writes the text with json.dumps (double quotes), older
# code used single quotes — accept both.
for sx, sz, q, txt, rot in re.findall(r"  addSignboard\(([^,]+),\s*([^,]+),\s*(['\"])(.*?)\3,\s*([^)]+)\);", SRC):
    if q == '"': txt = json.loads('"' + txt + '"')
    sign_full.append(dict(x=round(_ev(sx), 2), z=round(_ev(sz), 2), text=txt, rot=round(math.degrees(_ev(rot))) % 360))
spawn_full = []
for key, name, sx, sz, rot in re.findall(r"(\w+):\s*\{ name: '([^']+)',\s*spawn: \{ x: (-?[\d.]+),\s*z: (-?[\d.]+),\s*rot:\s*([^}]+)\}", block("export const ZONES = {", "};")):
    spawn_full.append(dict(key=key, name=name, x=float(sx), z=float(sz), rotDeg=round(math.degrees(_ev(rot.strip()))) % 360))
stall_reds = [v == 'true' for v in re.findall(r"\[-?[\d.]+,\s*-?[\d.]+,\s*[^,]+,\s*(true|false)\]", _STALL_SRC)]
signs = [(SIGN_X, -14), (14, SIGN_X), (-14, -SIGN_X), (-SIGN_X, 11), (SIGN_X, -RING_R + 8), (RING_R - 8, -SIGN_X), (-RING_R + 8, SIGN_X)]
spawns = {'square': (0, 30), 'north': (0, -12), 'east': (14, 0), 'west': (-14, 0)}
rocks = [(float(x), float(z)) for x, z in re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+)\]", block('  // ── Rocks', 'forEach'))]

# ── svg ─────────────────────────────────────────────────────────
S = 10          # px per world unit
EXT = 72        # half extent shown
PAD = 60
W = H = int(EXT * 2 * S + PAD * 2)
def X(x): return PAD + (x + EXT) * S
def Y(z): return PAD + (z + EXT) * S      # +z (south) is DOWN

out = []
def add(s): out.append(s)

add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Nunito, Segoe UI, Arial, sans-serif">')
add('<defs><style>text{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}</style></defs>')
add(f'<rect width="{W}" height="{H}" fill="#f4efe4"/>')
add(f'<rect x="{PAD}" y="{PAD}" width="{EXT*2*S}" height="{EXT*2*S}" fill="#a9c98a"/>')   # grass

# grid every 10 units
for v in range(-70, 71, 10):
    add(f'<line x1="{X(v)}" y1="{PAD}" x2="{X(v)}" y2="{H-PAD}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1"/>')
    add(f'<line x1="{PAD}" y1="{Y(v)}" x2="{W-PAD}" y2="{Y(v)}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1"/>')
    add(f'<text x="{X(v)}" y="{PAD-8}" font-size="12" text-anchor="middle" fill="#555">x {v}</text>')
    add(f'<text x="{PAD-6}" y="{Y(v)+4}" font-size="12" text-anchor="end" fill="#555">z {v}</text>')
add(f'<line x1="{X(0)}" y1="{PAD}" x2="{X(0)}" y2="{H-PAD}" stroke="#000" stroke-opacity="0.18" stroke-width="1.5"/>')
add(f'<line x1="{PAD}" y1="{Y(0)}" x2="{W-PAD}" y2="{Y(0)}" stroke="#000" stroke-opacity="0.18" stroke-width="1.5"/>')

# wall (r 63, gates E/W/S)
add(f'<circle cx="{X(0)}" cy="{Y(0)}" r="{63*S}" fill="none" stroke="#8c7b62" stroke-width="{1.8*S}" stroke-opacity="0.85"/>')
for name, ang in [('S', 0), ('E', math.pi/2), ('W', -math.pi/2)]:
    gx, gz = math.sin(ang)*63, math.cos(ang)*63
    add(f'<circle cx="{X(gx)}" cy="{Y(gz)}" r="{5.2*S}" fill="#5c3a1e" stroke="#3a2416" stroke-width="2"/>')
    add(f'<text x="{X(gx)}" y="{Y(gz)+5}" font-size="13" font-weight="700" text-anchor="middle" fill="#fff" stroke="#3a2416">{name} gate</text>')
for i in range(8):
    a = i/8*math.pi*2 + math.pi/8
    add(f'<circle cx="{X(math.sin(a)*63)}" cy="{Y(math.cos(a)*63)}" r="{2.4*S}" fill="#b9a98e" stroke="#6b5a44" stroke-width="2"/>')
for ang in [0, math.pi/2, -math.pi/2]:
    for sgn in (-1, 1):
        a = ang + sgn*(5.2+1.6)/63
        add(f'<circle cx="{X(math.sin(a)*63)}" cy="{Y(math.cos(a)*63)}" r="{2.4*S}" fill="#b9a98e" stroke="#6b5a44" stroke-width="2"/>')

# roads
road = '#c9b48e'; roadEdge = '#8f7b5c'
add(f'<circle cx="{X(0)}" cy="{Y(0)}" r="{50*S}" fill="none" stroke="{road}" stroke-width="{9*S}"/>')   # ring road
add(f'<rect x="{X(-6)}" y="{Y(-52)}" width="{12*S}" height="{(61+52)*S}" fill="{road}"/>')             # N/S spoke
add(f'<rect x="{X(-61)}" y="{Y(-6)}" width="{122*S}" height="{12*S}" fill="{road}"/>')                # E/W spoke
add(f'<rect x="{X(-17)}" y="{Y(17)}" width="{30*S}" height="{20*S}" fill="#d7bb8f"/>')                # plaza
add(f'<circle cx="{X(0)}" cy="{Y(0)}" r="{13*S}" fill="#d7bb8f"/>')                                    # roundabout
add(f'<circle cx="{X(0)}" cy="{Y(0)}" r="{4*S}" fill="#a9c98a"/>')
add(f'<circle cx="{X(0)}" cy="{Y(0)}" r="{2.8*S}" fill="#7fc8e8" stroke="#3f7fa8" stroke-width="2"/>')  # fountain
add(f'<text x="{X(0)}" y="{Y(0)+4}" font-size="11" text-anchor="middle" fill="#1a3a5a">Fountain</text>')

# trees / bushes / flowers
SPECIES = {'oak': '#c8c24a', 'birch': '#ff7040', 'cherry': '#ff8a9a', 'green': '#4f9b3c'}
for x, z, s, sp in bushes:
    add(f'<circle cx="{X(x)}" cy="{Y(z)}" r="{s*0.9*S}" fill="{SPECIES[sp]}" fill-opacity="0.8" stroke="#2f5a25" stroke-width="1"/>')
for i, (x, z, sp) in enumerate(trees):
    r = 1.9 * tree_scale(i)
    add(f'<circle cx="{X(x)}" cy="{Y(z)}" r="{r*S}" fill="{SPECIES[sp]}" fill-opacity="0.85" stroke="#2f5a25" stroke-width="1.5"/>')
    add(f'<circle cx="{X(x)}" cy="{Y(z)}" r="{0.3*S}" fill="#6b4a2e"/>')
for x, z in flowers:
    add(f'<text x="{X(x)}" y="{Y(z)+5}" font-size="14" text-anchor="middle" stroke="none">✿</text>')
for x, z in rocks:
    add(f'<circle cx="{X(x)}" cy="{Y(z)}" r="{0.6*S}" fill="#8a8a8a" stroke="#555" stroke-width="1"/>')

# buildings
ZONE_COLOR = {'square': '#ffd166', 'north': '#e08a2e', 'east': '#06d6a0', 'west': '#b07cf0'}
for b in buildings:
    x0, y0 = X(b['x'] - b['w']/2), Y(b['z'] - b['d']/2)
    add(f'<rect x="{x0}" y="{y0}" width="{b["w"]*S}" height="{b["d"]*S}" fill="#f3e4c4" stroke="{ZONE_COLOR[b["zone"]]}" stroke-width="4"/>')
    # door / front face marker on +z (south) edge
    add(f'<rect x="{X(b["x"]-0.55)}" y="{Y(b["z"]+b["d"]/2)-3}" width="{1.1*S}" height="6" fill="#5c3a1e"/>')
    lab = b['label'] + (' ★' if b['project'] else '')
    add(f'<text x="{X(b["x"])}" y="{Y(b["z"])-4}" font-size="12" font-weight="700" text-anchor="middle" fill="#2b2d42">{lab}</text>')
    add(f'<text x="{X(b["x"])}" y="{Y(b["z"])+11}" font-size="10" text-anchor="middle" fill="#555">({b["x"]:g}, {b["z"]:g})  {b["w"]:g}×{b["d"]:g}</text>')

# clock tower
add(f'<rect x="{X(-3)}" y="{Y(-61)}" width="{6*S}" height="{6*S}" fill="#b9a98e" stroke="#4a4034" stroke-width="3"/>')
add(f'<text x="{X(0)}" y="{Y(-58)+4}" font-size="11" font-weight="700" text-anchor="middle">Clock Tower</text>')

# props
for x, z, rot in stalls:
    add(f'<g transform="translate({X(x)},{Y(z)}) rotate({-rot})"><rect x="{-1.6*S}" y="{-0.8*S}" width="{3.2*S}" height="{1.6*S}" fill="#e86f2b" stroke="#7a3a10" stroke-width="1.5"/></g>')
    add(f'<text x="{X(x)}" y="{Y(z)+4}" font-size="9" text-anchor="middle">stall</text>')
for x, z in tables:
    add(f'<circle cx="{X(x)}" cy="{Y(z)}" r="{0.8*S}" fill="#6b4226" stroke="#3a2416" stroke-width="1"/>')
add(f'<circle cx="{X(campfire[0])}" cy="{Y(campfire[1])}" r="{0.9*S}" fill="#ff6b35" stroke="#8a2a00" stroke-width="2"/>')
add(f'<text x="{X(campfire[0])}" y="{Y(campfire[1])+15}" font-size="9" text-anchor="middle">campfire</text>')
for x, z in barrels:
    add(f'<circle cx="{X(x)}" cy="{Y(z)}" r="{0.4*S}" fill="#5a4033"/>')
for x, z in beds:
    add(f'<rect x="{X(x-1.2)}" y="{Y(z-1.2)}" width="{2.4*S}" height="{2.4*S}" fill="none" stroke="#5c3d2e" stroke-width="2"/>')
for x, z in lamps:
    add(f'<circle cx="{X(x)}" cy="{Y(z)}" r="4" fill="#ffd166" stroke="#7a5a10" stroke-width="1.5"/>')
for x, z in signs:
    add(f'<rect x="{X(x)-5}" y="{Y(z)-5}" width="10" height="10" fill="#3a2210" transform="rotate(45 {X(x)} {Y(z)})"/>')
for x, z in npcs:
    add(f'<circle cx="{X(x)}" cy="{Y(z)}" r="4.5" fill="#2a1a10" stroke="#ffbe6e" stroke-width="1.5"/>')
for key, (x, z) in spawns.items():
    add(f'<circle cx="{X(x)}" cy="{Y(z)}" r="7" fill="none" stroke="#e63946" stroke-width="2.5" stroke-dasharray="3 2"/>')
    add(f'<text x="{X(x)+10}" y="{Y(z)+4}" font-size="10" fill="#e63946" font-weight="700">spawn: {key}</text>')
# cart start
add(f'<polygon points="{X(0)},{Y(30)-9} {X(0)-6},{Y(30)+7} {X(0)+6},{Y(30)+7}" fill="#c0392b" stroke="#fff" stroke-width="1.5"/>')
add(f'<text x="{X(0)+10}" y="{Y(30)+16}" font-size="10" fill="#c0392b" font-weight="700">cart start (0, 30) facing north</text>')

# zone labels
for txt, (x, z) in {'TOWN SQUARE': (0, 44), 'MAIN STREET (north)': (0, -44), 'RESEARCH QUARTER (east)': (34, -22), 'SERVICES QUARTER (west)': (-34, 22)}.items():
    add(f'<text x="{X(x)}" y="{Y(z)}" font-size="15" font-weight="900" text-anchor="middle" fill="#2b2d42" letter-spacing="2">{txt}</text>')

# compass + legend
cx, cy = W - PAD - 60, PAD + 60
add(f'<circle cx="{cx}" cy="{cy}" r="34" fill="#fff" fill-opacity="0.85" stroke="#555"/>')
add(f'<polygon points="{cx},{cy-28} {cx-8},{cy} {cx+8},{cy}" fill="#e63946"/>')
add(f'<text x="{cx}" y="{cy-32}" font-size="12" font-weight="700" text-anchor="middle">N (−z)</text>')
add(f'<text x="{cx}" y="{cy+46}" font-size="12" text-anchor="middle">S (+z)</text>')
add(f'<text x="{cx+44}" y="{cy+4}" font-size="12">E (+x)</text><text x="{cx-44}" y="{cy+4}" font-size="12" text-anchor="end">W (−x)</text>')

lx, ly = PAD + 10, H - PAD - 250
add(f'<rect x="{lx-8}" y="{ly-22}" width="330" height="262" rx="8" fill="#fff" fill-opacity="0.92" stroke="#555"/>')
add(f'<text x="{lx}" y="{ly-4}" font-size="14" font-weight="900">LEGEND  (1 grid square = 10 world units)</text>')
items = [
    ('<rect x="0" y="-8" width="18" height="12" fill="#f3e4c4" stroke="#e08a2e" stroke-width="3"/>', 'Building footprint (border = zone colour); ★ = has a project modal'),
    ('<rect x="6" y="-4" width="8" height="5" fill="#5c3a1e"/>', 'Door — the building\'s front is always its +z (south) side'),
    ('<circle cx="9" cy="-2" r="7" fill="#c8c24a" stroke="#2f5a25"/>', 'Tree crown: oak (yellow), birch (orange), cherry (pink), green'),
    ('<circle cx="9" cy="-2" r="4" fill="#4f9b3c" stroke="#2f5a25"/>', 'Bush'),
    ('<text x="2" y="4" font-size="14" stroke="none">✿</text>', 'Wild flower cluster'),
    ('<circle cx="9" cy="-2" r="4" fill="#ffd166" stroke="#7a5a10"/>', 'Lamp post'),
    ('<rect x="4" y="-7" width="10" height="10" fill="#3a2210" transform="rotate(45 9 -2)"/>', 'Signboard'),
    ('<circle cx="9" cy="-2" r="4.5" fill="#2a1a10" stroke="#ffbe6e"/>', 'NPC sprite'),
    ('<rect x="0" y="-7" width="18" height="10" fill="#e86f2b"/>', 'Market stall (awning)'),
    ('<circle cx="9" cy="-2" r="5" fill="#6b4226"/>', 'Tavern table  ·  orange ring = campfire'),
    ('<circle cx="9" cy="-2" r="7" fill="none" stroke="#e63946" stroke-width="2.5" stroke-dasharray="3 2"/>', 'Fast-travel spawn point'),
    ('<rect x="0" y="-8" width="18" height="12" fill="#c9b48e"/>', 'Road (spokes 12 wide, ring 9) · plaza / roundabout darker'),
    ('<circle cx="9" cy="-2" r="7" fill="none" stroke="#8c7b62" stroke-width="4"/>', 'City wall r=63 with towers; gates E / W / S (closed)'),
]
for i, (icon, label) in enumerate(items):
    y = ly + 14 + i * 18
    add(f'<g transform="translate({lx},{y})">{icon}</g><text x="{lx+26}" y="{y+2}" font-size="12">{label}</text>')

add(f'<text x="{W/2}" y="{H-14}" font-size="12" text-anchor="middle" fill="#555">Generated from town-world.js placement data · roads: |x|≤6 or |z|≤6 spokes, ring r 45.5–54.5, roundabout r≤13, plaza x −17…13 / z 17…37</text>')
add('</svg>')

svg = '\n'.join(out)
# ── editor data ─────────────────────────────────────────────────
import json
EDITOR = dict(
    buildings=buildings,
    trees=[dict(x=x, z=z, species=sp) for x, z, sp in trees],
    bushes=[dict(x=round(x, 2), z=round(z, 2), scale=sc, species=sp, derived=(i >= n_hand_bushes)) for i, (x, z, sc, sp) in enumerate(bushes)],
    lamps=[dict(x=round(x, 2), z=round(z, 2), derived=(i >= n_hand_lamps)) for i, (x, z) in enumerate(lamps)],
    signs=sign_full,
    npcs=[dict(x=x, z=z, variant=npc_variants[i]) for i, (x, z) in enumerate(npcs)],
    stalls=[dict(x=x, z=z, rot=r, red=red) for (x, z, r), red in zip(stalls, stall_reds)],
    tables=[dict(x=x, z=z) for x, z in tables],
    barrels=[dict(x=x, z=z) for x, z in barrels],
    campfire=[dict(x=campfire[0], z=campfire[1])],
    beds=[dict(x=x, z=z) for x, z in beds],
    flowers=[dict(x=x, z=z) for x, z in flowers],
    rocks=[dict(x=x, z=z) for x, z in rocks],
    spawns=spawn_full,
)
tpl = open(os.path.join(ROOT, 'tools', 'town-map-editor.template.html'), encoding='utf-8').read()
html = tpl.replace('/*__DATA__*/{}', json.dumps(EDITOR).replace('</', '<\\/'))
os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
open(os.path.join(ROOT, 'docs', 'town-map-editor.html'), 'w', encoding='utf-8').write(html)
print('editor: buildings', len(buildings), 'signs', len(sign_full), 'spawns', len(spawn_full))
open(os.path.join(ROOT, 'docs', 'town-map.svg'), 'w', encoding='utf-8').write(svg)
print('buildings', len(buildings), 'trees', len(trees), 'bushes', len(bushes), 'lamps', len(lamps), 'size', W)
