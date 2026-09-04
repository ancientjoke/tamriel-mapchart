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

  var S = TM.S, ST = TM.state, V, EX;
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
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* ============================== INIT ================================== */
  function init() {
    V = TM.view; EX = TM.exporter;

    V.build(W.TAMRIEL_MAP, $('stage'), $('tip'));

    ST.loadAutosave();
    fillStatics();
    // the traced map carries no rivers or lakes of its own; hide dead controls
    if (!(S.map.rivers || []).length) $('row-rivers').style.display = 'none';
    if (!(S.map.lakes || []).length) $('row-lakes').style.display = 'none';
    bind();
    renderAll();
    setTab('paint');
    setMode('paint'); setLevel(S.level || 'region', true);
    setCityMode(!!S.doc.style.showCityDistricts, true);
    setActiveColor(TM.PALETTES.Banners[0], true);
    bindLegendDrag();

    TM.on('paint', function () {
      V.repaint(); renderLegend(); renderTree(); renderStatus(); renderInspector();
    });
    TM.on('doc', function () { syncStyleControls(); V.applyTheme(); renderAll(); });
    TM.on('selection', function () { V.repaint(); renderTree(); renderSel(); renderStatus(); });
    TM.on('history', renderStatus);
    TM.on('hover', function () { renderStatus(); renderInspector(); });
    TM.on('view', renderStatus);
    TM.on('contextmenu', openMenu);
    D.addEventListener('pointerdown', function (e) {
      var m = $('ctxmenu');
      if (m && m.classList.contains('on') && !m.contains(e.target)) closeMenu();
    }, true);
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
    renderSwatches(); renderLegend(); renderTree(); renderSel(); renderSlots();
    syncStyleControls(); renderTitleCard(); renderStatus(); renderInspector();
    $('f-name').value = S.doc.name;
  }

  /* ---------- palette ---------- */
  function swatchEl(c, onPick, onForget) {
    var d = D.createElement('div');
    d.className = 'sw' + (c === S.activeColor ? ' on' : '');
    d.style.background = c; d.title = c;
    d.onclick = function () { onPick(c); };
    if (onForget) {
      d.oncontextmenu = function (e) { e.preventDefault(); onForget(c); };
      d.title = c + ' — right-click to forget';
    }
    return d;
  }
  function renderSwatches() {
    var box = $('swatches'); box.innerHTML = '';
    (TM.PALETTES[S.activePalette] || []).forEach(function (c) {
      box.appendChild(swatchEl(c, function () { setActiveColor(c); }));
    });
    Array.prototype.forEach.call($('palset').children, function (b) {
      b.classList.toggle('on', b.dataset.pal === S.activePalette);
    });
    renderRecent(); renderMine();
  }
  function renderRecent() {
    var host = $('recent'), wrap = $('recent-wrap');
    host.innerHTML = '';
    wrap.hidden = !S.recent.length;
    S.recent.forEach(function (c) {
      host.appendChild(swatchEl(c, function () { setActiveColor(c); }));
    });
  }
  function renderMine() {
    var host = $('mine'), wrap = $('mine-wrap');
    var mine = ST.listSwatches();
    host.innerHTML = '';
    wrap.hidden = !mine.length;
    mine.forEach(function (c) {
      host.appendChild(swatchEl(c, function () { setActiveColor(c); },
        function () { ST.removeSwatch(c); renderMine(); }));
    });
  }
  function setActiveColor(c, quiet) {
    c = ST.normHex(c) || '#8c2f2a';
    S.activeColor = c;
    ST.noteColor(c);
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
      var mv = D.createElement('span');
      mv.className = 'mv';
      mv.innerHTML = '<span class="up" title="Move up">&#9650;</span>' +
                     '<span class="dn" title="Move down">&#9660;</span>';
      mv.onclick = function (e) { e.stopPropagation(); };
      mv.querySelector('.up').onclick = function (e) { e.stopPropagation(); moveGroup(i, -1); };
      mv.querySelector('.dn').onclick = function (e) { e.stopPropagation(); moveGroup(i, 1); };
      var x = D.createElement('span');
      x.className = 'x'; x.innerHTML = '&times;'; x.title = 'Clear every region in this group';
      x.onclick = function (e) {
        e.stopPropagation();
        var ids = idsWithColor(g.color);
        ST.setColor(ids, null);
        toast('Cleared ' + plural(ids.length, 'region'));
      };
      [chip, nm, n, mv, x].forEach(function (el) { row.appendChild(el); });
      row.onclick = function () { setActiveColor(g.color); selectColor(g.color); };
      row.title = 'Click to make this the active colour and select its regions';
      list.appendChild(row);
    });
    renderMapLegend();
  }
  function moveGroup(i, d) {
    var gs = S.doc.groups, j = i + d;
    if (j < 0 || j >= gs.length) return;
    var t = gs[i]; gs[i] = gs[j]; gs[j] = t;
    S.dirty = true; renderLegend();
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
    for (var o in S.doc.occupied) if (S.doc.occupied[o] === from) S.doc.occupied[o] = to;
    for (var c in S.doc.cityColors) if (S.doc.cityColors[c] === from) S.doc.cityColors[c] = to;
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
    var box = $('maplegend'), st = S.doc.style, gs = S.doc.groups;
    if (!st.showLegend || !gs.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    var cols = Math.max(1, Math.min(4, st.legendCols || 1));
    box.innerHTML = '<div class="lt">' + esc(st.legendTitle || 'Legend') + '</div>' +
      '<div class="cols" style="grid-template-columns:repeat(' + cols + ',auto)">' +
      gs.map(function (g) {
        return '<div class="li"><i style="background:' + esc(g.color) + '"></i>' +
               esc(g.label || g.color) +
               (st.legendCounts ? '<u>' + ST.countColor(g.color) + '</u>' : '') + '</div>';
      }).join('') + '</div>';
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
      $('s-legendpos').value = 'custom';
      S.dirty = true;
    });
    function stop(e) { if (drag) { drag = null; box.releasePointerCapture(e.pointerId); } }
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);
    W.addEventListener('resize', placeLegend);
  }

  /* ---------- title card on the map ---------- */
  function renderTitleCard() {
    var st = S.doc.style, card = $('titlecard');
    $('tc-t').textContent = st.title || '';
    $('tc-s').textContent = st.subtitle || '';
    card.classList.toggle('bare', !(st.title || st.subtitle));
  }

  /* ---------- inspector ---------- */
  function renderInspector() {
    var host = $('inspect');
    var id = S.hover || Object.keys(S.selection)[0];
    var r = id && S.regions[id];
    if (!r) {
      host.innerHTML = '<p class="hint" style="margin:0">Hover the map to inspect a region.</p>';
      return;
    }
    var col = S.doc.colors[id], g = ST.groupFor(col);
    var occ = S.doc.occupied[id], og = ST.groupFor(occ);
    var siblings = (S.byBase[r.baseId] || []).length;
    var nbNames = (r.nb || []).map(function (n) {
      return (S.regions[n] || {}).base || (S.regions[n] || {}).name;
    }).filter(function (v, i, a) { return v && v !== r.base && a.indexOf(v) === i; });

    var rows = [
      ['Province', esc(r.province)],
      ['Region', esc(r.base || r.name)],
      ['Subregion', esc(r.name)],
      ['Siblings', siblings + ' in this region'],
      ['Colour', col ? '<span class="mono">' + esc(col) + '</span>' +
                       (g ? ' &middot; ' + esc(g.label) : '') : '—']
    ];
    if (r.city) rows.splice(3, 0, ['City', esc(r.city)]);
    if (occ) rows.push(['Occupied by', '<span class="mono">' + esc(occ) + '</span>' +
                                       (og ? ' &middot; ' + esc(og.label) : '')]);

    host.innerHTML =
      '<div class="ih"><i style="background:' + (col || 'transparent') +
        ';border-style:' + (col ? 'solid' : 'dashed') + '"></i>' +
        '<b>' + esc(S.level === 'province' ? r.province
                    : (S.level === 'subregion' ? r.name : (r.base || r.name))) + '</b></div>' +
      '<dl>' + rows.map(function (p) {
        return '<dt>' + p[0] + '</dt><dd>' + p[1] + '</dd>';
      }).join('') + '</dl>' +
      (nbNames.length ? '<div class="nb"><dt style="margin-bottom:4px">Borders</dt>' +
        nbNames.slice(0, 10).map(function (n) { return '<em>' + esc(n) + '</em>'; }).join('') +
        (nbNames.length > 10 ? ' +' + (nbNames.length - 10) + ' more' : '') + '</div>' : '');
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
    'vvardenfell': ['West Gash', 'Ashlands', 'Bitter Coast', 'Ascadian Isles', 'Vivec',
                    'Sheogorad', 'Molag Amur', 'Grazelands', "Azura's Coast",
                    'Red Mountain', 'Telvanni Isles', 'Zafirbel Bay'],
    'summerset': ['Summerset', 'Cloudrest', 'Dusk', 'Lillandril', 'Shimmerene',
                  'Sunhold', 'Auridon', 'Skywatch', 'Corgrad Wastes', 'Eton Nir'],
    'alinor': [],
    'holds': ['Haafingar', 'Hjaalmarch', 'The Pale', 'Winterhold', 'Eastmarch',
              'Whiterun Hold', 'Falkreath Hold', 'The Rift', 'The Reach'],
    'skyrim': [],
    'colovia': ['Gold Coast', 'Colovian Highlands', 'West Weald', 'Great Forest',
                'Jerall Mountains', 'Larsius River'],
    'nibenay': ['Heartlands', 'Nibenay Basin', 'Nibenay Valley', 'Blackwood',
                'Valus Mountains', 'Niben Bay', 'Silverfish River', 'Panther River'],
    'cyrodiil': [],
    'argonia': ['Shadowfen', 'Thornmarsh', 'Murkmire', 'Arnesia', 'Onkobra',
                'Helstrom', 'Archon', 'Blackrose', 'Alten Corimont', 'Soulrest',
                'Thorn', 'Xanmeer Basin'],
    "alik'r": ["Alik'r Desert", "Dak'fron", 'Sentinel', 'Gilane', 'Taneth',
               'Hegathe', 'Rihad', 'Khefrem'],
    'iliac bay': ['Glenumbra', 'Daggerfall', 'Stormhaven', 'Rivenspire', 'Shornhelm',
                  'Bangkorai'],
    'deshaan': ['Deshaan', 'Narsis', 'Tear'],
    'telvanni': ['Telvanni Peninsula', 'Telvanni Isles', 'Port Telvannis',
                 "Azura's Coast", 'Firewatch'],
    'elsweyr': ['Riverhold', 'Orcrest', 'Rimmen', 'Dune', 'Corinthe', 'Torval', 'Senchal'],
    'dominion': ['Summerset', 'Auridon', 'Grahtwood', 'Malabal Tor', 'Greenshade',
                 "Reaper's March", 'Torval', 'Senchal', 'Riverhold']
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
    if (S.level === 'province') {
      var np = 0;
      S.map.provinces.forEach(function (p) {
        if (p.regions.some(function (x) { return S.doc.colors[x]; })) np++;
      });
      bits.push(np + '/' + S.map.provinces.length + ' provinces painted');
    } else if (S.level === 'region') {
      bits.push(countGroups(S.byBase) + '/' + (S.map.baseRegions || []).length + ' regions painted');
    } else {
      bits.push(painted + '/' + S.map.regions.length + ' subregions painted');
    }
    var nocc = Object.keys(S.doc.occupied).length;
    if (nocc) bits.push(nocc + ' occupied');
    if (cityMode()) {
      bits.push(Object.keys(S.doc.cityColors).length + '/' +
                (S.map.cityDistricts || []).length + ' cities');
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
    $('s-capitals').checked = !!st.showCapitals;
    $('s-towns').checked = !!st.showTowns;
    $('s-citynames').checked = !!st.showCityNames;
    $('s-citydistricts').checked = !!st.showCityDistricts;
    $('s-stripe').value = st.stripeWidth != null ? st.stripeWidth : 2.4;
    $('s-stripe-v').textContent = $('s-stripe').value;
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
    $('s-legendcounts').checked = !!st.legendCounts;
    $('s-legendpos').value = st.legendAnchor || 'tr';
    $('s-legendcols').value = st.legendCols || 1;
    $('s-legendcols-v').textContent = st.legendCols || 1;
    $('e-view').value = st.exportView || 'fit';
    $('e-scale').value = st.exportScale || 2;
    $('e-scale-v').textContent = '×' + (st.exportScale || 2);
  }
  function styleChanged(rerender) {
    S.dirty = true;
    if (rerender !== false) V.applyTheme();
    renderMapLegend(); renderTitleCard(); renderStatus();
  }

  /* ---------- right-click menu ---------- */
  function closeMenu() {
    var m = $('ctxmenu');
    if (m) m.classList.remove('on');
  }
  function openMenu(info) {
    var m = $('ctxmenu');
    if (!info.id && !info.city) { closeMenu(); return; }
    var r = info.id ? S.regions[info.id] : null;
    var scope = info.id ? TM.idsFor(info.id, {}) : [];
    var provIds = r ? S.byProvince[r.province] : [];
    var title = r ? (S.level === 'province' ? r.province
                     : (S.level === 'subregion' ? r.name : (r.base || r.name)))
                  : (S.map.cityDistricts || []).filter(function (c) {
                      return c.id === info.city; }).map(function (c) {
                      return c.name; })[0];
    var items = [];
    if (info.city) {
      items.push(['Colour this city', function () { ST.setCityColor([info.city], S.activeColor); }]);
      items.push(['Clear this city', function () { ST.setCityColor([info.city], null); }]);
    }
    if (r) {
      items.push(['Fill with active colour', function () { ST.setColor(scope, S.activeColor); }]);
      items.push(['Fill the whole province', function () {
        ST.setColor(provIds.slice(), S.activeColor);
      }]);
      items.push(['-']);
      items.push(['Occupy with active colour', function () {
        ST.setOccupied(scope, S.activeColor);
        toast('Occupied ' + scope.length + ' — striped over the owner');
      }]);
      items.push(['Occupy the whole province', function () {
        ST.setOccupied(provIds.slice(), S.activeColor);
        toast('Occupied all of ' + r.province);
      }]);
      items.push(['Liberate (clear occupation)', function () { ST.setOccupied(scope, null); }]);
      items.push(['Liberate the province', function () { ST.setOccupied(provIds.slice(), null); }]);
      items.push(['-']);
      items.push(['Select this', function () {
        scope.forEach(function (id) { S.selection[id] = true; });
        TM.emit('selection');
      }]);
      items.push(['Zoom here', function () { V.zoomToRegion(info.id); }]);
      items.push(['Clear colour', function () { ST.setColor(scope, null); }]);
    }
    m.innerHTML = '<div class="ct">' + esc(title || '') + '</div>';
    items.forEach(function (it) {
      if (it[0] === '-') { m.appendChild(D.createElement('hr')); return; }
      var b = D.createElement('button');
      b.textContent = it[0];
      b.onclick = function () { it[1](); closeMenu(); };
      m.appendChild(b);
    });
    m.classList.add('on');
    m.style.left = '0px'; m.style.top = '0px';
    var w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.min(info.x, W.innerWidth - w - 8) + 'px';
    m.style.top = Math.min(info.y, W.innerHeight - h - 8) + 'px';
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
  var LEVELS = ['province', 'region', 'subregion'];
  function setLevel(l, quiet) {
    if (LEVELS.indexOf(l) < 0) l = 'region';
    S.level = l;
    LEVELS.forEach(function (k) { $('lv-' + k).classList.toggle('on', k === l); });
    // exactly one tier of borders is drawn -- the one you are working with.
    // Cities are the exception: an independent toggle that rides along.
    var st = S.doc.style;
    st.showBorders = (l === 'subregion');
    st.showBaseBorders = (l === 'region');
    st.showProvBorders = (l === 'province');
    $('s-borders').checked = st.showBorders;
    $('s-baseborders').checked = st.showBaseBorders;
    $('s-provborders').checked = st.showProvBorders;
    V.applyTheme();
    if (V.clearHover) V.clearHover();
    if (!quiet) { renderStatus(); renderInspector(); }
  }

  function cityMode() { return !!S.doc.style.showCityDistricts; }
  function setCityMode(on, quiet) {
    var st = S.doc.style;
    st.showCityDistricts = on;
    st.showCapitals = on;
    st.showTowns = on;
    $('lv-city').classList.toggle('on', on);
    $('s-citydistricts').checked = on;
    $('s-capitals').checked = on;
    $('s-towns').checked = on;
    V.applyTheme();
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
    $('lv-city').onclick = function () { setCityMode(!cityMode()); };
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
    $('pk-save').onclick = function () {
      if (ST.addSwatch(S.activeColor)) { renderMine(); toast('Saved ' + S.activeColor); }
      else toast('Already in My colours');
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
    $('q-region').onclick = function () {
      ST.pushUndo();
      var pal = TM.PALETTES[S.activePalette] || TM.PALETTES.Banners;
      (S.map.baseRegions || []).forEach(function (b, i) {
        var c = pal[i % pal.length];
        (S.byBase[b.id] || []).forEach(function (id) { S.doc.colors[id] = c; });
      });
      pal.forEach(function (c, i) { ST.ensureGroup(c, 'Group ' + (i + 1)); });
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
    $('q-rest').onclick = function () {
      var ids = S.map.regions.filter(function (r) { return !S.doc.colors[r.id]; })
                             .map(function (r) { return r.id; });
      if (!ids.length) { toast('Every region already has a colour'); return; }
      ST.setColor(ids, S.activeColor);
      toast('Filled ' + plural(ids.length, 'unpainted region'));
    };
    $('q-all').onclick = function () {
      ST.setColor(S.map.regions.map(function (r) { return r.id; }), S.activeColor);
    };
    $('q-clear').onclick = function () {
      ST.pushUndo();
      S.doc.colors = {}; S.doc.occupied = {}; S.doc.cityColors = {}; S.doc.groups = [];
      TM.emit('paint');
    };

    /* select panel */
    $('find').oninput = function () { renderFind($('find').value); };
    $('sel-fill').onclick = function () {
      var ids = Object.keys(S.selection);
      if (!ids.length) { toast('Nothing selected'); return; }
      ST.setColor(ids, S.activeColor);
      toast('Filled ' + plural(ids.length, 'region'));
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
    [['s-borders', 'showBorders'],
     ['s-baseborders', 'showBaseBorders'], ['s-provborders', 'showProvBorders'],
     ['s-coast', 'showCoast'],
     ['s-capitals', 'showCapitals'], ['s-towns', 'showTowns'],
     ['s-citynames', 'showCityNames'], ['s-citydistricts', 'showCityDistricts'],
     ['s-rivers', 'showRivers'], ['s-lakes', 'showLakes']].forEach(function (p) {
      $(p[0]).onchange = function () {
        S.doc.style[p[1]] = $(p[0]).checked;
        if (p[1] === 'showCityDistricts') $('lv-city').classList.toggle('on', $(p[0]).checked);
        styleChanged();
      };
    });
    $('s-stripe').oninput = function () {
      S.doc.style.stripeWidth = parseFloat($('s-stripe').value);
      $('s-stripe-v').textContent = S.doc.style.stripeWidth;
      V.restripe(); S.dirty = true;
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
    $('s-legendcounts').onchange = function () { S.doc.style.legendCounts = $('s-legendcounts').checked; styleChanged(false); };
    $('s-legendcols').oninput = function () {
      S.doc.style.legendCols = parseInt($('s-legendcols').value, 10) || 1;
      $('s-legendcols-v').textContent = S.doc.style.legendCols;
      styleChanged(false);
    };
    $('s-legendpos').onchange = function () {
      var v = $('s-legendpos').value;
      S.doc.style.legendAnchor = v;
      if (LEGEND_CORNERS[v]) S.doc.style.legendAt = LEGEND_CORNERS[v].slice();
      styleChanged(false);
    };
    $('s-reset').onclick = function () {
      var keep = S.doc.style.title, keep2 = S.doc.style.subtitle;
      S.doc.style = ST.defaultStyle();
      S.doc.style.title = keep; S.doc.style.subtitle = keep2;
      syncStyleControls(); setLevel(S.level, true); setCityMode(false, true);
      styleChanged(); V.repaint();
      toast('Style reset');
    };

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

    function setImmersive(on) {
      var app = D.getElementById('app');
      app.classList.toggle('immersive', on);
      $('b-immersive').classList.toggle('on', on);
      setTimeout(function () { V.resetView(); }, 230);
    }
    $('b-immersive').onclick = function () {
      setImmersive(!D.getElementById('app').classList.contains('immersive'));
    };
    $('exit-immersive').onclick = function () { setImmersive(false); };
    TM.setImmersive = setImmersive;

    $('side-toggle').onclick = function () {
      var app = D.getElementById('app');
      var on = app.classList.toggle('collapsed');
      $('side-toggle').innerHTML = on ? '&#9656;' : '&#9666;';
      $('side-toggle').title = on ? 'Show the panel (Tab)' : 'Hide the panel (Tab)';
      setTimeout(function () { TM.emit('view'); V.resetView(); }, 220);
    };

    /* zoom controls */
    $('z-in').onclick = function () { V.zoomBy(1 / 1.35); };
    $('z-out').onclick = function () { V.zoomBy(1.35); };
    $('z-fit').onclick = function () { V.resetView(); };

    /* keyboard */
    D.addEventListener('keydown', onKey);
  }

  function doPNG() {
    toast('Rendering PNG…');
    EX.exportPNG(S.doc.style.exportScale || 2)
      .then(function () { toast('PNG exported'); })
      .catch(function (e) { toast('PNG failed: ' + e); });
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
      case 'c': setCityMode(!cityMode()); break;
      case 'f':
        TM.setImmersive(!D.getElementById('app').classList.contains('immersive'));
        break;
      case '0': V.resetView(); break;
      case '+': case '=': V.zoomBy(1 / 1.35); break;
      case '-': V.zoomBy(1.35); break;
      case 'escape':
        if (D.getElementById('app').classList.contains('immersive')) {
          TM.setImmersive(false);
        } else { S.selection = {}; TM.emit('selection'); }
        break;
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
