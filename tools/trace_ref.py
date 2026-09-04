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
from skimage.segmentation import watershed
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
LABEL_DROP = 9            # px: the label text sits this far above its marker
MIN_ISLAND = 45           # px: standalone islands may be smaller than that
TARGET_AREA = 2500        # px: aim for subdivisions around this size
MAX_SPLIT = 5
SPLIT_WOBBLE = 0.10       # how far a cut wanders, as a fraction of its length
SUB_AREA = 2300           # px: target size of a subregion
MAX_SPLIT_N = 8           # a big region may need more than a handful of parcels
SEA_LINK = 14             # px: parcels this close across water count as neighbours
CITY_RADIUS = 13.0        # px: reach of a city district
CHAIKIN = 4               # corner-cutting passes over every outline
SIMPLIFY = 0.25
OUTLINE_SIMPLIFY = 1.1    # stroke-only layers can be much coarser
GROW = 0.18               # px: overlap that closes hairline seams between neighbours

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
                  "Black Marsh", "Anequina", "Pellitine", "Valenwood", "Alinor"]

# ---------------------------------------------------------------------------
# Lore, as of 4E 200 (the "Tamriel and its Nations" reference).
#
# The provinces are renamed to their Fourth Era forms -- Summerset is Alinor,
# and Elsweyr is not one polity but the two kingdoms of Anequina in the north
# and Pellitine in the south -- and each is tagged with the nation that holds
# it, which is what the reference actually colours.
# ---------------------------------------------------------------------------
PROVINCE_RENAME = {"Summerset Isles": "Alinor"}
# Elsweyr splits on latitude: Anequina's plains north, Pellitine's jungle south
ELSWEYR_SPLIT_Y = 555.0

NATIONS = {
    "High Rock": "Mede Empire", "Skyrim": "Mede Empire", "Cyrodiil": "Mede Empire",
    "Hammerfell": "Hammerfell", "Morrowind": "Morrowind", "Black Marsh": "Black Marsh",
    "Alinor": "Aldmeri Dominion", "Valenwood": "Aldmeri Dominion",
    "Anequina": "Aldmeri Dominion", "Pellitine": "Aldmeri Dominion",
}

# Where lore gives a region a name of its own, the city becomes just the seat.
# Only mappings that are canonical and unambiguous are listed; anything absent
# keeps its city-state name, which is how both reference maps label them.
LORE_REGIONS = {
    # Skyrim's nine holds
    "Solitude": "Haafingar", "Morthal": "Hjaalmarch", "Dawnstar": "The Pale",
    "Falkreath": "Falkreath Hold", "Riften": "The Rift", "Markarth": "The Reach",
    "Windhelm": "Eastmarch", "Whiterun": "Whiterun Hold",
    # High Rock's regions
    "Northpoint": "Rivenspire", "Camlorn": "Glenumbra",
    "Wayrest": "Stormhaven", "Evermore": "Bangkorai",
    # Cyrodiil's regions
    "Bruma": "Jerall Mountains", "Chorrol": "Great Forest",
    "Imperial City": "Heartlands", "Cheydinhal": "Valus Mountains",
    "Skingrad": "West Weald", "Kvatch": "Colovian Highlands",
    "Anvil": "Gold Coast", "Bravil": "Nibenay Basin", "Leyawiin": "Blackwood",
    # Hammerfell
    "Dragonstar": "Dragontail Mountains", "Elinhir": "Craglorn",
    "Skaven": "Alik'r Desert",
    # Vvardenfell and the Morrowind mainland
    "Gnisis": "West Gash", "Ald'ruhn": "Ashlands", "Balmora": "Bitter Coast",
    "Seyda Neen": "Ascadian Isles", "Mournhold": "Deshaan",
    "Sadrith Mora": "Azura's Coast", "Dagon Fel": "Sheogorad",
    "Necrom": "Telvanni Peninsula",
    # the Dominion
    "Elden Root": "Grahtwood", "Silvenar": "Malabal Tor",
    "Greenheart": "Greenshade", "Arenthia": "Reaper's March",
    "Firsthold": "Auridon", "Alinor": "Summerset",
    "Stormhold": "Shadowfen", "Gideon": "Murkmire",
}

