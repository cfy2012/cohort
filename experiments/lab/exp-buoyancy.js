/* ============================================================
   实验 04 · 探究浮力大小
   真实阿基米德：F浮 = ρ水 g V排，测力计示数 = G − F浮
   水槽上移 → 排开水的体积变大 → 水面上升（V排 / 容器底面积）
   ============================================================ */
(function () {
  'use strict';
  var g = window.CohortLab.G;

  var PXCM = 9;
  var R_CM = 2, H_CM = 10;              // 圆柱体半径 / 高
  var RHO_OBJ = 1.2;                    // g/cm³
  var V_OBJ = Math.PI * R_CM * R_CM * H_CM;   // ≈125.7 cm³
  var G_OBJ = RHO_OBJ * V_OBJ / 1000 * 9.8;   // ≈1.478 N
  var BEAKER_AREA = 16 * 16;            // cm²
  var WATER_BASE = 455;                 // 水面初始 y
  var OBJ_BOTTOM = 420;                 // 圆柱体底 y
  var BEAKER_TOP = 380, BEAKER_W = 16 * PXCM;
  var BEAKER_X = 480;

  window.CohortLab.register({
    id: 'buoyancy',
    name: '浮力大小',
    grade: '八年级下',
    aim: '把圆柱体慢慢浸入水中，看弹簧测力计示数怎么变，找出 F浮 与 V排 的关系。',
    formula: 'F浮 = ρ水 g V排',
    tip: '先放上水槽，再把水槽往上推——物体不动，水面升高，这样才和真实实验一致。',
    steps: [
      '把水槽放到圆柱体正下方',
      '记下物体在空气中的测力计示数（即重力 G）',
      '慢慢上推水槽，让物体逐渐浸入，记 3 组 V排 与 F浮',
      '物体完全浸没后再上推，示数还会变吗？'
    ],
    columns: ['V排/cm³', 'F浮/N'],
    tableHint: '浸没前后各记两组',
    tools: [
      { id: 'spring', icon: 'spring', name: '铁架台 + 测力计', hint: '0~5 N，测重力与拉力' },
      { id: 'cylinder', icon: 'cylinder', name: '圆柱体', hint: 'ρ=1.2 g/cm³，V≈126 cm³' },
      { id: 'beaker', icon: 'beaker', name: '水槽', hint: '装水，可上下来回推' }
    ],
    ask: ['为什么浸没后浮力不再变大？', '浮力和物体重力有关系吗？', '水面为什么会上升？'],

    create: function (api) {
      var st = { lift: 0, drag: false, t: 0, entered: false, full: false, grabY: 0, lift0: 0 };
      api.placed.add('spring');
      api.placed.add('cylinder');

      function waterSurface() {
        var risePx = 0;
        for (var i = 0; i < 3; i++) {
          var ws = WATER_BASE - st.lift - risePx;
          var depthPx = Math.max(0, Math.min(H_CM * PXCM, OBJ_BOTTOM - ws));
          var vsub = Math.PI * R_CM * R_CM * (depthPx / PXCM);
          risePx = (vsub / BEAKER_AREA) * PXCM;
        }
        return { y: WATER_BASE - st.lift - risePx, rise: risePx };
      }
      function calc() {
        var ws = waterSurface().y;
        var depthPx = api.placed.has('beaker') ? Math.max(0, Math.min(H_CM * PXCM, OBJ_BOTTOM - ws)) : 0;
        var depthCm = depthPx / PXCM;
        var vsub = Math.PI * R_CM * R_CM * depthCm;
        var fb = 1000 * 9.8 * vsub * 1e-6;
        return { depth: depthCm, vsub: vsub, fb: fb, reading: Math.max(0, G_OBJ - fb), ws: ws };
      }

      return {
        placed: api.placed,
        onPlace: function (id) {
          if (id === 'beaker') api.note('把水槽放到圆柱体正下方，水面距物体底部还有一段距离', 'note');
        },
        onRemove: function (id) { if (id === 'beaker') st.lift = 0; },
        reset: function () {
          st.lift = 0; st.drag = false; st.entered = false; st.full = false;
          api.placed.clear(); api.placed.add('spring'); api.placed.add('cylinder');
          api.note('复位：取下水槽，物体回到空气中', 'note');
        },

        step: function (dt) { st.t += dt; },

        down: function (p) {
          if (!api.placed.has('beaker')) return false;
          var top = BEAKER_TOP - st.lift, bottom = 556 - st.lift;
          if (p.x > BEAKER_X - BEAKER_W / 2 - 10 && p.x < BEAKER_X + BEAKER_W / 2 + 10 && p.y > top - 16 && p.y < bottom) {
            st.drag = true; st.grabY = p.y; st.lift0 = st.lift; return true;
          }
          return false;
        },
        move: function (p) {
          if (!st.drag) return;
          st.lift = Math.max(0, Math.min(132, st.lift0 + (st.grabY - p.y)));
        },
        up: function () {
          if (st.drag) {
            var c = calc();
            api.note('水槽上推 ' + st.lift.toFixed(0) + ' px，浸入 ' + c.depth.toFixed(1) + ' cm，F浮 = ' + c.fb.toFixed(2) + ' N', 'obs');
            api.save();
          }
          st.drag = false;
        },
        cursor: function (p) {
          if (!api.placed.has('beaker')) return 'default';
          var top = BEAKER_TOP - st.lift, bottom = 556 - st.lift;
          if (p.x > BEAKER_X - BEAKER_W / 2 - 10 && p.x < BEAKER_X + BEAKER_W / 2 + 10 && p.y > top - 16 && p.y < bottom) return 'grab';
          return 'default';
        },

        readings: function () {
          var c = calc();
          var fullNow = c.depth >= H_CM - 0.15;
          if (c.depth > 0.3 && !st.entered) {
            st.entered = true;
            api.note('物体开始浸入水中，测力计示数开始变小', 'obs');
          }
          if (fullNow && !st.full) {
            st.full = true;
            api.stamp('浸没后 F浮 = ρ水 g V排 不再变');
            api.note('完全浸没：V排 = ' + c.vsub.toFixed(0) + ' cm³，F浮 = ' + c.fb.toFixed(2) + ' N', 'ok');
            api.save();
          }
          return [
            { label: '示数 F', value: c.reading.toFixed(2), unit: 'N' },
            { label: 'F浮', value: c.fb.toFixed(2), unit: 'N' },
            { label: 'V排', value: c.vsub.toFixed(0), unit: 'cm³' },
            { label: '浸入', value: c.depth.toFixed(1), unit: 'cm' },
            { label: '状态', value: fullNow ? '浸没' : (c.depth > 0.2 ? '部分浸入' : '空气中'), tone: fullNow ? 'ok' : '' }
          ];
        },
        dataRow: function () {
          var c = calc();
          if (c.depth < 0.2) return null;
          return [c.vsub.toFixed(0), c.fb.toFixed(2)];
        },
        snapshot: function () {
          var c = calc();
          return '浮力：物体 G=' + G_OBJ.toFixed(2) + 'N，浸入' + c.depth.toFixed(1) + 'cm，V排=' + c.vsub.toFixed(0) + 'cm³，F浮=' + c.fb.toFixed(2) + 'N，测力计示数' + c.reading.toFixed(2) + 'N';
        },
        hint: function () {
          if (!api.placed.has('beaker')) return '先把水槽放上台';
          return st.drag ? '继续上推 / 下拉' : '按住水槽上下推';
        },

        draw: function (ctx) {
          var c = calc();

          // 桌面
          g.line(ctx, 120, 566, 890, 566, { color: '#6f6c64', w: 2 });
          g.hatch(ctx, [[120, 566], [890, 566], [890, 586], [120, 586]], { color: '#6f6c64', gap: 10, alpha: .22 });

          // ---- 铁架台
          g.line(ctx, 300, 110, 300, 560, { color: '#3a3830', w: 3 });
          g.line(ctx, 240, 560, 366, 560, { color: '#3a3830', w: 4 });
          g.hatch(ctx, [[240, 560], [366, 560], [366, 568], [240, 568]], { color: '#6f6c64', gap: 8, alpha: .3 });
          g.line(ctx, 300, 140, 486, 140, { color: '#3a3830', w: 3 });
          g.circle(ctx, 300, 140, 6, { color: '#3a3830', w: 1.2 });

          // ---- 弹簧测力计
          if (api.placed.has('spring')) {
            var cx = 480;
            g.line(ctx, cx, 140, cx, 156, { color: '#3a3830', w: 1.6 });
            g.rect(ctx, cx - 30, 156, 60, 174, { color: '#3a3830', w: 1.4, fill: '#fdfcf8', fillAlpha: .9 });
            g.line(ctx, cx - 22, 170, cx + 22, 170, { color: '#d6d2c6', w: 1 });
            // 刻度 0~5 N
            for (var i = 0; i <= 10; i++) {
              var y = 180 + i * 13.5;
              g.line(ctx, cx - 22, y, cx + (i % 2 === 0 ? -8 : -14), y, { color: '#6f6c64', w: 1, alpha: .8 });
              if (i % 2 === 0) g.text(ctx, cx - 26, y + 4, String(5 - i / 2), { size: 9, color: '#8b8880', align: 'right' });
            }
            // 红色指针（示数）
            var py = 180 + (1 - c.reading / 5) * 135;
            g.line(ctx, cx - 26, py, cx + 24, py, { color: '#ad1f26', w: 1.6 });
            g.text(ctx, cx + 36, 196, c.reading.toFixed(2) + ' N', { size: 13, color: '#ad1f26' });
            // 弹簧
            g.coil(ctx, cx - 8, 176, 16, 4, 3, { color: '#6f6c64', w: 1, alpha: .5 });
            g.line(ctx, cx, 330, cx, 344, { color: '#3a3830', w: 1.6 });
            g.arc(ctx, cx, 346, 5, Math.PI * 1.1, Math.PI * 1.9, { color: '#3a3830', w: 1.2 });
            g.text(ctx, cx - 44, 170, '弹簧测力计', { size: 10, color: '#4b4a41', align: 'right' });
          }

          // ---- 水槽
          if (api.placed.has('beaker')) {
            var top = BEAKER_TOP - st.lift, bottom = 556 - st.lift;
            var ws = c.ws;
            var left = BEAKER_X - BEAKER_W / 2, right = BEAKER_X + BEAKER_W / 2;
            // 玻璃
            g.poly(ctx, [[left, top], [right, top], [right, bottom], [left, bottom]], { color: '#4b4a41', w: 1.4 });
            g.line(ctx, left + 8, top, left + 8, bottom - 6, { color: '#a8c6e2', w: 1, alpha: .5 });
            // 水
            ctx.save();
            ctx.globalAlpha = .16; ctx.fillStyle = '#79a9d6';
            ctx.fillRect(left + 2, ws, BEAKER_W - 4, bottom - ws - 1);
            ctx.restore();
            // 水面波纹
            for (var wv = 0; wv < 2; wv++) {
              var pts = [];
              for (var k = 0; k <= 12; k++) {
                var xx = left + 3 + (BEAKER_W - 6) * k / 12;
                pts.push([xx, ws + wv * 3 + Math.sin(k * 0.9 + st.t * 2.4 + wv) * 1.6]);
              }
              g.linePath(ctx, pts, { color: '#33507d', w: 1.1, alpha: wv ? .35 : .7 }, false);
            }
            g.hatch(ctx, [[left + 3, ws], [right - 3, ws], [right - 3, bottom - 3], [left + 3, bottom - 3]],
              { color: '#33507d', gap: 9, alpha: .12 });
            // 标注（都写在玻璃里面，避免和箭头打架）
            g.text(ctx, left + 8, bottom - 26, '水槽', { size: 10, color: '#4b4a41' });
            g.text(ctx, left + 8, bottom - 13, '底面积 256 cm²', { size: 9, color: '#8b8880' });
            // 水面标注
            g.line(ctx, left - 9, ws, left, ws, { color: '#33507d', w: 1, alpha: .8 });
            g.text(ctx, left + 8, ws + 14, '水面', { size: 10, color: '#33507d', italic: true });
          }

          // ---- 圆柱体
          if (api.placed.has('cylinder')) {
            var cx2 = 480;
            var top2 = OBJ_BOTTOM - H_CM * PXCM;
            g.rect(ctx, cx2 - R_CM * PXCM, top2, R_CM * 2 * PXCM, H_CM * PXCM,
              { color: '#3a3830', w: 1.4, fill: '#e6d6b0', fillAlpha: .8 });
            g.arc(ctx, cx2, top2, R_CM * PXCM, Math.PI, 0, { color: '#3a3830', w: 1.2, alpha: .7 });
            g.arc(ctx, cx2, OBJ_BOTTOM, R_CM * PXCM, 0, Math.PI, { color: '#3a3830', w: 1.2, alpha: .55 });
            g.text(ctx, cx2, top2 + 52, 'ρ=1.2', { size: 9, color: '#16150f', align: 'center' });
            g.text(ctx, cx2, top2 + 66, 'g/cm³', { size: 9, color: '#16150f', align: 'center' });

            // 浸入部分阴影
            if (c.depth > 0.1) {
              ctx.save();
              ctx.globalAlpha = .22; ctx.fillStyle = '#33507d';
              ctx.fillRect(cx2 - R_CM * PXCM, Math.max(top2, c.ws), R_CM * 2 * PXCM, OBJ_BOTTOM - Math.max(top2, c.ws));
              ctx.restore();
            }
            // 重力箭头
            g.arrow(ctx, cx2 - 70, top2 + 34, cx2 - 70, top2 + 76, { color: '#3a3830', w: 1.2, alpha: .7 });
            g.text(ctx, cx2 - 78, top2 + 58, 'G=' + G_OBJ.toFixed(2) + 'N', { size: 10, color: '#3a3830', align: 'right' });
            if (c.fb > 0.02) {
              g.arrow(ctx, cx2 + 74, OBJ_BOTTOM - 42, cx2 + 74, OBJ_BOTTOM - 86, { color: '#33507d', w: 1.2, alpha: .8 });
              g.text(ctx, cx2 + 82, OBJ_BOTTOM - 60, 'F浮=' + c.fb.toFixed(2) + 'N', { size: 10, color: '#33507d' });
            }
          }

          // ---- 批注
          g.text(ctx, 130, 96, 'F浮 = ρ水 g V排', { size: 15, color: '#ad1f26' });
          g.text(ctx, 130, 116, 'G物 = ρ物 V物 g = ' + G_OBJ.toFixed(2) + ' N', { size: 12, color: '#3a3830' });
          g.text(ctx, 130, 136, '测力计示数 = G − F浮', { size: 12, color: '#3a3830' });

          if (!api.placed.has('beaker')) {
            g.text(ctx, 640, 320, '把水槽放到圆柱体下面', { size: 14, color: '#33507d', italic: true });
            g.arrow(ctx, 600, 340, 540, 360, { color: '#33507d', w: 1.2, alpha: .6, dash: [5, 4] });
          } else if (c.depth > 0.1) {
            // 浸入深度标注
            var sx = BEAKER_X + BEAKER_W / 2 + 48;
            g.dim(ctx, sx, c.ws, sx, OBJ_BOTTOM, 'h=' + c.depth.toFixed(1) + 'cm', { color: '#33507d', size: 10 });
          }
          if (c.depth >= H_CM - 0.2) {
            g.text(ctx, 760, 140, '完全浸没', { size: 12, color: '#ad1f26', italic: true });
            g.text(ctx, 760, 158, 'V排 = 125.7 cm³ 不变', { size: 10, color: '#8b8880' });
          }
        }
      };
    }
  });
})();
