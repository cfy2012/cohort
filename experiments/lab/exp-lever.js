/* ============================================================
   实验 01 · 杠杆平衡条件
   真实力矩动力学：τ = +g·cosθ·Σ(m s)，I = Σ m s² + 杆转动惯量
   钩码挂在杠杆上，松手后杠杆自己转到平衡（或顶到限位）
   ============================================================ */
(function () {
  'use strict';
  var g = window.CohortLab.G;

  var PIVOT = { x: 500, y: 400 };
  var PXCM = 9.0;                 // 1 cm = 9 px
  var HALF = 30;                  // 杠杆半长 30 cm
  var M = 0.05;                   // 每只钩码 50 g
  var GACC = 9.8;
  var BEAM_M = 0.30;              // 横梁自重 300 g（木尺 60 cm）
  var BEAM_D = 0.006;             // 刀口比重心高 6 mm，横梁会自己慢慢回到水平

  window.CohortLab.register({
    id: 'lever',
    name: '杠杆平衡',
    group: '力学',
    grade: '八年级下',
    aim: '把钩码挂在杠杆两侧的不同位置，找出“力×力臂”相等时的平衡规律。',
    formula: 'F₁L₁ = F₂L₂',
    tip: '先把钩码挂上去，再拖到不同位置——松手后杠杆会按真实力矩自己转。',
    steps: [
      '把钩码挂到杠杆上（最多 6 只，每只 50 g）',
      '拖住钩码沿杠杆滑动，改变力臂',
      '松手，等杠杆停稳，读出左右力矩',
      '记三组数据，比较 F₁L₁ 与 F₂L₂'
    ],
    columns: ['左钩码', '左力矩', '右钩码', '右力矩', '平衡'],
    tableHint: '力矩 N·m｜力臂 cm',
    tools: [
      { id: 'lever', icon: 'lever', name: '杠杆', hint: '带刻度的木尺，支点在中间' },
      { id: 'weights', icon: 'weights', name: '钩码', hint: '每只 50 g', qty: 6 }
    ],
    ask: ['为什么力臂越长越省力？', '两边钩码数不同也能平衡吗？', '我这几组数据说明什么？'],

    create: function (api) {
      var st = {
        theta: 0, omega: 0,
        weights: [],          // {s: cm}
        drag: -1,
        balancedOnce: false,
        t: 0
      };
      var barI = 0.010;       // 60 cm 木尺绕支点的转动惯量 m L²/12 ≈ 0.009

      api.placed.add('lever');

      function pivotTorque() {
        var sum = 0;
        st.weights.forEach(function (w) { sum += M * (w.s / 100); });
        // 钩码挂在左边（s<0）要把左端压下去：θ 的正方向是右端下沉，所以这里用 +g cosθ Σ(m s)
        // 横梁自重（重心在支点下方）再把 θ 拉回 0
        var restore = -BEAM_M * GACC * BEAM_D * Math.sin(st.theta);
        return GACC * Math.cos(st.theta) * sum + restore;
      }
      function inertia() {
        var I = barI;
        st.weights.forEach(function (w) { I += M * Math.pow(w.s / 100, 2); });
        return I;
      }
      function posOf(s) {
        return {
          x: PIVOT.x + Math.cos(st.theta) * s * PXCM,
          y: PIVOT.y + Math.sin(st.theta) * s * PXCM
        };
      }
      function moments() {
        var L = 0, R = 0, nl = 0, nr = 0;
        st.weights.forEach(function (w) {
          if (w.s < 0) { L += M * GACC * Math.abs(w.s) / 100; nl++; }
          else { R += M * GACC * Math.abs(w.s) / 100; nr++; }
        });
        return { L: L, R: R, nl: nl, nr: nr };
      }

      return {
        placed: api.placed,
        counts: { weights: 0 },
        onPlace: function (id, pt) {
          if (id !== 'weights') return;
          var suggested = [-15, 15, -20, 20, -25, 25];
          var s = suggested[st.weights.length % suggested.length];
          st.weights.push({ s: s });
          api.counts.weights = st.weights.length;
          api.note('挂上第 ' + st.weights.length + ' 只钩码（50 g），放在' + (s < 0 ? '左' : '右') + Math.abs(s) + ' cm 处', 'note');
        },
        onRemove: function (id) {
          if (id !== 'weights') return;
          st.weights.pop();
          api.counts.weights = st.weights.length;
        },
        reset: function () {
          st.theta = 0; st.omega = 0; st.weights = []; st.drag = -1; st.balancedOnce = false;
          api.placed.clear(); api.placed.add('lever');
          api.counts.weights = 0;
          api.note('复位：卸下全部钩码', 'note');
        },

        step: function (dt) {
          st.t += dt;
          var I = inertia();
          var tw = pivotTorque();
          // 阻尼（空气 + 轴摩擦）：0.65 左右才像真杠杆，太大就变成泡在糖浆里
          var damp = -0.65 * st.omega;
          st.omega += (tw + damp) / I * dt;
          // 静摩擦：力矩很小、几乎不动 → 停住；然后慢慢落回水平（真实杠杆会自己回到水平）
          if (Math.abs(tw) < 0.006 && Math.abs(st.omega) < 0.12) {
            st.omega = 0;
            st.theta *= 0.94;
            if (Math.abs(st.theta) < 0.02) st.theta = 0;
          }
          st.theta += st.omega * dt;
          var lim = 0.44;
          if (st.theta > lim) { st.theta = lim; st.omega = 0; }
          if (st.theta < -lim) { st.theta = -lim; st.omega = 0; }

          var bal = Math.abs(tw) < 0.004 && Math.abs(st.omega) < 0.01;
          if (bal && !st.balancedOnce && st.weights.length >= 2) {
            st.balancedOnce = true;
            var m = moments();
            api.stamp('平衡：F₁L₁ = F₂L₂');
            api.note('杠杆平衡：左 ' + m.L.toFixed(2) + ' N·m ＝ 右 ' + m.R.toFixed(2) + ' N·m', 'ok');
            api.save();
          }
          if (!bal) st.balancedOnce = false;
        },

        down: function (p) {
          for (var i = st.weights.length - 1; i >= 0; i--) {
            var a = posOf(st.weights[i].s);
            if (Math.abs(p.x - a.x) < 26 && p.y > a.y - 8 && p.y < a.y + 46) {
              st.drag = i;
              return true;
            }
          }
          return false;
        },
        move: function (p) {
          if (st.drag < 0) return;
          var dx = p.x - PIVOT.x, dy = p.y - PIVOT.y;
          var s = (dx * Math.cos(st.theta) + dy * Math.sin(st.theta)) / PXCM;
          s = Math.round(s);
          s = Math.max(-HALF + 1, Math.min(HALF - 1, s));
          if (s === 0) s = 1;
          st.weights[st.drag].s = s;
        },
        up: function () {
          if (st.drag >= 0) {
            var w = st.weights[st.drag];
            api.note('把钩码移到' + (w.s < 0 ? '左' : '右') + Math.abs(w.s) + ' cm 处（力臂 ' + Math.abs(w.s) + ' cm）', 'note');
            api.save();
          }
          st.drag = -1;
        },
        cursor: function (p) {
          for (var i = 0; i < st.weights.length; i++) {
            var a = posOf(st.weights[i].s);
            if (Math.abs(p.x - a.x) < 26 && p.y > a.y - 8 && p.y < a.y + 46) return 'grab';
          }
          return 'default';
        },

        readings: function () {
          var m = moments();
          var tw = pivotTorque();
          var empty = (st.weights.length === 0);
          var bal = !empty && Math.abs(tw) < 0.004 && Math.abs(st.omega) < 0.01;
          var deg = Math.abs(st.theta * 180 / Math.PI);
          return [
            { label: '左力矩', value: m.L.toFixed(2), unit: 'N·m' },
            { label: '右力矩', value: m.R.toFixed(2), unit: 'N·m' },
            { label: '倾斜', value: deg < 0.6 ? '水平' : ((st.theta > 0 ? '右端下沉 ' : '左端下沉 ') + deg.toFixed(1) + '°') },
            { label: '状态', value: empty ? '空载' : (bal ? '平衡' : '不平衡'), tone: bal ? 'ok' : (empty ? '' : 'warn') }
          ];
        },
        dataRow: function () {
          var m = moments();
          var bal = Math.abs(pivotTorque()) < 0.004 && Math.abs(st.omega) < 0.01;
          return [String(m.nl), m.L.toFixed(2), String(m.nr), m.R.toFixed(2), bal ? '平衡' : '不平衡'];
        },
        snapshot: function () {
          var m = moments();
          return '杠杆：左' + m.nl + '只/' + m.L.toFixed(2) + 'N·m，右' + m.nr + '只/' + m.R.toFixed(2) + 'N·m，倾角' + (st.theta * 180 / Math.PI).toFixed(1) + '°';
        },

        draw: function (ctx) {
          // 桌面
          g.line(ctx, 120, 566, 880, 566, { color: '#6f6c64', w: 2 });
          g.hatch(ctx, [[120, 566], [880, 566], [880, 586], [120, 586]], { color: '#6f6c64', gap: 10, alpha: .22 });

          // 支架
          g.line(ctx, PIVOT.x, PIVOT.y + 8, PIVOT.x, 566, { color: '#4b4a41', w: 2.2 });
          g.line(ctx, PIVOT.x - 62, 566, PIVOT.x + 62, 566, { color: '#4b4a41', w: 3 });
          g.poly(ctx, [[PIVOT.x - 16, PIVOT.y + 34], [PIVOT.x, PIVOT.y + 6], [PIVOT.x + 16, PIVOT.y + 34]],
            { color: '#4b4a41', w: 1.6, fill: '#ded8c9', fillAlpha: .5 });
          g.hatch(ctx, [[PIVOT.x - 16, PIVOT.y + 34], [PIVOT.x, PIVOT.y + 6], [PIVOT.x + 16, PIVOT.y + 34]],
            { color: '#6f6c64', gap: 5, alpha: .28 });
          g.text(ctx, PIVOT.x + 24, PIVOT.y + 44, '支点', { size: 11, color: '#ad1f26', italic: true });

          // 杠杆（有厚度）
          var a0 = posOf(-HALF), a1 = posOf(HALF);
          var nx = -Math.sin(st.theta), ny = Math.cos(st.theta);
          var hw = 7;
          g.poly(ctx, [
            [a0.x + nx * hw, a0.y + ny * hw], [a1.x + nx * hw, a1.y + ny * hw],
            [a1.x - nx * hw, a1.y - ny * hw], [a0.x - nx * hw, a0.y - ny * hw]
          ], { color: '#3a3830', w: 1.6, fill: '#efe4c8', fillAlpha: .85 });
          // 刻度
          for (var s = -HALF; s <= HALF; s += 5) {
            if (s === 0) continue;
            var p = posOf(s);
            var L = (s % 10 === 0) ? 8 : 5;
            g.line(ctx, p.x + nx * (hw - 1), p.y + ny * (hw - 1), p.x + nx * (hw - 1 - L), p.y + ny * (hw - 1 - L),
              { color: '#6f6c64', w: 1, alpha: .8 });
            if (s % 10 === 0) {
              g.text(ctx, p.x + nx * (hw + 11), p.y + ny * (hw + 11), String(Math.abs(s) / 1).replace('.0', ''),
                { size: 9, color: '#6f6c64', align: 'center' });
            }
          }
          // 中心线
          g.line(ctx, PIVOT.x, PIVOT.y - 26, PIVOT.x, PIVOT.y + 22, { color: '#ad1f26', w: 1.1, alpha: .55, dash: [4, 4] });

          // 钩码
          var maxL = 0, maxR = 0;
          st.weights.forEach(function (w) {
            if (w.s < 0) maxL = Math.max(maxL, -w.s); else maxR = Math.max(maxR, w.s);
          });
          st.weights.forEach(function (w, i) {
            var pt = posOf(w.s);
            var dragging = st.drag === i;
            g.line(ctx, pt.x, pt.y + 6, pt.x, pt.y + 20, { color: '#4b4a41', w: 1.4, alpha: .9 });
            // 挂钩
            g.arc(ctx, pt.x, pt.y + 22, 4, Math.PI, 0, { color: '#4b4a41', w: 1.2 });
            var bx = pt.x - 13, by = pt.y + 24;
            g.rect(ctx, bx, by, 26, 24, {
              color: dragging ? '#33507d' : '#3a3830', w: 1.3,
              fill: dragging ? '#e8eef7' : '#d8cbab', fillAlpha: .85
            });
            g.text(ctx, pt.x, by + 16, '50g', { size: 9, color: '#16150f', align: 'center' });
            // 力臂虚线：只标每一侧最外面那只，避免字叠在一起
            var isOuter = (w.s < 0 ? (-w.s === maxL) : (w.s === maxR));
            if (isOuter && Math.abs(w.s) >= 5) {
              g.line(ctx, pt.x, by + 26, PIVOT.x, by + 26, { color: '#33507d', w: 1, alpha: .35, dash: [3, 4] });
              g.text(ctx, (pt.x + PIVOT.x) / 2, by + 40, Math.abs(w.s) + ' cm', { size: 10, color: '#33507d', align: 'center', italic: true });
            }
          });

          // 力矩批注
          var m = moments();
          g.text(ctx, 130, 120, '左侧力矩  ' + m.L.toFixed(2) + ' N·m', { size: 13, color: m.nl ? '#ad1f26' : '#8b8880' });
          g.text(ctx, 130, 142, '右侧力矩  ' + m.R.toFixed(2) + ' N·m', { size: 13, color: m.nr ? '#ad1f26' : '#8b8880' });
          if (m.nl + m.nr === 0) {
            g.text(ctx, 500, 200, '先从左边器材架拿钩码，挂到杠杆上', { size: 15, color: '#33507d', align: 'center', italic: true });
            g.arrow(ctx, 760, 230, 520, 330, { color: '#33507d', w: 1.2, alpha: .55, dash: [5, 4] });
          }
        }
      };
    }
  });
})();