# Regions the flood puts in the wrong province.  The flood walks the region
# adjacency from the nearest city, which is right nearly everywhere but cannot
# know where a frontier actually runs when the region carries no label of its
# own.  Each entry is a point inside the region, the province it belongs to,
# and the name it takes there.
PROVINCE_OVERRIDE = [
    # the Brena is Cyrodiil's western march, not Hammerfell's eastern one
    (457, 363, "Cyrodiil", "Brena Valley"),
    # the wedge north-east of Blackwood is Cyrodiil's, so it cannot keep an
    # Argonian name: the Corbolo runs east through it towards Black Marsh
    (734, 514, "Cyrodiil", "Corbolo River"),
    # a province of None keeps the province and only pins the name.  Compass
    # placeholders are numbered per province, so moving one region out of a
    # province renumbers the rest and their names would drift.
    (761, 665, None, "Alten Corimont"),
]

# Compass placeholders replaced with the feature the reference labels there.
LORE_PLACEHOLDERS = {
    # Skyrim
    "Skyrim North": "Icy Coast", "Skyrim North-East": "Broken Cape",
    "Skyrim East": "Winterhold Coast",
    # Cyrodiil -- named for the rivers and bays Oblivion itself names them by
    "Cyrodiil North": "Larsius River", "Cyrodiil Central": "Niben Bay",
    "Cyrodiil East": "Panther River", "Cyrodiil East II": "Silverfish River",
    "Cyrodiil South-East": "Nibenay Valley", "Cyrodiil South": "Strid River",
    # Hammerfell
    "Hammerfell East": "Dak'fron", "Hammerfell South-East": "Brena Valley",
    "Hammerfell South": "Khefrem",
    # Morrowind
    "Morrowind West": "Red Mountain", "Morrowind East": "Telvanni Isles",
    "Morrowind North-West": "Velothi Mountains",
    "Morrowind North": "Grazelands", "Morrowind North-East": "Port Telvannis",
    "Morrowind North-East II": "Firewatch Coast", "Morrowind Central": "Molag Amur",
    "Morrowind Central II": "Zafirbel Bay", "Morrowind South-East": "Boethiah's Spine",
    # Black Marsh
    "Black Marsh North-West": "Arnesia", "Black Marsh West": "Thornmarsh",
    "Black Marsh South-West": "Alten Corimont", "Black Marsh South": "Onkobra",
    "Black Marsh South II": "Xanmeer Basin",
    # the Dominion
    "Valenwood South-West": "Greenshade Isles",
    "Alinor South-West": "Corgrad Wastes", "Alinor South": "Eton Nir",
    "Anequina Central": "Northern Woods", "Pellitine Central": "Tenmar Forest",
}

# the seat of each province, drawn larger than the other cities
CAPITALS = {
    "High Rock": "Stormhaven", "Hammerfell": "Sentinel", "Skyrim": "Haafingar",
    "Cyrodiil": "Heartlands", "Morrowind": "Deshaan",
    "Black Marsh": "Helstrom", "Anequina": "Riverhold", "Pellitine": "Torval",
    "Valenwood": "Grahtwood", "Alinor": "Summerset",
}


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

    lab2 = split_merged_cells(lab2, nseed, bright)

    # grow the seeds over the strokes and the label holes so the land tiles
    _, idx = ndimage.distance_transform_edt(lab2 == 0, return_indices=True)
    grown = lab2[tuple(idx)]
    grown[~land] = 0
    return grown


def nearest_in(mask, cx, cy, reach=26):
    """Nearest pixel of `mask` to a city marker (the label sits above it)."""
    h, w = mask.shape
    for r in range(reach):
        y0, y1 = max(0, cy - r), min(h, cy + r + 1)
        x0, x1 = max(0, cx - r), min(w, cx + r + 1)
        sub = mask[y0:y1, x0:x1]
        if not sub.any():
            continue
        ys, xs = np.nonzero(sub)
        k = int(np.argmin((ys + y0 - (cy + LABEL_DROP)) ** 2 + (xs + x0 - cx) ** 2))
        return int(ys[k] + y0), int(xs[k] + x0)
    return None


