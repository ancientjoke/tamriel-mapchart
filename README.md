# Tamriel MapChart

A MapChart-style colouring tool for Tamriel — the same idea as
[mapchart.net/tamriel.html](https://www.mapchart.net/tamriel.html), but with the map
**traced 1:1 from the reference** and then subdivided much further: the reference's
own 89 regions, split into **199 subregions** across the nine provinces.

The map carries no names, exactly like the reference. You just colour in provinces
and subregions.

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
6. **Adds depth** by splitting the larger regions with k-means over their own
   pixels. Straight cluster boundaries would look computed, so each cluster's
   distance is modulated by its own smooth noise field and the split lines wander
   the way the traced ones do. No split ever moves a border that came from the
   image — it only adds lines inside one region.
7. **Vectorises** with marching squares, smoothed with Chaikin (symmetric, so two
   regions' shared border stays coincident), and writes `data/tamriel-map.js`.

The build reports coverage against the traced land — it should read ~100%.

```bash
pip install numpy scipy shapely pillow scikit-image
python3 tools/trace_ref.py     # regenerates data/tamriel-map.js
python3 tools/bundle.py        # regenerates tamriel-mapchart.html
```

`trace_ref.py` expects the reference screenshot at the path in `REF`.

## Three border tiers

Because the trace keeps the reference's regions *and* adds subdivisions, the map
draws its borders in a hierarchy you can control separately in **Style**:

| Tier | What it is |
|---|---|
| Province | the nine provinces, heaviest |
| Map region | the 89 regions traced from the reference |
| Subregion | the 199 subdivisions, lightest |

## What's in it

**Colouring.** Click to fill, drag to paint a run of subregions,
<kbd>Shift</kbd>+click for a whole province, <kbd>Alt</kbd>+click to clear. Seven
palettes plus any custom colour. The legend builds itself as you paint — rename a
group, recolour every region in it at once, or click it to reselect those regions.

**Selecting.** Search across region, province and city names, with lore aliases
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
<kbd>P</kbd> toggle province tool · <kbd>1</kbd>–<kbd>9</kbd> palette colour ·
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
data/tamriel-map.js      generated geometry (199 subregions, 89 map regions, 9 provinces)
tools/trace_ref.py       the tracer
tools/bundle.py          single-file build
```

Region and place names follow the reference map's city labels. The Elder Scrolls is
a Bethesda property; this is an unofficial fan tool.
