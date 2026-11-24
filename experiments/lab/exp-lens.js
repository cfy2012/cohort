/* ============================================================
   实验 02 · 凸透镜成像
   真实薄透镜作图：1/f = 1/u + 1/v，三条特殊光线逐条画出来
   光屏离焦 → 像变模糊（模糊量按离焦距离实时算）
   ============================================================ */
(function () {
  'use strict';
  var g = window.CohortLab.G;

  var AXIS = 340;       // 光轴
  var RAIL = 474;       // 光具座导轨
  var PXCM = 8;         // 1 cm = 8 px
  var X0 = 80;          // 0 cm 的 x
  var LENS_CM = 45;
  var F = 10;           // 焦距 10 cm

  function px(cm) { return X0 + cm * PXCM; }

  window.CohortLab.register({
    id: 'lens',
    name: '凸透镜成像',
    group: '光学',
    grade: '八年级上',
    aim: '改变蜡烛到凸透镜的距离，找出 u>2f、f<u<2f、u<f 三种情况的成像规律。',
    formula: '1/f = 1/u + 1/v',
    tip: '把蜡烛、凸透镜、光屏依次放上光具座，再拖动蜡烛和光屏。',
    steps: [
      '在光具座上依次放蜡烛、凸透镜、光屏',
      '把蜡烛放在 2f 以外，移动光屏找到清晰的像',
      '把蜡烛移到 f 与 2f 之间，再找一次清晰的像',
      '把蜡烛移到焦点以内，光屏上还能接到像吗？'
    ],
    columns: ['物距 u/cm', '像距 v/cm', '像的性质', '放大率'],
    tableHint: 'v 为负表示虚像',
    tools: [
      { id: 'bench', icon: 'bench', name: '光具座', hint: '带刻度的导轨' },
      { id: 'candle', icon: 'candle', name: '蜡烛', hint: '做物体，高约 5 cm' },
      { id: 'lens', icon: 'lens', name: '凸透镜', hint: 'f = 10 cm' },
      { id: 'screen', icon: 'screen', name: '光屏', hint: '用来承接实像' }
    ],
    ask: ['为什么物距小于焦距时找不到像？', '像距和物距是什么关系？', '怎么判断像是放大还是缩小？'],

    create: function (api) {
      var st = {
        candleCm: 15,
        screenCm: 75,
        drag: null,
        t: 0,
        clearMarked: false,
        tipShown: false
      };
      api.placed.add('bench');

      var lensX = px(LENS_CM);

      function u() { return LENS_CM - st.candleCm; }
      function v() {
        var uu = u();
        var den = 1 / F - 1 / uu;
        if (Math.abs(den) < 1e-4) return Infinity;
        return 1 / den;
      }
      function objH() { return 5 * PXCM; }
      function imgH() {
        var vv = v();
        if (!isFinite(vv)) return Infinity;
        return -objH() * vv / u();
      }
      function nature() {
        var uu = u(), vv = v();
        if (!isFinite(vv)) return '不成像（平行光）';
        if (vv > 0) {
          var m = Math.abs(vv / uu);
          return '倒立、' + (m > 1.05 ? '放大' : (m < 0.95 ? '缩小' : '等大')) + '的实像';
        }
        return '正立、放大的虚像（光屏接不到）';
      }

      function tipY() { return AXIS - objH(); }

      return {
        placed: api.placed,
        onPlace: function (id) {
          if (id === 'candle') api.note('把蜡烛放在光具座 ' + st.candleCm + ' cm 处', 'note');
          if (id === 'lens') api.note('放上凸透镜（f = 10 cm），固定在 ' + LENS_CM + ' cm 处', 'note');
          if (id === 'screen') api.note('放上光屏，准备承接实像', 'note');
        },
        onRemove: function (id) {
          if (id === 'screen') api.note('取走光屏', 'note');
        },
        reset: function () {
          st.candleCm = 15; st.screenCm = 75; st.drag = null; st.clearMarked = false;
          api.placed.clear(); api.placed.add('bench');
          api.note('复位：只留光具座', 'note');
        },

        step: function (dt) { st.t += dt; },

        down: function (p) {
          if (api.placed.has('candle') && Math.abs(p.x - px(st.candleCm)) < 30 && p.y > 250 && p.y < 480) { st.drag = 'candle'; return true; }
          if (api.placed.has('screen') && Math.abs(p.x - px(st.screenCm)) < 30 && p.y > 230 && p.y < 480) { st.drag = 'screen'; return true; }
          return false;
        },
        move: function (p) {
          if (!st.drag) return;
          var cm = Math.round((p.x - X0) / PXCM);
          if (st.drag === 'candle') st.candleCm = Math.max(2, Math.min(LENS_CM - 2, cm));
          else st.screenCm = Math.max(LENS_CM + 2, Math.min(102, cm));
        },
        up: function () {
          if (st.drag === 'candle') api.note('蜡烛移到 ' + st.candleCm + ' cm 处，物距 u = ' + u().toFixed(0) + ' cm', 'note');
          if (st.drag === 'screen') api.note('光屏移到 ' + st.screenCm + ' cm 处', 'note');
          if (st.drag) api.save();
          st.drag = null;
        },
        cursor: function (p) {
          if (api.placed.has('candle') && Math.abs(p.x - px(st.candleCm)) < 30 && p.y > 250 && p.y < 480) return 'grab';
          if (api.placed.has('screen') && Math.abs(p.x - px(st.screenCm)) < 30 && p.y > 230 && p.y < 480) return 'grab';
          return 'default';
        },

        readings: function () {
          var haveObj = api.placed.has('candle'), haveLens = api.placed.has('lens'), haveScr = api.placed.has('screen');
          var uu = u(), vv = v();
          var out = [
            { label: '物距 u', value: haveObj ? uu.toFixed(1) : '—', unit: 'cm' },
            { label: '像距 v', value: (haveObj && haveLens && isFinite(vv)) ? vv.toFixed(1) : '—', unit: 'cm' },
            { label: '放大率', value: (haveObj && haveLens && isFinite(vv)) ? Math.abs(vv / uu).toFixed(2) : '—', unit: '×' }
          ];
          var imgX = lensX + (isFinite(vv) ? vv * PXCM : 0);
          var sharp = haveObj && haveLens && haveScr && isFinite(vv) && vv > 0 && Math.abs(px(st.screenCm) - imgX) < PXCM * 0.6;
          out.push({
            label: '光屏',
            value: !haveScr ? '未放光屏' : (!haveLens || !haveObj ? '缺器材' : (sharp ? '清晰的像' : (isFinite(vv) && vv > 0 ? '没对准（模糊）' : '接不到像'))),
            tone: sharp ? 'ok' : 'warn'
          });
          return out;
        },
        dataRow: function () {
          var vv = v();
          return [u().toFixed(0), isFinite(vv) ? vv.toFixed(1) : '∞', nature(), isFinite(vv) ? Math.abs(vv / u()).toFixed(2) : '—'];
        },
        snapshot: function () {
          var missing = ['candle', 'lens', 'screen'].filter(function (k) { return !api.placed.has(k); });
          var nm = { candle: '蜡烛', lens: '凸透镜', screen: '光屏' };
          return '光具座：蜡烛 ' + st.candleCm + 'cm，凸透镜 ' + LENS_CM + 'cm(f=10)，光屏 ' + st.screenCm + 'cm；'
            + (missing.length ? '还没放：' + missing.map(function (k) { return nm[k]; }).join('、') : '器材已放齐')
            + '；u=' + u() + 'cm，v=' + (isFinite(v()) ? v().toFixed(1) : '∞') + 'cm，' + nature();
        },

        draw: function (ctx) {
          // ---- 光具座
          g.line(ctx, X0 - 10, RAIL, px(106), RAIL, { color: '#4b4a41', w: 2.2 });
          g.line(ctx, X0 - 10, RAIL + 10, px(106), RAIL + 10, { color: '#4b4a41', w: 1.2, alpha: .7 });
          g.hatch(ctx, [[X0 - 10, RAIL], [px(106), RAIL], [px(106), RAIL + 8], [X0 - 10, RAIL + 8]],
            { color: '#6f6c64', gap: 9, alpha: .2 });
          for (var c = 0; c <= 100; c += 5) {
            var x = px(c);
            var big = c % 10 === 0;
            g.line(ctx, x, RAIL, x, RAIL + (big ? 14 : 8), { color: '#6f6c64', w: 1, alpha: big ? .85 : .5 });
            if (big) g.text(ctx, x, RAIL + 26, String(c), { size: 10, color: '#6f6c64', align: 'center' });
          }
          g.text(ctx, X0 + 34, RAIL + 44, '光具座 / cm', { size: 10, color: '#8b8880', italic: true });

          // ---- 透镜（固定）
          if (api.placed.has('lens')) {
            drawLens(ctx, lensX);
            g.text(ctx, lensX, RAIL + 60, '凸透镜 f=10cm', { size: 10, color: '#33507d', align: 'center', italic: true });
            // 焦点
            [LENS_CM - F, LENS_CM + F].forEach(function (fc, i) {
              var fx = px(fc);
              g.line(ctx, fx - 4, AXIS - 4, fx + 4, AXIS + 4, { color: '#ad1f26', w: 1, alpha: .7 });
              g.line(ctx, fx - 4, AXIS + 4, fx + 4, AXIS - 4, { color: '#ad1f26', w: 1, alpha: .7 });
              g.text(ctx, fx, AXIS + 18, i ? "F′" : 'F', { size: 11, color: '#ad1f26', align: 'center', italic: true });
            });
          }

          // ---- 蜡烛
          if (api.placed.has('candle')) {
            var cx = px(st.candleCm);
            g.line(ctx, cx, RAIL, cx, 412, { color: '#4b4a41', w: 1.2, alpha: .7 });
            g.line(ctx, cx - 18, RAIL + 4, cx + 18, RAIL + 4, { color: '#4b4a41', w: 2 });
            // 烛身
            g.rect(ctx, cx - 9, 306, 18, 104, { color: '#4b4a41', w: 1.3, fill: '#f2e7c6', fillAlpha: .85 });
            g.line(ctx, cx - 9, 330, cx + 9, 334, { color: '#e8e2d3', w: 1, alpha: .8 });
            g.line(ctx, cx - 9, 356, cx + 9, 352, { color: '#e8e2d3', w: 1, alpha: .8 });
            // 焰
            var wob = Math.sin(st.t * 7) * 1.2 + Math.sin(st.t * 3.1) * 1.8;
            g.poly(ctx, [
              [cx, 286 + wob], [cx + 7, 300], [cx + 3, 306], [cx - 3, 306], [cx - 7, 300]
            ], { color: '#ad1f26', w: 1.2, fill: '#f6d27a', fillAlpha: .55 });
            // 物高箭头
            g.arrow(ctx, cx, AXIS, cx, AXIS - objH() + 2, { color: '#33507d', w: 1.2, alpha: .8 });
            g.text(ctx, cx - 16, AXIS + 16, '物', { size: 11, color: '#33507d', align: 'right', italic: true });
            // 物距
            g.dim(ctx, cx, AXIS + 46, lensX, AXIS + 46, 'u = ' + u().toFixed(0) + ' cm', { color: '#33507d' });
          }

          // ---- 光屏
          if (api.placed.has('screen')) {
            var sx = px(st.screenCm);
            g.line(ctx, sx, RAIL, sx, 232, { color: '#4b4a41', w: 1.2, alpha: .7 });
            g.rect(ctx, sx - 9, 218, 18, 200, { color: '#4b4a41', w: 1.2, fill: '#fbf6e6', fillAlpha: .9 });
            g.hatch(ctx, [[sx - 9, 218], [sx + 9, 218], [sx + 9, 418], [sx - 9, 418]], { color: '#6f6c64', gap: 6, alpha: .22 });
            g.text(ctx, sx, RAIL + 44, '光屏', { size: 10, color: '#3a3830', align: 'center' });
          }

          // ---- 三条特殊光线 + 像
          if (api.placed.has('candle') && api.placed.has('lens')) {
            var yTip = tipY();
            var vv = v();
            var imgX = lensX + (isFinite(vv) ? vv * PXCM : 0);
            var faded = '#4a6fa5';

            // 1) 平行于主光轴 → 过 F′
            g.line(ctx, cx, yTip, lensX, yTip, { color: faded, w: 1.1, alpha: .55 });
            if (isFinite(vv)) {
              var k1 = (AXIS - yTip) / (px(LENS_CM + F) - lensX);
              var endX = 960;
              var endY = yTip + k1 * (endX - lensX);
              g.line(ctx, lensX, yTip, endX, endY, { color: faded, w: 1.1, alpha: .5 });
            } else {
              g.line(ctx, lensX, yTip, 960, yTip, { color: faded, w: 1.1, alpha: .4, dash: [4, 4] });
            }

            // 2) 过光心
            var k2 = (AXIS - yTip) / (lensX - cx);
            var y2 = yTip + k2 * (960 - cx);
            g.line(ctx, cx, yTip, lensX, AXIS, { color: faded, w: 1.1, alpha: .5 });
            g.line(ctx, lensX, AXIS, 960, y2, { color: faded, w: 1.1, alpha: .45 });

            // 3) 过 F → 出射平行
            var fL = px(LENS_CM - F);
            var k3 = (AXIS - yTip) / (fL - cx);
            var yAtLens = yTip + k3 * (lensX - cx);
            if (Math.abs(yAtLens - AXIS) < 400) {
              g.line(ctx, cx, yTip, lensX, yAtLens, { color: faded, w: 1, alpha: .38, dash: [5, 3] });
              g.line(ctx, lensX, yAtLens, 960, yAtLens, { color: faded, w: 1, alpha: .38, dash: [5, 3] });
            }

            // 像
            if (isFinite(vv) && objH() > 0) {
              var iy = AXIS + imgH();
              if (imgX > lensX) {
                g.arrow(ctx, imgX, AXIS, imgX, iy, { color: '#ad1f26', w: 1.4, alpha: .85 });
                g.text(ctx, imgX + 10, iy + (iy > AXIS ? 14 : -6), '实像', { size: 11, color: '#ad1f26', italic: true });
                g.dim(ctx, lensX, AXIS + 62, imgX, AXIS + 62, 'v = ' + vv.toFixed(0) + ' cm', { color: '#ad1f26' });
              } else {
                // 虚像：反向延长
                var vx = lensX + vv * PXCM;
                g.line(ctx, lensX, yTip, vx, AXIS + imgH(), { color: '#6b4b86', w: 1, alpha: .45, dash: [5, 4] });
                g.arrow(ctx, vx, AXIS, vx, AXIS + imgH(), { color: '#6b4b86', w: 1.4, alpha: .8 });
                g.text(ctx, vx - 10, AXIS + imgH() - 8, '虚像', { size: 11, color: '#6b4b86', align: 'right', italic: true });
              }
            }

            // 光屏上的像斑（离焦越远越糊）
            if (api.placed.has('screen') && isFinite(vv) && vv > 0) {
              var sx2 = px(st.screenCm);
              var defocus = Math.abs(st.screenCm - (LENS_CM + vv));
              var sharp = defocus < 0.6;
              var alpha = Math.max(0.16, 0.9 / (1 + defocus * 0.35));
              var blur = sharp ? 0.4 : Math.min(16, 1 + defocus * 2.2);
              ctx.save();
              if (ctx.filter !== undefined) ctx.filter = 'blur(' + blur + 'px)';
              // 屏上的像：倒立的烛焰
              g.arrow(ctx, sx2, AXIS, sx2, AXIS + imgH(), { color: '#c9782a', w: 2.6, alpha: alpha });
              ctx.globalAlpha = alpha * .75;
              ctx.fillStyle = '#f2c063';
              ctx.beginPath();
              ctx.ellipse(sx2, AXIS + imgH(), 6, Math.min(9, 4 + Math.abs(imgH()) / 12), 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.filter = 'none';
              ctx.restore();
              if (sharp && !st.clearMarked) {
                st.clearMarked = true;
                api.stamp('光屏上出现清晰的像');
                api.note('u=' + u().toFixed(0) + 'cm，v=' + vv.toFixed(0) + 'cm，' + nature(), 'ok');
                api.save();
              }
              if (!sharp) st.clearMarked = false;
            }
          }

          // 缺器材提示
          var missing = ['candle', 'lens', 'screen'].filter(function (k) { return !api.placed.has(k); });
          if (missing.length) {
            var names = { candle: '蜡烛', lens: '凸透镜', screen: '光屏' };
            g.text(ctx, 500, 120, '还缺：' + missing.map(function (k) { return names[k]; }).join('、') + '（从左边器材架拿）',
              { size: 14, color: '#33507d', align: 'center', italic: true });
          }
        }
      };

      function drawLens(ctx, lx) {
        var h = 26, bulge = 11;
        // 双凸透镜：两条二次曲线围成的柳叶形
        var right = [], left = [];
        for (var i = 0; i <= 18; i++) {
          var t = i / 18;
          var y = AXIS - h + 2 * h * t;
          var tt = 1 - t;
          var xr = tt * tt * lx + 2 * tt * t * (lx + bulge * 2) + t * t * lx;
          var xl = tt * tt * lx + 2 * tt * t * (lx - bulge * 2) + t * t * lx;
          right.push([xr, y]);
          left.push([xl, y]);
        }
        var outline = right.concat(left.reverse());
        ctx.save();
        ctx.globalAlpha = .20; ctx.fillStyle = '#9fc0dd';
        ctx.beginPath();
        outline.forEach(function (p, i) { if (!i) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
        ctx.closePath(); ctx.fill();
        ctx.restore();
        g.poly(ctx, outline, { color: '#3a3830', w: 1.5, closed: true, jit: .8 });
        // 高光
        g.line(ctx, lx - 5, AXIS - 16, lx - 2, AXIS - 4, { color: '#fff', w: 2, alpha: .55 });
        g.line(ctx, lx - 1, AXIS - 5, lx - 1, AXIS + 6, { color: '#ad1f26', w: 1.1, alpha: .55 });
        // 支架
        g.line(ctx, lx, AXIS + h, lx, RAIL, { color: '#4b4a41', w: 1.2, alpha: .8 });
        g.line(ctx, lx - 16, RAIL + 3, lx + 16, RAIL + 3, { color: '#4b4a41', w: 2 });
      }
    }
  });
})();
