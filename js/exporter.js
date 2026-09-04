/* ==========================================================================
   exporter.js -- standalone SVG, PNG raster, JSON and CSV I/O
   ========================================================================== */
(function (W) {
  'use strict';
  var TM = W.TM, S = TM.S;

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }
  function slug(s) {
    return String(s || 'tamriel').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'tamriel';
  }

  /* --------------------------------------------------- self-contained SVG */
  /**
   * Renders the map to an SVG string that carries no CSS dependencies.
   * `opts.colors` overrides the painting,
   * `opts.box` overrides the viewBox, `opts.groups` overrides the legend.
   */
  function buildSVG(opts) {
    opts = opts || {};
    var M = S.map, st = S.doc.style, t = TM.THEMES[st.theme] || TM.THEMES.mapchart;
    var colors = opts.colors || S.doc.colors;
    var groups = opts.groups || S.doc.groups;
    var box = opts.box || TM.view.getFit();
    var scale = opts.scale || 1;
    var w = Math.round(box.w * scale), h = Math.round(box.h * scale);
    var esc = TM.view.esc;
    var o = [];

    o.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
           '" viewBox="' + box.x + ' ' + box.y + ' ' + box.w + ' ' + box.h + '">');
    o.push('<rect x="' + box.x + '" y="' + box.y + '" width="' + box.w + '" height="' +
           box.h + '" fill="' + t.sea + '"/>');
    o.push('<g fill="' + t.land + '">' +
           M.land.concat(M.scenery).map(function (d) { return '<path d="' + d + '"/>'; }).join('') +
           '</g>');
    o.push('<g stroke="' + (st.showBorders ? t.border : 'none') + '" stroke-width="' +
           st.borderWidth + '" stroke-linejoin="round">');
    M.regions.forEach(function (r) {
      o.push('<path d="' + r.d + '" fill="' + (colors[r.id] || t.unpainted) + '"/>');
    });
    o.push('</g>');

    // occupations: the occupier's colour hatched over the owner's
    var occ = opts.occupied || S.doc.occupied || {};
    var occHexes = {};
    for (var oid in occ) occHexes[occ[oid]] = 1;
    var hexList = Object.keys(occHexes);
    if (hexList.length) {
      var sw = st.stripeWidth || 2.4;
      o.push('<defs>');
      hexList.forEach(function (h) {
        o.push('<pattern id="xs' + h.slice(1) + '" width="' + (sw * 2) + '" height="' +
               (sw * 2) + '" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
               '<rect width="' + sw + '" height="' + (sw * 2) + '" fill="' + h + '"/></pattern>');
      });
      o.push('</defs><g stroke="none">');
      M.regions.forEach(function (r) {
        if (occ[r.id]) {
          o.push('<path d="' + r.d + '" fill="url(#xs' + occ[r.id].slice(1) + ')"/>');
        }
      });
      o.push('</g>');
    }

    if (st.showCityDistricts && M.cityDistricts) {
      var cc = opts.cityColors || S.doc.cityColors || {};
      o.push('<g stroke="' + t.provBorder + '" stroke-width="0.75" stroke-linejoin="round">');
      M.cityDistricts.forEach(function (c) {
        var f = cc[c.id];
        o.push('<path d="' + c.d + '" fill="' + (f || 'none') + '" fill-opacity="' +
               (f ? 0.92 : 0) + '"' + (f ? '' : ' stroke-dasharray="1.6 1.2"') + '/>');
      });
      o.push('</g>');
    }
    if (st.showSubBorders && M.subRegions) {
      o.push('<g fill="none" stroke="' + (t.subBorder || t.border) + '" stroke-width="' +
             (st.subBorderWidth != null ? st.subBorderWidth : 0.6) +
             '" stroke-linejoin="round">' +
             M.subRegions.map(function (b) { return '<path d="' + b.d + '"/>'; }).join('') +
             '</g>');
    }
    if (st.showBaseBorders && M.baseRegions) {
      o.push('<g fill="none" stroke="' + (t.baseBorder || t.border) + '" stroke-width="' +
             (st.baseBorderWidth != null ? st.baseBorderWidth : 0.9) +
             '" stroke-linejoin="round">' +
             M.baseRegions.map(function (b) { return '<path d="' + b.d + '"/>'; }).join('') +
             '</g>');
    }
    if (st.showProvBorders) {
      o.push('<g fill="none" stroke="' + t.provBorder + '" stroke-width="' +
             st.provBorderWidth + '" stroke-linejoin="round">' +
             M.provinces.map(function (p) { return '<path d="' + p.d + '"/>'; }).join('') + '</g>');
    }
    if (st.showLakes) {
      o.push('<g fill="' + t.water + '" stroke="' + t.water + '" stroke-width="0.4">' +
             M.lakes.map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</g>');
    }
    if (st.showRivers) {
      o.push('<g fill="none" stroke="' + t.river + '" stroke-width="1.5" stroke-linecap="round">' +
             M.rivers.map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</g>');
    }
    if (st.showCoast) {
      o.push('<g fill="none" stroke="' + t.coast + '" stroke-width="' +
             Math.max(0.8, st.provBorderWidth * 0.75) + '" stroke-linejoin="round">' +
             M.land.concat(M.scenery).map(function (d) { return '<path d="' + d + '"/>'; }).join('') +
             '</g>');
    }
    if ((st.showCapitals || st.showTowns) && M.baseRegions) {
      var cs = st.cityScale || 1;
      o.push('<g text-anchor="middle" paint-order="stroke" ' +
             'font-family="Segoe UI,Inter,system-ui,sans-serif">');
      M.baseRegions.forEach(function (b) {
        if (!b.city) return;
        var cap = !!b.capital;
        if (cap ? !st.showCapitals : !st.showTowns) return;
        var r = (cap ? 2.6 : 1.5) * cs;
        o.push('<circle cx="' + b.cityAt[0] + '" cy="' + b.cityAt[1] + '" r="' + r +
               '" fill="' + (cap ? t.city : t.cityFill) + '" stroke="' + t.city +
               '" stroke-width="' + (0.55 * cs) + '"/>');
        if (st.showCityNames) {
          var fs = (cap ? 6.2 : 5.0) * cs;
          o.push('<text x="' + b.cityAt[0] + '" y="' + (b.cityAt[1] - r - fs * 0.32) +
                 '" font-size="' + fs + '" fill="' + t.label + '" stroke="' + t.labelHalo +
                 '" stroke-width="' + (fs * 0.09) + '">' + esc(b.city) + '</text>');
        }
      });
      o.push('</g>');
    }
    if (st.labelMode !== 'none') {
      var fs = st.labelSize;
      o.push('<g text-anchor="middle" font-family="Segoe UI,Inter,system-ui,sans-serif" ' +
             'font-size="' + fs + '" fill="' + t.label + '" stroke="' + t.labelHalo +
             '" stroke-width="' + (fs * 0.15) + '" paint-order="stroke">');
      M.regions.forEach(function (r) {
        var txt = st.labelSource === 'city' ? (r.city || r.name) : r.name;
        if (st.labelMode !== 'all') {
          if (txt.length * fs * 0.46 > Math.sqrt(r.area) * 1.28) return;
        }
        o.push('<text x="' + r.label[0] + '" y="' + r.label[1] + '">' + esc(txt) + '</text>');
      });
      o.push('</g>');
    }

    /* --- chrome: title, subtitle, legend --- */
    var pad = box.w * 0.014;
    var titleSize = box.w * 0.024;
    if (st.title || st.subtitle) {
      // measure the block first so it can sit on its own panel instead of
      // colliding with the region labels underneath
      var lines = [];
      if (st.title) lines.push({ t: st.title, s: titleSize, w: 600, o: 1 });
      if (st.subtitle) lines.push({ t: st.subtitle, s: titleSize * 0.5, w: 400, o: 0.9 });
      var bw = 0, bh = pad * 0.5;
      lines.forEach(function (L) {
        bw = Math.max(bw, L.t.length * L.s * 0.47);
        bh += L.s * 1.32;
      });
      bw = Math.min(bw + pad * 1.2, box.w * 0.62);
      bh += pad * 0.35;
      var bx = box.x + pad * 0.6, by = box.y + pad * 0.6;
      o.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh +
             '" rx="' + (titleSize * 0.16) + '" fill="' +
             (t.dark ? 'rgba(12,10,8,.72)' : 'rgba(255,255,255,.78)') + '"/>');
      o.push('<g font-family="Palatino Linotype,Palatino,Georgia,serif" fill="' + t.label + '">');
      var ty = by + pad * 0.5;
      lines.forEach(function (L) {
        ty += L.s * 0.98;
        o.push('<text x="' + (bx + pad * 0.6) + '" y="' + ty + '" font-size="' + L.s +
               '" font-weight="' + L.w + '" opacity="' + L.o + '">' + esc(L.t) + '</text>');
        ty += L.s * 0.34;
      });
      o.push('</g>');
    }
    if (st.showLegend && groups && groups.length) {
      var lh = box.w * 0.0115, lw = box.w * 0.13;
      var maxLbl = groups.reduce(function (m, g) {
        return Math.max(m, (g.label || '').length + (st.legendCounts ? 6 : 0));
      }, 6);
      lw = Math.max(lw, maxLbl * lh * 0.5 + lh * 2.8);
      var lhh = groups.length * lh + lh * 2.6;
      var at = st.legendAt || [0.985, 0.02];
      var ax = at[0] > 0.5 ? 1 : 0, ay = at[1] > 0.5 ? 1 : 0;
      var lx = box.x + at[0] * box.w - ax * lw;
      var ly = box.y + at[1] * box.h - ay * lhh;
      lx = Math.max(box.x + pad * 0.4, Math.min(box.x + box.w - lw - pad * 0.4, lx));
      ly = Math.max(box.y + pad * 0.4, Math.min(box.y + box.h - lhh - pad * 0.4, ly));
      o.push('<g>');
      o.push('<rect x="' + lx + '" y="' + ly + '" width="' + lw + '" height="' +
             lhh + '" rx="' + (lh * 0.28) + '" fill="' +
             (t.dark ? 'rgba(12,10,8,.9)' : 'rgba(255,255,255,.95)') + '" stroke="' +
             t.provBorder + '" stroke-width="' + (lh * 0.05) + '"/>');
      o.push('<text x="' + (lx + lh * 0.6) + '" y="' + (ly + lh * 1.05) + '" font-size="' +
             (lh * 0.6) + '" font-family="Segoe UI,system-ui,sans-serif" letter-spacing="' +
             (lh * 0.06) + '" fill="' + t.label + '" opacity="0.75">' +
             esc((st.legendTitle || 'Legend').toUpperCase()) + '</text>');
      groups.forEach(function (g, i) {
        var y = ly + lh * 2.15 + i * lh;
        o.push('<rect x="' + (lx + lh * 0.6) + '" y="' + (y - lh * 0.62) + '" width="' +
               (lh * 0.74) + '" height="' + (lh * 0.74) + '" rx="' + (lh * 0.1) +
               '" fill="' + g.color + '" stroke="rgba(0,0,0,.55)" stroke-width="' +
               (lh * 0.045) + '"/>');
        var lbl = g.label || '';
        if (st.legendCounts) lbl += '  (' + TM.state.countColor(g.color) + ')';
        o.push('<text x="' + (lx + lh * 1.72) + '" y="' + (y + lh * 0.02) + '" font-size="' +
               (lh * 0.66) + '" font-family="Segoe UI,system-ui,sans-serif" fill="' + t.label +
               '">' + esc(lbl) + '</text>');
      });
      o.push('</g>');
    }
    o.push('</svg>');
    return { svg: o.join(''), w: w, h: h };
  }

  function exportSVG() {
    var r = buildSVG({ box: currentBox(), scale: 1 });
    download(new Blob([r.svg], { type: 'image/svg+xml' }), slug(S.doc.name) + '.svg');
  }

  function currentBox() {
    return S.doc.style.exportView === 'screen' ? TM.view.getView() : TM.view.getFit();
  }

  /* ------------------------------------------------------------------ PNG */
  function rasterise(svgText, w, h) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        res(c);
      };
      img.onerror = function (e) { URL.revokeObjectURL(url); rej(e); };
      img.src = url;
    });
  }

  function exportPNG(scale) {
    scale = scale || S.doc.style.exportScale || 2;
    var r = buildSVG({ box: currentBox(), scale: scale });
    return rasterise(r.svg, r.w, r.h).then(function (canvas) {
      return new Promise(function (res) {
        canvas.toBlob(function (b) {
          download(b, slug(S.doc.name) + '.png');
          res(true);
        }, 'image/png');
      });
    });
  }

  /* ----------------------------------------------------------------- JSON */
  function exportJSON() {
    var out = JSON.parse(JSON.stringify(S.doc));
    out.generator = 'Tamriel MapChart';
    out.exportedAt = new Date().toISOString();
    download(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }),
             slug(S.doc.name) + '.tamriel.json');
  }
  function importJSON(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          TM.state.setDoc(JSON.parse(fr.result));
          res(true);
        } catch (e) { rej(e); }
      };
      fr.onerror = rej;
      fr.readAsText(file);
    });
  }

  /* --------------------------------------------------- CSV of the painting */
  function exportCSV() {
    var rows = [['region', 'province', 'city', 'color', 'group']];
    S.map.regions.forEach(function (r) {
      var c = S.doc.colors[r.id] || '';
      var g = c ? (TM.state.groupFor(c) || {}).label || '' : '';
      rows.push([r.name, r.province, r.city || '', c, g]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (v) {
        return /[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n');
    download(new Blob([csv], { type: 'text/csv' }), slug(S.doc.name) + '.csv');
  }

  TM.exporter = {
    buildSVG: buildSVG, exportSVG: exportSVG, exportPNG: exportPNG,
    exportJSON: exportJSON, importJSON: importJSON,
    exportCSV: exportCSV, download: download
  };
})(window);
