/* ==========================================================================
   mapview.js -- SVG map: build, theme, pan/zoom, hover, paint interaction
   ========================================================================== */
(function (W) {
  'use strict';
  var TM = W.TM, S = TM.S, D = document, NS = 'http://www.w3.org/2000/svg';

  var svg, defs, gSea, gLand, gScenery, gRegions, gOcc, gSub, gBase, gProv,
      gWater, gCoast, gCityD, gCity, gLabel;
  var stage, tip;
  var view = { x: 0, y: 0, w: 1000, h: 700 };
  var fit = { x: 0, y: 0, w: 1000, h: 700 };
  var paths = {};      // parcelId -> <path>
  var occPaths = {};   // parcelId -> striped overlay <path>
  var cityPaths = {};  // cityId -> district <path>
  var stripeIds = {};  // hex -> pattern id
  var labels = {};     // regionId -> <text>
  var cityDots = {};
  var provPaths = {};
  var painting = false, panning = false, panStart = null, lastPainted = null;
  var hoverSet = [];
  var MIN_W = 5, MAX_W = 4000;   // MIN_W sets the deepest zoom (~200x)

  function el(n, a) {
    var e = document.createElementNS(NS, n);
    if (a) for (var k in a) e.setAttribute(k, a[k]);
    return e;
  }
  function theme() { return TM.THEMES[S.doc.style.theme] || TM.THEMES.mapchart; }
  function fillFor(id) {
    var c = S.doc.colors[id];
    return c || theme().unpainted;
  }

  /* ------------------------------------------------------------------ build */
  function build(mapData, stageEl, tipEl) {
    S.map = mapData; stage = stageEl; tip = tipEl;
    S.regions = {}; S.byProvince = {};
    S.baseRegions = {}; S.byBase = {}; S.provBases = {};
    S.subRegions = {}; S.bySub = {}; S.basesOfSub = {};
    (mapData.baseRegions || []).forEach(function (b) {
      S.baseRegions[b.id] = b;
      S.byBase[b.id] = [];
      (S.provBases[b.province] = S.provBases[b.province] || []).push(b.id);
    });
    (mapData.subRegions || []).forEach(function (b) {
      S.subRegions[b.id] = b;
      S.bySub[b.id] = [];
      S.basesOfSub[b.id] = b.baseId;
    });
    mapData.regions.forEach(function (r) {
      S.regions[r.id] = r;
      (S.byProvince[r.province] = S.byProvince[r.province] || []).push(r.id);
      if (r.baseId && S.byBase[r.baseId]) S.byBase[r.baseId].push(r.id);
      if (r.subId && S.bySub[r.subId]) S.bySub[r.subId].push(r.id);
    });

    svg = el('svg', { id: 'map', xmlns: NS, 'shape-rendering': 'geometricPrecision' });
    defs = el('defs');
    svg.appendChild(defs);
    gSea = el('g', { id: 'g-sea' });
    gLand = el('g', { id: 'g-land' });
    gScenery = el('g', { id: 'g-scenery' });
    gRegions = el('g', { id: 'g-regions' });
    gOcc = el('g', { id: 'g-occ', stroke: 'none' });
    gCityD = el('g', { id: 'g-cityd', 'stroke-linejoin': 'round' });
    gSub = el('g', { id: 'g-sub', fill: 'none', 'stroke-linejoin': 'round' });
    gBase = el('g', { id: 'g-base', fill: 'none', 'stroke-linejoin': 'round' });
    gProv = el('g', { id: 'g-prov', fill: 'none', 'stroke-linejoin': 'round' });
    gWater = el('g', { id: 'g-water' });
    gCoast = el('g', { id: 'g-coast', fill: 'none', 'stroke-linejoin': 'round' });
    gCity = el('g', { id: 'g-city' });
    gLabel = el('g', { id: 'g-label', 'text-anchor': 'middle',
      'font-family': '"Segoe UI",Inter,system-ui,sans-serif', 'paint-order': 'stroke' });
    [gSea, gLand, gScenery, gRegions, gOcc, gCityD, gSub, gBase, gProv,
     gWater, gCoast, gCity, gLabel]
      .forEach(function (g) { svg.appendChild(g); });

    gSea.appendChild(el('rect', { id: 'searect' }));
    mapData.land.forEach(function (d) { gLand.appendChild(el('path', { d: d })); });
    mapData.scenery.forEach(function (d) { gScenery.appendChild(el('path', { d: d })); });

    mapData.regions.forEach(function (r) {
      var p = el('path', { d: r.d, 'class': 'region' });
      p.__id = r.id;
      paths[r.id] = p;
      gRegions.appendChild(p);
      var o = el('path', { d: r.d, 'class': 'occ' });
      o.style.display = 'none';
      occPaths[r.id] = o;
      gOcc.appendChild(o);
    });
    (mapData.cityDistricts || []).forEach(function (c) {
      var p = el('path', { d: c.d, 'class': 'citydistrict' });
      p.__city = c.id;
      cityPaths[c.id] = p;
      gCityD.appendChild(p);
    });
    (mapData.subRegions || []).forEach(function (b) {
      gSub.appendChild(el('path', { d: b.d }));
    });
    (mapData.baseRegions || []).forEach(function (b) {
      gBase.appendChild(el('path', { d: b.d }));
    });
    mapData.provinces.forEach(function (p) {
      var e = el('path', { d: p.d });
      provPaths[p.name] = e;
      gProv.appendChild(e);
    });
    mapData.lakes.forEach(function (d) { gWater.appendChild(el('path', { d: d, 'class': 'lake' })); });
    mapData.rivers.forEach(function (d) {
      gWater.appendChild(el('path', { d: d, 'class': 'river', fill: 'none',
        'stroke-linecap': 'round' }));
    });
    mapData.land.forEach(function (d) { gCoast.appendChild(el('path', { d: d })); });
    mapData.scenery.forEach(function (d) { gCoast.appendChild(el('path', { d: d })); });

    mapData.regions.forEach(function (r) {
      var t = el('text', { x: r.label[0], y: r.label[1] });
      t.textContent = r.name;
      labels[r.id] = t;
      gLabel.appendChild(t);
    });
    (mapData.baseRegions || []).forEach(function (b) {
      if (!b.city) return;
      var g = el('g', { 'class': b.capital ? 'city capital' : 'city town' });
      g.appendChild(el('circle', { cx: b.cityAt[0], cy: b.cityAt[1], r: 1.6 }));
      var t = el('text', { x: b.cityAt[0], y: b.cityAt[1] - 2.6 });
      t.textContent = b.city;
      g.appendChild(t);
      g.__cy = b.cityAt[1];
      cityDots[b.id] = g;
      gCity.appendChild(g);
    });

    stage.querySelector('#svgwrap').appendChild(svg);
    fit = { x: mapData.fitBox[0], y: mapData.fitBox[1], w: mapData.fitBox[2], h: mapData.fitBox[3] };
    resetView();
    wire();
    applyTheme();
    repaint();
  }

  /* ------------------------------------------------------------------ theme */
  /** Border widths are in map units, so at deep zoom they would swallow the
      map.  Thin them as you go in, but not linearly -- they should stay
      visible. */
  function strokeScale() {
    var k = fit.w / view.w;
    return k <= 1 ? 1 : 1 / Math.pow(k, 0.72);
  }

  /** Re-apply only the zoom-dependent stroke widths (cheap, runs on pan/zoom). */
  function applyStrokes() {
    var st = S.doc.style, ss = strokeScale();
    if (!gRegions) return;
    gRegions.setAttribute('stroke-width', st.borderWidth * ss);
    gSub.setAttribute('stroke-width', (st.subBorderWidth != null ? st.subBorderWidth : 0.6) * ss);
    gBase.setAttribute('stroke-width', (st.baseBorderWidth != null ? st.baseBorderWidth : 0.9) * ss);
    gProv.setAttribute('stroke-width', st.provBorderWidth * ss);
    gCoast.setAttribute('stroke-width', Math.max(0.8, st.provBorderWidth * 0.75) * ss);
    Array.prototype.forEach.call(gWater.querySelectorAll('.river'), function (e) {
      e.setAttribute('stroke-width', 1.5 * ss);
    });
    sizeStripes();
    paintCityDistricts();
  }

  function applyTheme() {
    var t = theme(), st = S.doc.style, ss = strokeScale();
    stage.style.background = t.sea;
    var sr = svg.querySelector('#searect');
    sr.setAttribute('fill', t.sea);
    gLand.setAttribute('fill', t.land);
    gLand.setAttribute('stroke', 'none');
    gScenery.setAttribute('fill', t.land);
    gScenery.setAttribute('stroke', 'none');
    gRegions.setAttribute('stroke', st.showBorders ? t.border : 'none');
    gRegions.setAttribute('stroke-width', st.borderWidth * ss);
    gBase.setAttribute('stroke', st.showBaseBorders ? (t.baseBorder || t.border) : 'none');
    gBase.setAttribute('stroke-width', (st.baseBorderWidth != null ? st.baseBorderWidth : 0.9) * ss);
    gProv.setAttribute('stroke', st.showProvBorders ? t.provBorder : 'none');
    gProv.setAttribute('stroke-width', st.provBorderWidth * ss);
    gCoast.setAttribute('stroke', st.showCoast ? t.coast : 'none');
    gCoast.setAttribute('stroke-width', Math.max(0.8, st.provBorderWidth * 0.75) * ss);
    gWater.style.display = (st.showLakes || st.showRivers) ? '' : 'none';
    Array.prototype.forEach.call(gWater.querySelectorAll('.lake'), function (e) {
      e.setAttribute('fill', t.water);
      e.setAttribute('stroke', t.water);
      e.setAttribute('stroke-width', 0.4);
      e.style.display = st.showLakes ? '' : 'none';
    });
    Array.prototype.forEach.call(gWater.querySelectorAll('.river'), function (e) {
      e.setAttribute('stroke', t.river);
      e.setAttribute('stroke-width', 1.5);
      e.style.display = st.showRivers ? '' : 'none';
    });
    gSub.setAttribute('stroke', st.showSubBorders ? (t.subBorder || t.border) : 'none');
    gSub.setAttribute('stroke-width', (st.subBorderWidth != null ? st.subBorderWidth : 0.6) * ss);
    styleCities();
    gLabel.setAttribute('fill', t.label);
    gLabel.setAttribute('stroke', t.labelHalo);
    updateLabels(true);
  }

  /** Capitals and towns are separate layers with their own sizes. */
  function styleCities() {
    var st = S.doc.style, t = theme();
    var k = fit.w / view.w;
    var base = (st.cityScale || 1) / Math.pow(k, 0.55);
    Array.prototype.forEach.call(gCity.children, function (g) {
      var cap = g.classList.contains('capital');
      var on = cap ? st.showCapitals : st.showTowns;
      g.style.display = on ? '' : 'none';
      if (!on) return;
      var r = (cap ? 2.6 : 1.5) * base;
      var c = g.querySelector('circle');
      c.setAttribute('r', r);
      c.setAttribute('fill', cap ? t.city : t.cityFill);
      c.setAttribute('stroke', t.city);
      c.setAttribute('stroke-width', Math.max(0.12, 0.55 * base));
      var tx = g.querySelector('text');
      var fs = (cap ? 8.0 : 6.4) * base;
      // a name only earns its place once it is big enough on screen to read
      var onScreen = fs * (stage.clientWidth / view.w);
      tx.style.display = (st.showCityNames && onScreen >= 8) ? '' : 'none';
      tx.setAttribute('font-size', fs);
      tx.setAttribute('y', g.__cy - r - fs * 0.32);
      tx.setAttribute('fill', t.label);
      tx.setAttribute('stroke', t.labelHalo);
      tx.setAttribute('stroke-width', fs * 0.09);
    });
  }

  /* ----------------------------------------------------------------- labels */
  function labelText(r) {
    var src = S.doc.style.labelSource || 'region';
    if (src === 'city') return r.city || r.name;
    if (src === 'both' && r.city && r.city !== r.name) return r.city;
    return r.name;
  }
  var lastCull = null;
  function updateLabels(force) {
    var st = S.doc.style;
    var k = fit.w / view.w;                      // current zoom factor vs. fit
    var fs = Math.max(0.9, st.labelSize / Math.pow(k, 0.82));
    styleCities();                       // city layers size with zoom too
    applyStrokes();                      // and borders thin as you go in
    gLabel.style.display = st.labelMode === 'none' ? 'none' : '';
    if (st.labelMode === 'none') { lastCull = null; return; }
    gLabel.setAttribute('font-size', fs);
    gLabel.setAttribute('stroke-width', fs * 0.15);
    var mode = st.labelMode + '|' + (st.labelSource || 'region');
    for (var id in labels) {
      var txt = labelText(S.regions[id]);
      if (labels[id].textContent !== txt) labels[id].textContent = txt;
    }
    if (st.labelMode === 'all') {
      for (var id2 in labels) labels[id2].style.display = '';
      lastCull = null;
      sizeCities(k);
      return;
    }
    // Collision culling depends only on the font size and the text, never on
    // panning -- so it is recomputed only when one of those actually changes.
    var sig = fs.toFixed(3) + '|' + mode;
    if (!force && lastCull === sig) { sizeCities(k); return; }
    lastCull = sig;
    cull(fs);
    sizeCities(k);
  }

  function sizeCities(k) { styleCities(); }

  /**
   * Greedy label placement: biggest regions win, and any label whose box
   * overlaps one already placed is dropped.  Zooming in shrinks the boxes,
   * so more names appear the closer you look.
   */
  function cull(fs) {
    var order = Object.keys(labels).sort(function (a, b) {
      return S.regions[b].area - S.regions[a].area;
    });
    var i, id, e;
    for (i = 0; i < order.length; i++) labels[order[i]].style.display = '';
    var placed = [], pad = fs * 0.18;
    for (i = 0; i < order.length; i++) {
      id = order[i]; e = labels[id];
      var b;
      try { b = e.getBBox(); } catch (err) { continue; }
      if (!b || !b.width) { continue; }
      var box = { x1: b.x - pad, y1: b.y - pad, x2: b.x + b.width + pad, y2: b.y + b.height + pad };
      var clash = false;
      for (var j = 0; j < placed.length; j++) {
        var q = placed[j];
        if (box.x1 < q.x2 && box.x2 > q.x1 && box.y1 < q.y2 && box.y2 > q.y1) { clash = true; break; }
      }
      if (clash) e.style.display = 'none';
      else placed.push(box);
    }
  }

  /** A diagonal hatch in the occupier's colour with transparent gaps, so the
      owner's colour still reads underneath. */
  function stripeFor(hex) {
    if (stripeIds[hex]) return stripeIds[hex];
    var id = 'stripe-' + hex.slice(1);
    var pat = el('pattern', {
      id: id, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
    });
    pat.appendChild(el('rect', { fill: hex }));
    defs.appendChild(pat);
    stripeIds[hex] = id;
    sizeStripes();
    return id;
  }
  /** Pattern geometry is in map units, so the hatch has to be re-sized on
      zoom or it turns into giant bands. */
  function sizeStripes() {
    var w = (S.doc.style.stripeWidth || 2.4) * strokeScale();
    for (var hex in stripeIds) {
      var pat = defs.querySelector('#' + stripeIds[hex]);
      if (!pat) continue;
      pat.setAttribute('width', w * 2);
      pat.setAttribute('height', w * 2);
      var r = pat.firstChild;
      r.setAttribute('width', w);
      r.setAttribute('height', w * 2);
    }
  }
  function restripe() { sizeStripes(); }

  /* ---------------------------------------------------------------- repaint */
  function repaint() {
    // while the timeline is being scrubbed the screen shows interpolated
    // colours that are not in doc.colors -- keep showing those.
    if (S.scrubbing && TM.timeline) { paintFrom(TM.timeline.colorsAt(S.playhead)); return; }
    var t = theme();
    for (var id in paths) {
      var f = S.doc.colors[id] || t.unpainted;
      if (paths[id].__f !== f) { paths[id].setAttribute('fill', f); paths[id].__f = f; }
      var on = !!S.selection[id];
      if (paths[id].__s !== on) {
        paths[id].classList.toggle('sel', on);
        paths[id].__s = on;
      }
      var occ = S.doc.occupied[id] || null;
      var op = occPaths[id];
      if (op && op.__o !== occ) {
        if (occ) {
          op.setAttribute('fill', 'url(#' + stripeFor(occ) + ')');
          op.style.display = '';
        } else {
          op.style.display = 'none';
        }
        op.__o = occ;
      }
    }
    paintCityDistricts();
  }

  function paintCityDistricts() {
    var st = S.doc.style, t = theme();
    gCityD.style.display = st.showCityDistricts ? '' : 'none';
    if (!st.showCityDistricts) return;
    var ss = strokeScale();
    for (var cid in cityPaths) {
      var c = S.doc.cityColors[cid];
      var p = cityPaths[cid];
      p.setAttribute('fill', c || 'none');
      p.setAttribute('fill-opacity', c ? 0.92 : 0);
      p.setAttribute('stroke', t.provBorder);
      p.setAttribute('stroke-width', 0.75 * ss);
      p.setAttribute('stroke-dasharray', c ? 'none' : (1.6 * ss) + ' ' + (1.2 * ss));
    }
  }
  /** Paint straight from a colour map (used by timeline playback). */
  function paintFrom(colorMap) {
    var t = theme();
    for (var oid in occPaths) { occPaths[oid].style.display = 'none'; occPaths[oid].__o = null; }
    for (var id in paths) {
      var f = colorMap[id] || t.unpainted;
      if (paths[id].__f !== f) { paths[id].setAttribute('fill', f); paths[id].__f = f; }
    }
  }

  /* ------------------------------------------------------------------- view */
  /** Stage aspect ratio, guarded: a hidden or mid-transition stage can report
      zero height, and dividing by it puts Infinity in the viewBox. */
  function aspect() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!(w > 0) || !(h > 0)) return view.h / view.w || 0.66;
    return h / w;
  }

  function pushView() {
    view.w = Math.min(MAX_W, Math.max(MIN_W, view.w));
    var ar = aspect();
    view.h = view.w * ar;
    svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
    var sr = svg.querySelector('#searect');
    sr.setAttribute('x', view.x - 10); sr.setAttribute('y', view.y - 10);
    sr.setAttribute('width', view.w + 20); sr.setAttribute('height', view.h + 20);
    updateLabels();
    TM.emit('view');
  }
  function resetView() {
    var ar = aspect();
    if (!(ar > 0)) return;                 // stage not laid out yet
    var w = fit.w, h = fit.w * ar;
    if (h < fit.h) { h = fit.h; w = fit.h / ar; }
    view.x = fit.x - (w - fit.w) / 2;
    view.y = fit.y - (h - fit.h) / 2;
    view.w = w;
    pushView();
  }
  function zoomAt(factor, cx, cy) {
    var p = toMap(cx, cy);
    var nw = Math.min(MAX_W, Math.max(MIN_W, view.w * factor));
    var s = nw / view.w;
    view.x = p.x - (p.x - view.x) * s;
    view.y = p.y - (p.y - view.y) * s;
    view.w = nw;
    pushView();
  }
  function zoomBy(f) {
    var r = stage.getBoundingClientRect();
    zoomAt(f, r.left + r.width / 2, r.top + r.height / 2);
  }
  function toMap(clientX, clientY) {
    var r = stage.getBoundingClientRect();
    return {
      x: view.x + (clientX - r.left) / r.width * view.w,
      y: view.y + (clientY - r.top) / r.height * view.h
    };
  }
  function zoomToRegion(id) {
    var p = paths[id]; if (!p) return;
    var b = p.getBBox();
    var pad = Math.max(b.width, b.height) * 0.9 + 24;
    view.x = b.x + b.width / 2 - (b.width + pad) / 2;
    view.y = b.y + b.height / 2;
    view.w = b.width + pad;
    view.y -= view.w * aspect() / 2;
    pushView();
  }

  /* ------------------------------------------------------------ interaction */
  function regionAt(ev) {
    var t = ev.target;
    return (t && t.__id) ? t.__id : null;
  }
  function cityAt(ev) {
    var t = ev.target;
    return (t && t.__city) ? t.__city : null;
  }
  /** What one click acts on, given the current detail level. */
  function idsFor(id, ev) {
    if (!id) return [];
    var r = S.regions[id];
    if (S.level === 'province' || (ev && ev.shiftKey)) {
      return S.byProvince[r.province].slice();
    }
    if (S.level === 'region' && r.baseId && S.byBase[r.baseId]) {
      return S.byBase[r.baseId].slice();
    }
    if (S.level === 'subregion' && r.subId && S.bySub[r.subId]) {
      return S.bySub[r.subId].slice();
    }
    return [id];
  }
  TM.idsFor = idsFor;

  function applyPaint(id, ev, first) {
    var ids = idsFor(id, ev);
    if (!ids.length) return;
    var erase = ev.altKey || ev.ctrlKey || ev.metaKey;
    S.scrubbing = false;
    if (first) TM.state.pushUndo();
    var hex = erase ? null : S.activeColor;
    for (var i = 0; i < ids.length; i++) {
      if (hex) S.doc.colors[ids[i]] = hex; else delete S.doc.colors[ids[i]];
    }
    if (hex) TM.state.ensureGroup(hex);
    TM.state.pruneGroups();
    S.dirty = true;
    TM.emit('paint');
  }

  function wire() {
    svg.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      // a pointer capture from the preceding pointerdown retargets this event
      // to the <svg>, so hit-test by position instead of trusting e.target
      var el2 = D.elementFromPoint(e.clientX, e.clientY);
      TM.emit('contextmenu', {
        id: (el2 && el2.__id) || null,
        city: (el2 && el2.__city) || null,
        x: e.clientX, y: e.clientY
      });
    });

    svg.addEventListener('pointerdown', function (e) {
      if (e.button === 2) return;               // right-click opens the menu
      svg.setPointerCapture(e.pointerId);
      var id = regionAt(e);
      var wantPan = e.button === 1 || e.spaceKey || (!id && e.button === 0) ||
                    (e.button === 0 && S.mode === 'pan');
      if (wantPan) {
        panning = true; panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        svg.classList.add('panning');
        return;
      }
      var cid = cityAt(e);
      if (cid && S.level === 'city') {
        S.scrubbing = false;
        TM.state.setCityColor([cid],
          (e.altKey || e.ctrlKey || e.metaKey) ? null : S.activeColor);
        return;
      }
      if (!id) return;
      if (S.mode === 'pick') {
        TM.emit('pickcolor', S.doc.colors[id] || null);
        return;
      }
      if (S.mode === 'select') {
        var ids = idsFor(id, e);
        var on = !S.selection[ids[0]];
        ids.forEach(function (x) { if (on) S.selection[x] = true; else delete S.selection[x]; });
        TM.emit('selection');
        return;
      }
      painting = true; lastPainted = id;
      applyPaint(id, e, true);
    });

    svg.addEventListener('pointermove', function (e) {
      if (panning) {
        var r = stage.getBoundingClientRect();
        view.x = panStart.vx - (e.clientX - panStart.x) / r.width * view.w;
        view.y = panStart.vy - (e.clientY - panStart.y) / r.height * view.h;
        pushView();
        return;
      }
      var id = regionAt(e);
      if (painting) {
        if (id && id !== lastPainted) { lastPainted = id; applyPaint(id, e, false); }
        return;
      }
      hoverRegion(id, e);
    });

    function endDrag() {
      painting = false; panning = false; lastPainted = null;
      svg.classList.remove('panning');
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('pointerleave', function () { endDrag(); hoverRegion(null); });

    svg.addEventListener('dblclick', function (e) {
      var id = regionAt(e); if (!id) return;
      S.byProvince[S.regions[id].province].forEach(function (x) { S.selection[x] = true; });
      TM.emit('selection');
    });

    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomAt(e.deltaY > 0 ? 1.16 : 1 / 1.16, e.clientX, e.clientY);
    }, { passive: false });

    W.addEventListener('resize', function () { pushView(); });
  }

  function hoverRegion(id, ev) {
    if (S.hover === id) { if (id && ev) moveTip(ev); return; }
    (hoverSet || []).forEach(function (h) {
      if (paths[h]) paths[h].classList.remove('hov');
    });
    S.hover = id;
    if (!id) { hoverSet = []; tip.style.opacity = 0; TM.emit('hover'); return; }
    hoverSet = idsFor(id, ev || {});
    hoverSet.forEach(function (h) { if (paths[h]) paths[h].classList.add('hov'); });
    var r = S.regions[id], g = TM.state.groupFor(S.doc.colors[id]);
    var head = (S.level === 'subregion') ? r.name : (r.base || r.name);
    var sub = (S.level === 'subregion' && r.base && r.base !== r.name)
      ? esc(r.base) + ' &middot; ' + esc(r.province) : esc(r.province);
    tip.innerHTML = '<b>' + esc(head) + '</b><i>' + sub +
      (r.city ? ' &middot; ' + esc(r.city) : '') + '</i>' +
      (g ? '<i style="color:' + g.color + '">&#9632; ' + esc(g.label) + '</i>' : '');
    tip.style.opacity = 1;
    if (ev) moveTip(ev);
    TM.emit('hover');
  }
  function moveTip(ev) {
    var r = stage.getBoundingClientRect();
    var x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
    if (x + tip.offsetWidth > r.width - 8) x = ev.clientX - r.left - tip.offsetWidth - 12;
    if (y + tip.offsetHeight > r.height - 8) y = ev.clientY - r.top - tip.offsetHeight - 12;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function clearHover() {
    (hoverSet || []).forEach(function (h) {
      if (paths[h]) paths[h].classList.remove('hov');
    });
    hoverSet = []; S.hover = null; tip.style.opacity = 0;
  }

  TM.view = {
    build: build, clearHover: clearHover, styleCities: styleCities,
    restripe: restripe, paintCityDistricts: paintCityDistricts, applyTheme: applyTheme, repaint: repaint, paintFrom: paintFrom,
    resetView: resetView, zoomBy: zoomBy, zoomToRegion: zoomToRegion,
    updateLabels: updateLabels,
    getView: function () { return { x: view.x, y: view.y, w: view.w, h: view.h }; },
    getFit: function () { return { x: fit.x, y: fit.y, w: fit.w, h: fit.h }; },
    svgNode: function () { return svg; },
    esc: esc
  };
})(window);
