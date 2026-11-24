/* ============================================================
   实验 05 · 通用实验台（sandbox）
   ------------------------------------------------------------
   一间什么都能摆的台子：
   - 电学：电池 / 开关 / 电流表 / 电压表 / 定值电阻 / 滑动变阻器 / 小灯泡
     端子之间自己连线，按节点导纳矩阵 + MNA 真实解，任意拓扑都算
   - 光学：蜡烛 / 凸透镜 / 凹透镜 / 光屏，薄透镜成像 1/f = 1/u + 1/v
   - 场景可以用 JSON 描述（items + wires），所以「独立实验室」= 一份 JSON：
     传进来就自动摆好，老师也能在台上摆完直接导出
   ============================================================ */
(function () {
  'use strict';
  var g = window.CohortLab.G;

  var PX_PER_CM = 6;                       // 画布比例：1 cm = 6 px
  var LS_KEY = 'cohort.sandbox.v1';        // 本机场景（刷新还在）

  // ---------------------------------------------------------- 器材定义
  // pins 的 dx/dy 是相对器材中心的端子位置
  var TYPES = {
    battery:  { name: '电池组',    icon: 'battery',  domain: 'e', emf: 3, r: 0.3, w: 96, h: 40, pins: [{ id: '+', dx: -36, dy: -10, pol: '+' }, { id: '-', dx: 36, dy: -10, pol: '-' }] },
    switch:   { name: '开关',      icon: 'switch',   domain: 'e', w: 84, h: 36, pins: [{ id: 'a', dx: -34, dy: -8 }, { id: 'b', dx: 34, dy: -8 }] },
    ammeter:  { name: '电流表',    icon: 'ammeter',  domain: 'e', ra: 0.05, max: 0.6, unit: 'A', pinTone: '#33507d', w: 92, h: 62, pins: [{ id: 'a', dx: -38, dy: -12 }, { id: 'b', dx: 38, dy: -12 }] },
    voltmeter:{ name: '电压表',    icon: 'voltmeter',domain: 'e', rv: 3000, max: 3, unit: 'V', pinTone: '#ad1f26', w: 92, h: 62, pins: [{ id: 'a', dx: -38, dy: -12 }, { id: 'b', dx: 38, dy: -12 }] },
    resistor: { name: '定值电阻',  icon: 'resistor', domain: 'e', R: 10, w: 96, h: 34, pins: [{ id: 'a', dx: -44, dy: 0 }, { id: 'b', dx: 44, dy: 0 }] },
    rbox:     { name: '电阻箱',    icon: 'rbox',     domain: 'e', R: 10, w: 108, h: 46, pins: [{ id: 'a', dx: -50, dy: 0 }, { id: 'b', dx: 50, dy: 0 }] },
    rheostat: { name: '滑动变阻器',icon: 'rheostat', domain: 'e', Rmax: 20, pos: 0.6, w: 130, h: 40, pins: [{ id: 'a', dx: -62, dy: 0 }, { id: 'b', dx: 62, dy: 0 }] },
    bulb:     { name: '小灯泡',    icon: 'candle',   domain: 'e', R: 6, w: 54, h: 56, pins: [{ id: 'a', dx: -16, dy: 22 }, { id: 'b', dx: 16, dy: 22 }] },
    wire:     { name: '导线',      icon: 'wire',     domain: 'e', R: 0.001, w: 110, h: 16, pins: [{ id: 'a', dx: -50, dy: 0 }, { id: 'b', dx: 50, dy: 0 }] },
    candle:   { name: '蜡烛（物）',icon: 'candle',   domain: 'o', h0: 34, w: 44, h: 60, pins: [] },
    lens:     { name: '凸透镜',    icon: 'lens',     domain: 'o', f: 10, aperture: 56, w: 26, h: 96, pins: [] },
    lensNeg:  { name: '凹透镜',    icon: 'lens',     domain: 'o', f: -10, aperture: 56, w: 26, h: 96, pins: [] },
    screen:   { name: '光屏',      icon: 'screen',   domain: 'o', w: 20, h: 110, pins: [] }
  };

  var SHELF = [
    { id: 'battery',   icon: 'battery',   name: '电池组',     hint: '3 V / 0.3 Ω，点一下换电压', group: '电学' },
    { id: 'switch',    icon: 'switch',    name: '开关',       hint: '点一下开合', group: '电学' },
    { id: 'ammeter',   icon: 'ammeter',   name: '电流表',     hint: '0~0.6 A，串联', group: '电学' },
    { id: 'voltmeter', icon: 'voltmeter', name: '电压表',     hint: '0~3 V，并联', group: '电学' },
    { id: 'resistor',  icon: 'resistor',  name: '定值电阻',   hint: '10 Ω', group: '电学' },
    { id: 'rbox',      icon: 'rbox',      name: '电阻箱',     hint: '点一下换阻值', group: '电学' },
    { id: 'rheostat',  icon: 'rheostat',  name: '滑动变阻器', hint: '0~20 Ω，拖滑片', group: '电学' },
    { id: 'bulb',      icon: 'candle',    name: '小灯泡',     hint: '6 Ω，看亮度', group: '电学' },
    { id: 'wire',      icon: 'wire',      name: '导线',       hint: '0 Ω，接线用', group: '电学' },
    { id: 'candle',    icon: 'candle',    name: '蜡烛（物）', hint: '光学物', group: '光学' },
    { id: 'lens',      icon: 'lens',      name: '凸透镜',     hint: 'f = 10 cm', group: '光学' },
    { id: 'lensNeg',   icon: 'lens',      name: '凹透镜',     hint: 'f = −10 cm', group: '光学' },
    { id: 'screen',    icon: 'screen',    name: '光屏',       hint: '接像用', group: '光学' }
  ];

  // ---------------------------------------------------------- 内置实验室
  var PRESETS = [
    {
      id: 'free', name: '自由实验台', aim: '想做什么就摆什么：器材拖上台，端子之间拉线，读数实时算。', formula: '任意拓扑 · 节点法求解', items: [], wires: []
    },
    {
      id: 'series', name: '串联电路（测电流）', aim: '电池、开关、电流表、定值电阻串成一圈，看电流是不是处处相等。',
      formula: 'I = E / (r + R_A + R)', items: [
        { type: 'battery', x: 200, y: 500 }, { type: 'switch', x: 380, y: 500 },
        { type: 'ammeter', x: 560, y: 430 }, { type: 'resistor', x: 740, y: 500 }
      ], wires: [[0, '+', 1, 'a'], [1, 'b', 2, 'a'], [2, 'b', 3, 'a'], [3, 'b', 0, '-']]
    },
    {
      id: 'ohm', name: '伏安法测电阻', aim: '电流表串联、电压表并联在 Rx 两端，改变滑片测三组 U、I。',
      formula: 'R = U / I', items: [
        { type: 'battery', x: 170, y: 500 }, { type: 'switch', x: 340, y: 500 },
        { type: 'ammeter', x: 500, y: 430 }, { type: 'resistor', x: 640, y: 500 },
        { type: 'rheostat', x: 820, y: 500 }, { type: 'voltmeter', x: 640, y: 320 }
      ], wires: [[0, '+', 1, 'a'], [1, 'b', 2, 'a'], [2, 'b', 3, 'a'], [3, 'b', 4, 'a'], [4, 'b', 0, '-'],
                [5, 'a', 3, 'a'], [5, 'b', 3, 'b']]
    },
    {
      id: 'lens', name: '凸透镜成像', aim: '蜡烛放在二倍焦距外，移动光屏找到清晰的像，看倒立、缩小。',
      formula: '1/f = 1/u + 1/v', items: [
        { type: 'candle', x: 180, y: 500 }, { type: 'lens', x: 400, y: 500 }, { type: 'screen', x: 485, y: 500 }
      ], wires: []
    },
    {
      id: 'lens2', name: '凹透镜发散', aim: '凹透镜永远成缩小正立的虚像，光屏上接不到。',
      formula: '1/f = 1/u + 1/v（f < 0）', items: [
        { type: 'candle', x: 200, y: 500 }, { type: 'lensNeg', x: 480, y: 500 }, { type: 'screen', x: 760, y: 500 }
      ], wires: []
    },
    {
      id: 'mixed', name: '电学 + 光学同台', aim: '台子上可以同时有电路和光路，各算各的，互不干扰。',
      formula: '两种物理场并存', items: [
        { type: 'battery', x: 180, y: 540 }, { type: 'switch', x: 320, y: 540 }, { type: 'bulb', x: 460, y: 520 },
        { type: 'candle', x: 620, y: 540 }, { type: 'lens', x: 780, y: 500 }, { type: 'screen', x: 920, y: 500 }
      ], wires: [[0, '+', 1, 'a'], [1, 'b', 2, 'a'], [2, 'b', 0, '-']]
    }
  ];

  // ---------------------------------------------------------- 工具函数
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function uid(n) { return 'i' + n; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // 并查集：把连线两端的端子并成同一个节点
  function DSU() {
    var p = {};
    function find(x) { if (p[x] == null) p[x] = x; return p[x] === x ? x : (p[x] = find(p[x])); }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) p[a] = b; }
    return { find: find, union: union, keys: function () { return Object.keys(p); } };
  }

  // 高斯消元（带部分主元）
  function solveLin(A, b) {
    var n = A.length, i, j, k;
    for (i = 0; i < n; i++) A[i] = A[i].slice();
    for (i = 0; i < n; i++) {
      var piv = i;
      for (k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
      if (Math.abs(A[piv][i]) < 1e-12) return null;      // 奇异：短路/悬空
      if (piv !== i) { var t = A[piv]; A[piv] = A[i]; A[i] = t; var tb = b[piv]; b[piv] = b[i]; b[i] = tb; }
      for (k = i + 1; k < n; k++) {
        var f = A[k][i] / A[i][i];
        if (!f) continue;
        for (j = i; j < n; j++) A[k][j] -= f * A[i][j];
        b[k] -= f * b[i];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = b[i];
      for (j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }

  // ---------------------------------------------------------- 注册
  window.CohortLab.register({
    id: 'sandbox',
    name: '通用实验台',
    grade: '八 / 九年级',
    aim: '电学和光学器材混在一张台上，自己摆放、自己接线；也可以载入一份「实验室」JSON，自动摆好。',
    formula: '电学：节点法  ·  光学：1/f = 1/u + 1/v',
    tip: '先选实验室或自己摆器材；连线要先切到「连线」模式。',
    steps: [
      '从器材架拿器材放到台上（点一下或拖过来）',
      '切到「连线」模式，从一个端子拖到另一个端子',
      '接好后读数自动出来；开关点一下开合，变阻器拖滑片',
      '摆满意了点「导出实验室」，就是一份能重复用的独立实验室'
    ],
    columns: ['读数摘要'],
    tableHint: '每次「记录读数」存一条',
    tools: SHELF,
    ask: ['这里电流为什么变小了？', '凸透镜成像什么时候是倒立的？', '电压表并联会改变电流吗？'],

    create: function (api) {
      var el = {
        items: [], wires: [], nextId: 1,
        mode: 'select',            // select | wire | erase
        drag: null,               // {item, dx, dy}
        knob: null,               // 变阻器滑片
        pending: null,             // 连线起点 {item, pin}
        hoverPin: null,
        hoverItem: null,
        t: 0,
        labName: '自由实验台',
        sol: null,                 // 电学解
        opt: null                  // 光学解
      };

      // ---------- 场景读写 ----------
      function typeOf(it) { return TYPES[it.type]; }

      function addItem(type, x, y, params) {
        var t = TYPES[type];
        if (!t) return null;
        var it = { id: uid(el.nextId++), type: type, x: x, y: y, params: params ? clone(params) : {} };
        if (type === 'rheostat' && it.params.pos == null) it.params.pos = 0.6;
        if (type === 'switch' && it.params.closed == null) it.params.closed = false;
        if (type === 'battery' && it.params.emf == null) it.params.emf = 3;
        if (type === 'resistor' && it.params.R == null) it.params.R = 10;
        if (type === 'rbox' && it.params.R == null) it.params.R = 10;
        if ((type === 'lens' || type === 'lensNeg') && it.params.f == null) it.params.f = t.f;
        if (type === 'candle' && it.params.h0 == null) it.params.h0 = t.h0;
        el.items.push(it);
        return it;
      }

      function pinPos(it, pinId) {
        var t = typeOf(it);
        var p = (t.pins || []).filter(function (x) { return x.id === pinId; })[0];
        if (!p) return null;
        return { x: it.x + p.dx, y: it.y + p.dy, tone: p.pol === '+' ? '#ad1f26' : (p.pol === '-' ? '#33507d' : (t.pinTone || '#4b4a41')) };
      }

      function allPins() {
        var out = [];
        el.items.forEach(function (it) {
          (typeOf(it).pins || []).forEach(function (p) {
            out.push({ item: it, pin: p.id, x: it.x + p.dx, y: it.y + p.dy });
          });
        });
        return out;
      }

      function findPin(x, y, near, exclude) {
        var best = null, bd = near || 15;
        allPins().forEach(function (p) {
          if (exclude && p.item === exclude.item && p.pin === exclude.pin) return;
          var d = Math.hypot(p.x - x, p.y - y);
          if (d < bd) { bd = d; best = p; }
        });
        return best;
      }

      function wiresOf(it) {
        return el.wires.filter(function (w) { return w.a.item === it || w.b.item === it; });
      }

      function removeItem(it) {
        el.items = el.items.filter(function (x) { return x !== it; });
        el.wires = el.wires.filter(function (w) { return w.a.item !== it && w.b.item !== it; });
        syncPlaced();
      }

      function syncPlaced() {
        api.placed.clear();
        el.items.forEach(function (it) { api.placed.add(it.type); });
      }

      function clearScene() {
        el.items = []; el.wires = []; el.pending = null; el.sol = null; el.opt = null;
        syncPlaced();
      }

      // ---------- 实验室 JSON ----------
      function toLab() {
        var idx = {};
        el.items.forEach(function (it, i) { idx[it.id] = i; });
        return {
          v: 1,
          name: el.labName,
          items: el.items.map(function (it) {
            return { type: it.type, x: Math.round(it.x), y: Math.round(it.y), params: clone(it.params) };
          }),
          wires: el.wires.map(function (w) {
            return [idx[w.a.item.id], w.a.pin, idx[w.b.item.id], w.b.pin];
          })
        };
      }

      function applyLab(lab, opts) {
        if (!lab || !Array.isArray(lab.items)) { api.toast('这份实验室文件读不懂'); return false; }
        clearScene();
        el.labName = lab.name || '自定义实验室';
        lab.items.forEach(function (d, i) {
          var x = (d.x == null) ? 140 + (i % 5) * 170 : d.x;
          var y = (d.y == null) ? 420 + Math.floor(i / 5) * 120 : d.y;
          if (!TYPES[d.type]) return;
          addItem(d.type, x, y, d.params || {});
        });
        (lab.wires || []).forEach(function (w) {
          var ai = el.items[w[0]], bi = el.items[w[2]];
          if (!ai || !bi) return;
          el.wires.push({ a: { item: ai, pin: w[1] }, b: { item: bi, pin: w[3] } });
        });
        syncPlaced();
        if (!opts || !opts.silent) api.toast('已载入实验室：' + el.labName);
        rebuildToolbarLabel();
        solve();
        persist();
        return true;
      }

      function persist() {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(toLab()));
        } catch (e) { }
      }

      // ---------- 电学求解 ----------
      function elecItems() {
        return el.items.filter(function (it) { return typeOf(it).domain === 'e'; });
      }

      function resistanceOf(it) {
        var t = typeOf(it);
        switch (it.type) {
          case 'switch': return it.params.closed ? 0.02 : Infinity;
          case 'ammeter': return t.ra;
          case 'voltmeter': return t.rv;
          case 'resistor': return Math.max(0.01, Number(it.params.R) || 10);
          case 'rbox': return Math.max(1, Number(it.params.R) || 10);
          case 'wire': return 0.001;
          case 'rheostat': return 0.5 + clamp(Number(it.params.pos), 0, 1) * t.Rmax;
          case 'bulb': return t.R;
          default: return Math.max(0.001, Number(it.params.R) || 0.001);
        }
      }

      function solveElectric() {
        var items = elecItems();
        if (!items.length) return null;
        var dsu = DSU();
        el.wires.forEach(function (w) { dsu.union(w.a.item.id + ':' + w.a.pin, w.b.item.id + ':' + w.b.pin); });
        items.forEach(function (it) {
          (typeOf(it).pins || []).forEach(function (p) { dsu.find(it.id + ':' + p.id); });
        });
        var keys = dsu.keys();

        // 先按并查集的“根”归并成真正的节点，再编号（地节点去掉）
        var rootIdx = {}, comps = [];
        keys.forEach(function (k) {
          var r = dsu.find(k);
          if (rootIdx[r] == null) { rootIdx[r] = comps.length; comps.push(r); }
        });
        var groundRoot = null;
        var bat = items.filter(function (i) { return i.type === 'battery'; })[0];
        if (bat) groundRoot = dsu.find(bat.id + ':-');
        if (groundRoot == null) groundRoot = comps[0];

        var map = {}, next = 0, order = {};
        comps.forEach(function (r) {
          if (r === groundRoot) { order[r] = -1; return; }
          order[r] = next++;
        });
        keys.forEach(function (k) { map[k] = order[dsu.find(k)]; });
        var n = next;

        var vSources = bat ? [bat] : [];
        var m = vSources.length;
        var size = n + m;
        var A = [], b = [];
        for (var i = 0; i < size; i++) { A.push(new Array(size).fill(0)); b.push(0); }

        function stampR(ia, ib, R) {
          if (R === Infinity || !isFinite(R) || R <= 0) return;
          if (!(R > 0)) return;
          var G = 1 / R;
          if (ia >= 0) A[ia][ia] += G;
          if (ib >= 0) A[ib][ib] += G;
          if (ia >= 0 && ib >= 0) { A[ia][ib] -= G; A[ib][ia] -= G; }
        }

        // 每节点到地加一点极小的漏电导：开关断开时孤立的线段也有确定解（0），矩阵不奇异
        for (var q = 0; q < n; q++) A[q][q] += 1e-9;

        // 电阻类
        items.forEach(function (it) {
          var t = typeOf(it), R = resistanceOf(it);
          var pa = it.id + ':' + (t.pins[0] ? t.pins[0].id : 'a');
          var pb = it.id + ':' + (t.pins[1] ? t.pins[1].id : 'b');
          var ia = map[pa], ib = map[pb];
          if (it.type === 'battery') return;   // 电池的内阻并在电压源支路里算（串联），不再单独并电阻
          stampR(ia, ib, R);
        });

        // 理想电压源支路
        vSources.forEach(function (src, k) {
          var t = typeOf(src);
          var ia = map[src.id + ':+'];
          var ib = map[src.id + ':-'];
          var row = n + k;
          if (ia >= 0) { A[ia][row] -= 1; }
          if (ib >= 0) { A[ib][row] += 1; }
          if (ia >= 0) A[row][ia] += 1;
          if (ib >= 0) A[row][ib] -= 1;
          // 内阻串在源里：V(a) - V(b) + I*r = emf
          A[row][row] += Math.max(0.001, Number(src.params.r) || t.r);
          b[row] = Number(src.params.emf) || t.emf;
        });

        var x = solveLin(A, b);
        if (!x) return { broken: true, volts: {}, currents: {}, amps: 0, voltsMax: 0, power: 0 };

        var volts = {};   // item.id -> 两端电压（a-b，带符号）
        items.forEach(function (it) {
          var t = typeOf(it);
          var ia = map[it.id + ':' + (t.pins[0] ? t.pins[0].id : 'a')];
          var ib = map[it.id + ':' + (t.pins[1] ? t.pins[1].id : 'b')];
          var va = ia >= 0 ? x[ia] : 0;
          var vb = ib >= 0 ? x[ib] : 0;
          volts[it.id] = va - vb;
        });

        var res = { broken: false, volts: volts, currents: {}, amps: 0, voltsMax: 0, power: 0 };
        items.forEach(function (it) {
          var R = resistanceOf(it);
          if (!isFinite(R) || R <= 0) return;
          var I = (volts[it.id] || 0) / R;
          res.currents[it.id] = I;
          if (it.type === 'ammeter') res.amps = Math.max(res.amps, Math.abs(I));
          if (it.type === 'voltmeter') res.voltsMax = Math.max(res.voltsMax, Math.abs(volts[it.id]));
          if (it.type === 'bulb') res.power = Math.max(res.power, Math.abs(I * volts[it.id]));
        });
        return res;
      }

      // ---------- 光学求解 ----------
      function solveOptics() {
        var candles = el.items.filter(function (i) { return i.type === 'candle'; });
        var lenses = el.items.filter(function (i) { return i.type === 'lens' || i.type === 'lensNeg'; })
          .sort(function (a, b) { return a.x - b.x; });
        var screens = el.items.filter(function (i) { return i.type === 'screen'; });
        if (!candles.length || !lenses.length) return null;

        var src = candles[0];
        var h0 = Number(src.params.h0) || typeOf(src).h0;

        // 逐片透镜成像：前一片的像当成后一片的物
        var objX = src.x, objH = h0, chain = [];
        lenses.forEach(function (ln) {
          var f = (Number(ln.params.f) || typeOf(ln).f) * PX_PER_CM;
          var u = ln.x - objX;
          if (u <= 1) return;
          var v = 1 / (1 / f - 1 / u);
          var imgX = ln.x + v;
          var mag = (v / u);
          chain.push({ lens: ln, u: u, v: v, imgX: imgX, f: f, h: objH * mag });
          objX = imgX;
          objH = objH * mag;
        });
        var last = chain[chain.length - 1];
        if (!last) return null;

        var imgX = last.imgX, imgH = last.h;

        // 光屏：清晰度取决于离像面多远
        var hit = null;
        screens.forEach(function (sc) {
          var d = Math.abs(sc.x - imgX);
          var dof = Math.max(10, Math.abs(last.v) * 0.12);
          var sharp = clamp(1 - d / (dof * 4), 0, 1);
          var cand = { screen: sc, dist: d, sharp: sharp, h: imgH };
          if (!hit || sharp > hit.sharp) hit = cand;
        });

        return { chain: chain, src: src, imgX: imgX, imgH: imgH, hit: hit, u: last.u, v: last.v, f: last.f };
      }

      function solve() {
        el.sol = solveElectric();
        el.opt = solveOptics();
        syncPlaced();
      }

      // ---------- 画 ----------
      function drawPin(ctx, p, hot) {
        var c = p.tone || '#4b4a41';
        g.circle(ctx, p.x, p.y, hot ? 5.2 : 3.6, { color: c, w: hot ? 2 : 1.2, fill: hot ? '#ffffff' : null, fillAlpha: .9 });
        if (hot) g.circle(ctx, p.x, p.y, 9, { color: c, w: 1, alpha: .35, dash: [3, 4] });
      }

      function drawWires(ctx) {
        el.wires.forEach(function (w) {
          var pa = pinPos(w.a.item, w.a.pin), pb = pinPos(w.b.item, w.b.pin);
          if (!pa || !pb) return;
          var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2 + 14;
          var pts = [];
          for (var i = 0; i <= 12; i++) {
            var t = i / 12;
            var x = (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * mx + t * t * pb.x;
            var y = (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * my + t * t * pb.y;
            pts.push([x, y]);
          }
          g.linePath(ctx, pts, { color: '#26251d', w: 1.7, alpha: .92 });
        });
      }

      function drawBattery(ctx, it) {
        g.rect(ctx, it.x - t2(it, 'w') / 2, it.y - 14, t2(it, 'w'), 28, { color: '#3a3830', w: 1.4, fill: '#ded8c9', fillAlpha: .8 });
        g.text(ctx, it.x, it.y + 4, (Number(it.params.emf) || 3).toFixed(1) + ' V', { size: 12, align: 'center' });
      }

      function drawSwitch(ctx, it) {
        var c = it.params.closed ? '#ad1f26' : '#3a3830';
        g.circle(ctx, it.x - 26, it.y, 4.5, { color: '#3a3830', w: 1.2 });
        g.circle(ctx, it.x + 26, it.y, 4.5, { color: '#3a3830', w: 1.2 });
        if (it.params.closed) g.line(ctx, it.x - 26, it.y, it.x + 26, it.y, { color: c, w: 2.2 });
        else g.line(ctx, it.x - 26, it.y, it.x + 16, it.y - 26, { color: c, w: 2.2 });
      }

      function drawMeter(ctx, it) {
        var t = typeOf(it), c = it.type === 'ammeter' ? '#33507d' : '#ad1f26';
        g.rect(ctx, it.x - t.w / 2, it.y - 26, t.w, t.h, { color: '#3a3830', w: 1.4, fill: '#fdfdfa', fillAlpha: .92 });
        var cx = it.x, cy = it.y + 24, R = 30;
        g.arc(ctx, cx, cy, R, Math.PI * 1.04, Math.PI * 1.96, { color: '#6f6c64', w: 1 });
        var val = it.type === 'ammeter'
          ? (el.sol && !el.sol.broken ? Math.abs(el.sol.currents[it.id] || 0) : 0)
          : (el.sol && !el.sol.broken ? Math.abs(el.sol.volts[it.id] || 0) : 0);
        var f = clamp(val / t.max, 0, 1);
        var ang = Math.PI * 1.04 + (1 - f) * (Math.PI * 0.92);
        // 指针（从表心指向刻度）
        g.line(ctx, cx, cy, cx + Math.cos(ang) * (R - 4), cy + Math.sin(ang) * (R - 4), { color: '#ad1f26', w: 1.7 });
        g.circle(ctx, cx, cy, 3, { color: '#3a3830', w: 1 });
        g.text(ctx, cx, it.y - 8, it.type === 'ammeter' ? 'A' : 'V', { size: 13, color: c, align: 'center', weight: '600' });
        g.text(ctx, cx, it.y + 38, val.toFixed(it.type === 'ammeter' ? 3 : 2) + ' ' + t.unit, { size: 11, align: 'center' });
      }

      function drawResistor(ctx, it) {
        var t = typeOf(it);
        g.rect(ctx, it.x - 40, it.y - 14, 80, 28, { color: '#3a3830', w: 1.4, fill: '#efe5cd', fillAlpha: .85 });
        g.text(ctx, it.x, it.y + 4, (Number(it.params.R) || 10).toFixed(0) + ' Ω', { size: 12, color: '#ad1f26', align: 'center' });
        g.line(ctx, it.x - 44, it.y, it.x - 40, it.y, { color: '#3a3830', w: 1.5 });
        g.line(ctx, it.x + 40, it.y, it.x + 44, it.y, { color: '#3a3830', w: 1.5 });
      }

      function drawRbox(ctx, it) {
        var R = Number(it.params.R) || 10;
        g.rect(ctx, it.x - 50, it.y - 20, 100, 40, { color: '#3a3830', w: 1.4, fill: '#efe8d6', fillAlpha: .9 });
        g.rect(ctx, it.x - 42, it.y - 13, 22, 26, { color: '#8b8880', w: 1, fill: '#fbf8ef', fillAlpha: .9 });
        g.rect(ctx, it.x + 20, it.y - 13, 22, 26, { color: '#8b8880', w: 1, fill: '#fbf8ef', fillAlpha: .9 });
        g.text(ctx, it.x - 31, it.y + 5, String(Math.floor(R / 10)), { size: 13, color: '#33507d', align: 'center' });
        g.text(ctx, it.x + 31, it.y + 5, String(R % 10), { size: 13, color: '#33507d', align: 'center' });
        g.text(ctx, it.x, it.y - 5, R + ' Ω', { size: 11, color: '#ad1f26', align: 'center' });
        g.line(ctx, it.x - 50, it.y, it.x - 54, it.y, { color: '#3a3830', w: 1.5 });
        g.line(ctx, it.x + 50, it.y, it.x + 54, it.y, { color: '#3a3830', w: 1.5 });
      }

      function drawWire(ctx, it) {
        g.line(ctx, it.x - 44, it.y, it.x + 44, it.y, { color: '#4b4a41', w: 2 });
        g.circle(ctx, it.x - 44, it.y, 5.5, { color: '#3a3830', w: 1.2, fill: '#ded8c9', fillAlpha: .6 });
        g.circle(ctx, it.x + 44, it.y, 5.5, { color: '#3a3830', w: 1.2, fill: '#ded8c9', fillAlpha: .6 });
      }

      function drawRheostat(ctx, it) {
        var pos = clamp(Number(it.params.pos), 0, 1);
        g.rect(ctx, it.x - 58, it.y - 14, 116, 28, { color: '#3a3830', w: 1.4, fill: '#f3ead3', fillAlpha: .85 });
        g.coil(ctx, it.x - 50, it.y, 100, 5, 9, { color: '#6f6c64', w: 1.1, alpha: .8 });
        var sx = it.x - 58 + pos * 116;
        g.rect(ctx, sx - 6, it.y - 26, 12, 16, { color: '#ad1f26', w: 1.3, fill: '#f0d7c2', fillAlpha: .85 });
        g.line(ctx, sx, it.y - 26, sx, it.y - 32, { color: '#ad1f26', w: 1.4 });
        g.text(ctx, sx, it.y - 38, (0.5 + pos * typeOf(it).Rmax).toFixed(1) + ' Ω', { size: 10, color: '#ad1f26', align: 'center', italic: true });
      }

      function drawBulb(ctx, it) {
        var P = el.sol && !el.sol.broken ? el.sol.power : 0;
        var lit = clamp(P / 1.2, 0, 1);
        if (lit > 0.02) {
          ctx.save();
          var gr = ctx.createRadialGradient(it.x, it.y - 14, 2, it.x, it.y - 14, 34);
          gr.addColorStop(0, 'rgba(255,196,80,' + (0.55 * lit).toFixed(2) + ')');
          gr.addColorStop(1, 'rgba(255,196,80,0)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(it.x, it.y - 14, 34, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        g.circle(ctx, it.x, it.y - 14, 12, { color: '#3a3830', w: 1.4, fill: lit > 0.05 ? '#ffe9b8' : '#f3f1e8', fillAlpha: .9 });
        g.line(ctx, it.x - 6, it.y - 20, it.x + 6, it.y - 8, { color: '#6f6c64', w: 1 });
        g.line(ctx, it.x + 6, it.y - 20, it.x - 6, it.y - 8, { color: '#6f6c64', w: 1 });
        g.rect(ctx, it.x - 8, it.y - 2, 16, 16, { color: '#3a3830', w: 1.2, fill: '#ded8c9', fillAlpha: .8 });
        g.text(ctx, it.x, it.y + 34, P > 0.01 ? P.toFixed(2) + ' W' : '不亮', { size: 10, color: lit > .3 ? '#ad1f26' : '#8b8880', align: 'center' });
      }

      function drawCandle(ctx, it) {
        var h0 = Number(it.params.h0) || typeOf(it).h0;
        g.rect(ctx, it.x - 5, it.y - h0, 10, h0, { color: '#3a3830', w: 1.2, fill: '#f0e5c8', fillAlpha: .85 });
        g.line(ctx, it.x, it.y - h0, it.x, it.y - h0 - 6, { color: '#3a3830', w: 1 });
        g.arc(ctx, it.x, it.y - h0 - 9, 4.5, 0, Math.PI * 2, { color: '#ad1f26', w: 1.3, fill: '#ad1f26', fillAlpha: .25 });
        g.line(ctx, it.x - 8, it.y, it.x + 8, it.y, { color: '#6f6c64', w: 1 });
        g.text(ctx, it.x, it.y + 16, '物', { size: 10, color: '#8b8880', align: 'center' });
      }

      function drawLens(ctx, it) {
        var t = typeOf(it), a = t.aperture / 2;
        if (it.type === 'lens') {
          g.poly(ctx, [[it.x - 9, it.y - a], [it.x + 9, it.y], [it.x - 9, it.y + a], [it.x, it.y]], { color: '#3a3830', w: 1.2, fill: '#e8f0f6', fillAlpha: .5 }, false);
          g.arc(ctx, it.x, it.y, a, -Math.PI / 2, Math.PI / 2, { color: '#3a3830', w: 1.2 });
          g.arc(ctx, it.x, it.y, a, Math.PI / 2, Math.PI * 1.5, { color: '#3a3830', w: 1.2 });
          g.line(ctx, it.x, it.y - a, it.x, it.y + a, { color: '#8b8880', w: 1, dash: [3, 4] });
          g.text(ctx, it.x, it.y + a + 16, 'f=' + (Number(it.params.f) || 10) + 'cm', { size: 10, color: '#4b4a41', align: 'center' });
        } else {
          g.line(ctx, it.x, it.y - a, it.x, it.y + a, { color: '#3a3830', w: 1.2 });
          g.poly(ctx, [[it.x, it.y - a], [it.x - 8, it.y], [it.x, it.y + a]], { color: '#3a3830', w: 1.1, fill: '#eef3f7', fillAlpha: .45 }, false);
          g.poly(ctx, [[it.x, it.y - a], [it.x + 8, it.y], [it.x, it.y + a]], { color: '#3a3830', w: 1.1, fill: '#eef3f7', fillAlpha: .45 }, false);
          g.text(ctx, it.x, it.y + a + 16, 'f=' + (Number(it.params.f) || -10) + 'cm', { size: 10, color: '#4b4a41', align: 'center' });
        }
      }

      function drawScreen(ctx, it) {
        g.rect(ctx, it.x - 9, it.y - 50, 18, 100, { color: '#3a3830', w: 1.3, fill: '#fbf8ef', fillAlpha: .95 });
        g.line(ctx, it.x - 9, it.y - 50, it.x + 9, it.y - 50, { color: '#3a3830', w: 1.6 });
        g.hatch(ctx, [[it.x - 6, it.y - 47], [it.x + 6, it.y - 47], [it.x + 6, it.y + 47], [it.x - 6, it.y + 47]], { color: '#6f6c64', gap: 9, alpha: .18 });
        g.line(ctx, it.x, it.y + 50, it.x, it.y + 60, { color: '#6f6c64', w: 1.1 });
        g.text(ctx, it.x, it.y + 74, '光屏', { size: 10, color: '#8b8880', align: 'center' });
      }

      function t2(it, k) { return typeOf(it)[k]; }

      function drawItem(ctx, it) {
        switch (it.type) {
          case 'battery': drawBattery(ctx, it); break;
          case 'switch': drawSwitch(ctx, it); break;
          case 'ammeter': case 'voltmeter': drawMeter(ctx, it); break;
          case 'resistor': drawResistor(ctx, it); break;
          case 'rbox': drawRbox(ctx, it); break;
          case 'wire': drawWire(ctx, it); break;
          case 'rheostat': drawRheostat(ctx, it); break;
          case 'bulb': drawBulb(ctx, it); break;
          case 'candle': drawCandle(ctx, it); break;
          case 'lens': case 'lensNeg': drawLens(ctx, it); break;
          case 'screen': drawScreen(ctx, it); break;
          default:
            g.circle(ctx, it.x, it.y, 12, { color: '#3a3830', w: 1.2 });
        }
        if (it === el.hoverItem && el.mode !== 'wire') {
          g.rect(ctx, it.x - (typeOf(it).w || 40) / 2 - 4, it.y - (typeOf(it).h || 40) / 2 - 4,
            (typeOf(it).w || 40) + 8, (typeOf(it).h || 40) + 8, { color: '#33507d', w: 1, alpha: .35, dash: [4, 4] });
        }
      }

      function drawOptics(ctx, o) {
        if (!o) return;
        var src = o.src, h0 = Number(src.params.h0) || typeOf(src).h0;
        var s = { x: src.x, y: src.y, h: h0 };   // 物体底部在 src.y，顶端在 src.y - h
        g.line(ctx, 60, src.y, 940, src.y, { color: '#8b8880', w: 1, dash: [7, 5], alpha: .45 });
        g.text(ctx, 60, src.y + 14, '主光轴', { size: 9, color: '#a8a49a' });

        // 逐片透镜画光线
        var objX = src.x, objH = h0, objTipY = src.y - h0;
        var baseY = src.y;
        o.chain.forEach(function (step) {
          var ln = step.lens, ap = typeOf(ln).aperture / 2;
          var u = step.u, v = step.v, imgX = step.imgX, imgH = step.h;
          var objTip = baseY - objH;

          // 三条特征光线：过光心 / 到透镜上下缘
          var hits = [0, -ap, ap];
          hits.forEach(function (dy, idx) {
            var from = { x: objX, y: objTip };
            var to = { x: ln.x, y: ln.y + dy };
            g.line(ctx, from.x, from.y, to.x, to.y, { color: idx === 0 ? '#ad1f26' : '#33507d', w: 1.1, alpha: .75 });
            if (v > 0) {
              var tipImg = baseY - imgH;
              var target = { x: imgX, y: ln.y + (tipImg - ln.y) * (Math.abs(v) / Math.max(1, Math.abs(u))) };
              // 以像点为终点，避免符号乱七八糟
              target = { x: imgX, y: baseY - imgH };
              g.line(ctx, to.x, to.y, target.x, target.y, { color: idx === 0 ? '#ad1f26' : '#33507d', w: 1.1, alpha: .75 });
            } else {
              // 虚像：出射光线发散，反向延长用虚线
              var slope = (ln.y + dy - (baseY - imgH)) / (ln.x - imgX);
              var far = ln.x + (ln.x - to.x) + 160;
              g.line(ctx, to.x, to.y, far, ln.y + dy + slope * (far - ln.x), { color: '#33507d', w: 1, alpha: .45, dash: [5, 5] });
            }
          });

          // 像点
          var imgY = baseY - imgH;
          if (v > 0) {
            g.circle(ctx, imgX, imgY, 3.4, { color: '#ad1f26', w: 1.2, fill: '#ad1f26', fillAlpha: .35 });
            g.arrow(ctx, imgX, baseY, imgX, imgY, { color: '#ad1f26', w: 1.4, alpha: .8 });
          }

          objX = imgX; objH = imgH;
        });

        // 光屏上的像
        if (o.hit) {
          var sc = o.hit.screen, iy = o.hit.h;
          var sharp = o.hit.sharp;
          // 屏上的光斑
          var blur = 10 + (1 - sharp) * 55;
          var cy = sc.y - Math.max(0, iy) / 2;
          ctx.save();
          ctx.globalAlpha = .22 + sharp * .5;
          ctx.fillStyle = '#ad1f26';
          ctx.beginPath();
          ctx.ellipse(sc.x, cy, Math.max(3, blur / 2), Math.max(3, Math.abs(iy) / 2 + blur / 2), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          g.text(ctx, sc.x + 26, sc.y - 58, sharp > .7 ? '像清晰' : (sharp > .25 ? '像模糊' : '没接到像'),
            { size: 11, color: sharp > .7 ? '#ad1f26' : '#8b8880', italic: true });
        }

        // 结论批注
        var last = o.chain[o.chain.length - 1];
        if (Math.abs(last.v) > 1) {
          g.text(ctx, 60, 60, 'u = ' + (last.u / PX_PER_CM).toFixed(1) + ' cm   v = ' + (last.v / PX_PER_CM).toFixed(1) + ' cm',
            { size: 12, color: '#33507d' });
          g.text(ctx, 60, 78, '放大率 m = ' + Math.abs(last.v / last.u).toFixed(2)
            + (last.v < 0 ? '（虚像，光屏接不到）' : ''), { size: 12, color: '#33507d' });
        }
      }

      // ---------- 工具栏（只在本实验出现） ----------
      var bar = null, labSel = null, fileInput = null, modeBtns = {};

      function rebuildToolbarLabel() {
        if (labSel) {
          var has = Array.prototype.some.call(labSel.options, function (o) { return o.value === el.labName; });
          if (has) labSel.value = el.labName;
        }
        var title = document.getElementById('sb-lab-name');
        if (title) title.textContent = el.labName;
      }

      function buildToolbar() {
        var bench = document.querySelector('.bench');
        if (!bench || document.getElementById('sb-tools')) { bar = document.getElementById('sb-tools'); return; }
        bar = document.createElement('div');
        bar.id = 'sb-tools';
        bar.className = 'sb-tools';
        bar.innerHTML =
          '<div class="sb-row">' +
            '<span class="sb-label">模式</span>' +
            '<button class="sb-btn is-on" data-mode="select" type="button">选择 / 拖动</button>' +
            '<button class="sb-btn" data-mode="wire" type="button">连线</button>' +
            '<button class="sb-btn" data-mode="erase" type="button">删除</button>' +
            '<span class="sb-sep"></span>' +
            '<span class="sb-label">实验室</span>' +
            '<select id="sb-lab-sel"></select>' +
            '<button class="sb-btn" type="button" id="sb-export">导出</button>' +
            '<button class="sb-btn" type="button" id="sb-import">导入</button>' +
            '<button class="sb-btn" type="button" id="sb-save-lab">存为实验室</button>' +
            '<span class="sb-sep"></span>' +
            '<button class="sb-btn sb-danger" type="button" id="sb-clear">清空</button>' +
            '<span class="sb-now">当前：<b id="sb-lab-name">自由实验台</b></span>' +
          '</div>';
        bench.insertBefore(bar, bench.querySelector('.stage'));
        labSel = document.getElementById('sb-lab-sel');

        bar.addEventListener('click', function (e) {
          var b = e.target.closest('[data-mode]');
          if (b) {
            el.mode = b.getAttribute('data-mode');
            Array.prototype.forEach.call(bar.querySelectorAll('[data-mode]'), function (x) {
              x.classList.toggle('is-on', x === b);
            });
            el.pending = null;
            api.toast(el.mode === 'wire' ? '连线模式：从一个端子拖到另一个端子' : (el.mode === 'erase' ? '删除模式：点器材或导线' : '选择模式：拖器材、点开关、拖滑片'));
            return;
          }
          if (e.target.id === 'sb-clear') {
            if (!confirm('清空整个实验台？')) return;
            clearScene(); persist(); api.toast('台子清空了');
          }
          if (e.target.id === 'sb-export') exportLab();
          if (e.target.id === 'sb-import') importLab();
          if (e.target.id === 'sb-save-lab') saveLab();
        });

        labSel.addEventListener('change', function () {
          var id = labSel.value;
          var p = PRESETS.filter(function (x) { return x.id === id; })[0];
          if (p) { applyLab(p); return; }
          fetch('/api/lab/labs', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
            var lab = (d.labs || []).filter(function (x) { return x.id === id; })[0];
            if (lab && lab.data) applyLab(lab.data);
          }).catch(function () { });
        });
      }

      function fillLabList(remote, keepId) {
        if (!labSel) return;
        var html = PRESETS.map(function (p) { return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('');
        if (remote && remote.length) {
          html += '<optgroup label="自定义">' + remote.map(function (l) {
            return '<option value="' + l.id + '">' + (l.name || l.id) + '</option>';
          }).join('') + '</optgroup>';
        }
        labSel.innerHTML = html;
        if (keepId && PRESETS.every(function (p) { return p.id !== keepId; })) labSel.value = keepId;
        rebuildToolbarLabel();
      }

      function fetchLabs(keepId) {
        fetch('/api/lab/labs', { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (d) { fillLabList((d && d.labs) || [], keepId); })
          .catch(function () { fillLabList([], keepId); });
      }

      // 链接直达：/exp/lab?lab=<实验室id>，老师把链接发给学生就能直接进这一间
      function labIdFromUrl() {
        try { return (new URLSearchParams(location.search)).get('lab') || ''; } catch (e) { return ''; }
      }

      function openLabFromUrl(id) {
        fetch('/api/lab/labs', { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var labs = (d && d.labs) || [];
            fillLabList(labs, id);
            var lab = labs.filter(function (x) { return x.id === id; })[0];
            if (!lab || !lab.data) { api.toast('这个实验室链接失效了'); return; }
            applyLab(lab.data, { silent: true });
            api.stamp('已打开：' + (lab.name || '自定义实验室'));
          })
          .catch(function () { api.toast('实验室列表读不到'); });
      }

      function exportLab() {
        var lab = toLab();
        lab.name = el.labName;
        var s = JSON.stringify(lab, null, 2);
        var blob = new Blob([s], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (el.labName || '实验室') + '.lab.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
        api.toast('已导出 ' + a.download);
        api.note('导出实验室：' + el.labName + '（' + el.items.length + ' 件器材）', 'note');
      }

      function importLab() {
        if (!fileInput) {
          fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = '.json,application/json';
          fileInput.style.display = 'none';
          document.body.appendChild(fileInput);
          fileInput.addEventListener('change', function () {
            var f = fileInput.files[0];
            if (!f) return;
            var fr = new FileReader();
            fr.onload = function () {
              try {
                var lab = JSON.parse(fr.result);
                applyLab(lab);
                api.note('导入实验室：' + el.labName, 'note');
              } catch (e) { api.toast('JSON 读不懂：' + e.message); }
              fileInput.value = '';
            };
            fr.readAsText(f);
          });
        }
        fileInput.click();
      }

      function saveLab() {
        var name = prompt('给这个实验室起个名字（学生端能看到）', el.labName === '自由实验台' ? '我的实验室' : el.labName);
        if (!name) return;
        el.labName = name;
        var lab = toLab();
        lab.name = name;
        fetch('/api/admin/lab/lab', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lab)
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (!d.ok) { api.toast('保存失败：' + (d.error || '需要老师登录')); return; }
          api.toast('已保存到实验室列表');
          api.note('保存为实验室：' + name, 'note');
          rebuildToolbarLabel();
          fetchLabs(d.id);
        }).catch(function () { api.toast('保存失败'); });
      }

      // ---------- 交互 ----------
      function itemAt(x, y) {
        var hit = null;
        el.items.forEach(function (it) {
          var t = typeOf(it);
          var w = t.w || 50, h = t.h || 50;
          if (Math.abs(x - it.x) <= w / 2 + 4 && Math.abs(y - it.y) <= h / 2 + 4) hit = it;
        });
        return hit;
      }

      function wireAt(x, y) {
        var hit = null;
        el.wires.forEach(function (w) {
          var pa = pinPos(w.a.item, w.a.pin), pb = pinPos(w.b.item, w.b.pin);
          if (!pa || !pb) return;
          var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2 + 14;
          for (var i = 0; i <= 16; i++) {
            var t = i / 16;
            var px = (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * mx + t * t * pb.x;
            var py = (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * my + t * t * pb.y;
            if (Math.hypot(x - px, y - py) < 6) { hit = w; break; }
          }
        });
        return hit;
      }

      return {
        onEnter: function () {
          buildToolbar();
          var urlLab = labIdFromUrl();
          if (urlLab) { openLabFromUrl(urlLab); rebuildToolbarLabel(); solve(); return; }
          fetchLabs();
          // 本机场景优先；没有就空台
          try {
            var s = localStorage.getItem(LS_KEY);
            if (s) {
              var lab = JSON.parse(s);
              if (lab && lab.items && lab.items.length) applyLab(lab, { silent: true });
              else el.labName = lab.name || '自由实验台';
            }
          } catch (e) { }
          rebuildToolbarLabel();
          solve();
        },
        onLeave: function () {
          var b = document.getElementById('sb-tools');
          if (b) b.remove();
          persist();
        },

        onPlace: function (type, pos) {
          var p = pos || { x: 260 + (el.items.length % 4) * 150, y: 430 };
          // 别叠在一起
          while (itemAt(p.x, p.y)) { p.x += 24; p.y += 16; }
          addItem(type, p.x, p.y);
          solve(); persist();
        },
        onRemove: function (type) {
          var last = null;
          el.items.forEach(function (it) { if (it.type === type) last = it; });
          if (last) removeItem(last);
          solve(); persist();
        },

        down: function (p) {
          el.hoverItem = itemAt(p.x, p.y);

          if (el.mode === 'erase') {
            var w = wireAt(p.x, p.y);
            if (w) { el.wires = el.wires.filter(function (x) { return x !== w; }); solve(); persist(); return true; }
            var it0 = el.hoverItem;
            if (it0) { removeItem(it0); solve(); persist(); api.toast('删除 ' + typeOf(it0).name); return true; }
            return false;
          }

          if (el.mode === 'wire') {
            var pin = findPin(p.x, p.y, 16);
            if (!pin) { api.toast('要点在器材的端子上（小圆圈）'); return false; }
            el.pending = pin;
            return true;
          }

          // 选择模式：先看滑片，再看器材
          var it = el.hoverItem;
          if (it && it.type === 'rheostat') {
            var pos = clamp((p.x - (it.x - 58)) / 116, 0, 1);
            if (Math.abs(p.y - (it.y - 18)) < 26 && Math.abs(p.x - (it.x - 58 + clamp(Number(it.params.pos), 0, 1) * 116)) < 16) {
              el.knob = it;
              return true;
            }
          }
          if (it) {
            el.drag = { item: it, dx: p.x - it.x, dy: p.y - it.y, moved: 0 };
            // 把被拖的拿到最上层
            el.items = el.items.filter(function (x) { return x !== it; }).concat([it]);
            return true;
          }
          return false;
        },
        move: function (p) {
          if (el.knob) {
            el.knob.params.pos = clamp((p.x - (el.knob.x - 58)) / 116, 0, 1);
            solve();
            return;
          }
          if (el.drag) {
            el.drag.item.x = clamp(p.x - el.drag.dx, 60, 940);
            el.drag.item.y = clamp(p.y - el.drag.dy, 120, 560);
            el.drag.moved += 1;
            return;
          }
          el.hoverItem = itemAt(p.x, p.y);
        },
        up: function (p) {
          if (el.knob) {
            api.note('变阻器调到 ' + (0.5 + el.knob.params.pos * typeOf(el.knob).Rmax).toFixed(1) + ' Ω', 'obs');
            el.knob = null; solve(); persist(); return;
          }
          if (el.mode === 'wire' && el.pending) {
            var target = findPin(p.x, p.y, 20, el.pending);
            if (target && target.item !== el.pending.item) {
              var dup = el.wires.some(function (w) {
                return (w.a.item === el.pending.item && w.a.pin === el.pending.pin && w.b.item === target.item && w.b.pin === target.pin)
                  || (w.b.item === el.pending.item && w.b.pin === el.pending.pin && w.a.item === target.item && w.a.pin === target.pin);
              });
              if (!dup) {
                el.wires.push({ a: { item: el.pending.item, pin: el.pending.pin }, b: { item: target.item, pin: target.pin } });
                solve(); persist();
                api.note('连了一根线：' + typeOf(el.pending.item).name + ' → ' + typeOf(target.item).name, 'note');
              }
            }
            el.pending = null;
            return;
          }
          if (el.drag) {
            var it = el.drag.item;
            if (el.drag.moved <= 2 && it.type === 'switch') {
              it.params.closed = !it.params.closed;
              solve(); persist();
              api.note('开关' + (it.params.closed ? '闭合' : '断开'), 'note');
            } else if (el.drag.moved <= 2 && it.type === 'battery') {
              var emf = Number(it.params.emf) || 3;
              it.params.emf = emf >= 6 ? 1.5 : emf + 1.5;
              solve(); persist();
              api.toast('电池换成 ' + it.params.emf + ' V');
            } else if (el.drag.moved <= 2 && it.type === 'rbox') {
              var steps = [5, 10, 15, 20, 30, 50];
              var at = steps.indexOf(Number(it.params.R));
              it.params.R = steps[(at + 1) % steps.length];
              solve(); persist();
              api.note('电阻箱调到 ' + it.params.R + ' Ω', 'obs');
            } else {
              persist();
            }
            el.drag = null;
          }
        },
        hover: function (p) {
          el.hoverItem = itemAt(p.x, p.y);
          el.hoverPin = el.mode === 'wire' ? findPin(p.x, p.y, 16) : null;
        },
        cursor: function (p) {
          if (el.mode === 'erase') return wireAt(p.x, p.y) || itemAt(p.x, p.y) ? 'not-allowed' : 'default';
          if (el.mode === 'wire') return findPin(p.x, p.y, 16) ? 'crosshair' : 'default';
          var it = itemAt(p.x, p.y);
          if (!it) return 'default';
          if (it.type === 'switch' && Math.hypot(p.x - it.x, p.y - it.y) < 30) return 'pointer';
          if (it.type === 'rheostat' && el.knob) return 'grabbing';
          return 'grab';
        },

        step: function (dt) {
          el.t += dt;
          // 电路不用逐帧解，参数变了才重算；这里只做表针平滑
        },

        readings: function () {
          var out = [];
          var sol = el.sol;
          if (el.items.length && sol) {
            if (sol.broken) {
              out.push({ label: '电路', value: '没接成回路', tone: 'warn' });
            } else {
              var amps = sol.amps, vmax = sol.voltsMax;
              if (el.items.some(function (i) { return i.type === 'ammeter'; })) out.push({ label: '电流 I', value: amps.toFixed(3), unit: 'A' });
              if (el.items.some(function (i) { return i.type === 'voltmeter'; })) out.push({ label: '电压 U', value: vmax.toFixed(2), unit: 'V' });
              if (el.items.some(function (i) { return i.type === 'bulb'; })) out.push({ label: '灯泡功率', value: sol.power.toFixed(2), unit: 'W', tone: sol.power > 0.2 ? 'ok' : '' });
              out.push({ label: '器材', value: String(el.items.length), unit: '件' });
            }
          }
          var o = el.opt;
          if (o) {
            out.push({ label: 'u', value: (o.u / PX_PER_CM).toFixed(1), unit: 'cm' });
            out.push({ label: 'v', value: (o.v / PX_PER_CM).toFixed(1), unit: 'cm' });
            if (o.hit) out.push({ label: '屏上', value: o.hit.sharp > .7 ? '清晰' : '不清晰', tone: o.hit.sharp > .7 ? 'ok' : 'warn' });
          }
          return out;
        },
        dataRow: function () {
          if (el.opt && el.opt.hit) {
            return ['光学 u=' + (el.opt.u / PX_PER_CM).toFixed(1) + 'cm v=' + (el.opt.v / PX_PER_CM).toFixed(1) + 'cm ' + (el.opt.hit.sharp > .7 ? '清晰' : '模糊')];
          }
          if (el.sol && !el.sol.broken) {
            return ['电学 I=' + el.sol.amps.toFixed(3) + 'A U=' + el.sol.voltsMax.toFixed(2) + 'V'];
          }
          return null;
        },
        snapshot: function () {
          var parts = [];
          var sol = el.sol;
          if (el.items.length) parts.push('台上有 ' + el.items.length + ' 件器材：' + el.items.map(function (i) { return typeOf(i).name; }).join('、'));
          if (sol && !sol.broken) parts.push('电学 I=' + sol.amps.toFixed(3) + 'A，U=' + sol.voltsMax.toFixed(2) + 'V，灯泡功率 ' + sol.power.toFixed(2) + 'W');
          var o = el.opt;
          if (o) parts.push('光学 u=' + (o.u / PX_PER_CM).toFixed(1) + 'cm，v=' + (o.v / PX_PER_CM).toFixed(1) + 'cm，放大率 ' + Math.abs(o.v / o.u).toFixed(2) + (o.hit ? '，屏上 ' + (o.hit.sharp > .7 ? '清晰' : '模糊') : ''));
          return parts.join('；') || '空台';
        },
        hint: function () {
          if (el.mode === 'wire') return '连线模式：点端子，拖到另一个端子';
          if (el.mode === 'erase') return '删除模式：点器材或导线就删';
          return el.items.length ? '拖器材换位置；点开关开合；变阻器拖滑片' : '从左边器材架拿器材上台';
        },
        reset: function () {
          clearScene();
          el.labName = '自由实验台';
          rebuildToolbarLabel();
          persist();
          api.note('清空实验台', 'note');
        },

        draw: function (ctx) {
          // 桌面
          g.line(ctx, 70, 566, 940, 566, { color: '#6f6c64', w: 2 });
          g.hatch(ctx, [[70, 566], [940, 566], [940, 586], [70, 586]], { color: '#6f6c64', gap: 10, alpha: .22 });

          drawWires(ctx);
          el.items.forEach(function (it) { drawItem(ctx, it); });
          drawOptics(ctx, el.opt);

          // 端子
          var pinMode = el.mode === 'wire';
          allPins().forEach(function (p) {
            var hot = el.hoverPin && el.hoverPin.item === p.item && el.hoverPin.pin === p.pin;
            drawPin(ctx, pinPos(p.item, p.pin), hot || pinMode);
          });

          // 连线拖拽预览
          if (el.pending) {
            var from = pinPos(el.pending.item, el.pending.pin);
            if (from) g.circle(ctx, from.x, from.y, 6, { color: '#ad1f26', w: 1.6 });
          }

          if (!el.items.length) {
            g.text(ctx, 500, 250, '这是一张空台', { size: 20, color: '#4b4a41', align: 'center' });
            g.text(ctx, 500, 280, '从左边器材架拿器材放上来；电学拉线、光学排成一条轴', { size: 13, color: '#8b8880', align: 'center' });
            g.text(ctx, 500, 306, '或者在上面「实验室」里选一个现成的，自动摆好', { size: 13, color: '#8b8880', align: 'center' });
          } else {
            g.text(ctx, 940, 600, el.mode === 'wire' ? '连线模式' : (el.mode === 'erase' ? '删除模式' : '选择模式'),
              { size: 11, color: '#8b8880', align: 'right', italic: true });
          }
        }
      };
    }
  });
})();
