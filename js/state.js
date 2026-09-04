/* ==========================================================================
   state.js -- palettes, map themes, document state, undo history, storage
   ========================================================================== */
(function (W) {
  'use strict';

  /* ---------------------------------------------------------------- palettes */
  var PALETTES = {
    'Banners': ['#8c2f2a', '#2f5f8c', '#3f7a4a', '#8a6d1f', '#5d3a7a', '#2f7a75',
                '#a5552a', '#7a2f5d', '#4a5a2f', '#2a3f6b', '#7a7a2f', '#6b3a2a',
                '#3a6b8c', '#8c5a2f', '#5a2f2f', '#2f5a3a', '#6b2f7a', '#c08a2f'],
    // ordered to match PROVINCE_ORDER, and chosen so no two neighbouring
    // provinces land on the same tone
    'Provinces': ['#6f9dc4', '#e0b45f', '#b9d2e2', '#c98a5e', '#a98fb5', '#6fa87e',
                  '#e8d38a', '#8fc47a', '#d0a0c8', '#b0b8c0', '#cfc3a4', '#9aa88f'],
    'Daedric':  ['#6d1f2b', '#1f3f6d', '#274d2b', '#6d5a1f', '#4a1f6d', '#1f5a5a',
                 '#8f3a1f', '#2b2b2b', '#0f0f14', '#8f7a3a', '#3a1f1f', '#1f2b1f'],
    'Ashen':    ['#c96f4a', '#6f4a3a', '#8a8578', '#4a4a52', '#b09a6a', '#3a4a4a',
                 '#7a3a2a', '#a8a090', '#5a5248', '#2a2f36', '#d0b48a', '#6a5f52'],
    'Aurbis':   ['#3b6ea5', '#5aa0d6', '#8fc7e8', '#c2e3f2', '#e8c96a', '#d69a3b',
                 '#a5563b', '#6a3b5a', '#3b5a6a', '#8a9a5a', '#c9d68a', '#f2ead1'],
    'Muted':    ['#9c6b6b', '#6b829c', '#7a9c6b', '#9c936b', '#8a6b9c', '#6b9c95',
                 '#b08a6b', '#9c6b85', '#7c876b', '#6b769c', '#a3a36b', '#8a7266'],
    'Greys':    ['#111111', '#2b2b2b', '#454545', '#5f5f5f', '#797979', '#939393',
                 '#adadad', '#c7c7c7', '#e1e1e1', '#f5f5f5']
  };

  /* ------------------------------------------------------------ map themes */
  var THEMES = {
    mapchart: {
      // sampled straight off the reference map
      label: 'MapChart', sea: '#b2bac3', land: '#dddddd', unpainted: '#dddddd',
      border: '#a9a9a9', baseBorder: '#6f6f6f', provBorder: '#1e1e1e',
      coast: '#1e1e1e',
      water: '#b2bac3', river: '#b2bac3', label: '#141414', labelHalo: '#ffffff',
      city: '#2b2b2b', cityFill: '#ffffff', stageBg: '#b2bac3', dark: false
    },
    parchment: {
      label: 'Parchment', baseBorder: '#9c8557', sea: '#c2b189', land: '#efe3c4', unpainted: '#efe3c4',
      border: '#8c7a52', provBorder: '#4a3b21', coast: '#5c4a2a',
      water: '#a8bcc0', river: '#9fb5bb', label: '#3a2c14', labelHalo: '#f6ecd4',
      city: '#3a2c14', cityFill: '#fdf6e2', stageBg: '#a08f6b', dark: false
    },
    slate: {
      label: 'Slate', baseBorder: '#7e8f9e', sea: '#1b232b', land: '#2f3a44', unpainted: '#2f3a44',
      border: '#5a6a78', provBorder: '#0d1218', coast: '#0d1218',
      water: '#233240', river: '#2c3b48', label: '#e6edf3', labelHalo: '#0d1218',
      city: '#e6edf3', cityFill: '#0d1218', stageBg: '#141a21', dark: true
    },
    ashland: {
      label: 'Ashland', baseBorder: '#a2907f', sea: '#3a2f2c', land: '#5a4f47', unpainted: '#5a4f47',
      border: '#8a7a6c', provBorder: '#1c1512', coast: '#1c1512',
      water: '#4a3f3c', river: '#57484a', label: '#f2e6d8', labelHalo: '#241b17',
      city: '#f2e6d8', cityFill: '#241b17', stageBg: '#2a221f', dark: true
    },
    ink: {
      label: 'Ink', baseBorder: '#6f6a62', sea: '#f2f0ea', land: '#ffffff', unpainted: '#ffffff',
      border: '#9a958c', provBorder: '#141414', coast: '#141414',
      water: '#dfe6ea', river: '#c9d4da', label: '#141414', labelHalo: '#ffffff',
      city: '#141414', cityFill: '#ffffff', stageBg: '#e6e3db', dark: false
    }
  };

  /* ------------------------------------------------------------- documents */
  function defaultStyle() {
    return {
      theme: 'mapchart',
      // the reference map has no names on it, so neither does this by default
      showLabels: false, labelSize: 5.6, labelMode: 'none',
      showCities: false, showRivers: true, showLakes: true,
      showBorders: false, showBaseBorders: true, showProvBorders: true,
      showCoast: true,
      borderWidth: 0.45, baseBorderWidth: 0.9, provBorderWidth: 1.7,
      title: 'Tamriel', subtitle: '',
      legendTitle: 'Legend', showLegend: true,
      legendAt: [0.985, 0.02], legendAnchor: 'tr',
      labelSource: 'region',
      crossfade: true, secPerFrame: 1.6, loopPlay: false,
      exportScale: 2, exportView: 'fit', captionFromTimeline: true
    };
  }

  function newDoc() {
    return {
      version: 3,
      name: 'Untitled map',
      colors: {},                     // regionId -> hex
      groups: [],                     // [{color, label}]
      style: defaultStyle(),
      keyframes: [],                  // [{date,title,note,colors,groups}]
      factions: []
    };
  }

  var S = {
    doc: newDoc(),
    map: null,
    regions: {},          // id -> subregion record
    byProvince: {},       // province -> [subregion ids]
    baseRegions: {},      // baseId -> the reference's own region record
    byBase: {},           // baseId -> [subregion ids]
    provBases: {},        // province -> [baseIds]
    activeColor: '#8c2f2a',
    activePalette: 'Banners',
    selection: {},        // id -> true
    mode: 'paint',        // paint | select | pick
    level: 'region',      // province | region | subregion -- what a click acts on
    tool: 'region',       // kept for province-wide Shift+click
    playhead: 0,
    playing: false,
    activeKf: -1,
    hover: null,
    dirty: false,
    scrubbing: false
  };

  /* ----------------------------------------------------------------- undo */
  var undoStack = [], redoStack = [], LIMIT = 120;

  function snap() {
    return JSON.stringify({ colors: S.doc.colors, groups: S.doc.groups });
  }
  function pushUndo() {
    S.scrubbing = false;
    undoStack.push(snap());
    if (undoStack.length > LIMIT) undoStack.shift();
    redoStack.length = 0;
    S.dirty = true;
    W.TM.emit('history');
  }
  function apply(json) {
    var o = JSON.parse(json);
    S.doc.colors = o.colors; S.doc.groups = o.groups;
  }
  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(snap());
    apply(undoStack.pop());
    W.TM.emit('paint'); W.TM.emit('history');
    return true;
  }
  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(snap());
    apply(redoStack.pop());
    W.TM.emit('paint'); W.TM.emit('history');
    return true;
  }
  function resetHistory() { undoStack.length = 0; redoStack.length = 0; W.TM.emit('history'); }

  /* --------------------------------------------------------------- groups */
  function normHex(h) {
    if (!h) return null;
    h = String(h).trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return /^#[0-9a-f]{6}$/.test(h) ? h : null;
  }
  function groupFor(hex) {
    hex = normHex(hex);
    for (var i = 0; i < S.doc.groups.length; i++)
      if (S.doc.groups[i].color === hex) return S.doc.groups[i];
    return null;
  }
  function ensureGroup(hex, label) {
    hex = normHex(hex);
    if (!hex) return null;
    var g = groupFor(hex);
    if (g) { if (label && /^Group \d+$/.test(g.label)) g.label = label; return g; }
    g = { color: hex, label: label || ('Group ' + (S.doc.groups.length + 1)) };
    S.doc.groups.push(g);
    return g;
  }
  function countColor(hex) {
    hex = normHex(hex);
    var n = 0;
    for (var k in S.doc.colors) if (S.doc.colors[k] === hex) n++;
    return n;
  }
  function pruneGroups() {
    S.doc.groups = S.doc.groups.filter(function (g) { return countColor(g.color) > 0; });
  }

  /* ---------------------------------------------------------------- paint */
  function setColor(ids, hex, noUndo) {
    S.scrubbing = false;
    if (!Array.isArray(ids)) ids = [ids];
    hex = hex === null ? null : normHex(hex);
    if (!noUndo) pushUndo();
    if (hex) ensureGroup(hex);
    for (var i = 0; i < ids.length; i++) {
      if (!S.regions[ids[i]]) continue;
      if (hex) S.doc.colors[ids[i]] = hex; else delete S.doc.colors[ids[i]];
    }
    pruneGroups();
    W.TM.emit('paint');
  }

  /* -------------------------------------------------------------- storage */
  var LS_SLOTS = 'tamriel.mapchart.slots';
  var LS_AUTO = 'tamriel.mapchart.autosave';

  function safeGet(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { W.localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  function listSlots() {
    try { return JSON.parse(safeGet(LS_SLOTS) || '[]'); } catch (e) { return []; }
  }
  function saveSlot(name) {
    var slots = listSlots();
    var rec = { name: name, at: new Date().toISOString(), doc: S.doc };
    var i = slots.findIndex(function (s) { return s.name === name; });
    if (i >= 0) slots[i] = rec; else slots.push(rec);
    if (!safeSet(LS_SLOTS, JSON.stringify(slots))) return false;
    S.dirty = false;
    return true;
  }
  function loadSlot(name) {
    var s = listSlots().find(function (x) { return x.name === name; });
    if (!s) return false;
    setDoc(s.doc);
    return true;
  }
  function deleteSlot(name) {
    safeSet(LS_SLOTS, JSON.stringify(listSlots().filter(function (s) { return s.name !== name; })));
  }
  function autosave() { safeSet(LS_AUTO, JSON.stringify(S.doc)); }
  function loadAutosave() {
    var raw = safeGet(LS_AUTO);
    if (!raw) return false;
    try { setDoc(JSON.parse(raw)); return true; } catch (e) { return false; }
  }

  /* --------------------------------------------------------- doc plumbing */
  function migrate(d) {
    var out = newDoc();
    if (!d || typeof d !== 'object') return out;
    out.name = d.name || out.name;
    out.colors = {};
    var src = d.colors || d.fills || {};
    for (var k in src) { var h = normHex(src[k]); if (h) out.colors[k] = h; }
    out.groups = (d.groups || d.legend || []).map(function (g, i) {
      return { color: normHex(g.color) || '#888888', label: g.label || g.name || ('Group ' + (i + 1)) };
    }).filter(function (g) { return g.color; });
    var st = d.style || {};
    for (var p in out.style) if (st[p] !== undefined) out.style[p] = st[p];
    if (!THEMES[out.style.theme]) out.style.theme = 'mapchart';
    out.keyframes = (d.keyframes || []).map(function (k, i) {
      var c = {};
      for (var r in (k.colors || {})) { var hh = normHex(k.colors[r]); if (hh) c[r] = hh; }
      return {
        date: k.date || ('Frame ' + (i + 1)), title: k.title || '', note: k.note || '',
        colors: c,
        groups: (k.groups || []).map(function (g) {
          return { color: normHex(g.color) || '#888888', label: g.label || '' };
        })
      };
    });
    out.factions = d.factions || [];
    return out;
  }
  function setDoc(d) {
    S.doc = migrate(d);
    resetHistory();
    S.activeKf = -1; S.playhead = 0; S.playing = false;
    S.selection = {};
    W.TM.emit('doc');
  }

  W.TM = W.TM || {};
  W.TM.S = S;
  W.TM.PALETTES = PALETTES;
  W.TM.THEMES = THEMES;
  W.TM.state = {
    newDoc: newDoc, setDoc: setDoc, migrate: migrate, defaultStyle: defaultStyle,
    pushUndo: pushUndo, undo: undo, redo: redo, resetHistory: resetHistory,
    canUndo: function () { return undoStack.length > 0; },
    canRedo: function () { return redoStack.length > 0; },
    setColor: setColor, normHex: normHex, groupFor: groupFor, ensureGroup: ensureGroup,
    countColor: countColor, pruneGroups: pruneGroups,
    listSlots: listSlots, saveSlot: saveSlot, loadSlot: loadSlot, deleteSlot: deleteSlot,
    autosave: autosave, loadAutosave: loadAutosave
  };
})(window);
