# -*- coding: utf-8 -*-
"""
Builds data/tamriel-map.js from tools/geo_data.py.

Method
------
1. Coastlines are hand-authored rings (geo_data.MAINLAND / ISLANDS).
2. Region seeds are tessellated with a Voronoi diagram, computed *per landmass*
   so that an island is never claimed by a mainland region.
3. Every interior Voronoi edge is replaced by a fractal (midpoint-displacement)
   polyline.  The displacement is keyed on the edge's vertex pair, so the two
   cells sharing an edge generate the *identical* wiggly line and the borders
   stay watertight -- no slivers, no gaps.  Voronoi vertices (where three
   regions meet) are left untouched, so triple junctions stay exact.
4. Cells are clipped against the coastline, which supplies the natural
   land/sea boundary.
5. Adjacency is taken from the Voronoi ridges, plus short sea crossings, and
   shipped with the map so the app can run growth simulations over it.
"""
import hashlib
import json
import math
import os
import sys

import numpy as np
from scipy.spatial import Voronoi
from shapely.geometry import Polygon, MultiPolygon, Point, LineString
from shapely.ops import unary_union
from shapely import make_valid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import geo_data as G  # noqa: E402

NOISE_LEVELS = 3          # 2**3 = 8 segments per Voronoi edge, then smoothed
NOISE_AMP = 0.10          # first displacement, as a fraction of edge length
NOISE_DECAY = 0.55
NOISE_MAX = 6.0           # px: cap, so the very long outer edges stay tame
EDGE_SMOOTH = 2           # Chaikin passes over each perturbed border
COAST_SAMPLES = 3         # centripetal Catmull-Rom samples per coast segment
SEA_LINK_DIST = 34.0      # px: islands closer than this count as neighbours


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def catmull_ring(pts, closed=True, samples=COAST_SAMPLES, alpha=0.5):
    """
    Centripetal Catmull-Rom resampling.  The curve passes through every
    authored point but arrives smoothly, which is what turns a hand-typed
    coastline into something that reads as drawn rather than plotted.
    Centripetal parameterisation (alpha=0.5) cannot overshoot into a cusp,
    so narrow inlets and cape tips survive intact.
    """
    P = [np.asarray(q, float) for q in pts]
    if len(P) > 1 and np.allclose(P[0], P[-1]):
        P = P[:-1]
    n = len(P)
    if n < 4:
        return [tuple(q) for q in P]
    out = []
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = P[(i - 1) % n] if closed else P[max(0, i - 1)]
        p1 = P[i % n]
        p2 = P[(i + 1) % n] if closed else P[min(n - 1, i + 1)]
        p3 = P[(i + 2) % n] if closed else P[min(n - 1, i + 2)]
        d1 = max(np.linalg.norm(p1 - p0), 1e-6) ** alpha
        d2 = max(np.linalg.norm(p2 - p1), 1e-6) ** alpha
        d3 = max(np.linalg.norm(p3 - p2), 1e-6) ** alpha
        # tangents for the centripetal form
        m1 = (p2 - p1 + d2 * ((p1 - p0) / d1 - (p2 - p0) / (d1 + d2)))
        m2 = (p2 - p1 + d2 * ((p3 - p2) / d3 - (p3 - p1) / (d2 + d3)))
        for k in range(samples):
            t = k / float(samples)
            t2, t3 = t * t, t * t * t
            pt = ((2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 +
                  (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2)
            out.append((float(pt[0]), float(pt[1])))
    if not closed:
        out.append((float(P[-1][0]), float(P[-1][1])))
    return out


def chaikin(pts, iters=EDGE_SMOOTH, keep_ends=True):
    """Corner-cutting smoothing.  Symmetric, so an edge walked from either
    end yields the identical polyline -- which is what keeps two regions'
    shared border watertight after smoothing."""
    P = [tuple(map(float, q)) for q in pts]
    for _ in range(max(0, iters)):
        if len(P) < 3:
            break
        out = [P[0]] if keep_ends else []
        for i in range(len(P) - 1):
            a, b = P[i], P[i + 1]
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        if keep_ends:
            out.append(P[-1])
        P = out
    return P


def clean(poly):
    p = make_valid(Polygon(poly)) if not isinstance(poly, (Polygon, MultiPolygon)) else make_valid(poly)
    if isinstance(p, MultiPolygon):
        p = max(p.geoms, key=lambda g: g.area)
    return p


def rng_for(key):
    h = hashlib.sha256(key.encode()).digest()
    return np.random.default_rng(int.from_bytes(h[:8], "big"))


def fractal_edge(p0, p1, key, levels=NOISE_LEVELS, amp=NOISE_AMP):
    """Midpoint-displacement polyline from p0 to p1, deterministic in `key`."""
    rng = rng_for(key)
    pts = [np.asarray(p0, float), np.asarray(p1, float)]
    base = float(np.linalg.norm(pts[1] - pts[0]))
    if base < 1e-9:
        return [tuple(pts[0]), tuple(pts[1])]
    a = min(amp * base, NOISE_MAX)
    for _ in range(levels):
        out = [pts[0]]
        for i in range(len(pts) - 1):
            s, e = pts[i], pts[i + 1]
            mid = (s + e) / 2.0
            d = e - s
            n = np.array([-d[1], d[0]])
            ln = np.linalg.norm(n)
            if ln > 1e-9:
                # clamped so a bulge can never reach across a neighbouring cell
                disp = float(np.clip(rng.normal(0.0, a), -1.7 * a, 1.7 * a))
                mid = mid + (n / ln) * disp
            out.append(mid)
            out.append(e)
        pts = out
        a *= NOISE_DECAY
    return [tuple(map(float, p)) for p in pts]


def guard_ring(pts, pad=3.0, n=64):
    """Points on a big circle so that every real seed gets a finite cell."""
    c = pts.mean(axis=0)
    r = max(np.linalg.norm(pts - c, axis=1).max() * pad, 400.0)
    ang = np.linspace(0, 2 * math.pi, n, endpoint=False)
    return np.stack([c[0] + r * np.cos(ang), c[1] + r * np.sin(ang)], axis=1)


def pole_of_inaccessibility(geom, step=4.0):
    """Grid-search the interior point furthest from the boundary (label anchor)."""
    if geom.is_empty:
        return (0.0, 0.0)
    minx, miny, maxx, maxy = geom.bounds
    best, bestd = None, -1.0
    s = step
    for _ in range(4):
        xs = np.arange(minx + s / 2, maxx, s)
        ys = np.arange(miny + s / 2, maxy, s)
        if len(xs) == 0 or len(ys) == 0:
            break
        bnd = geom.boundary
        for x in xs:
            for y in ys:
                p = Point(x, y)
                if geom.contains(p):
                    d = p.distance(bnd)
                    if d > bestd:
                        bestd, best = d, (float(x), float(y))
        if best is not None:
            # refine around the winner
            minx, maxx = best[0] - s, best[0] + s
            miny, maxy = best[1] - s, best[1] + s
            s = s / 3.0
        else:
            s = s / 2.0
    if best is None:
        p = geom.representative_point()
        return (float(p.x), float(p.y))
    return best


def fmt(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def ring_to_path(ring):
    pts = list(ring)
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if not pts:
        return ""
    out = ["M%s %s" % (fmt(pts[0][0]), fmt(pts[0][1]))]
    for x, y in pts[1:]:
        out.append("L%s %s" % (fmt(x), fmt(y)))
    out.append("Z")
    return "".join(out)


def geom_to_path(geom):
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
    parts = []
    for p in polys:
        if p.is_empty:
            continue
        parts.append(ring_to_path(p.exterior.coords))
        for h in p.interiors:
            parts.append(ring_to_path(h.coords))
    return "".join(parts)


def smooth_path(points, closed=False, tension=0.5):
    """Catmull-Rom through `points`, emitted as cubic beziers."""
    p = [np.asarray(q, float) for q in points]
    if len(p) < 3:
        return "M%s %sL%s %s" % (fmt(p[0][0]), fmt(p[0][1]), fmt(p[-1][0]), fmt(p[-1][1]))
    if closed:
        pts = p
        n = len(pts)
        idx = lambda i: pts[i % n]
    else:
        pts = [p[0]] + p + [p[-1]]
        n = len(pts)
        idx = lambda i: pts[max(0, min(n - 1, i))]
    d = ["M%s %s" % (fmt(idx(0 if closed else 1)[0]), fmt(idx(0 if closed else 1)[1]))]
    rng_end = len(p) if closed else len(p) - 1
    off = 0 if closed else 1
    for i in range(rng_end):
        p0, p1, p2, p3 = idx(i - 1 + off), idx(i + off), idx(i + 1 + off), idx(i + 2 + off)
        c1 = p1 + (p2 - p0) * (tension / 3.0)
        c2 = p2 - (p3 - p1) * (tension / 3.0)
        d.append("C%s %s %s %s %s %s" % (fmt(c1[0]), fmt(c1[1]), fmt(c2[0]), fmt(c2[1]),
                                         fmt(p2[0]), fmt(p2[1])))
    if closed:
        d.append("Z")
    return "".join(d)


# --------------------------------------------------------------------------- #
# 1. landmasses
# --------------------------------------------------------------------------- #
landmasses = {"mainland": clean(catmull_ring(G.MAINLAND))}
for name, ring in G.ISLANDS.items():
    landmasses[name] = clean(catmull_ring(ring))
print("coastlines   : %d authored points -> %d smoothed" % (
    len(G.MAINLAND) + sum(len(r) for r in G.ISLANDS.values()),
    sum(len(p.exterior.coords) for p in landmasses.values())))

scenery = {k: v for k, v in landmasses.items() if k in G.SCENERY_ISLANDS}
for k in scenery:
    landmasses.pop(k, None)

# --------------------------------------------------------------------------- #
# 2. assign seeds to landmasses
# --------------------------------------------------------------------------- #
seeds = []
for i, (name, prov, x, y, city) in enumerate(G.SEEDS):
    seeds.append(dict(idx=i, name=name, province=prov, x=float(x), y=float(y), city=city))

orphans = []
for s in seeds:
    pt = Point(s["x"], s["y"])
    host = None
    for lname, poly in landmasses.items():
        if poly.contains(pt):
            host = lname
            break
    if host is None:  # snap to the nearest landmass, report it
        lname = min(landmasses, key=lambda k: landmasses[k].distance(pt))
        dist = landmasses[lname].distance(pt)
        orphans.append((s["name"], s["x"], s["y"], lname, round(dist, 1)))
        host = lname
    s["land"] = host

if orphans:
    print("!! seeds outside land (snapped to nearest landmass):")
    for o in orphans:
        print("   %-22s (%s,%s) -> %s  %.1fpx" % o)

# --------------------------------------------------------------------------- #
# 3+4. per-landmass perturbed Voronoi, clipped to the coast
# --------------------------------------------------------------------------- #
regions = {}
adjacency = {}


def add_adj(a, b):
    if a == b:
        return
    adjacency.setdefault(a, set()).add(b)
    adjacency.setdefault(b, set()).add(a)


for lname, poly in landmasses.items():
    mine = [s for s in seeds if s["land"] == lname]
    if not mine:
        scenery[lname] = poly
        continue
    if len(mine) == 1:
        s = mine[0]
        regions[s["idx"]] = dict(seed=s, geom=poly)
        continue

    pts = np.array([[s["x"], s["y"]] for s in mine], float)
    # jitter identical / collinear inputs a hair for a robust triangulation
    pts = pts + rng_for("jitter:" + lname).normal(0, 1e-4, pts.shape)
    allpts = np.vstack([pts, guard_ring(pts)])
    vor = Voronoi(allpts)

    # deterministic fractal polyline per Voronoi edge, shared by both cells
    edge_cache = {}
    pending = []

    def edge_poly(a, b):
        key = (a, b) if a < b else (b, a)
        if key not in edge_cache:
            p0 = vor.vertices[key[0]]
            p1 = vor.vertices[key[1]]
            edge_cache[key] = chaikin(
                fractal_edge(p0, p1, "%s|%d|%d" % (lname, key[0], key[1])))
        line = edge_cache[key]
        return line if (a, b) == key else line[::-1]

    # ridge -> the two cells that share it, so a cell's boundary can be walked
    # as a closed chain of edges rather than guessed from a vertex ordering.
    cell_ridges = {}
    for (pa, pb), (v1, v2) in zip(vor.ridge_points, vor.ridge_vertices):
        for c in (pa, pb):
            cell_ridges.setdefault(c, []).append((v1, v2))

    def cell_ring(k):
        """Vertex indices around cell k, chained through its shared ridges."""
        edges = cell_ridges.get(k, [])
        if any(v == -1 for e in edges for v in e) or len(edges) < 3:
            return None
        nxt = {}
        for v1, v2 in edges:
            nxt.setdefault(v1, []).append(v2)
            nxt.setdefault(v2, []).append(v1)
        if any(len(v) != 2 for v in nxt.values()):
            return None
        start = edges[0][0]
        ring = [start]
        prev, cur = None, start
        while True:
            a, b = nxt[cur]
            step = a if a != prev else b
            if step == start:
                break
            ring.append(step)
            prev, cur = cur, step
            if len(ring) > len(edges) + 2:
                return None
        return ring if len(ring) == len(edges) else None

    for k, s in enumerate(mine):
        order = cell_ring(k)
        if order is None:
            # fall back to the angular ordering of the region's vertices
            vidx = [i for i in vor.regions[vor.point_region[k]] if i != -1]
            if len(vidx) < 3:
                print("!! open Voronoi cell for", s["name"], "- using a disc")
                regions[s["idx"]] = dict(
                    seed=s, geom=poly.intersection(Point(s["x"], s["y"]).buffer(40)))
                continue
            vs = np.array([vor.vertices[i] for i in vidx])
            ang = np.arctan2(vs[:, 1] - pts[k][1], vs[:, 0] - pts[k][0])
            order = [vidx[i] for i in np.argsort(ang)]

        ring = []
        for i in range(len(order)):
            a, b = order[i], order[(i + 1) % len(order)]
            seg = edge_poly(a, b)
            ring.extend(seg[:-1])
        cell = Polygon(ring)
        if not cell.is_valid:
            cell = make_valid(cell)
            if isinstance(cell, MultiPolygon):
                cell = max(cell.geoms, key=lambda g: g.area)
        geom = cell.intersection(poly)
        if isinstance(geom, MultiPolygon):
            big = max(g.area for g in geom.geoms)
            keep = [g for g in geom.geoms if g.area > max(4.0, big * 0.02)]
            geom = MultiPolygon(keep) if len(keep) > 1 else keep[0]
        if geom.is_empty or geom.area < 1.0:
            print("!! empty clipped cell for", s["name"])
            continue
        pending.append((s, geom))

    # A 3-sigma bulge can still nick a non-adjacent cell.  Walk the cells in a
    # stable order and hand each one only the area no earlier cell claimed:
    # boolean ops keep the boundaries exactly coincident, so the tiling stays
    # watertight while overlaps drop to zero.
    claimed = None
    for s, geom in sorted(pending, key=lambda t: t[0]["idx"]):
        a0 = geom.area
        if claimed is not None:
            geom = geom.difference(claimed)
            if geom.area < a0 * 0.95:
                print("   trim %-24s %.1f -> %.1f" % (s["name"], a0, geom.area))
            if isinstance(geom, MultiPolygon):
                big = max(g.area for g in geom.geoms)
                keep = [g for g in geom.geoms if g.area > max(4.0, big * 0.02)]
                geom = MultiPolygon(keep) if len(keep) > 1 else keep[0]
            if geom.is_empty or geom.area < 1.0:
                print("!! cell fully absorbed:", s["name"])
                continue
        claimed = geom if claimed is None else unary_union([claimed, geom])
        regions[s["idx"]] = dict(seed=s, geom=geom)

    # adjacency from the ridges between two real seeds
    nreal = len(mine)
    for (p, q) in vor.ridge_points:
        if p < nreal and q < nreal:
            add_adj(mine[p]["idx"], mine[q]["idx"])

# explicit historical sea crossings
_by_name = {r["seed"]["name"]: i for i, r in regions.items()}
for a, b in getattr(G, "MANUAL_SEA_LINKS", []):
    if a in _by_name and b in _by_name:
        add_adj(_by_name[a], _by_name[b])
    else:
        print("!! manual sea link names unknown:", a, b)

# sea crossings between landmasses
ids = sorted(regions)
for i in range(len(ids)):
    for j in range(i + 1, len(ids)):
        a, b = regions[ids[i]], regions[ids[j]]
        if a["seed"]["land"] == b["seed"]["land"]:
            continue
        if a["geom"].distance(b["geom"]) <= SEA_LINK_DIST:
            add_adj(ids[i], ids[j])

# --------------------------------------------------------------------------- #
# 5. serialise
# --------------------------------------------------------------------------- #
# Attach each unseeded islet to the region it lies nearest, so it colours in
# with that region instead of sitting on the map as a grey hole.
ISLET_REACH = 130.0
leftover = {}
for iname, ipoly in scenery.items():
    best, bestd = None, 1e9
    for idx in regions:
        d = regions[idx]["geom"].distance(ipoly)
        if d < bestd:
            bestd, best = d, idx
    if best is not None and bestd <= ISLET_REACH:
        g = regions[best]["geom"]
        parts = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
        regions[best]["geom"] = MultiPolygon(parts + [ipoly])
        regions[best]["islets"] = regions[best].get("islets", 0) + 1
    else:
        leftover[iname] = ipoly
        print("   islet kept as scenery: %s (%.0fpx from land)" % (iname, bestd))
scenery = leftover


def slug(name):
    out = []
    for ch in name.lower():
        out.append(ch if ch.isalnum() else "-")
    s = "".join(out)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")


out_regions = []
id_by_idx = {}
for idx in sorted(regions):
    r = regions[idx]
    s = r["seed"]
    rid = slug(s["province"]) + "_" + slug(s["name"])
    id_by_idx[idx] = rid

for idx in sorted(regions):
    r = regions[idx]
    s = r["seed"]
    geom = r["geom"]
    main = max(geom.geoms, key=lambda g: g.area) if isinstance(geom, MultiPolygon) else geom
    lx, ly = pole_of_inaccessibility(main)
    entry = dict(
        id=id_by_idx[idx],
        name=s["name"],
        province=s["province"],
        d=geom_to_path(geom),
        label=[round(lx, 1), round(ly, 1)],
        area=round(geom.area, 1),
        nb=sorted(id_by_idx[n] for n in adjacency.get(idx, ()) if n in id_by_idx),
    )
    # neighbours reached only by sea, so the simulation can price a crossing
    sea = []
    for n in adjacency.get(idx, ()):
        if n not in regions or n not in id_by_idx:
            continue
        if geom.distance(regions[n]["geom"]) > 0.05:
            sea.append(id_by_idx[n])
    if sea:
        entry["nbSea"] = sorted(sea)
    if s["city"]:
        entry["city"] = s["city"]
        entry["cityAt"] = [round(lx, 1), round(ly, 1)]
    out_regions.append(entry)

# province outlines
provinces = []
for pname in G.PROVINCE_ORDER:
    geoms = [regions[i]["geom"] for i in regions if regions[i]["seed"]["province"] == pname]
    if not geoms:
        continue
    u = unary_union(geoms).buffer(0.02).buffer(-0.02)
    big = max(u.geoms, key=lambda g: g.area) if isinstance(u, MultiPolygon) else u
    lx, ly = pole_of_inaccessibility(big, step=8.0)
    provinces.append(dict(name=pname, d=geom_to_path(u),
                          label=[round(lx, 1), round(ly, 1)],
                          area=round(u.area, 1),
                          regions=sorted(id_by_idx[i] for i in regions
                                         if regions[i]["seed"]["province"] == pname)))

land_all = [geom_to_path(landmasses["mainland"])]
for k, v in landmasses.items():
    if k != "mainland":
        land_all.append(geom_to_path(v))
for idx in regions:
    if regions[idx].get("islets"):
        g = regions[idx]["geom"]
        parts = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
        biggest = max(parts, key=lambda x: x.area)
        for part in parts:
            if part is not biggest:
                land_all.append(geom_to_path(part))
scenery_paths = [geom_to_path(v) for v in scenery.values()]

# tight bounding box of everything drawn, for the app's default "fit" view
_all = unary_union(list(landmasses.values()) + list(scenery.values()) +
                   [regions[i]["geom"] for i in regions])
_b = _all.bounds
fit = [round(_b[0] - 12, 1), round(_b[1] - 12, 1),
       round(_b[2] - _b[0] + 24, 1), round(_b[3] - _b[1] + 24, 1)]

data = dict(
    canvas=list(G.CANVAS),
    fitBox=fit,
    land=land_all,
    scenery=scenery_paths,
    lakes=[smooth_path(l, closed=True) for l in G.LAKES],
    rivers=[smooth_path(r) for r in G.RIVERS],
    provinces=provinces,
    regions=out_regions,
)

os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
js_path = os.path.join(ROOT, "data", "tamriel-map.js")
with open(js_path, "w") as f:
    f.write("/* Generated by tools/build_map.py -- do not edit by hand. */\n")
    f.write("window.TAMRIEL_MAP = ")
    json.dump(data, f, separators=(",", ":"))
    f.write(";\n")

# ---- report
total_area = sum(r["area"] for r in out_regions)
land_area = _all.area
print("regions      : %d" % len(out_regions))
print("provinces    : %d" % len(provinces))
print("coverage     : %.2f%% of land tessellated" % (100.0 * total_area / land_area))
print("adjacency    : %.1f neighbours avg" % (sum(len(r["nb"]) for r in out_regions) / len(out_regions)))
iso = [r["id"] for r in out_regions if not r["nb"]]
if iso:
    print("isolated     : %s" % ", ".join(iso))
print("fit box      : %s" % fit)
print("output       : %s (%.0f KB)" % (js_path, os.path.getsize(js_path) / 1024.0))