def split_merged_cells(lab2, nseed, bright):
    """Prise apart cells that swallowed more than one of the reference's cities.

    A border stroke is 1px and anti-aliased, so a few of them fall back to the
    land tone for a pixel or two and two of the reference's regions leak into
    one cell.  Closing the web cannot fix every such pinhole without eating the
    genuinely narrow regions, and the damage is not cosmetic: one cell held
    Falkreath, Riften *and* Cheydinhal, which put a third of Cyrodiil inside
    Skyrim.

    Each of the reference's regions carries exactly one city label, so a cell
    holding n of them is n regions stuck together.  Watershed it apart with the
    cities as markers and the image itself as the relief: the cut then follows
    the faint stroke that is actually there rather than an invented line.
    """
    nxt = nseed + 1
    for _ in range(6):
        held = {}
        for (cname, cprov, cx, cy) in CITIES:
            hit = nearest_in(lab2 > 0, cx, cy)
            if hit:
                held.setdefault(int(lab2[hit]), []).append((cx, cy))
        merged = {k: v for k, v in held.items() if len(v) > 1}
        if not merged:
            break
        split = 0
        for cell, pts in merged.items():
            m = lab2 == cell
            mark = np.zeros(m.shape, np.int32)
            placed = 0
            for (cx, cy) in pts:
                at = nearest_in(m, cx, cy)
                if at is None or mark[at]:
                    continue
                mark[at] = cell if placed == 0 else nxt
                if placed:
                    nxt += 1
                placed += 1
            if placed < 2:
                continue
            cut = watershed(bright, mark, mask=m)
            take = cut > 0
            lab2[take] = cut[take]
            split += 1
        print("split merged : %d cells held several cities -> %d prised apart"
              % (len(merged), split))
        if not split:
            break
    return lab2


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
        CITY_AT[rid] = [float(cx), float(cy) + 9.0]
        CITY_NAME[rid] = cname
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
        CITY_AT[rid] = [float(cx), float(cy) + 9.0]
        CITY_NAME[rid] = cname
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


