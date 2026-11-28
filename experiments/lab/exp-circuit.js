/* ============================================================
   实验 03 · 伏安法测电阻
   真实回路求解：I = E / (r + R_A + R滑 + Rx∥Rv)
   电压表内阻 3000 Ω 参与并联，所以测得的 R 会略小于 10 Ω（真实误差）
   ============================================================ */
(function () {
  'use strict';
  var g = window.CohortLab.G;

  var E = 3.0, R_INT = 0.3, RA = 0.05, RX = 10, RV = 3000, R_MAX = 20;

  window.CohortLab.register({
    id: 'circuit',
    name: '伏安法实验室',
    group: '电学',
    grade: '九年级',
    aim: '用电流表和电压表测出定值电阻的阻值，理解滑动变阻器在电路中的作用。',
    formula: 'R = U / I',
    tip: '闭合开关前先把滑动变阻器调到最大；点击闸刀开关合上电路。',
    steps: [
      '认清电路：电流表串联、电压表并联在 Rx 两端',
      '把滑动变阻器滑片移到阻值最大端',
      '闭合开关，读出电流表、电压表示数',
      '改变滑片位置，测三组 U、I，算出 R'
    ],
    columns: ['I / A', 'U / V', 'R = U/I / Ω'],
    tableHint: '三组数据取平均',
    tools: [
      { id: 'battery', icon: 'battery', name: '电池组', hint: '3 V，内阻 0.3 Ω', group: '电源与开关' },
      { id: 'switch', icon: 'switch', name: '开关', hint: '串联在干路', group: '电源与开关' },
      { id: 'ammeter', icon: 'ammeter', name: '电流表', hint: '0~0.6 A，串联', group: '测量仪表' },
      { id: 'voltmeter', icon: 'voltmeter', name: '电压表', hint: '0~3 V，并联在 Rx', group: '测量仪表' },
      { id: 'resistor', icon: 'resistor', name: '定值电阻', hint: '待测 Rx', group: '电阻元件' },
      { id: 'rheostat', icon: 'rheostat', name: '滑动变阻器', hint: '0~20 Ω，改变电流', group: '电阻元件' }
    ],
    ask: ['滑动变阻器为什么能改变电流？', '电压表并联会影响测量结果吗？', '为什么要测三组数据取平均？'],

    create: function (api) {
      var st = {
        closed: false, p: 0.85, drag: false,
        na: 0, nv: 0,     // 表针当前角度（做阻尼摆动）
        t: 0, notedOpen: false
      };
      api.placed.add('battery'); api.placed.add('switch'); api.placed.add('ammeter');
      api.placed.add('voltmeter'); api.placed.add('resistor'); api.placed.add('rheostat');

      var SW = { x1: 322, x2: 400, y: 480 };
      var RH = { x1: 652, x2: 800, y: 480 };

      function loopOK() {
        return api.placed.has('battery') && api.placed.has('switch') && api.placed.has('ammeter')
          && api.placed.has('resistor') && api.placed.has('rheostat');
      }
      function calc() {
        if (!loopOK() || !st.closed) return { I: 0, U: 0, Rp: 0, R滑: st.p * R_MAX };
        var R滑 = st.p * R_MAX;
        var Rp = RX * RV / (RX + RV);
        var I = E / (R_INT + RA + R滑 + Rp);
        return { I: I, U: I * Rp, Rp: Rp, R滑: R滑 };
      }
      function needle(value, max) {
        var f = Math.max(0, Math.min(1, value / max));
        return 3.926 - f * 4.712;
      }

      return {
        placed: api.placed,
        onPlace: function (id) { if (id === 'switch') api.note('开关串在干路上（此时断开）', 'note'); },
        onRemove: function (id) { if (id === 'switch' && st.closed) { st.closed = false; } },
        reset: function () {
          st.closed = false; st.p = 0.85; st.na = 0; st.nv = 0;
          api.placed.clear();
          ['battery', 'switch', 'ammeter', 'voltmeter', 'resistor', 'rheostat'].forEach(function (k) { api.placed.add(k); });
          api.note('复位：开关断开，滑片移到阻值最大端', 'note');
        },

        step: function (dt) {
          st.t += dt;
          var c = calc();
          var ta = needle(c.I, 0.6), tv = needle(c.U, 3);
          // 表针阻尼摆动（一阶滞后，真实表针的惯性）
          st.na += (ta - st.na) * Math.min(1, dt * 7.5);
          st.nv += (tv - st.nv) * Math.min(1, dt * 7.5);
        },

        down: function (p) {
          // 闸刀
          if (api.placed.has('switch') && p.x > SW.x1 - 10 && p.x < SW.x2 + 10 && p.y > 430 && p.y < 500) {
            st.closed = !st.closed;
            api.note(st.closed ? '闭合开关' : '断开开关', 'note');
            if (st.closed) {
              var c0 = calc();
              api.note('闭合瞬间：I ≈ ' + c0.I.toFixed(3) + ' A，U ≈ ' + c0.U.toFixed(2) + ' V', 'obs');
            }
            api.save();
            return true;
          }
          // 滑片
          if (api.placed.has('rheostat') && p.x > RH.x1 - 6 && p.x < RH.x2 + 6 && p.y > 420 && p.y < 505) {
            st.drag = true;
            st.p = Math.max(0, Math.min(1, (p.x - RH.x1) / (RH.x2 - RH.x1)));
            return true;
          }
          return false;
        },
        move: function (p) {
          if (!st.drag) return;
          st.p = Math.max(0, Math.min(1, (p.x - RH.x1) / (RH.x2 - RH.x1)));
        },
        up: function () {
          if (st.drag) {
            var c = calc();
            api.note('滑片移到 ' + (st.p * 100).toFixed(0) + '%，R滑 = ' + c.R滑.toFixed(1) + ' Ω，I = ' + c.I.toFixed(3) + ' A', 'obs');
            api.save();
          }
          st.drag = false;
        },
        cursor: function (p) {
          if (p.x > SW.x1 - 10 && p.x < SW.x2 + 10 && p.y > 430 && p.y < 500) return 'pointer';
          if (p.x > RH.x1 - 6 && p.x < RH.x2 + 6 && p.y > 420 && p.y < 505) return 'grab';
          return 'default';
        },

        readings: function () {
          var c = calc();
          return [
            { label: '电流 I', value: c.I.toFixed(3), unit: 'A' },
            { label: '电压 U', value: c.U.toFixed(2), unit: 'V' },
            { label: 'R = U/I', value: c.I > 0 ? (c.U / c.I).toFixed(2) : '—', unit: 'Ω' },
            { label: 'R滑', value: c.R滑.toFixed(1), unit: 'Ω' },
            { label: '开关', value: st.closed ? '闭合' : '断开', tone: st.closed ? 'ok' : 'warn' }
          ];
        },
        dataRow: function () {
          var c = calc();
          if (c.I <= 0) return null;
          return [c.I.toFixed(3), c.U.toFixed(2), (c.U / c.I).toFixed(2)];
        },
        snapshot: function () {
          var c = calc();
          return '电路：开关' + (st.closed ? '闭合' : '断开') + '，滑片' + (st.p * 100).toFixed(0) + '%，R滑=' + c.R滑.toFixed(1) + 'Ω，I=' + c.I.toFixed(3) + 'A，U=' + c.U.toFixed(2) + 'V';
        },
        hint: function () { return st.closed ? '拖动滑片，看电流表跟着走' : '点闸刀开关合上电路'; },

        draw: function (ctx) {
          // 桌面
          g.line(ctx, 110, 566, 890, 566, { color: '#6f6c64', w: 2 });
          g.hatch(ctx, [[110, 566], [890, 566], [890, 586], [110, 586]], { color: '#6f6c64', gap: 10, alpha: .22 });

          var ok = loopOK();
          var wire = { color: ok ? '#3a3830' : '#b8ad96', w: 2.2, alpha: .9 };

          // ------- 导线回路
          g.line(ctx, 150, 480, 850, 480, { color: ok ? '#3a3830' : '#d6d2c6', w: 2, alpha: .35, dash: [6, 6] });
          g.line(ctx, 850, 480, 850, 200, wire);
          g.line(ctx, 850, 200, 410, 200, wire);
          g.line(ctx, 260, 200, 150, 200, wire);
          g.line(ctx, 150, 200, 150, 480, wire);
          // 元件结点
          if (api.placed.has('battery')) g.line(ctx, 180, 480, 280, 480, wire);
          if (api.placed.has('switch') && st.closed) g.line(ctx, 400, 480, 450, 480, wire);
          if (api.placed.has('resistor') && api.placed.has('rheostat')) g.line(ctx, 590, 480, 652, 480, wire);
          if (api.placed.has('rheostat')) g.line(ctx, 800, 480, 850, 480, wire);

          // 电流方向
          if (ok && st.closed && calc().I > 0.001) {
            [200, 420, 620, 830].forEach(function (x, i) {
              g.arrow(ctx, x, 480, x + 16, 480, { color: '#ad1f26', w: 1, alpha: .55 });
            });
            g.arrow(ctx, 850, 340, 850, 300, { color: '#ad1f26', w: 1, alpha: .55 });
            g.arrow(ctx, 600, 200, 570, 200, { color: '#ad1f26', w: 1, alpha: .55 });
          }

          // ------- 电池组
          if (api.placed.has('battery')) {
            g.rect(ctx, 176, 438, 108, 48, { color: '#3a3830', w: 1.4, fill: '#ded8c9', fillAlpha: .8 });
            g.line(ctx, 210, 438, 210, 424, { color: '#3a3830', w: 1.6 });
            g.line(ctx, 208, 424, 216, 424, { color: '#3a3830', w: 1.6 });
            g.line(ctx, 240, 438, 240, 428, { color: '#3a3830', w: 1.6 });
            g.text(ctx, 230, 470, '3V', { size: 12, color: '#16150f', align: 'center' });
            g.text(ctx, 230, 418, '+', { size: 12, color: '#ad1f26', align: 'center' });
            g.text(ctx, 250, 424, '−', { size: 12, color: '#33507d', align: 'center' });
          }

          // ------- 开关
          if (api.placed.has('switch')) {
            g.line(ctx, 318, 496, 404, 496, { color: '#3a3830', w: 2 });
            g.circle(ctx, 326, 482, 4, { color: '#3a3830', w: 1.2 });
            g.circle(ctx, 392, 482, 4, { color: '#3a3830', w: 1.2 });
            if (st.closed) g.line(ctx, 326, 482, 392, 482, { color: '#ad1f26', w: 2.2 });
            else g.line(ctx, 326, 482, 372, 448, { color: '#3a3830', w: 2.2 });
            g.text(ctx, 360, 514, '开关', { size: 11, color: '#4b4a41', align: 'center' });
          }

          // ------- 定值电阻
          if (api.placed.has('resistor')) {
            g.rect(ctx, 452, 462, 136, 32, { color: '#3a3830', w: 1.4, fill: '#efe5cd', fillAlpha: .85 });
            g.line(ctx, 470, 462, 470, 494, { color: '#d6d2c6', w: 1 });
            g.line(ctx, 500, 462, 500, 494, { color: '#d6d2c6', w: 1 });
            g.text(ctx, 520, 484, 'Rx', { size: 13, color: '#ad1f26', align: 'center' });
            g.text(ctx, 520, 514, '待测电阻', { size: 10, color: '#8b8880', align: 'center' });
          }

          // ------- 滑动变阻器
          if (api.placed.has('rheostat')) {
            g.rect(ctx, RH.x1, 452, RH.x2 - RH.x1, 34, { color: '#3a3830', w: 1.4, fill: '#f3ead3', fillAlpha: .85 });
            g.coil(ctx, RH.x1 + 8, 469, RH.x2 - RH.x1 - 16, 6, 9, { color: '#6f6c64', w: 1.1, alpha: .8 });
            var sx = RH.x1 + st.p * (RH.x2 - RH.x1);
            g.rect(ctx, sx - 7, 438, 14, 18, { color: '#ad1f26', w: 1.3, fill: '#f0d7c2', fillAlpha: .8 });
            g.line(ctx, sx, 438, sx, 430, { color: '#ad1f26', w: 1.4 });
            g.text(ctx, (RH.x1 + RH.x2) / 2, 512, '滑动变阻器 0~20Ω', { size: 10, color: '#4b4a41', align: 'center' });
            g.text(ctx, sx, 424, (st.p * R_MAX).toFixed(0) + 'Ω', { size: 10, color: '#ad1f26', align: 'center', italic: true });
          }

          // ------- 电流表
          if (api.placed.has('ammeter')) {
            drawMeter(ctx, 250, 138, 'A', 0.6, st.na, calc().I, '#33507d');
            g.line(ctx, 250, 200, 240, 200, wire);
            g.line(ctx, 390, 200, 410, 200, wire);
            g.text(ctx, 330, 132, '电流表 0~0.6A（串联）', { size: 10, color: '#4b4a41', align: 'center' });
          }

          // ------- 电压表 + 并联线
          if (api.placed.has('voltmeter')) {
            drawMeter(ctx, 470, 288, 'V', 3, st.nv, calc().U, '#ad1f26');
            g.line(ctx, 485, 392, 462, 478, { color: '#ad1f26', w: 1.4, alpha: .55, dash: [4, 3] });
            g.line(ctx, 585, 392, 588, 478, { color: '#ad1f26', w: 1.4, alpha: .55, dash: [4, 3] });
            g.text(ctx, 530, 292, '电压表 0~3V（并联在 Rx）', { size: 10, color: '#4b4a41', align: 'center' });
          }

          // 提示
          if (!ok) {
            g.text(ctx, 500, 92, '电路不完整：把缺的元件放回台上', { size: 14, color: '#ad1f26', align: 'center', italic: true });
          } else if (!st.closed) {
            g.text(ctx, 500, 600, '开关断开时，电表有示数吗？', { size: 13, color: '#33507d', align: 'center', italic: true });
          }

          // 批注
          var c = calc();
          if (c.I > 0) {
            g.text(ctx, 620, 360, 'R = U/I = ' + (c.U / c.I).toFixed(2) + ' Ω', { size: 14, color: '#ad1f26' });
            g.text(ctx, 620, 378, '（真实 Rx = 10.00 Ω，电压表分流带来误差）', { size: 10, color: '#8b8880' });
          }
        }
      };

      function drawMeter(ctx, x, y, letter, max, angle, val, color) {
        g.rect(ctx, x, y, 140, 72, { color: '#3a3830', w: 1.5, fill: '#fdfdfa', fillAlpha: .9 });
        var cx = x + 70, cy = y + 62, R = 40;
        g.arc(ctx, cx, cy, R, Math.PI * 1.06, Math.PI * 1.94, { color: '#6f6c64', w: 1 });
        for (var i = 0; i <= 6; i++) {
          var frac = i / 6;
          var a = Math.PI * 1.06 + frac * (Math.PI * 0.88);
          g.line(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6),
            { color: '#4b4a41', w: 1, alpha: .8 });
        }
        // 指针
        g.line(ctx, cx, cy, cx + Math.cos(3.926 - angle) * (R - 5), cy + Math.sin(3.926 - angle) * (R - 5),
          { color: '#ad1f26', w: 1.7 });
        g.circle(ctx, cx, cy, 3, { color: '#3a3830', w: 1 });
        g.text(ctx, cx, y + 20, letter, { size: 13, color: color, align: 'center' });
        g.text(ctx, cx - 30, y + 58, '0', { size: 9, color: '#8b8880' });
        g.text(ctx, cx + 30, y + 58, String(max), { size: 9, color: '#8b8880' });
        // 读数写在表盘外面，不与刻度打架
        g.text(ctx, cx, y + 94, val.toFixed(max < 1 ? 3 : 2) + (max < 1 ? ' A' : ' V'),
          { size: 12, color: '#16150f', align: 'center', weight: '600' });
      }
    }
  });
})();

