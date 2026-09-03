/* ==========================================================================
   sim.js -- history simulator: factions grow over the region adjacency graph
   and every turn is recorded as a timeline keyframe.
   ========================================================================== */
(function (W) {
  'use strict';
  var TM = W.TM, S = TM.S;

  /* deterministic PRNG so a given seed always replays the same history */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function defaults() {
    return {
      seed: 'tamriel',
      steps: 12,
      startEra: '2E', startYear: 580, yearsPerStep: 4,
      expansion: 0.55,        // chance an attempt on empty land succeeds
      aggression: 0.28,       // chance of attacking a rival region
      seaChance: 0.22,        // multiplier applied to sea crossings
      attempts: 3,            // frontier attempts per faction per turn
      revolt: 0.03,           // chance an isolated holding breaks away
      neutralColor: '#d9d4c6',
      neutralLabel: 'Unclaimed'
    };
  }

  function newFaction(i) {
    var pal = TM.PALETTES.Banners;
    return {
      name: 'Faction ' + (i + 1),
      color: pal[i % pal.length],
      seeds: [],
      power: 1.0
    };
  }

  /** Run the simulation; returns the generated keyframes (also installed). */
  function run(cfg, factions, opts) {
    cfg = Object.assign(defaults(), cfg || {});
    factions = (factions || []).filter(function (f) { return f.seeds && f.seeds.length; });
    if (!factions.length) return null;

    var rnd = mulberry32(hashStr(String(cfg.seed)));
    var owner = {};                                    // regionId -> faction index
    factions.forEach(function (f, i) {
      f.seeds.forEach(function (id) { if (S.regions[id]) owner[id] = i; });
    });

    var groups = factions.map(function (f) { return { color: f.color, label: f.name }; });
    if (cfg.neutralColor) groups.push({ color: cfg.neutralColor, label: cfg.neutralLabel });

    function snapshot(date, title, note) {
      var colors = {};
      for (var id in S.regions) {
        colors[id] = (owner[id] !== undefined) ? factions[owner[id]].color : cfg.neutralColor;
      }
      return { date: date, title: title, note: note, colors: colors,
               groups: JSON.parse(JSON.stringify(groups)) };
    }
    function dateFor(step) {
      return cfg.startEra + ' ' + (cfg.startYear + step * cfg.yearsPerStep);
    }
    function isSea(a, b) {
      var r = S.regions[a];
      return !!(r.nbSea && r.nbSea.indexOf(b) >= 0);
    }
    function held(fi) {
      var n = 0; for (var id in owner) if (owner[id] === fi) n++; return n;
    }
    function support(id, fi) {                        // friendly neighbours
      var r = S.regions[id], n = 0;
      for (var i = 0; i < r.nb.length; i++) if (owner[r.nb[i]] === fi) n++;
      return n;
    }

    var frames = [snapshot(dateFor(0), 'Beginnings',
      factions.map(function (f) { return f.name + ' (' + f.seeds.length + ')'; }).join(' · '))];

    var order = factions.map(function (_, i) { return i; });
    for (var step = 1; step <= cfg.steps; step++) {
      // shuffle turn order each round
      for (var i = order.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t;
      }
      var events = [];
      order.forEach(function (fi) {
        var f = factions[fi];
        // build the frontier: neighbours of held regions that are not ours
        var frontier = [];
        for (var id in owner) {
          if (owner[id] !== fi) continue;
          var nb = S.regions[id].nb;
          for (var k = 0; k < nb.length; k++) {
            if (owner[nb[k]] === fi) continue;
            frontier.push({ from: id, to: nb[k] });
          }
        }
        if (!frontier.length) return;
        var tries = Math.max(1, Math.round(cfg.attempts * (f.power || 1)));
        for (var a = 0; a < tries && frontier.length; a++) {
          var pick = frontier.splice(Math.floor(rnd() * frontier.length), 1)[0];
          var tgt = pick.to, def = owner[tgt];
          var p = (def === undefined) ? cfg.expansion : cfg.aggression;
          if (isSea(pick.from, tgt)) p *= cfg.seaChance;
          if (def !== undefined) {
            // defenders are harder to shift when they hold the surrounding land
            p /= (1 + 0.42 * support(tgt, def));
            p *= (f.power || 1) / (factions[def].power || 1);
          }
          if (rnd() < p) {
            owner[tgt] = fi;
            if (def !== undefined) {
              events.push(f.name + ' takes ' + S.regions[tgt].name +
                          ' from ' + factions[def].name);
            } else {
              events.push(f.name + ' annexes ' + S.regions[tgt].name);
            }
          }
        }
      });
      // isolated holdings can break away
      if (cfg.revolt > 0) {
        for (var rid in owner) {
          var fi2 = owner[rid];
          if (support(rid, fi2) === 0 && rnd() < cfg.revolt) {
            events.push(S.regions[rid].name + ' revolts against ' + factions[fi2].name);
            delete owner[rid];
          }
        }
      }
      var counts = factions.map(function (f, i2) { return f.name + ' ' + held(i2); }).join('  ·  ');
      frames.push(snapshot(dateFor(step),
        'Turn ' + step,
        (events.slice(0, 3).join('. ') || 'A quiet season.') +
        (events.length > 3 ? ' (+' + (events.length - 3) + ' more)' : '') + '  —  ' + counts));
    }

    if (!opts || opts.install !== false) {
      S.doc.keyframes = frames;
      S.doc.factions = factions;
      S.doc.name = 'Simulation · ' + cfg.seed;
      var k0 = frames[0];
      S.doc.colors = JSON.parse(JSON.stringify(k0.colors));
      S.doc.groups = JSON.parse(JSON.stringify(k0.groups));
      S.activeKf = 0; S.playhead = 0;
      TM.state.resetHistory();
      S.dirty = true;
      TM.emit('paint'); TM.emit('timeline');
    }
    return frames;
  }

  /** Seed factions from the current painting: one faction per legend group. */
  function factionsFromPainting() {
    var byColor = {};
    for (var id in S.doc.colors) {
      var c = S.doc.colors[id];
      (byColor[c] = byColor[c] || []).push(id);
    }
    return Object.keys(byColor).map(function (c, i) {
      var g = TM.state.groupFor(c);
      return { name: (g && g.label) || ('Faction ' + (i + 1)), color: c,
               seeds: byColor[c], power: 1 };
    });
  }

  /** Handy presets: the historical great powers, seeded on their heartlands. */
  var PRESETS = {
    'Three Alliances': [
      { name: 'Ebonheart Pact', color: '#3f7a6e', power: 1,
        provinces: ['Morrowind', 'Skyrim', 'Black Marsh'] },
      { name: 'Daggerfall Covenant', color: '#2f5f8c', power: 1,
        provinces: ['High Rock', 'Hammerfell'] },
      { name: 'Aldmeri Dominion', color: '#c8b038', power: 1,
        provinces: ['Summerset Isles', 'Valenwood', 'Elsweyr'] }
    ],
    'Nine Provinces': [
      { name: 'High Rock', color: '#2f5f8c', provinces: ['High Rock'] },
      { name: 'Hammerfell', color: '#b5852f', provinces: ['Hammerfell'] },
      { name: 'Skyrim', color: '#3d6f9e', provinces: ['Skyrim'] },
      { name: 'Cyrodiil', color: '#8c2f2a', provinces: ['Cyrodiil'] },
      { name: 'Morrowind', color: '#5d3a7a', provinces: ['Morrowind'] },
      { name: 'Black Marsh', color: '#2f6b4a', provinces: ['Black Marsh'] },
      { name: 'Elsweyr', color: '#c9a13f', provinces: ['Elsweyr'] },
      { name: 'Valenwood', color: '#4a7a35', provinces: ['Valenwood'] },
      { name: 'Summerset', color: '#c9a0c0', provinces: ['Summerset Isles'] }
    ],
    'Capitals Only': [
      { name: 'Cyrodiil', color: '#8c2f2a', regions: ['Imperial City'] },
      { name: 'Skyrim', color: '#3d6f9e', regions: ['Whiterun Hold'] },
      { name: 'Morrowind', color: '#5d3a7a', regions: ['Mournhold'] },
      { name: 'High Rock', color: '#2f5f8c', regions: ['Wayrest'] },
      { name: 'Hammerfell', color: '#b5852f', regions: ['Sentinel'] },
      { name: 'Summerset', color: '#c9a0c0', regions: ['Alinor'] },
      { name: 'Valenwood', color: '#4a7a35', regions: ['Elden Root'] },
      { name: 'Elsweyr', color: '#c9a13f', regions: ['Torval'] },
      { name: 'Black Marsh', color: '#2f6b4a', regions: ['Helstrom'] }
    ]
  };

  function expandPreset(name) {
    var def = PRESETS[name];
    if (!def) return [];
    var byName = {};
    for (var id in S.regions) byName[S.regions[id].name.toLowerCase()] = id;
    return def.map(function (d) {
      var seeds = [];
      (d.provinces || []).forEach(function (p) {
        (S.byProvince[p] || []).forEach(function (id) { seeds.push(id); });
      });
      (d.regions || []).forEach(function (n) {
        var id = byName[n.toLowerCase()];
        if (id) seeds.push(id);
      });
      return { name: d.name, color: d.color, power: d.power || 1, seeds: seeds };
    }).filter(function (f) { return f.seeds.length; });
  }

  TM.sim = {
    defaults: defaults, newFaction: newFaction, run: run,
    factionsFromPainting: factionsFromPainting,
    presets: PRESETS, expandPreset: expandPreset
  };
})(window);
