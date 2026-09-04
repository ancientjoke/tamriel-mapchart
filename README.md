# Tamriel MapChart

A MapChart-style colouring tool for Tamriel — the same idea as
[mapchart.net/tamriel.html](https://www.mapchart.net/tamriel.html), with the map
**traced 1:1 from the reference image**.

You colour at whichever level you want, chosen with the **Fill** switch in the
toolbar:

| Level | What one click fills |
|---|---|
| **Province** | one of the nine provinces |
| **Region** | one of the reference map's own 89 regions — the default |
| **Subregion** | one of the 199 finer subdivisions |

Each level shows only the borders you are working with, so at Province and Region
the map looks exactly like the original. The map carries no names, like the
reference — though **capital cities**, **other cities** and **city names** are all
layers you can switch on in Style, with capitals drawn larger. Zoom goes to about
200×, and the panel folds away with <kbd>Tab</kbd> to give the map the full window.

Open `index.html` in a browser, or use the self-contained single file
`tamriel-mapchart.html` (no server, no dependencies, works from `file://`).

![The map coloured by province](docs/preview-app.png)

## The trace

The coastline and every region border come out of the reference image pixel by
pixel — nothing here is a hand-typed coordinate, so the outline matches 1:1.

The reference is flat-shaded, which is what makes that possible: land `#dddddd`,
sea `#b2bac3`, region borders as thin light-grey strokes, province borders and the
coastline much darker, labels darker still. `tools/trace_ref.py`:

1. **Classifies** every pixel into land, sea and ink.
2. **Continues the four coastal spans the screenshot cuts off** at its bottom edge
   with a shallow synthesised curve. This is the only geometry in the map that is
   not from the image; everything else is traced.
3. **Splits the land on the reference's own border strokes.** Labels can't be told
   from borders by colour — province borders and the coast are just as dark — so
   they're separated by shape: label and marker ink is dark *and* small *and*
   compact, while every real border is either light grey or long. Strokes are 1px
   and anti-aliased, so pinholes get closed first, or two regions leak into one.
   That recovers **89 regions**, matching the reference's own count.
4. **Grows each region back over the strokes**, so the regions tile the land exactly
   rather than leaving gaps where the borders were.
5. **Names them from the reference's city labels**, then floods each province across
   the region adjacency so provinces stay contiguous. Where two labels probe into
   the same region the loser is re-homed to the nearest free one; anything left
   over is named for where it sits in its province ("Skyrim North").
6. **Adds depth in two rounds** — region → subregion → sub-subregion — by
   repeatedly bisecting the largest parcel with a wandering cut across its short
   axis. k-means was the obvious choice and the wrong one: it leaves interior
   clusters, which come out as discs, very obvious on the big southern regions.
   A cut always produces two parcels that each reach the edge, so subdivisions
   look carved rather than stamped out. The cut bends along a smooth S-curve
   scaled to its own length, and is rejected if it would leave the two parcels
   badly unbalanced. No split ever moves a border that came from the image.
7. **Drops label ink floating on water.** Text drawn over the sea is dark, so it
   does not classify as sea and would otherwise survive as letter-shaped islands —
   the word "Bravil" sitting in the Niben, for instance. Any land component that is
   small, dark and compact is ink, not land; real islets carry the flat land tone
   and are far brighter.
8. **Vectorises** with marching squares, smoothed with Chaikin (symmetric, so two
   regions' shared border stays coincident), and writes `data/tamriel-map.js`.
   Regions are clipped to the traced coastline so the silhouette is exactly the
   image's, and overlap each other by a third of a pixel inland so no hairline seam
   shows between neighbouring fills.

Measured against the source mask, the coastline scores **97.9% IoU** — the residual
is the half-pixel convention of going raster → vector → raster, not trace error.

The build reports coverage against the traced land — it should read ~100%.

```bash
pip install numpy scipy shapely pillow scikit-image
python3 tools/trace_ref.py     # regenerates data/tamriel-map.js
python3 tools/bundle.py        # regenerates tamriel-mapchart.html
```

`trace_ref.py` expects the reference screenshot at the path in `REF`.

## Three border tiers

Because the trace keeps the reference's regions *and* adds subdivisions, the map
draws its borders in a hierarchy. The **Fill** switch sets a sensible default, and
**Style** lets you turn each tier on or off and set its width:

| Tier | What it is |
|---|---|
| Province | the nine provinces, heaviest |
| Map region | the 89 regions traced from the reference |
| Subregion | 188 subdivisions |
| Sub-subregion | 423 parcels, lightest |

Border widths are in map units but thin as you zoom in, so they stay readable at
200× instead of swallowing the map.

Colour is always stored per subregion, so switching levels never loses anything:
filling a region just fills all of its subdivisions at once.

## What's in it

**Colouring.** Click to fill whatever the **Fill** switch covers, drag to paint
several, <kbd>Shift</kbd>+click for a whole province, <kbd>Alt</kbd>+click to clear. Seven
palettes plus any custom colour. The legend builds itself as you paint — rename a
group, recolour every region in it at once, or click it to reselect those regions.

**Selecting.** Search returns map regions, not every subdivision, across region,
province and city names, with lore aliases
(“vvardenfell”, “holds”, “colovia”, “nibenay”, “argonia”, “alik'r”…) that expand to
the right set. Or work down the province tree. Invert, select-all, fill-selection.

**Styling.** Five map themes (MapChart — sampled off the reference — plus Parchment,
Slate, Ashland, Ink), the three border widths, optional names and city markers,
title/subtitle, and a legend you can drag anywhere.

**Time.** Capture the current colouring as a keyframe with an Elder Scrolls date,
then scrub or play the timeline — colours cross-fade between frames, so borders
appear to move. Three histories are built in:

| History | Frames | Covers |
|---|---|---|
| Ages of Empire | 9 | Alessian rebellion → First Empire of the Nords → Alessian Order → Reman's Second Empire → Akaviri Potentate → Three Banners War → Tiber Septim → Third Empire → after the Great War |
| The Three Banners War | 6 | 2E 582, the front line moving across Cyrodiil season by season |
| The Great War | 6 | 4E 170–180, the Dominion invasion, the Red Ring, the Concordat, Hammerfell's secession |

Scenarios name a map region and every one of its subdivisions follows, so they keep
working however finely the map is split.

**Simulation.** A growth simulator runs factions over the subregion adjacency graph.
Give each faction a colour and a starting territory — or use a preset (Three
Alliances, Nine Provinces, Capitals Only), or seed one faction per colour already on
your map — then set expansion, aggression, sea-crossing difficulty and revolt chance
and run it. Each turn becomes a keyframe you can play back. Runs are seeded, so the
same seed always produces the same history.

**Saving and exporting.** Auto-saves to the browser; named save slots; export as PNG
(up to ×6), standalone SVG, a `.json` map file you can re-open, a CSV of the
painting, or every timeline frame as its own PNG.

## Keyboard

<kbd>B</kbd> paint · <kbd>V</kbd> select · <kbd>I</kbd> pick colour ·
<kbd>P</kbd> cycle fill level · <kbd>1</kbd>–<kbd>9</kbd> palette colour ·
<kbd>K</kbd> capture frame · <kbd>Space</kbd> play/pause ·
<kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> undo/redo ·
<kbd>Ctrl</kbd>+<kbd>S</kbd> save · <kbd>0</kbd> fit · <kbd>+</kbd>/<kbd>−</kbd> zoom ·
<kbd>Esc</kbd> clear selection

## Layout

```
index.html               the app
tamriel-mapchart.html    the same app as one portable file
css/app.css
js/state.js              palettes, themes, document state, undo, storage
js/mapview.js            SVG build, theming, pan/zoom, hit-testing, labels
js/timeline.js           keyframes, cross-fade playback, the built-in histories
js/sim.js                the faction growth simulator
js/exporter.js           standalone SVG, PNG, JSON, CSV
js/ui.js                 panels, bindings, overlays, the event bus
data/tamriel-map.js      generated geometry (423 parcels, 188 subregions, 89 map regions, 9 provinces)
tools/trace_ref.py       the tracer
tools/bundle.py          single-file build
```

Region and place names follow the reference map's city labels. The Elder Scrolls is
a Bethesda property; this is an unofficial fan tool.
