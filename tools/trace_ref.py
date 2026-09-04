# -*- coding: utf-8 -*-
"""
Traces the reference MapChart Tamriel screenshot into the app's geometry.

The screenshot is flat-shaded -- land #dddddd, sea #b2bac3, borders as thin
light-grey strokes, labels in much darker ink -- which makes an exact trace
possible.  The coastline and every region border therefore come straight out
of the reference image instead of being re-typed by hand, so the outline
matches 1:1.

Pipeline
--------
1.  Classify pixels into land / sea / border-ink / label-ink.
2.  The reference is cropped at the bottom, so the few coastal spans that run
    off the frame get a shallow synthesised bulge -- the only geometry here
    that is not from the image.
3.  Border ink splits the land into the reference's own regions.  Labels are
    dropped first (they are darker than borders), then each region is grown
    back over the border strokes so the regions tile the land exactly.
4.  Specks are merged into whichever neighbour they share the most edge with.
5.  Regions are named and given a province from the reference's city labels.
6.  Large regions are split by k-means over their own pixels, which adds depth
    without moving any border that came from the image.
7.  Everything is vectorised with marching squares, smoothed with Chaikin
    (symmetric, so shared borders stay coincident) and written out.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.cluster.vq import kmeans2
from skimage import measure
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.geometry.polygon import orient
from shapely import make_valid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRATCH = "/tmp/claude-0/-home-user-tamriel-mapchart/d6073823-8f26-5a04-9c38-6f2930d41a6a/scratchpad"
REF = os.path.join(SCRATCH, "img_00_dc5b4fd12d.png")

BOTTOM_EXTRA = 56         # rows added below the crop for the clipped coasts
MIN_REGION = 150          # px: smaller blobs are merged into a neighbour
SEED_AREA = 150           # px: an interior blob this big counts as a region
MIN_ISLAND = 45           # px: standalone islands may be smaller than that
TARGET_AREA = 2500        # px: aim for subdivisions around this size
MAX_SPLIT = 5
SPLIT_WOBBLE = 0.13       # how far the added split lines wander
SEA_LINK = 20             # px: islands this close count as neighbours
CHAIKIN = 2
SIMPLIFY = 0.6
OUTLINE_SIMPLIFY = 1.1    # stroke-only layers can be much coarser
GROW = 0.12               # px: closes hairline seams between neighbours

UI_RECTS = [(0, 0, 1207, 2), (0, 706, 1207, 709), (0, 238, 28, 342),
            (1048, 443, 1157, 480)]

CITIES = [
    ("Northpoint", "High Rock", 240, 57), ("Farrun", "High Rock", 344, 54),
    ("Jehanna", "High Rock", 376, 69), ("Shornhelm", "High Rock", 200, 115),
    ("Evermore", "High Rock", 289, 158), ("Camlorn", "High Rock", 113, 190),
    ("Wayrest", "High Rock", 232, 194), ("Daggerfall", "High Rock", 68, 265),

    ("Dragonstar", "Hammerfell", 376, 168), ("Skaven", "Hammerfell", 315, 227),
    ("Elinhir", "Hammerfell", 482, 238), ("Sentinel", "Hammerfell", 139, 267),
    ("Gilane", "Hammerfell", 222, 323), ("Taneth", "Hammerfell", 301, 327),
    ("Hegathe", "Hammerfell", 150, 349), ("Rihad", "Hammerfell", 349, 379),
    ("Stros M'Kai", "Hammerfell", 177, 405),

    ("Solitude", "Skyrim", 462, 38), ("Dawnstar", "Skyrim", 558, 46),
    ("Winterhold", "Skyrim", 633, 40), ("Morthal", "Skyrim", 487, 76),
    ("Windhelm", "Skyrim", 645, 97), ("Markarth", "Skyrim", 378, 127),
    ("Whiterun", "Skyrim", 541, 148), ("Falkreath", "Skyrim", 505, 205),
    ("Riften", "Skyrim", 688, 209),

    ("Bruma", "Cyrodiil", 575, 262), ("Cheydinhal", "Cyrodiil", 703, 302),
    ("Chorrol", "Cyrodiil", 487, 312), ("Imperial City", "Cyrodiil", 605, 350),
    ("Kvatch", "Cyrodiil", 413, 434), ("Skingrad", "Cyrodiil", 487, 429),
    ("Anvil", "Cyrodiil", 365, 452), ("Bravil", "Cyrodiil", 663, 461),
    ("Leyawiin", "Cyrodiil", 671, 578),

    ("Blacklight", "Morrowind", 711, 95), ("Dagon Fel", "Morrowind", 852, 71),
    ("Gnisis", "Morrowind", 757, 118), ("Firewatch", "Morrowind", 935, 110),
    ("Ald'ruhn", "Morrowind", 810, 150), ("Sadrith Mora", "Morrowind", 952, 160),
    ("Balmora", "Morrowind", 807, 212), ("Seyda Neen", "Morrowind", 813, 236),
    ("Vivec", "Morrowind", 843, 264), ("Necrom", "Morrowind", 1019, 250),
    ("Mournhold", "Morrowind", 915, 348), ("Narsis", "Morrowind", 877, 393),
    ("Tear", "Morrowind", 975, 446),

    ("Stormhold", "Black Marsh", 837, 476), ("Thorn", "Black Marsh", 943, 479),
    ("Helstrom", "Black Marsh", 830, 563), ("Gideon", "Black Marsh", 742, 597),
    ("Archon", "Black Marsh", 927, 649), ("Soulrest", "Black Marsh", 752, 683),
    ("Blackrose", "Black Marsh", 819, 683),

    ("Riverhold", "Elsweyr", 571, 473), ("Dune", "Elsweyr", 521, 492),
    ("Orcrest", "Elsweyr", 573, 514), ("Rimmen", "Elsweyr", 641, 521),
    ("Corinthe", "Elsweyr", 583, 601), ("Torval", "Elsweyr", 543, 639),
    ("Senchal", "Elsweyr", 662, 698),

    ("Arenthia", "Valenwood", 500, 465), ("Falinesti", "Valenwood", 382, 522),
    ("Silvenar", "Valenwood", 419, 550), ("Elden Root", "Valenwood", 453, 601),
    ("Woodhearth", "Valenwood", 330, 609), ("Greenheart", "Valenwood", 390, 630),
    ("Southpoint", "Valenwood", 455, 675), ("Haven", "Valenwood", 521, 677),

    ("Firsthold", "Summerset Isles", 192, 504),
    ("Cloudrest", "Summerset Isles", 150, 546),
    ("Lillandril", "Summerset Isles", 63, 573),
    ("Skywatch", "Summerset Isles", 255, 587),
    ("Shimmerene", "Summerset Isles", 196, 625),
    ("Alinor", "Summerset Isles", 92, 659),
    ("Sunhold", "Summerset Isles", 148, 686),
    ("Dusk", "Summerset Isles", 219, 697),
]

PROVINCE_ORDER = ["High Rock", "Hammerfell", "Skyrim", "Cyrodiil", "Morrowind",
                  "Black Marsh", "Elsweyr", "Valenwood", "Summerset Isles"]


# --------------------------------------------------------------------------- #
# 1. classify
# --------------------------------------------------------------------------- #
def classify():
    a = np.asarray(Image.open(REF).convert("RGB")).astype(np.int16)
    R, B = a[..., 0], a[..., 2]
    bright = a.mean(axis=2)
    sea = ((B - R) > 10) & (bright >= 150)
    land = ~sea
    for (x0, y0, x1, y1) in UI_RECTS:
        land[y0:y1, x0:x1] = False
    land &= ~(((B - R) > 40) & (bright < 140))
    return land, bright


# --------------------------------------------------------------------------- #
# 2. the coasts the screenshot cuts off
# --------------------------------------------------------------------------- #
def extend_bottom(land, bright):
    h, w = land.shape
    out = np.zeros((h + BOTTOM_EXTRA, w), bool)
    out[:h] = land
    br = np.full((h + BOTTOM_EXTRA, w), 255.0)
    br[:h] = bright

    rows = np.nonzero(land.any(axis=1))[0]
    y_last = int(rows.max()) if len(rows) else h - 1
    row = land[y_last]
    spans, run = [], None
    for x in range(w):
        if row[x] and run is None:
            run = x
        elif not row[x] and run is not None:
            spans.append((run, x - 1)); run = None
    if run is not None:
        spans.append((run, w - 1))
    # join spans separated by a sliver so one coast does not become two lobes
    merged = []
    for s in spans:
        if merged and s[0] - merged[-1][1] <= 14:
            merged[-1] = (merged[-1][0], s[1])
        else:
            merged.append(s)
    n = 0
    for (x0, x1) in merged:
        hw = (x1 - x0) / 2.0
        if hw < 3:
            continue
        cx = (x0 + x1) / 2.0
        depth = min(BOTTOM_EXTRA - 6, max(6.0, hw * 0.42))
        for x in range(x0, x1 + 1):
            t = (x - cx) / hw
            # a shallow, shouldered profile reads as coast; a half-disc does not
            d = int(round(depth * max(0.0, 1.0 - t * t) ** 0.85))
            if d > 0:
                out[y_last + 1:y_last + 1 + d, x] = True
        n += 1
    print("bottom crop  : %d coastal spans continued below the frame" % n)
    return out, br


# --------------------------------------------------------------------------- #
# 3. regions from the reference's own border strokes
# --------------------------------------------------------------------------- #
def segment(land, bright):
    """Split the land on the reference's own border strokes.

    Everything darker than the flat land tone is ink: region borders, the
    heavier province borders, the coastline, plus labels and city markers.
    Labels cannot be separated by colour -- province borders and the coast are
    just as dark -- so they are told apart by shape: label and marker ink is
    dark AND small AND compact, while every real border is either light grey
    or long.
    """
    ink = land & (bright < 218)
    # strokes are 1px and anti-aliased; close the pinholes where a stroke
    # falls back to the land tone, or two regions leak into one
    ink = ndimage.binary_closing(ink, np.ones((3, 3))) & land

    lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
    areas = ndimage.sum(ink, lab, range(1, n + 1))
    meanb = ndimage.mean(bright, lab, range(1, n + 1))
    boxes = ndimage.find_objects(lab)
    drop = np.zeros(n + 1, bool)
    for i, sl in enumerate(boxes):
        if sl is None:
            continue
        bh = sl[0].stop - sl[0].start
        bw = sl[1].stop - sl[1].start
        if meanb[i] < 155 and areas[i] < 260 and (bh * bh + bw * bw) ** 0.5 < 95:
            drop[i + 1] = True
    web = ink & ~drop[lab]
    web = ndimage.binary_closing(web, np.ones((3, 3))) & land
    print("border web   : %d px (label/marker ink dropped: %d px in %d blobs)"
          % (web.sum(), int(areas[drop[1:]].sum()), int(drop.sum())))

    interior = land & ~web
    ilab, ino = ndimage.label(interior)
    isz = ndimage.sum(interior, ilab, range(1, ino + 1))
    seeds = np.isin(ilab, np.nonzero(isz >= SEED_AREA)[0] + 1)
    lab2, nseed = ndimage.label(seeds)
    print("raw regions  : %d seeds from the reference (of %d interior blobs)"
          % (nseed, ino))

    # grow the seeds over the strokes and the label holes so the land tiles
    _, idx = ndimage.distance_transform_edt(lab2 == 0, return_indices=True)
    grown = lab2[tuple(idx)]
    grown[~land] = 0
    return grown


def merge_small(lab, land):
    """Fold specks into the neighbour they share the most boundary with."""
    for _ in range(6):
        ids, counts = np.unique(lab[lab > 0], return_counts=True)
        area = dict(zip(ids.tolist(), counts.tolist()))
        small = [i for i in ids.tolist() if area[i] < MIN_REGION]
        if not small:
            break
        changed = 0
        for rid in small:
            m = lab == rid
            if not m.any():
                continue
            edge = ndimage.binary_dilation(m, np.ones((3, 3))) & ~m & (lab > 0)
            nb, nc = np.unique(lab[edge], return_counts=True)
            if len(nb) == 0:
                continue           # an island of its own: leave it alone
            lab[m] = nb[np.argmax(nc)]
            changed += 1
        if not changed:
            break
    ids = np.unique(lab[lab > 0])
    print("after merge  : %d regions" % len(ids))
    return lab


# --------------------------------------------------------------------------- #
# 5. naming
# --------------------------------------------------------------------------- #
def name_regions(lab):
    """Name each region from the reference's own city labels.

    The label text sits just above its marker, so the probe starts a few
    pixels below the text.  Where two labels probe into the same region --
    the coordinates are read off the image, so a few are a little out -- the
    loser searches outward for the nearest region nobody has claimed yet.
    """
    h, w = lab.shape
    name, prov, owner = {}, {}, {}
    unmatched = []

    def probe(cx, cy, allow_taken):
        best = None
        for r in range(0, 16, 2):
            cands = []
            for dy in range(-r, r + 1, 2):
                for dx in range(-r, r + 1, 2):
                    if max(abs(dx), abs(dy)) != r and r:
                        continue
                    x, y = cx + dx, cy + dy + 9
                    if 0 <= x < w and 0 <= y < h and lab[y, x] > 0:
                        rid = int(lab[y, x])
                        if allow_taken or rid not in owner:
                            cands.append((dx * dx + dy * dy, rid))
            if cands:
                best = min(cands)[1]
                break
        return best

    for (cname, cprov, cx, cy) in CITIES:
        rid = probe(cx, cy, allow_taken=False)
        if rid is None:
            rid = probe(cx, cy, allow_taken=True)
        if rid is None:
            unmatched.append(cname)
            continue
        if rid in owner:
            unmatched.append("%s (region already held by %s)" % (cname, owner[rid]))
            continue
        owner[rid] = cname
        name[rid] = cname
        prov[rid] = cprov
    # A few labels sit close enough together that the probe picks the wrong
    # region.  Hand whatever cities are left to the nearest region still
    # without a name, so the map keeps meaningful names throughout.
    ids = np.unique(lab[lab > 0]).tolist()
    cent = {i: ndimage.center_of_mass(lab == i) for i in ids}
    spare = [c for c in CITIES if c[0] not in owner.values()]
    free = [i for i in ids if i not in name]
    pairs = []
    for (cname, cprov, cx, cy) in spare:
        for rid in free:
            cy2, cx2 = cent[rid]
            pairs.append((((cx - cx2) ** 2 + (cy + 9 - cy2) ** 2) ** 0.5, cname, cprov, rid))
    pairs.sort()
    took_c, took_r = set(), set()
    for d, cname, cprov, rid in pairs:
        if d > 130 or cname in took_c or rid in took_r:
            continue
        name[rid] = cname
        prov[rid] = cprov
        took_c.add(cname); took_r.add(rid)
    if unmatched:
        print("re-homed     : %d label(s) the probe put in a neighbour's region"
              % len(took_c))
    print("named        : %d of %d regions carry a reference city"
          % (len(name), len(ids)))
    return name, prov


def flood_provinces(lab, prov):
    """Give unnamed regions the province of the nearest named one, walking the
    region adjacency so provinces stay contiguous."""
    ids = np.unique(lab[lab > 0]).tolist()
    adj = region_adjacency(lab)
    out = dict(prov)
    frontier = list(prov.keys())
    while frontier:
        nxt = []
        for r in frontier:
            for q in adj.get(r, ()):
                if q not in out:
                    out[q] = out[r]; nxt.append(q)
        frontier = nxt
    # anything still unassigned (an isolated island) takes its nearest neighbour
    missing = [i for i in ids if i not in out]
    if missing:
        cent = {i: np.array(ndimage.center_of_mass(lab == i)) for i in ids}
        for i in missing:
            best = min((k for k in out), key=lambda k: np.linalg.norm(cent[i] - cent[k]))
            out[i] = out[best]
        print("island prov  : %d assigned by proximity" % len(missing))
    return out


def region_adjacency(lab):
    adj = {}
    a = lab
    for da, db in ((a[:, :-1], a[:, 1:]), (a[:-1, :], a[1:, :])):
        m = (da > 0) & (db > 0) & (da != db)
        for u, v in set(zip(da[m].tolist(), db[m].tolist())):
            adj.setdefault(u, set()).add(v)
            adj.setdefault(v, set()).add(u)
    return adj


# --------------------------------------------------------------------------- #
# 6. depth: split the big regions without touching traced borders
# --------------------------------------------------------------------------- #
def noise_field(shape, rng, cells=26):
    """A smooth random field, used to make the added sub-borders wander."""
    small = rng.normal(0, 1, (max(2, shape[0] // cells + 2),
                              max(2, shape[1] // cells + 2)))
    z = ndimage.zoom(small, (shape[0] / small.shape[0], shape[1] / small.shape[1]),
                     order=3)
    z = z[:shape[0], :shape[1]]
    if z.shape != shape:                       # zoom can be a pixel short
        pad = np.zeros(shape)
        pad[:z.shape[0], :z.shape[1]] = z
        z = pad
    sd = z.std() or 1.0
    return z / sd


def subdivide(lab):
    """Split the big regions with k-means over their own pixels.

    Straight-line cluster boundaries would look computed, so each cluster's
    distance is modulated by its own smooth noise field: the split lines then
    wander the way the traced borders do.  Nothing here moves a border that
    came from the reference -- splits only ever add lines inside one region.
    """
    ids, counts = np.unique(lab[lab > 0], return_counts=True)
    area = dict(zip(ids.tolist(), counts.tolist()))
    nxt = int(ids.max()) + 1
    parent, splits = {}, 0
    for rid in ids.tolist():
        parent[rid] = rid
        k = int(round(area[rid] / float(TARGET_AREA)))
        if k < 2 or area[rid] < TARGET_AREA * 1.6:
            continue
        k = min(k, MAX_SPLIT)
        ys, xs = np.nonzero(lab == rid)
        pts = np.stack([xs, ys], 1).astype(float)
        try:
            cent, code = kmeans2(pts, k, minit="++", seed=int(rid) * 7 + 3, iter=40)
        except Exception:
            continue
        if len(np.unique(code)) < 2:
            continue
        rng = np.random.default_rng(int(rid) * 131 + 17)
        y0, y1 = ys.min(), ys.max() + 1
        x0, x1 = xs.min(), xs.max() + 1
        span = max(y1 - y0, x1 - x0)
        fields = [noise_field((y1 - y0, x1 - x0), rng, cells=max(8, span // 4))
                  for _ in range(k)]
        d = np.empty((k, len(xs)))
        ry, rx = ys - y0, xs - x0
        for c in range(k):
            dd = np.hypot(xs - cent[c][0], ys - cent[c][1])
            d[c] = dd * (1.0 + SPLIT_WOBBLE * fields[c][ry, rx])
        code = np.argmin(d, axis=0)
        for c in range(1, k):
            sel = code == c
            if sel.sum() < MIN_REGION:
                continue
            lab[ys[sel], xs[sel]] = nxt
            parent[nxt] = rid
            nxt += 1
        splits += 1
    # a wandering border can pinch off a pocket; keep each label's largest piece
    for rid in np.unique(lab[lab > 0]).tolist():
        m = lab == rid
        cc, ncc = ndimage.label(m)
        if ncc > 1:
            sz = ndimage.sum(m, cc, range(1, ncc + 1))
            lab[m & (cc != int(np.argmax(sz)) + 1)] = 0
    holes = (lab == 0) & LAND_REF
    if holes.any():
        _, idx = ndimage.distance_transform_edt(lab == 0, return_indices=True)
        filled = lab[tuple(idx)]
        lab[holes] = filled[holes]
    print("subdivision  : %d regions split -> %d total"
          % (splits, len(np.unique(lab[lab > 0]))))
    return lab, parent


# --------------------------------------------------------------------------- #
# 7. vectorise
# --------------------------------------------------------------------------- #
def chaikin(pts, iters=CHAIKIN):
    P = [tuple(map(float, q)) for q in pts]
    closed = P[0] == P[-1]
    if closed:
        P = P[:-1]
    for _ in range(iters):
        if len(P) < 4:
            break
        out = []
        n = len(P)
        for i in range(n):
            a, b = P[i], P[(i + 1) % n]
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        P = out
    return P


def mask_to_polygon(mask):
    pad = np.zeros((mask.shape[0] + 2, mask.shape[1] + 2), float)
    pad[1:-1, 1:-1] = mask
    rings = []
    for c in measure.find_contours(pad, 0.5):
        pts = [(x - 1.0, y - 1.0) for y, x in c]
        pts = chaikin(pts)
        if len(pts) < 4:
            continue
        p = Polygon(pts)
        if not p.is_valid:
            p = make_valid(p)
            if isinstance(p, MultiPolygon):
                p = max(p.geoms, key=lambda g: g.area)
            if not isinstance(p, Polygon):
                continue
        if p.area < 3:
            continue
        rings.append(p)
    if not rings:
        return None
    rings.sort(key=lambda p: -p.area)
    shells, holes = [], []
    for p in rings:
        if any(s.contains(p) for s in shells):
            holes.append(p)
        else:
            shells.append(p)
    polys = []
    for s in shells:
        hs = [h.exterior.coords for h in holes if s.contains(h)]
        polys.append(Polygon(s.exterior.coords, hs))
    g = polys[0] if len(polys) == 1 else MultiPolygon(polys)
    g = make_valid(g)
    if SIMPLIFY:
        g = g.simplify(SIMPLIFY)
    if GROW:
        g = g.buffer(GROW, join_style=2)
    if isinstance(g, MultiPolygon):
        parts = [p for p in g.geoms if p.area > 3]
        g = MultiPolygon(parts) if len(parts) > 1 else (parts[0] if parts else None)
    return g


def fmt(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def ring_path(coords):
    """Emit one ring.  Callers hand these in already-oriented order so the
    default non-zero fill rule renders holes correctly and overlapping parts
    simply merge instead of cancelling each other out."""
    pts = list(coords)
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if not pts:
        return ""
    return ("M%s %s" % (fmt(pts[0][0]), fmt(pts[0][1]))) + \
           "".join("L%s %s" % (fmt(x), fmt(y)) for x, y in pts[1:]) + "Z"


def geom_path(g, min_ring=2.0):
    if g is None or g.is_empty:
        return ""
    polys = g.geoms if isinstance(g, MultiPolygon) else [g]
    out = []
    for p in polys:
        if p.area < min_ring:
            continue
        p = orient(p, sign=1.0)          # exterior CCW, holes CW
        out.append(ring_path(p.exterior.coords))
        for h in p.interiors:
            if Polygon(h).area >= min_ring:
                out.append(ring_path(h.coords))
    return "".join(out)


def pole(geom, step=4.0):
    from shapely.geometry import Point
    if geom.is_empty:
        return (0.0, 0.0)
    main = max(geom.geoms, key=lambda g: g.area) if isinstance(geom, MultiPolygon) else geom
    minx, miny, maxx, maxy = main.bounds
    best, bd, s = None, -1.0, step
    for _ in range(4):
        xs = np.arange(minx + s / 2, maxx, s)
        ys = np.arange(miny + s / 2, maxy, s)
        if not len(xs) or not len(ys):
            break
        bnd = main.boundary
        for x in xs:
            for y in ys:
                pt = Point(x, y)
                if main.contains(pt):
                    d = pt.distance(bnd)
                    if d > bd:
                        bd, best = d, (float(x), float(y))
        if best is None:
            s /= 2.0
        else:
            minx, maxx = best[0] - s, best[0] + s
            miny, maxy = best[1] - s, best[1] + s
            s /= 3.0
    if best is None:
        p = main.representative_point()
        return (float(p.x), float(p.y))
    return best


def slug(t):
    out = "".join(c if c.isalnum() else "-" for c in t.lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


# --------------------------------------------------------------------------- #
def main():
    global LAND_REF
    land, bright = classify()
    land, bright = extend_bottom(land, bright)
    LAND_REF = land.copy()
    h, w = land.shape
    print("canvas       : %dx%d, land %.1f%%" % (w, h, 100 * land.mean()))

    lab = segment(land, bright)
    lab = merge_small(lab, land)
    name, prov = name_regions(lab)
    prov = flood_provinces(lab, prov)

    base_name, base_prov = dict(name), dict(prov)
    base_cent = {i: ndimage.center_of_mass(lab == i)
                 for i in np.unique(lab[lab > 0]).tolist()}
    lab, parent = subdivide(lab)
    adj = region_adjacency(lab)

    ids = np.unique(lab[lab > 0]).tolist()
    # names: a split region keeps its parent's name, numbered
    sibling = {}
    for rid in ids:
        p = parent.get(rid, rid)
        sibling.setdefault(p, []).append(rid)
    final_name, final_prov = {}, {}
    # anything with no city at all is named for where it sits in its province
    prov_pts = {}
    for p2 in sibling:
        prov_pts.setdefault(base_prov.get(p2, "?"), []).append(base_cent[p2])
    prov_mid = {k: (float(np.mean([c[1] for c in v])), float(np.mean([c[0] for c in v])))
                for k, v in prov_pts.items()}
    used_compass = {}
    for p, kids in sibling.items():
        if not base_name.get(p):
            pv = base_prov.get(p, "Region")
            cy, cx = base_cent[p]
            mx, my = prov_mid.get(pv, (cx, cy))
            dx, dy = cx - mx, cy - my
            ns = "North" if dy < -40 else ("South" if dy > 40 else "")
            ew = "West" if dx < -40 else ("East" if dx > 40 else "")
            where = (ns + "-" + ew if (ns and ew) else (ns or ew)) or "Central"
            key = (pv, where)
            used_compass[key] = used_compass.get(key, 0) + 1
            n = used_compass[key]
            base_name[p] = "%s %s%s" % (pv, where, "" if n == 1 else " " + ROMAN[n - 1])

    for p, kids in sibling.items():
        base = base_name.get(p) or ("%s %d" % (base_prov.get(p, "Region"), p))
        pv = base_prov.get(p, "Cyrodiil")
        kids.sort()
        for i, k in enumerate(kids):
            final_name[k] = base if len(kids) == 1 else "%s %s" % (base, ROMAN[i])
            final_prov[k] = pv

    print("vectorising  : %d regions" % len(ids))
    geoms, out_regions, id_of = {}, [], {}
    for rid in ids:
        g = mask_to_polygon(lab == rid)
        if g is None or g.is_empty:
            print("   ! empty geometry for region %d" % rid)
            continue
        geoms[rid] = g
        id_of[rid] = "%s_%s" % (slug(final_prov[rid]), slug(final_name[rid]))
    # unique ids
    seen = {}
    for rid in list(id_of):
        base = id_of[rid]
        if base in seen:
            seen[base] += 1
            id_of[rid] = "%s-%d" % (base, seen[base])
        else:
            seen[base] = 1

    # short sea crossings: islands would otherwise be unreachable, and the
    # simulator walks this graph
    keys = list(geoms)
    bnds = {r: geoms[r].bounds for r in keys}
    sea_links = {}
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            a, b = keys[i], keys[j]
            if b in adj.get(a, ()):
                continue
            ba, bb = bnds[a], bnds[b]
            if (ba[0] - bb[2] > SEA_LINK or bb[0] - ba[2] > SEA_LINK or
                    ba[1] - bb[3] > SEA_LINK or bb[1] - ba[3] > SEA_LINK):
                continue
            if geoms[a].distance(geoms[b]) <= SEA_LINK:
                sea_links.setdefault(a, set()).add(b)
                sea_links.setdefault(b, set()).add(a)
    print("sea links    : %d crossings under %.0fpx"
          % (sum(len(v) for v in sea_links.values()) // 2, SEA_LINK))

    land_geom = unary_union(list(geoms.values())).buffer(0.7).buffer(-0.7)
    land_draw = land_geom.simplify(0.5)
    for rid in geoms:
        g = geoms[rid]
        lx, ly = pole(g)
        base_of = parent.get(rid, rid)
        e = dict(id=id_of[rid], name=final_name[rid], province=final_prov[rid],
                 base=base_name.get(base_of) or final_name[rid],
                 d=geom_path(g), label=[round(lx, 1), round(ly, 1)],
                 area=round(g.area, 1),
                 nb=sorted(id_of[q] for q in
                           set(adj.get(rid, set())) | set(sea_links.get(rid, set()))
                           if q in id_of))
        if sea_links.get(rid):
            e["nbSea"] = sorted(id_of[q] for q in sea_links[rid] if q in id_of)
        if base_name.get(parent.get(rid, rid)) and final_name[rid] == base_name.get(parent.get(rid, rid)):
            e["city"] = base_name[parent[rid]]
            e["cityAt"] = [round(lx, 1), round(ly, 1)]
        out_regions.append(e)

    # the reference's own regions, as outlines for the middle border tier
    base_groups = {}
    for rid in geoms:
        base_groups.setdefault(parent.get(rid, rid), []).append(rid)
    base_regions = []
    for bid, kids in sorted(base_groups.items()):
        u = unary_union([geoms[k] for k in kids]).buffer(0.7).buffer(-0.7)
        u = u.simplify(OUTLINE_SIMPLIFY)
        base_regions.append(dict(
            name=base_name.get(bid) or ("%s %d" % (base_prov.get(bid, "Region"), bid)),
            province=base_prov.get(bid, "Cyrodiil"),
            d=geom_path(u),
            regions=sorted(id_of[k] for k in kids if k in id_of)))
    print("base regions : %d outlines from the reference" % len(base_regions))

    provinces = []
    for pname in PROVINCE_ORDER:
        mine = [geoms[r] for r in geoms if final_prov[r] == pname]
        if not mine:
            continue
        u = unary_union(mine).buffer(0.7).buffer(-0.7)
        lx, ly = pole(u, step=8.0)
        u = u.simplify(OUTLINE_SIMPLIFY)
        provinces.append(dict(name=pname, d=geom_path(u),
                              label=[round(lx, 1), round(ly, 1)],
                              area=round(u.area, 1),
                              regions=sorted(id_of[r] for r in geoms
                                             if final_prov[r] == pname)))

    b = land_geom.bounds
    data = dict(
        canvas=[w, h],
        fitBox=[round(b[0] - 10, 1), round(b[1] - 10, 1),
                round(b[2] - b[0] + 20, 1), round(b[3] - b[1] + 20, 1)],
        land=[geom_path(land_draw)],
        scenery=[], lakes=[], rivers=[],
        provinces=provinces, baseRegions=base_regions, regions=out_regions,
    )
    out = os.path.join(ROOT, "data", "tamriel-map.js")
    with open(out, "w") as f:
        f.write("/* Traced from the reference MapChart Tamriel image by\n"
                "   tools/trace_ref.py -- do not edit by hand. */\n")
        f.write("window.TAMRIEL_MAP = ")
        json.dump(data, f, separators=(",", ":"))
        f.write(";\n")

    total = sum(r["area"] for r in out_regions)
    print("provinces    : %d" % len(provinces))
    print("coverage     : %.2f%% of the traced land" % (100 * total / land_geom.area))
    print("adjacency    : %.1f neighbours avg"
          % (sum(len(r["nb"]) for r in out_regions) / len(out_regions)))
    iso = [r["id"] for r in out_regions if not r["nb"]]
    if iso:
        print("isolated     : %s" % ", ".join(iso[:8]))
    print("fit box      : %s" % data["fitBox"])
    print("output       : %s (%.0f KB)" % (out, os.path.getsize(out) / 1024.0))


ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]
LAND_REF = None

if __name__ == "__main__":
    main()
