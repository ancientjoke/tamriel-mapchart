/* ==========================================================================
   ui.js -- panels, bindings, overlays.  Runs last; owns the event bus.
   ========================================================================== */
(function (W, D) {
  'use strict';
  var TM = W.TM;

  /* ------------------------------------------------------------- event bus */
  var subs = {};
  TM.on = function (name, fn) { (subs[name] = subs[name] || []).push(fn); };
  TM.emit = function (name, arg) {
    (subs[name] || []).forEach(function (f) { f(arg); });
    (subs['*'] || []).forEach(function (f) { f(name, arg); });
  };

  var S = TM.S, ST = TM.state, V, TL, SIM, EX;
  function $(id) { return D.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }
  function selCount() { return Object.keys(S.selection).length; }

  /* ============================== INIT ================================== */
  function init() {
    V = TM.view; TL = TM.timeline; SIM = TM.sim; EX = TM.exporter;

    V.build(W.TAMRIEL_MAP, $('stage'), $('tip'));

    ST.loadAutosave();
    fillStatics();
    // the traced map carries no rivers or lakes of its own; hide dead controls
    if (!(S.map.rivers || []).length) $('row-rivers').style.display = 'none';
    if (!(S.map.lakes || []).length) $('row-lakes').style.display = 'none';
    bind();
    renderAll();
    setTab('paint');
    setMode('paint'); setLevel(S.level || 'region');
    setActiveColor(TM.PALETTES.Banners[0], true);
    bindLegendDrag();

    TM.on('paint', function () { V.repaint(); renderLegend(); renderTree(); renderStatus(); });
    TM.on('doc', function () { syncStyleControls(); V.applyTheme(); renderAll(); });
    TM.on('selection', function () { V.repaint(); renderTree(); renderSel(); renderStatus(); });
    TM.on('history', renderStatus);
    TM.on('hover', renderStatus);
    TM.on('view', renderStatus);
    TM.on('timeline', function () { renderKeyframes(); renderEra(); renderLegend(); });
    TM.on('playhead', function () { renderScrubs(); renderEra(); renderLegend(); });
    TM.on('playstate', function () { renderPlayButtons(); renderScrubs(); });
    TM.on('pickcolor', function (c) {
      if (!c) { toast('That region has no colour yet'); return; }
      setActiveColor(c);
      var g = ST.groupFor(c);
      toast('Picked ' + (g ? g.label + ' (' + c + ')' : c));
      setMode('paint');
    });

    setInterval(function () { if (S.dirty) { ST.autosave(); S.dirty = false; renderStatus(); } }, 4000);
    W.addEventListener('beforeunload', function () { ST.autosave(); });
    renderStatus();
  }

  /* --------------------------------------------------- static option lists */
  function fillStatics() {
    var th = $('s-theme');
    Object.keys(TM.THEMES).forEach(function (k) {
      th.appendChild(opt(k, TM.THEMES[k].title || k));
    });
    var sc = $('tl-scenario');
    TL.scenarios.forEach(function (s) { sc.appendChild(opt(s.id, s.name)); });
    var pr = $('sm-preset');
    Object.keys(SIM.presets).forEach(function (k) { pr.appendChild(opt(k, k)); });
    var ps = $('palset');
    Object.keys(TM.PALETTES).forEach(function (k) {
      var b = D.createElement('button');
      b.className = 'btn sm'; b.textContent = k; b.dataset.pal = k;
      b.onclick = function () { S.activePalette = k; renderSwatches(); };
      ps.appendChild(b);
    });
  }
  function opt(v, t) { var o = D.createElement('option'); o.value = v; o.textContent = t; return o; }

  /* ================================ RENDER ============================== */
  function renderAll() {
    renderSwatches(); renderLegend(); renderTree(); renderSel();
    renderKeyframes(); renderFactions(); renderSlots();
    syncStyleControls(); renderEra(); renderStatus(); renderScrubs();
    $('f-name').value = S.doc.name;
  }

  /* ---------- palette ---------- */
  function renderSwatches() {
    var box = $('swatches'); box.innerHTML = '';
    (TM.PALETTES[S.activePalette] || []).forEach(function (c) {
      var d = D.createElement('div');
      d.className = 'sw' + (c === S.activeColor ? ' on' : '');
      d.style.background = c; d.title = c;
      d.onclick = function () { setActiveColor(c); };
      box.appendChild(d);
    });
    Array.prototype.forEach.call($('palset').children, function (b) {
      b.classList.toggle('on', b.dataset.pal === S.activePalette);
    });
  }
  function setActiveColor(c, quiet) {
    c = ST.normHex(c) || '#8c2f2a';
    S.activeColor = c;
    $('curchip').style.background = c;
    $('pk-color').value = c;
    $('pk-hex').value = c;
    var g = ST.groupFor(c);
    $('pk-label').value = g ? g.label : '';
    renderSwatches();
    if (!quiet) renderLegend();
  }

  /* ---------- legend ---------- */
  function renderLegend() {
    var list = $('legend-list'); list.innerHTML = '';
    var gs = S.doc.groups;
    $('lg-count').textContent = gs.length ? '(' + gs.length + ')' : '';
    $('lg-empty').style.display = gs.length ? 'none' : '';
    gs.forEach(function (g, i) {
      var row = D.createElement('div');
      row.className = 'lg' + (g.color === S.activeColor ? ' on' : '');
      var chip = D.createElement('input');
      chip.type = 'color'; chip.value = g.color; chip.className = 'chip';
      chip.style.width = '19px'; chip.style.height = '19px'; chip.style.padding = '0';
      chip.title = 'Recolour every region in this group';
      chip.onclick = function (e) { e.stopPropagation(); };
      chip.oninput = function () { recolourGroup(g.color, chip.value); };
      var nm = D.createElement('input');
      nm.type = 'text'; nm.className = 'nm'; nm.value = g.label;
      nm.onclick = function (e) { e.stopPropagation(); };
      nm.oninput = function () { g.label = nm.value; S.dirty = true; renderMapLegend(); };
      var n = D.createElement('span');
      n.className = 'n'; n.textContent = ST.countColor(g.color);
      var x = D.createElement('span');
      x.className = 'x'; x.innerHTML = '&times;'; x.title = 'Clear every region in this group';
      x.onclick = function (e) {
        e.stopPropagation();
        var ids = idsWithColor(g.color);
        ST.setColor(ids, null);
        toast('Cleared ' + ids.length + ' region' + (ids.length === 1 ? '' : 's'));
      };
      row.appendChild(chip); row.appendChild(nm); row.appendChild(n); row.appendChild(x);
      row.onclick = function () { setActiveColor(g.color); selectColor(g.color); };
      row.title = 'Click to make this the active colour and select its regions';
      list.appendChild(row);
    });
    renderMapLegend();
  }
  function idsWithColor(c) {
    var out = [];
    for (var id in S.doc.colors) if (S.doc.colors[id] === c) out.push(id);
    return out;
  }
  function selectColor(c) {
    S.selection = {};
    idsWithColor(c).forEach(function (id) { S.selection[id] = true; });
    TM.emit('selection');
  }
  function recolourGroup(from, to) {
    to = ST.normHex(to); if (!to || to === from) return;
    ST.pushUndo();
    var g = ST.groupFor(from);
    idsWithColor(from).forEach(function (id) { S.doc.colors[id] = to; });
    if (g) {
      var exist = S.doc.groups.filter(function (x) { return x.color === to && x !== g; })[0];
      if (exist) { S.doc.groups = S.doc.groups.filter(function (x) { return x !== g; }); }
      else g.color = to;
    }
    ST.pruneGroups();
    if (S.activeColor === from) setActiveColor(to, true);
    TM.emit('paint');
  }
  var LEGEND_CORNERS = {
    tl: [0.015, 0.02], tr: [0.985, 0.02], bl: [0.015, 0.98], br: [0.985, 0.98]
  };
  function renderMapLegend() {
    var box = $('maplegend'), st = S.doc.style;
    var kf = (S.playing || S.scrubbing || S.activeKf >= 0) ? TL.frameAt(S.playhead) : null;
    var gs = (kf && kf.groups && kf.groups.length) ? kf.groups : S.doc.groups;
    if (!st.showLegend || !gs.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = '<div class="lt">' + esc(st.legendTitle || 'Legend') + '</div>' +
      gs.map(function (g) {
        return '<div class="li"><i style="background:' + esc(g.color) + '"></i>' +
               esc(g.label || g.color) + '</div>';
      }).join('');
    placeLegend();
  }
  function placeLegend() {
    var box = $('maplegend'), st = S.doc.style, stage = $('stage');
    var at = st.legendAt || LEGEND_CORNERS.tr;
    var w = box.offsetWidth || 200, h = box.offsetHeight || 90;
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var ax = at[0] > 0.5 ? 1 : 0, ay = at[1] > 0.5 ? 1 : 0;
    var x = at[0] * sw - ax * w, y = at[1] * sh - ay * h;
    x = Math.max(8, Math.min(sw - w - 8, x));
    y = Math.max(8, Math.min(sh - h - 8, y));
    box.style.left = x + 'px'; box.style.top = y + 'px';
    box.style.right = 'auto'; box.style.bottom = 'auto';
  }
  function bindLegendDrag() {
    var box = $('maplegend'), stage = $('stage'), drag = null;
    box.style.pointerEvents = 'auto';
    box.style.cursor = 'move';
    box.title = 'Drag to move the legend';
    box.addEventListener('pointerdown', function (e) {
      box.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, l: box.offsetLeft, t: box.offsetTop };
      e.preventDefault();
    });
    box.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var sw = stage.clientWidth, sh = stage.clientHeight;
      var l = drag.l + (e.clientX - drag.x), t = drag.t + (e.clientY - drag.y);
      l = Math.max(8, Math.min(sw - box.offsetWidth - 8, l));
      t = Math.max(8, Math.min(sh - box.offsetHeight - 8, t));
      box.style.left = l + 'px'; box.style.top = t + 'px';
      // store as a fraction, anchored to whichever side it is nearest
      var cx = l + box.offsetWidth / 2, cy = t + box.offsetHeight / 2;
      S.doc.style.legendAt = [
        cx > sw / 2 ? (l + box.offsetWidth) / sw : l / sw,
        cy > sh / 2 ? (t + box.offsetHeight) / sh : t / sh
      ];
      S.doc.style.legendAnchor = 'custom';
      S.dirty = true;
    });
    function stop(e) { if (drag) { drag = null; box.releasePointerCapture(e.pointerId); } }
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);
    W.addEventListener('resize', placeLegend);
  }

  /* ---------- era overlay ---------- */
  function renderEra() {
    var st = S.doc.style;
    var f = TL.frames();
    var kf = f.length ? TL.frameAt(S.playhead) : null;
    $('era-t').textContent = st.title || '';
    $('era-d').textContent = kf ? kf.date : (st.subtitle || '');
    $('era-n').textContent = kf ? [kf.title, kf.note].filter(Boolean).join(' — ')
                                : (kf ? '' : '');
    $('playbar').classList.toggle('on', f.length > 1);
  }

  /* ---------- tree ---------- */
  var treeBuilt = false;
  function renderTree() {
    var host = $('tree');
    if (!treeBuilt) {
      host.innerHTML = '';
      S.map.provinces.forEach(function (p) {
        var box = D.createElement('div');
        box.className = 'prov'; box.dataset.prov = p.name;
        var bases = S.provBases[p.name] || [];
        var hd = D.createElement('div');
        hd.className = 'hd';
        hd.innerHTML = '<span class="tw">&#9656;</span><b>' + esc(p.name) +
                       '</b><span class="n">' + bases.length + '</span>';
        hd.onclick = function (e) {
          if (e.shiftKey) {
            p.regions.forEach(function (id) { S.selection[id] = true; });
            TM.emit('selection');
            return;
          }
          box.classList.toggle('open');
          hd.querySelector('.tw').innerHTML = box.classList.contains('open') ? '&#9662;' : '&#9656;';
        };
        var fill = D.createElement('span');
        fill.className = 'n'; fill.style.cursor = 'pointer'; fill.style.marginLeft = '4px';
        fill.innerHTML = '&#9634;';
        fill.title = 'Fill this whole province with the active colour';
        fill.onclick = function (e) { e.stopPropagation(); ST.setColor(p.regions, S.activeColor); };
        hd.appendChild(fill);

        var kids = D.createElement('div');
        kids.className = 'kids';
        bases.forEach(function (bid) {
          var b = S.baseRegions[bid];
          var subs = S.byBase[bid] || [];
          var row = D.createElement('div');
          row.className = 'rg base'; row.dataset.base = bid;
          row.innerHTML = '<span class="tw">' + (subs.length > 1 ? '&#9656;' : '&nbsp;') +
            '</span><span class="dot"></span><span>' + esc(b.name) + '</span>' +
            (subs.length > 1 ? '<span class="cty">' + subs.length + '</span>' : '');
          var subBox = D.createElement('div');
          subBox.className = 'subs';
          subs.forEach(function (id) {
            var r = S.regions[id];
            var sr = D.createElement('div');
            sr.className = 'rg sub'; sr.dataset.id = id;
            sr.innerHTML = '<span class="dot"></span><span>' + esc(r.name) + '</span>';
            sr.onclick = function (e) {
              e.stopPropagation();
              if (e.shiftKey || S.mode === 'select') {
                if (S.selection[id]) delete S.selection[id]; else S.selection[id] = true;
                TM.emit('selection');
              } else if (e.altKey) { ST.setColor([id], null); }
              else { ST.setColor([id], S.activeColor); }
            };
            sr.ondblclick = function (e) { e.stopPropagation(); V.zoomToRegion(id); };
            subBox.appendChild(sr);
          });
          row.onclick = function (e) {
            if (e.target.classList.contains('tw') && subs.length > 1) {
              row.classList.toggle('open');
              e.target.innerHTML = row.classList.contains('open') ? '&#9662;' : '&#9656;';
              return;
            }
            if (e.shiftKey || S.mode === 'select') {
              var on = !S.selection[subs[0]];
              subs.forEach(function (x) { if (on) S.selection[x] = true; else delete S.selection[x]; });
              TM.emit('selection');
            } else if (e.altKey) { ST.setColor(subs, null); }
            else { ST.setColor(subs, S.activeColor); }
          };
          row.ondblclick = function () { if (subs.length) V.zoomToRegion(subs[0]); };
          kids.appendChild(row);
          kids.appendChild(subBox);
        });
        box.appendChild(hd); box.appendChild(kids);
        host.appendChild(box);
      });
      treeBuilt = true;
    }
    // colour dots and selection state
    Array.prototype.forEach.call(host.querySelectorAll('.rg.sub'), function (row) {
      var id = row.dataset.id;
      row.classList.toggle('sel', !!S.selection[id]);
      var c = S.doc.colors[id];
      var dot = row.querySelector('.dot');
      dot.style.background = c || 'transparent';
      dot.style.borderStyle = c ? 'solid' : 'dashed';
    });
    Array.prototype.forEach.call(host.querySelectorAll('.rg.base'), function (row) {
      var subs = S.byBase[row.dataset.base] || [];
      var cols = {}, any = false;
      subs.forEach(function (id) {
        if (S.doc.colors[id]) { cols[S.doc.colors[id]] = 1; any = true; }
      });
      var keys = Object.keys(cols);
      var dot = row.querySelector('.dot');
      dot.style.background = keys.length === 1 ? keys[0] : (any ? 'linear-gradient(45deg,' +
        keys.slice(0, 2).join(',') + ')' : 'transparent');
      dot.style.borderStyle = any ? 'solid' : 'dashed';
      row.classList.toggle('sel', subs.length > 0 &&
        subs.every(function (x) { return S.selection[x]; }));
    });
  }
  function renderSel() {
    var n = selCount();
    $('sel-count').textContent = n ? '(' + n + ')' : '';
  }

  /* ---------- search ---------- */
  /* Lore names people search for that are not themselves regions. */
  var ALIASES = {
    'vvardenfell': ['Gnisis', "Ald'ruhn", 'Balmora', 'Seyda Neen', 'Vivec', 'Dagon Fel'],
    'summerset': ['Alinor', 'Cloudrest', 'Dusk', 'Lillandril', 'Shimmerene', 'Sunhold',
                  'Firsthold'],
    'holds': ['Solitude', 'Morthal', 'Dawnstar', 'Winterhold', 'Windhelm', 'Whiterun',
              'Falkreath'],
    'colovia': ['Anvil', 'Kvatch', 'Skingrad', 'Chorrol', 'Bruma'],
    'nibenay': ['Imperial City', 'Bravil', 'Leyawiin', 'Cheydinhal'],
    'cyrodiil': [],
    'argonia': ['Stormhold', 'Thorn', 'Helstrom', 'Gideon', 'Archon', 'Soulrest',
                'Blackrose'],
    "alik'r": ['Gilane', 'Taneth', 'Hegathe', 'Rihad', 'Skaven'],
    'iliac bay': ['Camlorn', 'Wayrest', 'Shornhelm', 'Evermore'],
    'deshaan': ['Mournhold', 'Narsis', 'Tear'],
    'telvanni': ['Sadrith Mora', 'Firewatch', 'Necrom']
  };
  function aliasHits(q) {
    var names = null;
    for (var k in ALIASES) {
      if (ALIASES[k].length && k.indexOf(q) === 0) { names = ALIASES[k]; break; }
    }
    if (!names) return [];
    var out = [];
    names.forEach(function (n) {
      for (var id in S.regions) {
        var r = S.regions[id];
        if (r.name === n || r.base === n) out.push(r);
      }
    });
    return out;
  }
  function renderFind(q) {
    var out = $('find-out');
    q = (q || '').trim().toLowerCase();
    if (!q) { out.innerHTML = ''; return; }

    var aliased = aliasHits(q);
    var seen = {}, hits = [];
    function push(bid) {
      if (!bid || seen[bid]) return;
      seen[bid] = 1;
      hits.push(S.baseRegions[bid]);
    }
    aliased.forEach(function (r) { push(r.baseId); });
    var aliasCount = hits.length;
    for (var bid in S.baseRegions) {
      var b = S.baseRegions[bid];
      if ((b.name + ' ' + b.province).toLowerCase().indexOf(q) >= 0) push(bid);
    }
    for (var id in S.regions) {
      var r = S.regions[id];
      if ((r.name + ' ' + (r.city || '')).toLowerCase().indexOf(q) >= 0) push(r.baseId);
    }
    var head = hits.slice(0, aliasCount), rest = hits.slice(aliasCount);
    rest.sort(function (a, b) {
      var an = a.name.toLowerCase().indexOf(q), bn = b.name.toLowerCase().indexOf(q);
      return (an < 0 ? 9 : an) - (bn < 0 ? 9 : bn) || a.name.localeCompare(b.name);
    });
    hits = head.concat(rest);

    out.innerHTML = hits.slice(0, 14).map(function (b) {
      var subs = S.byBase[b.id] || [];
      var c = S.doc.colors[subs[0]] || 'transparent';
      return '<div class="rg" data-base="' + b.id + '"><span class="dot" style="background:' +
        c + '"></span><span>' + esc(b.name) + '</span><span class="cty">' +
        esc(b.province) + (subs.length > 1 ? ' · ' + subs.length : '') + '</span></div>';
    }).join('') || '<p class="hint">Nothing matches &ldquo;' + esc(q) + '&rdquo;.</p>';

    if (hits.length > 1) {
      var all = D.createElement('button');
      all.className = 'btn sm'; all.style.marginTop = '6px';
      all.textContent = 'Select all ' + hits.length + ' regions';
      all.onclick = function () {
        var n = 0;
        hits.forEach(function (b) {
          (S.byBase[b.id] || []).forEach(function (id) { S.selection[id] = true; n++; });
        });
        TM.emit('selection');
        toast(n + ' subregions selected');
      };
      out.appendChild(all);
    }
    Array.prototype.forEach.call(out.querySelectorAll('.rg'), function (row) {
      row.onclick = function (e) {
        var subs = S.byBase[row.dataset.base] || [];
        if (!subs.length) return;
        if (e.altKey) { ST.setColor(subs, S.activeColor); return; }
        subs.forEach(function (id) { S.selection[id] = true; });
        TM.emit('selection');
        V.zoomToRegion(subs[0]);
      };
    });
  }

  /* ---------- keyframes ---------- */
  function renderKeyframes() {
    var f = TL.frames(), host = $('kf-list');
    $('kf-count').textContent = f.length ? '(' + f.length + ')' : '';
    host.innerHTML = '';
    f.forEach(function (kf, i) {
      var row = D.createElement('div');
      row.className = 'kf' + (i === S.activeKf ? ' on' : '');
      row.innerHTML = '<span class="i">' + (i + 1) + '</span>' +
        '<span class="tx"><b>' + esc(kf.title || kf.date) + '</b><i>' + esc(kf.date) + '</i></span>' +
        '<span class="mv"><span class="up">&#9650;</span><span class="dn">&#9660;</span></span>' +
        '<span class="x">&times;</span>';
      row.onclick = function () { TL.load(i); renderKfFields(); };
      row.querySelector('.up').onclick = function (e) { e.stopPropagation(); TL.move(i, -1); };
      row.querySelector('.dn').onclick = function (e) { e.stopPropagation(); TL.move(i, 1); };
      row.querySelector('.x').onclick = function (e) { e.stopPropagation(); TL.remove(i); };
      host.appendChild(row);
    });
    renderScrubs(); renderKfFields();
  }
  function renderKfFields() {
    var kf = TL.frames()[S.activeKf];
    $('kf-date').value = kf ? kf.date : '';
    $('kf-title').value = kf ? kf.title : '';
    $('kf-note').value = kf ? kf.note : '';
    ['kf-date', 'kf-title', 'kf-note'].forEach(function (id) { $(id).disabled = !kf; });
  }
  function renderScrubs() {
    var n = Math.max(0, TL.frames().length - 1);
    [['tl-scrub', 'tl-pos'], ['pb-scrub', 'pb-lbl']].forEach(function (p) {
      var s = $(p[0]); s.max = n; s.value = S.playhead;
      s.disabled = n === 0;
      var kf = TL.frameAt(S.playhead);
      $(p[1]).textContent = kf ? kf.date : '—';
    });
  }
  function renderPlayButtons() {
    var glyph = S.playing ? '&#10073;&#10073;' : '&#9654;';
    $('tl-play').innerHTML = glyph;
    $('pb-play').innerHTML = glyph;
  }

  /* ---------- factions ---------- */
  var facs = [];
  function renderFactions() {
    var host = $('sm-factions'); host.innerHTML = '';
    $('sm-count').textContent = facs.length ? '(' + facs.length + ')' : '';
    facs.forEach(function (f, i) {
      var box = D.createElement('div');
      box.className = 'fac';
      var top = D.createElement('div'); top.className = 'top';
      var col = D.createElement('input'); col.type = 'color'; col.value = f.color;
      col.oninput = function () { f.color = col.value; };
      var nm = D.createElement('input'); nm.type = 'text'; nm.value = f.name;
      nm.oninput = function () { f.name = nm.value; };
      var setb = D.createElement('button');
      setb.className = 'btn sm'; setb.textContent = 'Set';
      setb.title = 'Use the current selection as this faction\'s starting regions';
      setb.onclick = function () {
        f.seeds = Object.keys(S.selection);
        if (!f.seeds.length) { toast('Select some regions first'); return; }
        renderFactions();
      };
      var del = D.createElement('button');
      del.className = 'btn sm danger'; del.innerHTML = '&times;';
      del.onclick = function () { facs.splice(i, 1); renderFactions(); };
      [col, nm, setb, del].forEach(function (e) { top.appendChild(e); });
      var seeds = D.createElement('div');
      seeds.className = 'seeds';
      seeds.innerHTML = f.seeds.length
        ? f.seeds.slice(0, 12).map(function (id) {
            return '<em>' + esc((S.regions[id] || {}).name || id) + '</em>';
          }).join('') + (f.seeds.length > 12 ? ' +' + (f.seeds.length - 12) + ' more' : '')
        : '<span style="opacity:.7">no starting regions — select some and press Set</span>';
      box.appendChild(top); box.appendChild(seeds);
      host.appendChild(box);
    });
  }

  /* ---------- slots ---------- */
  function renderSlots() {
    var host = $('f-slots'); host.innerHTML = '';
    var slots = ST.listSlots();
    if (!slots.length) {
      host.innerHTML = '<p class="hint">No saved maps yet.</p>';
      return;
    }
    slots.sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    slots.forEach(function (s) {
      var row = D.createElement('div');
      row.className = 'slot';
      row.innerHTML = '<span class="nm">' + esc(s.name) + '</span><span class="dt">' +
        esc((s.at || '').slice(0, 16).replace('T', ' ')) + '</span>';
      var ld = D.createElement('button');
      ld.className = 'btn sm'; ld.textContent = 'Open';
      ld.onclick = function () {
        ST.loadSlot(s.name); toast('Opened “' + s.name + '”');
      };
      var dl = D.createElement('button');
      dl.className = 'btn sm danger'; dl.innerHTML = '&times;';
      dl.onclick = function () { ST.deleteSlot(s.name); renderSlots(); };
      row.appendChild(ld); row.appendChild(dl);
      host.appendChild(row);
    });
  }

  /* ---------- status ---------- */
  function renderStatus() {
    var bits = [];
    var painted = Object.keys(S.doc.colors).length;
    function countGroups(idx) {
      var n = 0;
      for (var k in idx) {
        if (idx[k].some(function (x) { return S.doc.colors[x]; })) n++;
      }
      return n;
    }
    if (S.level === 'region') {
      bits.push(countGroups(S.byBase) + '/' + (S.map.baseRegions || []).length + ' regions painted');
    } else if (S.level === 'subregion') {
      bits.push(countGroups(S.bySub) + '/' + (S.map.subRegions || []).length + ' subregions painted');
    } else {
      bits.push(painted + '/' + S.map.regions.length + ' parcels painted');
    }
    if (selCount()) bits.push(selCount() + ' selected');
    if (S.hover) bits.push(S.regions[S.hover].name + ' · ' + S.regions[S.hover].province);
    var k = V.getFit().w / V.getView().w;
    bits.push('×' + k.toFixed(1));
    if (S.dirty) bits.push('unsaved');
    $('status').textContent = bits.join('  ·  ');
    $('b-undo').disabled = !ST.canUndo();
    $('b-redo').disabled = !ST.canRedo();
  }

  /* ---------- style controls ---------- */
  function syncStyleControls() {
    var st = S.doc.style;
    $('s-theme').value = st.theme;
    $('s-labelmode').value = st.labelMode;
    $('s-labelsource').value = st.labelSource || 'region';
    $('s-labelsize').value = st.labelSize; $('s-labelsize-v').textContent = st.labelSize;
    $('s-borders').checked = st.showBorders;
    $('s-subborders').checked = !!st.showSubBorders;
    $('s-sbw').value = st.subBorderWidth != null ? st.subBorderWidth : 0.6;
    $('s-sbw-v').textContent = $('s-sbw').value;
    $('s-capitals').checked = !!st.showCapitals;
    $('s-towns').checked = !!st.showTowns;
    $('s-citynames').checked = !!st.showCityNames;
    $('s-cs').value = st.cityScale != null ? st.cityScale : 1;
    $('s-cs-v').textContent = '×' + $('s-cs').value;
    $('s-baseborders').checked = st.showBaseBorders !== false;
    $('s-bbw').value = st.baseBorderWidth != null ? st.baseBorderWidth : 0.9;
    $('s-bbw-v').textContent = $('s-bbw').value;
    $('s-provborders').checked = st.showProvBorders;
    $('s-coast').checked = st.showCoast;
    $('s-rivers').checked = st.showRivers;
    $('s-lakes').checked = st.showLakes;
    $('s-bw').value = st.borderWidth; $('s-bw-v').textContent = st.borderWidth;
    $('s-pbw').value = st.provBorderWidth; $('s-pbw-v').textContent = st.provBorderWidth;
    $('s-title').value = st.title || '';
    $('s-subtitle').value = st.subtitle || '';
    $('s-legendtitle').value = st.legendTitle || '';
    $('s-showlegend').checked = st.showLegend !== false;
    $('s-legendpos').value = st.legendAnchor || 'tr';
    $('tl-spf').value = st.secPerFrame || 1.6; $('tl-spf-v').textContent = (st.secPerFrame || 1.6) + 's';
    $('tl-crossfade').checked = st.crossfade !== false;
    $('tl-loop').checked = !!st.loopPlay;
    $('e-view').value = st.exportView || 'fit';
    $('e-scale').value = st.exportScale || 2;
    $('e-scale-v').textContent = '×' + (st.exportScale || 2);
  }
  function styleChanged(rerender) {
    S.dirty = true;
    if (rerender !== false) V.applyTheme();
    renderMapLegend(); renderEra(); renderStatus();
  }

  /* ---------- tabs / modes ---------- */
  function setTab(name) {
    Array.prototype.forEach.call(D.querySelectorAll('#tabs button'), function (b) {
      b.classList.toggle('on', b.dataset.p === name);
    });
    Array.prototype.forEach.call(D.querySelectorAll('.panel'), function (p) {
      p.classList.toggle('on', p.dataset.p === name);
    });
  }
  function setMode(m) {
    S.mode = m;
    $('m-paint').classList.toggle('on', m === 'paint');
    $('m-select').classList.toggle('on', m === 'select');
    $('m-pick').classList.toggle('on', m === 'pick');
    var svg = V.svgNode();
    svg.classList.toggle('picking', m === 'pick');
    svg.style.cursor = m === 'select' ? 'pointer' : (m === 'pick' ? 'copy' : 'crosshair');
  }
  var LEVELS = ['province', 'region', 'subregion', 'parcel'];
  function setLevel(l, quiet) {
    if (LEVELS.indexOf(l) < 0) l = 'region';
    S.level = l;
    LEVELS.forEach(function (k) { $('lv-' + k).classList.toggle('on', k === l); });
    // the original map has no subdivision lines, so each level shows only the
    // borders you are actually working with
    var st = S.doc.style;
    st.showSubBorders = (l === 'subregion' || l === 'parcel');
    st.showBorders = (l === 'parcel');
    $('s-borders').checked = st.showBorders;
    $('s-subborders').checked = st.showSubBorders;
    V.applyTheme();
    if (V.clearHover) V.clearHover();
    if (!quiet) renderStatus();
  }

  /* ================================ BIND ================================ */
  function bind() {
    Array.prototype.forEach.call(D.querySelectorAll('#tabs button'), function (b) {
      b.onclick = function () { setTab(b.dataset.p); };
    });
    $('m-paint').onclick = function () { setMode('paint'); };
    $('m-select').onclick = function () { setMode('select'); };
    $('m-pick').onclick = function () { setMode('pick'); };
    LEVELS.forEach(function (k) {
      $('lv-' + k).onclick = function () { setLevel(k); };
    });
    $('b-undo').onclick = function () { ST.undo(); };
    $('b-redo').onclick = function () { ST.redo(); };
    $('b-fit').onclick = function () { V.resetView(); };
    $('b-png').onclick = doPNG;

    /* paint panel */
    $('pk-color').oninput = function () { setActiveColor($('pk-color').value); };
    $('pk-hex').onchange = function () {
      var c = ST.normHex($('pk-hex').value);
      if (c) setActiveColor(c); else { toast('Not a colour'); $('pk-hex').value = S.activeColor; }
    };
    $('pk-label').onchange = function () {
      var g = ST.ensureGroup(S.activeColor, $('pk-label').value);
      if (g) { g.label = $('pk-label').value || g.label; S.dirty = true; renderLegend(); }
    };
    $('q-prov').onclick = function () {
      ST.pushUndo();
      var pal = TM.PALETTES.Provinces;
      S.map.provinces.forEach(function (p, i) {
        var c = pal[i % pal.length];
        p.regions.forEach(function (id) { S.doc.colors[id] = c; });
        ST.ensureGroup(c, p.name);
      });
      ST.pruneGroups(); TM.emit('paint');
    };
    $('q-rand').onclick = function () {
      ST.pushUndo();
      var pal = TM.PALETTES[S.activePalette] || TM.PALETTES.Banners;
      S.map.regions.forEach(function (r) {
        S.doc.colors[r.id] = pal[Math.floor(Math.random() * pal.length)];
      });
      pal.forEach(function (c, i) { ST.ensureGroup(c, 'Group ' + (i + 1)); });
      ST.pruneGroups(); TM.emit('paint');
    };
    $('q-all').onclick = function () {
      ST.setColor(S.map.regions.map(function (r) { return r.id; }), S.activeColor);
    };
    $('q-clear').onclick = function () {
      ST.pushUndo(); S.doc.colors = {}; S.doc.groups = []; TM.emit('paint');
    };

    /* select panel */
    $('find').oninput = function () { renderFind($('find').value); };
    $('sel-fill').onclick = function () {
      var ids = Object.keys(S.selection);
      if (!ids.length) { toast('Nothing selected'); return; }
      ST.setColor(ids, S.activeColor);
      toast('Filled ' + ids.length + ' region' + (ids.length === 1 ? '' : 's'));
    };
    $('sel-erase').onclick = function () {
      var ids = Object.keys(S.selection);
      if (ids.length) ST.setColor(ids, null);
    };
    $('sel-all').onclick = function () {
      S.map.regions.forEach(function (r) { S.selection[r.id] = true; });
      TM.emit('selection');
    };
    $('sel-none').onclick = function () { S.selection = {}; TM.emit('selection'); };
    $('sel-invert').onclick = function () {
      var n = {};
      S.map.regions.forEach(function (r) { if (!S.selection[r.id]) n[r.id] = true; });
      S.selection = n; TM.emit('selection');
    };

    /* style panel */
    $('s-theme').onchange = function () { S.doc.style.theme = $('s-theme').value; styleChanged(); V.repaint(); };
    $('s-labelmode').onchange = function () { S.doc.style.labelMode = $('s-labelmode').value; styleChanged(); };
    $('s-labelsource').onchange = function () { S.doc.style.labelSource = $('s-labelsource').value; styleChanged(); };
    $('s-labelsize').oninput = function () {
      S.doc.style.labelSize = parseFloat($('s-labelsize').value);
      $('s-labelsize-v').textContent = S.doc.style.labelSize;
      V.updateLabels(true); S.dirty = true;
    };
    [['s-borders', 'showBorders'], ['s-subborders', 'showSubBorders'],
     ['s-baseborders', 'showBaseBorders'], ['s-provborders', 'showProvBorders'],
     ['s-coast', 'showCoast'],
     ['s-capitals', 'showCapitals'], ['s-towns', 'showTowns'],
     ['s-citynames', 'showCityNames'],
     ['s-rivers', 'showRivers'], ['s-lakes', 'showLakes']].forEach(function (p) {
      $(p[0]).onchange = function () { S.doc.style[p[1]] = $(p[0]).checked; styleChanged(); };
    });
    $('s-sbw').oninput = function () {
      S.doc.style.subBorderWidth = parseFloat($('s-sbw').value);
      $('s-sbw-v').textContent = S.doc.style.subBorderWidth; styleChanged();
    };
    $('s-cs').oninput = function () {
      S.doc.style.cityScale = parseFloat($('s-cs').value);
      $('s-cs-v').textContent = '×' + S.doc.style.cityScale;
      V.styleCities(); S.dirty = true;
    };
    $('s-bbw').oninput = function () {
      S.doc.style.baseBorderWidth = parseFloat($('s-bbw').value);
      $('s-bbw-v').textContent = S.doc.style.baseBorderWidth; styleChanged();
    };
    $('s-bw').oninput = function () {
      S.doc.style.borderWidth = parseFloat($('s-bw').value);
      $('s-bw-v').textContent = S.doc.style.borderWidth; styleChanged();
    };
    $('s-pbw').oninput = function () {
      S.doc.style.provBorderWidth = parseFloat($('s-pbw').value);
      $('s-pbw-v').textContent = S.doc.style.provBorderWidth; styleChanged();
    };
    $('s-title').oninput = function () { S.doc.style.title = $('s-title').value; styleChanged(false); };
    $('s-subtitle').oninput = function () { S.doc.style.subtitle = $('s-subtitle').value; styleChanged(false); };
    $('s-legendtitle').oninput = function () { S.doc.style.legendTitle = $('s-legendtitle').value; styleChanged(false); };
    $('s-showlegend').onchange = function () { S.doc.style.showLegend = $('s-showlegend').checked; styleChanged(false); };
    $('s-legendpos').onchange = function () {
      var v = $('s-legendpos').value;
      S.doc.style.legendAnchor = v;
      if (LEGEND_CORNERS[v]) S.doc.style.legendAt = LEGEND_CORNERS[v].slice();
      styleChanged(false);
    };

    /* timeline panel */
    $('tl-scenario').onchange = showScNote;
    showScNote();
    $('tl-load').onclick = function () {
      TL.loadScenario($('tl-scenario').value, false);
      toast('Loaded ' + TL.frames().length + ' frames');
      setTab('time');
    };
    $('tl-append').onclick = function () {
      TL.loadScenario($('tl-scenario').value, true);
      toast('Appended — ' + TL.frames().length + ' frames');
    };
    $('kf-add').onclick = function () {
      TL.add(); toast('Captured frame ' + TL.frames().length);
    };
    $('kf-update').onclick = function () {
      if (S.activeKf < 0) { toast('Pick a frame first'); return; }
      TL.update(S.activeKf); toast('Frame updated');
    };
    ['kf-date', 'kf-title', 'kf-note'].forEach(function (id) {
      $(id).oninput = function () {
        var kf = TL.frames()[S.activeKf]; if (!kf) return;
        kf[id.slice(3)] = $(id).value;
        S.dirty = true; renderKeyframes(); renderEra();
      };
    });
    $('tl-play').onclick = togglePlay;
    $('pb-play').onclick = togglePlay;
    $('pb-close').onclick = function () { TL.stop(); S.activeKf = -1; renderEra(); renderLegend(); };
    $('tl-scrub').oninput = function () { TL.pause(); TL.seek(parseFloat($('tl-scrub').value)); };
    $('pb-scrub').oninput = function () { TL.pause(); TL.seek(parseFloat($('pb-scrub').value)); };
    $('tl-spf').oninput = function () {
      S.doc.style.secPerFrame = parseFloat($('tl-spf').value);
      $('tl-spf-v').textContent = S.doc.style.secPerFrame + 's'; S.dirty = true;
    };
    $('tl-crossfade').onchange = function () { S.doc.style.crossfade = $('tl-crossfade').checked; S.dirty = true; };
    $('tl-loop').onchange = function () { S.doc.style.loopPlay = $('tl-loop').checked; S.dirty = true; };
    $('tl-frames').onclick = function () {
      if (!TL.frames().length) { toast('No frames to export'); return; }
      toast('Exporting ' + TL.frames().length + ' PNGs…');
      EX.exportFrames(1.5).then(function (n) { toast('Exported ' + n + ' frames'); });
    };

    /* sim panel */
    $('sm-loadpreset').onclick = function () {
      facs = SIM.expandPreset($('sm-preset').value);
      renderFactions();
      toast(facs.length + ' factions ready');
    };
    $('sm-frompaint').onclick = function () {
      facs = SIM.factionsFromPainting();
      if (!facs.length) { toast('Paint something first'); return; }
      renderFactions();
      toast(facs.length + ' factions taken from the painting');
    };
    $('sm-addfac').onclick = function () {
      var f = SIM.newFaction(facs.length);
      f.seeds = Object.keys(S.selection);
      facs.push(f); renderFactions();
    };
    $('sm-clearfac').onclick = function () { facs = []; renderFactions(); };
    [['sm-exp', 'sm-exp-v'], ['sm-agg', 'sm-agg-v'], ['sm-sea', 'sm-sea-v'],
     ['sm-rev', 'sm-rev-v']].forEach(function (p) {
      var upd = function () { $(p[1]).textContent = Math.round($(p[0]).value * 100) + '%'; };
      $(p[0]).oninput = upd; upd();
    });
    $('sm-run').onclick = function () { runSim(false); };
    $('sm-runplay').onclick = function () { runSim(true); };

    /* file panel */
    $('f-name').oninput = function () { S.doc.name = $('f-name').value; S.dirty = true; };
    $('f-save').onclick = function () {
      var n = ($('f-slot').value || S.doc.name || 'Untitled').trim();
      if (ST.saveSlot(n)) { toast('Saved “' + n + '”'); renderSlots(); renderStatus(); }
      else toast('Could not save — browser storage is full or blocked');
    };
    $('e-png').onclick = doPNG;
    $('e-svg').onclick = function () { EX.exportSVG(); toast('SVG exported'); };
    $('e-json').onclick = function () { EX.exportJSON(); toast('Map file exported'); };
    $('e-csv').onclick = function () { EX.exportCSV(); toast('CSV exported'); };
    $('e-view').onchange = function () { S.doc.style.exportView = $('e-view').value; S.dirty = true; };
    $('e-scale').oninput = function () {
      S.doc.style.exportScale = parseFloat($('e-scale').value);
      $('e-scale-v').textContent = '×' + S.doc.style.exportScale; S.dirty = true;
    };
    $('i-json').onclick = function () { $('i-file').click(); };
    $('i-file').onchange = function () {
      var f = $('i-file').files[0]; if (!f) return;
      EX.importJSON(f).then(function () { toast('Map loaded'); })
        .catch(function () { toast('That file could not be read'); });
      $('i-file').value = '';
    };
    $('f-reset').onclick = function () {
      if (!W.confirm('Discard this map and start over?')) return;
      ST.setDoc(ST.newDoc());
      toast('Cleared');
    };

    $('side-toggle').onclick = function () {
      var app = D.getElementById('app');
      var on = app.classList.toggle('collapsed');
      $('side-toggle').innerHTML = on ? '&#9656;' : '&#9666;';
      $('side-toggle').title = on ? 'Show the panel (Tab)' : 'Hide the panel (Tab)';
      setTimeout(function () { TM.emit('view'); V.resetView(); }, 200);
    };

    /* zoom controls */
    $('z-in').onclick = function () { V.zoomBy(1 / 1.35); };
    $('z-out').onclick = function () { V.zoomBy(1.35); };
    $('z-fit').onclick = function () { V.resetView(); };

    /* keyboard */
    D.addEventListener('keydown', onKey);
  }

  function showScNote() {
    var s = TL.scenarios.filter(function (x) { return x.id === $('tl-scenario').value; })[0];
    $('tl-scnote').textContent = s ? s.note + ' (' + s.frames.length + ' frames)' : '';
  }
  function togglePlay() {
    if (S.playing) TL.pause();
    else if (TL.frames().length > 1) TL.play();
    else toast('Capture at least two frames first');
  }
  function doPNG() {
    toast('Rendering PNG…');
    EX.exportPNG(S.doc.style.exportScale || 2)
      .then(function () { toast('PNG exported'); })
      .catch(function (e) { toast('PNG failed: ' + e); });
  }
  function runSim(thenPlay) {
    if (!facs.length || !facs.some(function (f) { return f.seeds.length; })) {
      toast('Give at least one faction some starting regions');
      return;
    }
    var cfg = {
      seed: $('sm-seed').value || 'tamriel',
      steps: Math.max(1, parseInt($('sm-steps').value, 10) || 12),
      attempts: Math.max(1, parseInt($('sm-attempts').value, 10) || 3),
      expansion: parseFloat($('sm-exp').value),
      aggression: parseFloat($('sm-agg').value),
      seaChance: parseFloat($('sm-sea').value),
      revolt: parseFloat($('sm-rev').value),
      startEra: $('sm-era').value,
      startYear: parseInt($('sm-year').value, 10) || 0,
      yearsPerStep: Math.max(1, parseInt($('sm-ypt').value, 10) || 1)
    };
    var frames = SIM.run(cfg, JSON.parse(JSON.stringify(facs)));
    if (!frames) { toast('Simulation produced nothing'); return; }
    toast('Simulated ' + frames.length + ' turns');
    setTab('time');
    if (thenPlay) { S.playhead = 0; TL.play(); }
  }

  function onKey(e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) ST.redo(); else ST.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); ST.redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 's') {
      e.preventDefault();
      var n = (S.doc.name || 'Untitled').trim();
      if (ST.saveSlot(n)) { toast('Saved “' + n + '”'); renderSlots(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (k) {
      case 'b': setMode('paint'); break;
      case 'v': setMode('select'); break;
      case 'i': setMode('pick'); break;
      case 'p':
        setLevel(LEVELS[(LEVELS.indexOf(S.level) + 1) % LEVELS.length]);
        break;
      case 'tab': e.preventDefault(); $('side-toggle').onclick(); break;
      case 'k': TL.add(); toast('Captured frame ' + TL.frames().length); break;
      case ' ': e.preventDefault(); togglePlay(); break;
      case '0': V.resetView(); break;
      case '+': case '=': V.zoomBy(1 / 1.35); break;
      case '-': V.zoomBy(1.35); break;
      case 'escape': S.selection = {}; TM.emit('selection'); break;
      default:
        if (/^[1-9]$/.test(k)) {
          var pal = TM.PALETTES[S.activePalette] || [];
          var c = pal[parseInt(k, 10) - 1];
          if (c) setActiveColor(c);
        }
    }
  }

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