def apply_province_override(lab, prov, name):
    """Move the handful of regions the flood cannot place, and name them."""
    h, w = lab.shape
    for (x, y, pv, nm) in PROVINCE_OVERRIDE:
        rid = int(lab[y, x]) if 0 <= y < h and 0 <= x < w else 0
        if not rid:
            print("override     : no region at (%d,%d) -- skipped" % (x, y))
            continue
        was = prov.get(rid, "?")
        if pv:
            prov[rid] = pv
        name[rid] = nm
        print("override     : (%d,%d) %s -> %s, named %s"
              % (x, y, was, pv or was, nm))
    return prov, name


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
def wander(n, rng, amp, harmonics=4):
    """A 1-D displacement with a coastline's spectrum: one broad sweep
    carrying progressively finer detail.  Because it stays a single-valued
    function of the across-axis it can bend as much as it likes without ever
    crossing itself, so the cut is always a clean split.

    The rolloff has to be steep.  At 1/h the higher harmonics carry nearly as
    much as the fundamental and the cut comes out as a tight zigzag -- it
    reads as noise, not as a border.  At 1/h**1.9 the fundamental dominates,
    so the cut is a long meander that only ripples on its way across.
    """
    t = np.linspace(0.0, 1.0, max(2, n))
    out = np.zeros_like(t)
    for h in range(harmonics):
        f = (h + 1) * rng.uniform(0.35, 0.7)
        out += rng.uniform(0.7, 1.0) / (h + 1) ** 2.2 * np.sin(
            2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
    sd = out.std() or 1.0
    return out / sd * amp


def bisect(ys, xs, rng, frac=0.5):
    """Cut a blob in two along a wandering line across its short axis.

    `frac` is the share of the blob that should end up on the low side, so a
    parcel count that is not a power of two still comes out even.

    k-means leaves interior clusters, which come out as discs -- very obvious
    on the big southern regions.  Cutting instead always produces two parcels
    that each reach the blob's edge, so subdivisions look carved rather than
    stamped out.
    """
    pts = np.stack([xs, ys], 1).astype(float)
    c = pts.mean(0)
    q = pts - c
    cov = np.cov(q.T)
    w, v = np.linalg.eigh(cov)
    u = v[:, int(np.argmax(w))]              # long axis
    perp = np.array([-u[1], u[0]])
    t = q @ u
    sacross = q @ perp
    lo, hi = sacross.min(), sacross.max()
    span = max(1e-6, hi - lo)
    tspan = max(1e-6, t.max() - t.min())

    prof = wander(256, rng, amp=SPLIT_WOBBLE * min(span, tspan))
    idx = np.clip(((sacross - lo) / span * 255).astype(int), 0, 255)
    off = prof[idx]

    # Slide the whole meander until it cuts off exactly the share we asked
    # for.  Falling back to a straight quantile line instead -- which is what
    # this used to do -- is what put those dead-straight spokes across the
    # bigger regions: the moment the wander skewed the split at all, the
    # cut it was replaced with had no shape to it whatsoever.
    resid = t - off
    shift = float(np.quantile(resid, frac))
    return resid > shift


def split_blob(mask, k, seed, floor):
    """Label a blob into k parcels of comparable size.

    Splitting the largest parcel over and over gives 50/25/25 for three, which
    is what made the subdivisions look arbitrary.  Instead each cut is
    proportional -- k parts are split into halves of ceil(k/2) and floor(k/2)
    parcels, recursively -- so every parcel lands near the target area.
    """
    rng = np.random.default_rng(seed)
    ys, xs = np.nonzero(mask)
    lab = np.full(len(ys), -1, int)
    counter = [0]

    def rec(sel, n):
        if n <= 1 or len(sel) < 2 * floor:
            lab[sel] = counter[0]
            counter[0] += 1
            return
        ka = n // 2
        side = bisect(ys[sel], xs[sel], rng, frac=ka / float(n))
        a, b = sel[~side], sel[side]
        if len(a) < floor or len(b) < floor:
            lab[sel] = counter[0]
            counter[0] += 1
            return
        rec(a, ka)
        rec(b, n - ka)

    rec(np.arange(len(ys)), k)
    return ys, xs, lab


def tidy_parcels(lab, land):
    """Keep each parcel's largest piece; hand strays to the nearest neighbour."""
    for rid in np.unique(lab[lab > 0]).tolist():
        m = lab == rid
        cc, ncc = ndimage.label(m)
        if ncc > 1:
            sz = ndimage.sum(m, cc, range(1, ncc + 1))
            lab[m & (cc != int(np.argmax(sz)) + 1)] = 0
    holes = (lab == 0) & land
    if holes.any():
        _, idx = ndimage.distance_transform_edt(lab == 0, return_indices=True)
        filled = lab[tuple(idx)]
        lab[holes] = filled[holes]
    return lab


def smooth_cuts(lab, parent, radius=3, rounds=4):
    """Round off the stair-steps a rasterised cut leaves behind.

    Only pixels whose whole neighbourhood sits inside one map region may
    move, and they may only move between that region's own parcels, so not a
    single pixel of the reference's own outline -- coast, traced border, the
    lot -- can shift.  Inside that guard the parcel labels are run through a
    mode filter, which pulls the cut off the pixel grid and onto a smooth
    curve without ever opening a gap or an overlap: every pixel still belongs
    to exactly one parcel.
    """
    base = np.zeros_like(lab)
    for child, top in parent.items():
        base[lab == child] = top
    kids = {}
    for child, top in parent.items():
        kids.setdefault(top, []).append(child)

    k = 2 * radius + 1
    win = np.ones((k, k), float)
    moved = 0
    for top, group in kids.items():
        if len(group) < 2:
            continue
        m = base == top
        ys, xs = np.nonzero(m)
        y0, y1 = ys.min(), ys.max() + 1
        x0, x1 = xs.min(), xs.max() + 1
        sub = lab[y0:y1, x0:x1]
        inside = m[y0:y1, x0:x1]
        # a pixel may only move if every pixel it is averaged with is in the
        # same map region -- that is what keeps the traced outline exact
        safe = ndimage.binary_erosion(inside, np.ones((k, k)))
        if not safe.any():
            continue
        for _ in range(rounds):
            best = None
            score = None
            for c in group:
                v = ndimage.uniform_filter((sub == c).astype(float), size=k)
                if score is None:
                    score, best = v, np.full(sub.shape, c)
                else:
                    take = v > score
                    score = np.where(take, v, score)
                    best = np.where(take, c, best)
            changed = safe & (best != sub)
            moved += int(changed.sum())
            sub = np.where(changed, best, sub)
        lab[y0:y1, x0:x1] = sub
    print("smooth cuts  : %d px moved between parcels of the same region" % moved)
    return lab


def subdivide(lab, target_area, max_split, land, tag):
    """Split every region bigger than target_area, returning child -> parent."""
    ids, counts = np.unique(lab[lab > 0], return_counts=True)
    area = dict(zip(ids.tolist(), counts.tolist()))
    nxt = int(ids.max()) + 1
    parent, splits = {}, 0
    floor = max(MIN_REGION, int(target_area * 0.55))
    for rid in ids.tolist():
        parent[rid] = rid
        k = int(round(area[rid] / float(target_area)))
        if k < 2 or area[rid] < target_area * 1.45:
            continue
        k = min(k, max_split)
        ys, xs, sub = split_blob(lab == rid, k, int(rid) * 7919 + 13, floor)
        if sub.max() < 1:
            continue
        parts = [c for c in range(int(sub.max()) + 1) if (sub == c).sum() >= MIN_REGION]
        if len(parts) < 2:
            continue
        for c in parts[1:]:            # the first keeps the region's own label
            sel = sub == c
            lab[ys[sel], xs[sel]] = nxt
            parent[nxt] = rid
            nxt += 1
        splits += 1
    lab = tidy_parcels(lab, land)
    lab = smooth_cuts(lab, parent)
    lab = tidy_parcels(lab, land)
    sizes = np.bincount(lab.ravel())[1:]
    sizes = sizes[sizes > 0]
    print("%-13s: %d split -> %d parcels (area min %d, median %d, max %d)"
          % (tag, splits, len(sizes), sizes.min(), int(np.median(sizes)), sizes.max()))
    return lab, parent


# --------------------------------------------------------------------------- #
# 7. vectorise
# --------------------------------------------------------------------------- #
def chaikin(pts, iters=None):
    iters = CHAIKIN if iters is None else iters
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


def mask_to_polygon(mask, grow=None, simplify=None):
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
    simp = SIMPLIFY if simplify is None else simplify
    if simp:
        g = g.simplify(simp)
    gr = GROW if grow is None else grow
    if gr:
        g = g.buffer(gr, join_style=2)
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
def drop_ink_islands(land, bright):
    """Labels drawn over water are dark, so they do not classify as sea and
    would survive as letter-shaped islands.  Any land component that is small,
    dark and compact is label or marker ink, not land -- real islets carry the
    flat land tone and so are far brighter."""
    lab, n = ndimage.label(land)
    if not n:
        return land
    areas = ndimage.sum(land, lab, range(1, n + 1))
    meanb = ndimage.mean(bright, lab, range(1, n + 1))
    boxes = ndimage.find_objects(lab)
    drop = np.zeros(n + 1, bool)
    for i, sl in enumerate(boxes):
        if sl is None:
            continue
        bh = sl[0].stop - sl[0].start
        bw = sl[1].stop - sl[1].start
        if meanb[i] < 165 and areas[i] < 300 and (bh * bh + bw * bw) ** 0.5 < 110:
            drop[i + 1] = True
    if drop.any():
        print("ink islands  : %d dropped (%d px of label text over water)"
              % (int(drop.sum()), int(areas[drop[1:]].sum())))
    return land & ~drop[lab]


def main():
    global LAND_REF
    land, bright = classify()
    land = drop_ink_islands(land, bright)
    land, bright = extend_bottom(land, bright)
    LAND_REF = land.copy()
    h, w = land.shape
    print("canvas       : %dx%d, land %.1f%%" % (w, h, 100 * land.mean()))

    lab = segment(land, bright)
    lab = merge_small(lab, land)
    name, prov = name_regions(lab)
    prov = flood_provinces(lab, prov)
    prov, name = apply_province_override(lab, prov, name)

    base_name, base_prov = dict(name), dict(prov)
    base_cent = {i: ndimage.center_of_mass(lab == i)
                 for i in np.unique(lab[lab > 0]).tolist()}

    # --- lore pass: province forms, the Elsweyr split, and region names -----
    renamed = 0
    for bid in list(base_prov):
        pv = base_prov[bid]
        if pv == "Elsweyr":
            cy = base_cent[bid][0] if bid in base_cent else 0
            base_prov[bid] = "Anequina" if cy < ELSWEYR_SPLIT_Y else "Pellitine"
        elif pv in PROVINCE_RENAME:
            base_prov[bid] = PROVINCE_RENAME[pv]
    for bid, nm in list(base_name.items()):
        new = LORE_REGIONS.get(nm) or LORE_PLACEHOLDERS.get(nm)
        if new and new != nm:
            base_name[bid] = new
            renamed += 1
    print("lore pass    : %d regions renamed, provinces -> %s"
          % (renamed, ", ".join(sorted(set(base_prov.values())))))

    # one round of cutting: map region -> subregion
    lab, p2 = subdivide(lab, SUB_AREA, MAX_SPLIT_N, land, "subregions")
    sub_parent = {c: c for c in np.unique(lab[lab > 0]).tolist()}
    parent = {c: p2.get(c, c) for c in sub_parent}
    adj = region_adjacency(lab)

    ids = np.unique(lab[lab > 0]).tolist()
    # names: a parcel keeps its map region's name, numbered by subregion and
    # then lettered within it
    sibling = {}
    for rid in ids:
        p = parent.get(rid, rid)
        sibling.setdefault(p, []).append(rid)
    sub_sibling = {}
    for rid in ids:
        sub_sibling.setdefault(sub_parent[rid], []).append(rid)
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
            nm2 = "%s %s%s" % (pv, where, "" if n == 1 else " " + ROMAN[n - 1])
            base_name[p] = LORE_PLACEHOLDERS.get(nm2, nm2)

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
            # parcels of one map region are already linked through their siblings
            if parent.get(a, a) == parent.get(b, b):
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

    # The coastline is traced straight off the mask rather than unioned back
    # out of the regions, so the silhouette is exactly what the image shows.
    # Regions are then clipped to it: they keep the seam-closing overgrow on
    # their inland edges but cannot spill past the coast.
    land_geom = mask_to_polygon(LAND_REF, grow=0.0, simplify=0.35)
    for rid in list(geoms):
        clipped = geoms[rid].intersection(land_geom)
        if isinstance(clipped, MultiPolygon):
            parts = [q for q in clipped.geoms if q.area > 3]
            clipped = MultiPolygon(parts) if len(parts) > 1 else (parts[0] if parts else None)
        if clipped is not None and not clipped.is_empty and clipped.area > 3:
            geoms[rid] = clipped
    land_draw = land_geom
    # the reference's own regions, as outlines for the middle border tier
    base_groups = {}
    for rid in geoms:
        base_groups.setdefault(parent.get(rid, rid), []).append(rid)
    base_id_of = {}
    city_at = {b: [round(v[0], 1), round(v[1], 1)] for b, v in CITY_AT.items()}

    for bid in sorted(base_groups):
        nm = base_name.get(bid) or ("%s %d" % (base_prov.get(bid, "Region"), bid))
        cand = "%s_%s" % (slug(base_prov.get(bid, "region")), slug(nm))
        n, uniq = 1, cand
        while uniq in base_id_of.values():
            n += 1
            uniq = "%s-%d" % (cand, n)
        base_id_of[bid] = uniq
    sub_groups = {}
    for rid in geoms:
        sub_groups.setdefault(sub_parent[rid], []).append(rid)
    sub_id_of, sub_regions = {}, []
    for sid in sorted(sub_groups):
        kids = sub_groups[sid]
        nm = final_name[kids[0]]
        if len(kids) > 1:
            nm = nm[:-1].strip()
        cand = "%s_%s" % (slug(final_prov[kids[0]]), slug(nm))
        n, uniq = 1, cand
        while uniq in sub_id_of.values():
            n += 1
            uniq = "%s-%d" % (cand, n)
        sub_id_of[sid] = uniq
    for sid in sorted(sub_groups):
        kids = sub_groups[sid]
        u = unary_union([geoms[k] for k in kids]).buffer(0.7).buffer(-0.7)
        u = u.simplify(OUTLINE_SIMPLIFY)
        nm = final_name[kids[0]]
        if len(kids) > 1:
            nm = nm[:-1].strip()
        sub_regions.append(dict(
            id=sub_id_of[sid], name=nm, province=final_prov[kids[0]],
            baseId=None, d=geom_path(u),
            regions=sorted(id_of[k] for k in kids if k in id_of)))
    for srec in sub_regions:
        first = srec["regions"][0] if srec["regions"] else None
        if first:
            for rid2 in geoms:
                if id_of.get(rid2) == first:
                    srec["baseId"] = base_id_of[parent.get(rid2, rid2)]
                    break
    print("subregion    : %d outlines" % len(sub_regions))

    base_regions = []
    for bid, kids in sorted(base_groups.items()):
        u = unary_union([geoms[k] for k in kids]).buffer(0.7).buffer(-0.7)
        u = u.simplify(OUTLINE_SIMPLIFY)
        lx, ly = pole(u, step=6.0)
        nm = base_name.get(bid) or ("%s %d" % (base_prov.get(bid, "Region"), bid))
        pv = base_prov.get(bid, "Cyrodiil")
        rec = dict(
            id=base_id_of[bid], name=nm, province=pv, d=geom_path(u),
            label=[round(lx, 1), round(ly, 1)], area=round(u.area, 1),
            regions=sorted(id_of[k] for k in kids if k in id_of))
        if bid in city_at:
            rec["city"] = CITY_NAME.get(bid, nm)
            rec["cityAt"] = city_at[bid]
            rec["capital"] = (CAPITALS.get(pv) == nm)
        base_regions.append(rec)

    # every province gets a seat: if its named capital did not survive the
    # label matching, promote its largest city
    for pv in PROVINCE_ORDER:
        mine = [r for r in base_regions if r["province"] == pv and r.get("city")]
        if mine and not any(r.get("capital") for r in mine):
            max(mine, key=lambda r: r["area"])["capital"] = True
    print("base regions : %d outlines from the reference" % len(base_regions))


    for rid in geoms:
        g = geoms[rid]
        lx, ly = pole(g)
        base_of = parent.get(rid, rid)
        e = dict(id=id_of[rid], name=final_name[rid], province=final_prov[rid],
                 base=base_name.get(base_of) or final_name[rid],
                 baseId=base_id_of[base_of],
                 subId=sub_id_of[sub_parent[rid]],
                 d=geom_path(g), label=[round(lx, 1), round(ly, 1)],
                 area=round(g.area, 1),
                 nb=sorted(id_of[q] for q in
                           set(adj.get(rid, set())) | set(sea_links.get(rid, set()))
                           if q in id_of))
        if sea_links.get(rid):
            e["nbSea"] = sorted(id_of[q] for q in sea_links[rid] if q in id_of)
        out_regions.append(e)

    provinces = []
    for pname in PROVINCE_ORDER:
        mine = [geoms[r] for r in geoms if final_prov[r] == pname]
        if not mine:
            continue
        u = unary_union(mine).buffer(0.7).buffer(-0.7)
        lx, ly = pole(u, step=8.0)
        u = u.simplify(OUTLINE_SIMPLIFY)
        provinces.append(dict(name=pname, nation=NATIONS.get(pname, pname),
                              d=geom_path(u),
                              label=[round(lx, 1), round(ly, 1)],
                              area=round(u.area, 1),
                              regions=sorted(id_of[r] for r in geoms
                                             if final_prov[r] == pname)))

    # circular city districts -- a city-state's reach around its seat, clipped
    # to its own province so a disc never bleeds across a border
    city_districts = []
    for brec in base_regions:
        if not brec.get("city"):
            continue
        # a plain circle: the reference draws city reach as a disc, and
        # clipping it to the coast made it read as a lumpy blob
        r = CITY_RADIUS * (1.55 if brec.get("capital") else 1.0)
        city_districts.append(dict(
            id="city_" + slug(brec["city"]), name=brec["city"],
            region=brec["name"],
            province=brec["province"], capital=bool(brec.get("capital")),
            baseId=brec["id"], at=brec["cityAt"], r=round(r, 1)))
    print("city discs   : %d (%d capitals)"
          % (len(city_districts), sum(1 for c in city_districts if c["capital"])))

    b = land_geom.bounds
    data = dict(
        canvas=[w, h],
        fitBox=[round(b[0] - 10, 1), round(b[1] - 10, 1),
                round(b[2] - b[0] + 20, 1), round(b[3] - b[1] + 20, 1)],
        land=[geom_path(land_draw)],
        scenery=[], lakes=[], rivers=[],
        provinces=provinces, baseRegions=base_regions, regions=out_regions,
        cityDistricts=city_districts,
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
CITY_AT = {}
CITY_NAME = {}
LAND_REF = None

if __name__ == "__main__":
    main()
