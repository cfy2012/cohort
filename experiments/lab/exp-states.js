/* ============================================================
   实验 · 物态变化（密闭空腔 + 烧杯）
   ------------------------------------------------------------
   模型：热量按温差传（Q = hA · ΔT · dt），相变按潜热（Q = mL）
        · 水 / 冰按 mcΔt 升温降温，到 0℃ / 100℃ 自动停在平台
        · 水蒸气按饱和蒸气压计算，超饱和在壁面液化（>0℃）或凝华（<0℃）
        · 温度计有热惯性，露出水面后测的是腔内气体温度
   ============================================================ */
(function () {
  'use strict';
  var g = window.CohortLab.G;

  /* ---------------- 物理常量 ---------------- */
  var K = {
    cw: 4.18, ci: 2.1,        // 水 / 冰 比热 J/(g·K)
    Lf: 334, Lv: 2260,        // 熔化 / 汽化潜热 J/g
    V: 0.03, Rv: 461.5,       // 空腔体积 m³ / 水蒸气气体常数
    hLiq: 7.0,                // 液态自然对流 W/K
    hPhase: 12.0,             // 相变界面 W/K
    hBoil: 12.0,              // 沸腾 W/K
    hCup: 1.2,                // 空杯 W/K
    cupC: 120                 // 杯体热容 J/K
  };
  var KE = 4.8e-7;            // 蒸发系数 g/(s·Pa)
  var M0 = 60;                // 初始水 60 g（半杯）
  var TS = 7;                 // 模型时间加速（画面上 1 s ≈ 4 s 物理时间）

  /* ---------------- 画面几何（设计坐标 1000×620） ---------------- */
  var CH = { x: 268, y: 60, w: 676, h: 482 };
  var CUP = { cx: 700, top: 225, bot: 505, topW: 240, botW: 200, maxH: 225, fullG: 120 };
  var PROBE = { x: 762, bulbY: 438, boxY: 166, boxH: 34 };
  var SLIDE = { x: 46, w: 192, y: 286 };

  /* ---------------- 状态 ---------------- */
  function fresh() {
    return {
      Ttgt: 25, Tenv: 25, Tc: 25, Tprobe: 25,
      mw: M0, mice: 0, mv: mSatG(25) * 0.45, mdew: 0, mfrost: 0,
      t: 0, drag: false,
      f0: false, f100: false, frost: false, dew: false, melt: false
    };
  }
  var S = fresh();
  var HAS_PROBE = true;

  /* ---------------- 物理 ---------------- */
  function pSatPa(T) {
    var kPa = T >= 0 ? 0.6112 * Math.exp(17.67 * T / (T + 243.5))
                     : 0.6112 * Math.exp(22.46 * T / (T + 272.62));
    return kPa * 1000;
  }
  function mSatG(T) {
    return pSatPa(T) * K.V / (K.Rv * (T + 273.15)) * 1000;
  }
  function melt(Q) { var dm = Math.min(Q / K.Lf, S.mice); S.mice -= dm; S.mw += dm; }
  function freeze(Q) { var dm = Math.min(Q / K.Lf, S.mw); S.mw -= dm; S.mice += dm; }
  function boil(Q) { var dm = Math.min(Q / K.Lv, S.mw); S.mw -= dm; S.mv += dm; }

  function evaporate(dt) {
    if (S.mw < 0.01 || S.Tc > 99.5) return;
    var pv = (S.mv / 1000) * K.Rv * (S.Tenv + 273.15) / K.V;
    var diff = pSatPa(S.Tc) - pv;
    if (diff <= 0) return;
    var dm = Math.min(KE * diff * dt, S.mw * 0.4);
    S.mw -= dm; S.mv += dm;
  }
  function condense(dt) {
    // 饱和量按腔温算：>0℃ 是水面的饱和蒸气压，<0℃ 是冰面的（升华/凝华平衡）
    var cap = mSatG(S.Tenv);
    if (S.mv > cap) {
      var dm = (S.mv - cap) * (1 - Math.exp(-dt / 0.6));
      S.mv -= dm;
      if (S.Tenv <= 0) S.mfrost += dm; else S.mdew += dm;
    } else if (S.mv < cap * 0.995) {
      // 不饱和：有冰就在升华补，有液态水就在蒸发补（低温也不会掉到 0）
      var lack = (cap - S.mv) * (1 - Math.exp(-dt / 6));
      if (S.mfrost > 0.001 && S.Tenv <= 0) {
        var sub = Math.min(S.mfrost, lack); S.mfrost -= sub; S.mv += sub;
      } else if (S.mice > 0.001 && S.Tenv <= 0) {
        var sub2 = Math.min(S.mice, lack); S.mice -= sub2; S.mv += sub2;
      } else if (S.mdew > 0.001) {
        var back = Math.min(S.mdew, lack); S.mdew -= back; S.mv += back;
      }
    }
    if (S.mfrost > 0 && S.Tenv > 0.5) {
      var bk = S.mfrost * (1 - Math.exp(-dt / 10));
      S.mfrost -= bk; S.mw += bk;
    }
    if (S.mv < 1e-5) S.mv = Math.min(1e-5, cap);
  }

  function advance(dt) {
    S.Tenv += (S.Ttgt - S.Tenv) * (1 - Math.exp(-dt / 3.5));
    if (Math.abs(S.Ttgt - S.Tenv) < 0.02) S.Tenv = S.Ttgt;

    var hasW = S.mw > 0.01, hasI = S.mice > 0.01;
    var dT = S.Tenv - S.Tc;
    var at0 = Math.abs(S.Tc) <= 0.05, at100 = S.Tc >= 99.9;

    var hA = K.hLiq;
    if (!hasW && !hasI) hA = K.hCup;
    else if (at100 && hasW && dT > 0) hA = K.hBoil;
    else if (at0 && (hasW || hasI)) hA = K.hPhase;

    var Q = hA * dT * dt;

    if (hasW && hasI && at0) {
      if (Q > 0) melt(Q); else if (Q < 0) freeze(-Q);
    } else if (hasW) {
      if (at100) {
        if (Q > 0) boil(Q);
        else S.Tc = Math.max(S.Tc + Q / (S.mw * K.cw + K.cupC), 0);
      } else {
        var C = S.mw * K.cw + K.cupC;
        var nt = S.Tc + Q / C;
        if (nt >= 100) {
          var need = (100 - S.Tc) * C;
          S.Tc = 100;
          if (Q > need) boil(Q - need);
        } else if (nt <= 0) {
          var needC = (0 - S.Tc) * C;
          S.Tc = 0;
          if (Q < needC) freeze(needC - Q);
        } else S.Tc = nt;
      }
    } else if (hasI) {
      var Ci = S.mice * K.ci + K.cupC;
      var ntI = S.Tc + Q / Ci;
      if (ntI >= 0) {
        var needI = (0 - S.Tc) * Ci;
        S.Tc = 0;
        if (Q > needI) melt(Q - needI);
      } else S.Tc = Math.max(ntI, -100);
    } else {
      S.Tc = Math.max(-100, Math.min(200, S.Tc + Q / K.cupC));
    }

    evaporate(dt);
    condense(dt);

    var tSensor = submerged() ? S.Tc : S.Tenv;
    S.Tprobe += (tSensor - S.Tprobe) * (1 - Math.exp(-dt / 1.5));
    S.t += dt;
  }

  /* ---------------- 几何 ---------------- */
  function waterH() {
    var total = S.mw + S.mice * 1.09;
    return Math.min(CUP.maxH, total / CUP.fullG * CUP.maxH);
  }
  function halfW(y) {
    var k = (y - CUP.top) / (CUP.bot - CUP.top);
    k = Math.max(0, Math.min(1, k));
    return (CUP.topW + (CUP.botW - CUP.topW) * k) / 2;
  }
  function surfaceY() { return CUP.bot - waterH(); }
  function submerged() {
    if (S.mw <= 0.5 && S.mice <= 0.5) return false;
    return PROBE.bulbY > surfaceY() + 3;
  }

  /* ---------------- 文字 / 状态 ---------------- */
  function fmtVapor(g) {
    // 低温也得读得出数（冰面饱和蒸气压约 0.003 g 量级），所以不足 0.01 g 改用 mg
    if (g < 0.00995) return { v: (g * 1000).toFixed(1), u: 'mg' };
    return { v: g.toFixed(2), u: 'g' };
  }
  function phaseName() {
    var hasW = S.mw > 0.5, hasI = S.mice > 0.5;
    if (hasW && hasI && Math.abs(S.Tc) < 0.15) return '冰水共存（0℃ 平台）';
    if (hasW && S.Tc >= 99.9) return '沸腾（100℃ 平台）';
    if (hasW && hasI) return '冰水共存 · 正在熔化/凝固';
    if (hasI && !hasW) return S.Tc < -0.1 ? '固态冰' : '冰正在熔化';
    if (!hasW && !hasI) return '水已全部汽化';
    if (S.Tc <= 0.15) return '冰水共存（0℃ 平台）';
    return '液态水';
  }
  function phaseShort() {
    var hasW = S.mw > 0.5, hasI = S.mice > 0.5;
    if (hasW && hasI) return '冰水共存';
    if (hasW && S.Tc >= 99.9) return '沸腾';
    if (hasI) return '固态';
    if (!hasW && !hasI) return '全汽化';
    return '液态';
  }
  function phaseDesc() {
    var hasW = S.mw > 0.5, hasI = S.mice > 0.5;
    if (hasW && hasI && Math.abs(S.Tc) < 0.15) return '温度停在 0℃ 不动：凝固放热 / 熔化吸热，热量都用来改变状态。';
    if (hasW && S.Tc >= 99.9) return '温度停在 100℃ 不动：沸腾吸热，热量全用来把水变成水蒸气。';
    if (hasI && !hasW) return '整杯都结成冰了，继续放热只会让冰的温度往下掉。';
    if (hasW && hasI) return '冰和水同时存在，温度就在 0℃ 附近，一边结冰一边熔化。';
    if (S.Tenv > S.Tc + 1) return '空腔比水热，热量正一点点从腔壁传进水里。';
    if (S.Tenv < S.Tc - 1) return '空腔比水冷，水正在把热量往外放。';
    return '水温和空腔温度已接近，热量交换很慢，温度基本稳定。';
  }

  function frostAmt() { return Math.max(0, Math.min(1, S.mfrost / 1.2)); }
  function dewAmt() { return Math.max(0, Math.min(1, S.mdew / 1.2)); }

  /* ---------------- 装饰（固定种子，每次一样） ---------------- */
  var seed = 20261128;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var DEW = [], FROST = [];
  (function () {
    for (var i = 0; i < 44; i++) DEW.push({ x: CH.x + 16 + rnd() * (CH.w - 32), y: CH.y + 16 + rnd() * (CH.h - 32), r: 1.6 + rnd() * 3.2 });
    for (var j = 0; j < 36; j++) FROST.push({ x: CH.x + 12 + rnd() * (CH.w - 24), y: CH.y + 12 + rnd() * (CH.h - 24), r: 2 + rnd() * 4.6, a: rnd() * Math.PI });
  })();
  var BUB = [];
  var MIST = [];
  (function () {
    for (var i = 0; i < 7; i++) MIST.push({ x: CH.x + 60 + (i * 93) % (CH.w - 120), y: CH.y + 60 + (i * 71) % (CH.h - 160), r: 44 + (i % 3) * 18 });
  })();

  /* ---------------- 绘制小工具 ---------------- */
  function roundPts(x, y, w, h, r) {
    var p = [], i;
    function corner(cx, cy, a0) {
      for (i = 0; i <= 5; i++) {
        var a = a0 + Math.PI / 2 * i / 5;
        p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    }
    corner(x + w - r, y + r, -Math.PI / 2);
    corner(x + w - r, y + h - r, 0);
    corner(x + r, y + h - r, Math.PI / 2);
    corner(x + r, y + r, Math.PI);
    return p;
  }
  function fillPoly(ctx, pts, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? .5 : alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    pts.forEach(function (q, i) { if (!i) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function wash(T) {
    if (T < 0) { var k = Math.min(1, -T / 60); return [Math.round(228 - 26 * k), Math.round(238 - 16 * k), Math.round(248 - 6 * k)]; }
    if (T > 40) { var k2 = Math.min(1, (T - 40) / 90); return [248, Math.round(242 - 14 * k2), Math.round(232 - 24 * k2)]; }
    return [244, 241, 231];
  }
  function cupPts(y0, y1, hw0, hw1) {
    var p = [[CUP.cx - hw0, y0], [CUP.cx + hw0, y0], [CUP.cx + hw1, y1]];
    p.push([CUP.cx + hw1 * 0.7, y1 + 5], [CUP.cx, y1 + 8], [CUP.cx - hw1 * 0.7, y1 + 5]);
    p.push([CUP.cx - hw1, y1]);
    return p;
  }

  window.CohortLab.register({
    id: 'states',
    name: '水温变化实验室',
    group: '热学',
    grade: '八年级上',
    aim: '把密闭空腔的温度推到很低或很高，看水怎样结冰、沸腾，以及水蒸气在腔壁上变成水珠或白霜。',
    formula: 'Q = cmΔt · Q = mL',
    tip: '先点滑块把空腔温度降到 -40℃，盯住温度计——到 0℃ 就再也不往下掉。',
    steps: [
      '把滑块从 25℃ 拖到 -40℃，观察水温怎样慢慢降下来',
      '看 0℃ 平台：温度停住，水开始结冰，杯里同时有冰和水',
      '再把温度推到 160℃，冰全熔化后继续升温，到 100℃ 出现第二个平台',
      '沸腾时看白气和气泡；降温到 0℃ 以下时，留意腔壁上的水珠与白霜'
    ],
    columns: ['水温 / ℃', '水的状态'],
    tableHint: '平台期尤其要记',
    tools: [
      { id: 'probe', icon: 'probe', name: '温度计', hint: '插在水里，读水温' },
      { id: 'ice', icon: 'ice', name: '冰块', hint: '点一下投 10 g 冰' }
    ],
    ask: ['为什么升温到 0℃ 就不动了？', '冰和水同时存在时温度为什么不变？', '腔壁上的水珠是从哪来的？', '沸腾时温度还会上升吗？'],
    create: function (api) {
      api.placed.add('probe');

      function noteOnce(flag, cond, text, kind) {
        if (cond && !S[flag]) { S[flag] = true; api.note(text, kind || 'obs'); }
        if (!cond) S[flag] = false;
      }

      return {
        placed: api.placed,
        onPlace: function (id) {
          if (id === 'ice') {
            S.mice += 10;
            api.placed.delete('ice');
            api.note('投入 10 g 冰，冰会吸热熔化', 'note');
          }
          if (id === 'probe') api.note('把温度计插进水里', 'note');
        },
        onRemove: function (id) { if (id === 'probe') api.note('温度计取出来了，读数改测腔内气体', 'note'); },
        reset: function () {
          S = fresh();
          api.placed.clear(); api.placed.add('probe');
          api.note('复位：空腔与水温都回到 25℃', 'note');
        },

        step: function (dt) { HAS_PROBE = api.placed.has('probe'); advance(dt * TS); },

        down: function (p) {
          if (p.x > SLIDE.x - 6 && p.x < SLIDE.x + SLIDE.w + 6 && p.y > SLIDE.y - 16 && p.y < SLIDE.y + 14) {
            S.drag = true; setTarget(p.x); return true;
          }
          // 快捷键 -50 / -10 / +10 / +50
          for (var i = 0; i < 4; i++) {
            var bx = SLIDE.x + i * 48;
            if (p.x > bx && p.x < bx + 42 && p.y > SLIDE.y + 26 && p.y < SLIDE.y + 50) {
              setTargetTemp(S.Ttgt + [-50, -10, 10, 50][i]);
              api.note('空腔目标温度设为 ' + S.Ttgt.toFixed(0) + '℃', 'note');
              return true;
            }
          }
          return false;
        },
        move: function (p) { if (S.drag) setTarget(p.x); },
        up: function () {
          if (S.drag) {
            S.drag = false;
            api.note('空腔目标温度设为 ' + S.Ttgt.toFixed(0) + '℃，热量开始按温差传进来', 'note');
            api.save();
          }
        },
        cursor: function (p) {
          if (p.x > SLIDE.x - 6 && p.x < SLIDE.x + SLIDE.w + 6 && p.y > SLIDE.y - 16 && p.y < SLIDE.y + 14) return 'grab';
          return 'default';
        },

        readings: function () {
          var out = [{ label: '空腔', value: S.Tenv.toFixed(1), unit: '℃' }];
          if (api.placed.has('probe')) out.push({ label: '传感器', value: S.Tprobe.toFixed(1), unit: '℃', tone: submerged() ? '' : 'warn' });
          var fv = fmtVapor(S.mv);
          out.push({ label: '水蒸气', value: fv.v, unit: fv.u });
          out.push({ label: '状态', value: phaseName(), tone: (Math.abs(S.Tc) < 0.15 || S.Tc >= 99.9) ? 'ok' : '' });

          noteOnce('f0', Math.abs(S.Tc) < 0.12 && S.mw > 0.5 && S.mice > 0.5,
            '温度停在 0℃ 不动了：冰水共存，凝固放出的热正好被熔化吸收', 'obs');
          noteOnce('f100', S.Tc >= 99.9 && S.mw > 0.5,
            '温度停在 100℃：水在沸腾，热量全用来汽化', 'obs');
          noteOnce('dew', S.mdew > 0.25, '腔壁上出现小水珠——水蒸气遇冷壁面液化', 'obs');
          noteOnce('frost', S.mfrost > 0.25, '腔壁上直接长出白霜——水蒸气低于 0℃ 凝华成冰晶', 'obs');
          return out;
        },
        dataRow: function () {
          // 两栏：水温 + 水的状态，点一次「记录读数」就落一行
          return [S.Tc.toFixed(1), phaseShort()];
        },
        snapshot: function () {
          return '物态变化：空腔 ' + S.Tenv.toFixed(1) + '℃，水温 ' + S.Tc.toFixed(1) + '℃，温度计 ' + S.Tprobe.toFixed(1) +
                 '℃，水 ' + S.mw.toFixed(1) + 'g、冰 ' + S.mice.toFixed(1) + 'g、水蒸气 ' + S.mv.toFixed(2) +
                 'g、壁面水珠 ' + S.mdew.toFixed(2) + 'g、白霜 ' + S.mfrost.toFixed(2) + 'g；' + phaseName();
        },
        hint: function () {
          if (S.drag) return '左右拖，松手后空腔温度会缓慢趋近目标';
          return '拖左边的滑块改空腔温度 · 点凉/热按钮快速 ±10℃ / ±50℃';
        },

        draw: function (ctx) {
          drawScene(ctx);
        }
      };
    }
  });

  function setTarget(px) {
    var f = (px - SLIDE.x) / SLIDE.w;
    f = Math.max(0, Math.min(1, f));
    setTargetTemp(-100 + f * 300);
  }
  function setTargetTemp(v) {
    S.Ttgt = Math.max(-100, Math.min(200, Math.round(v)));
  }

  /* ============================================================
     画面
     ============================================================ */
  function drawScene(ctx) {
    var c = wash(S.Tenv);

    /* ---- 空洞（密闭腔） ---- */
    fillPoly(ctx, roundPts(CH.x, CH.y, CH.w, CH.h, 18), 'rgb(' + c.join(',') + ')', .18);
    g.poly(ctx, roundPts(CH.x, CH.y, CH.w, CH.h, 18), { color: '#4b4a41', w: 2, alpha: .95 });
    g.poly(ctx, roundPts(CH.x + 10, CH.y + 10, CH.w - 20, CH.h - 20, 12), { color: '#8b8880', w: 1, alpha: .35 });
    g.text(ctx, CH.x + CH.w - 16, CH.y + 26, '密闭空腔 · 0.03 m³', { size: 10, color: '#6f6c64', align: 'right' });

    /* ---- 腔内白雾（相对湿度高时） ---- */
    var rh = S.mv / Math.max(mSatG(S.Tenv), 1e-6);
    var mistA = Math.max(0, Math.min(.22, (rh - .62) / .5 * .22));
    if (mistA > .01) {
      ctx.save();
      ctx.globalAlpha = mistA;
      for (var i = 0; i < MIST.length; i++) {
        var m = MIST[i];
        var rg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
        rg.addColorStop(0, 'rgba(255,255,255,.9)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    /* ---- 壁面水珠 / 白霜 ---- */
    var fa = frostAmt(), da = dewAmt();
    if (fa > .02) {
      ctx.save(); ctx.globalAlpha = fa * .8;
      for (var f = 0; f < FROST.length; f++) {
        var fr = FROST[f];
        var edge = fr.x < CH.x + 90 || fr.x > CH.x + CH.w - 90 || fr.y < CH.y + 70 || fr.y > CH.y + CH.h - 80;
        if (!edge && f % 3) continue;
        ctx.save(); ctx.translate(fr.x, fr.y); ctx.rotate(fr.a);
        g.stroke(ctx, { color: '#ffffff', w: 1.4, alpha: .95 });
        ctx.beginPath();
        for (var k = 0; k < 3; k++) {
          var ang = k * Math.PI / 3;
          ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * fr.r * 2.2, Math.sin(ang) * fr.r * 2.2);
        }
        ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
    if (da > .02) {
      ctx.save(); ctx.globalAlpha = Math.min(.85, da * .85);
      for (var d = 0; d < DEW.length; d++) {
        var dd = DEW[d];
        var edge2 = dd.x < CH.x + 100 || dd.x > CH.x + CH.w - 100 || dd.y < CH.y + 60 || dd.y > CH.y + CH.h - 70;
        if (!edge2 && d % 4) continue;
        g.circle(ctx, dd.x, dd.y, dd.r, { color: '#7fa8c8', w: .9, alpha: .7, fill: '#bfe0ef', fillAlpha: .55 });
        g.circle(ctx, dd.x - dd.r * .3, dd.y - dd.r * .35, dd.r * .38, { color: '#ffffff', w: .8, alpha: .6, fill: '#ffffff', fillAlpha: .8 });
      }
      ctx.restore();
    }

    // 壁面现象只在有量时用一行小字汇总，避免三条标签叠在角上
    if (fa > .02 || da > .02) {
      var wallTxt = '壁面：' + (da > .02 ? '水珠 ' + S.mdew.toFixed(2) + ' g' : '') +
                    (da > .02 && fa > .02 ? ' · ' : '') + (fa > .02 ? '白霜 ' + S.mfrost.toFixed(2) + ' g' : '');
      g.text(ctx, CH.x + 24, CH.y + CH.h - 20, wallTxt, { size: 10, color: '#33507d' });
    }
    g.text(ctx, CH.x + 24, CH.y + 28, '腔内空气 + 水蒸气', { size: 9, color: '#8b8880', italic: true });

    /* ---- 烧杯 ---- */
    var topHalf = CUP.topW / 2, botHalf = CUP.botW / 2;
    var ptsB = [[CUP.cx - topHalf, CUP.top], [CUP.cx + topHalf, CUP.top], [CUP.cx + botHalf, CUP.bot],
                [CUP.cx + botHalf * .7, CUP.bot + 5], [CUP.cx, CUP.bot + 8], [CUP.cx - botHalf * .7, CUP.bot + 5], [CUP.cx - botHalf, CUP.bot]];
    fillPoly(ctx, ptsB, '#ffffff', .28);
    g.poly(ctx, ptsB, { color: '#4b4a41', w: 1.5 });
    g.line(ctx, CUP.cx - topHalf + 6, CUP.top + 10, CUP.cx - topHalf + 6, CUP.bot - 12, { color: '#a8c6e2', w: 1, alpha: .35 });
    // 刻度
    for (var t = 1; t <= 3; t++) {
      var ty = CUP.bot - t * 50;
      var hwT = halfW(ty);
      g.line(ctx, CUP.cx + hwT - 12, ty, CUP.cx + hwT - 26, ty, { color: '#8b8880', w: 1, alpha: .5 });
      g.text(ctx, CUP.cx + hwT - 30, ty + 3, String(t * 20), { size: 8, color: '#8b8880', align: 'right' });
    }

    /* ---- 水 ---- */
    var ws = surfaceY();
    if (S.mw > 0.01) {
      var wp = cupPts(ws, CUP.bot, halfW(ws), halfW(CUP.bot));
      fillPoly(ctx, wp, '#79a9d6', .20);
      g.hatch(ctx, wp, { color: '#33507d', gap: 12, alpha: .10 });
      // 水面波纹
      var wpts = [];
      for (var k2 = 0; k2 <= 12; k2++) {
        wpts.push([CUP.cx - halfW(ws) + halfW(ws) * 2 * k2 / 12, ws + Math.sin(k2 * .9 + S.t * 1.6) * 1.5]);
      }
      g.linePath(ctx, wpts, { color: '#33507d', w: 1.2, alpha: .8 }, false);
      if (S.mw > 2) g.text(ctx, CUP.cx - halfW(ws) + 6, ws - 7, '水 ' + S.mw.toFixed(0) + ' g', { size: 9, color: '#33507d' });
    }

    /* ---- 冰 ---- */
    if (S.mice > 0.1) {
      var th = Math.max(8, Math.min(200, S.mice * 1.09 / CUP.fullG * CUP.maxH));
      var floating = S.mw > 0.5;   // 还有液态水 → 冰浮在水面；全冻住 → 冰落到底
      var iceTop, iceBot;
      if (floating) {
        iceTop = Math.max(CUP.top + 6, ws - th * .25);
        iceBot = Math.min(CUP.bot - 6, iceTop + th);
      } else {
        iceBot = CUP.bot - 6;
        iceTop = Math.max(CUP.top + 6, iceBot - th);
      }
      var ip = [[CUP.cx - halfW(iceTop), iceTop], [CUP.cx + halfW(iceTop), iceTop],
                [CUP.cx + halfW(iceBot), iceBot], [CUP.cx - halfW(iceBot), iceBot]];
      fillPoly(ctx, ip, '#f4fbff', .92);
      g.hatch(ctx, ip, { color: '#a9d2e6', gap: 10, alpha: .45 });
      g.poly(ctx, ip, { color: '#3a3830', w: 1.4 });
      // 冰晶（白色六出，草纸上画成短十字）
      for (var n = 0; n < 6; n++) {
        var ix = CUP.cx - halfW(iceTop) + 24 + n * 26, iy = (iceTop + iceBot) / 2 + (n % 2 ? 10 : -10);
        if (n * 26 > halfW(iceTop) * 2 - 40) break;
        g.line(ctx, ix - 8, iy, ix + 8, iy, { color: '#5f8ea6', w: 1, alpha: .8 });
        g.line(ctx, ix, iy - 7, ix, iy + 7, { color: '#5f8ea6', w: 1, alpha: .8 });
        g.line(ctx, ix - 5, iy - 5, ix + 5, iy + 5, { color: '#5f8ea6', w: .8, alpha: .55 });
      }
      g.text(ctx, CUP.cx - halfW(iceTop) + 8, iceTop + 14, '冰 ' + S.mice.toFixed(0) + ' g', { size: 9, color: '#33507d' });
    }

    /* ---- 沸腾气泡 ---- */
    if (S.Tc >= 99.9 && S.mw > 0.5) {
      if (BUB.length < 26 && Math.random() < .5) {
        BUB.push({ x: CUP.cx + (Math.random() - .5) * halfW(CUP.bot) * 1.6, y: CUP.bot - 10, r: 2 + Math.random() * 4, v: 26 + Math.random() * 26 });
      }
      for (var b = BUB.length - 1; b >= 0; b--) {
        var bu = BUB[b];
        bu.y -= bu.v * .06;
        if (bu.y < ws + 2) { BUB.splice(b, 1); continue; }
        g.circle(ctx, bu.x, bu.y, bu.r, { color: '#79a9d6', w: 1, alpha: .55 });
      }
      // 杯口白气
      for (var s2 = 0; s2 < 5; s2++) {
        var sx = CUP.cx - 46 + s2 * 23;
        var sy = CUP.top - 14 - ((S.t * 18 + s2 * 13) % 60);
        g.circle(ctx, sx + Math.sin(S.t * 2 + s2) * 4, sy, 10 - s2 * .6, { color: '#ffffff', w: 1, alpha: .35 });
      }
      g.text(ctx, CUP.cx + topHalf + 8, CUP.top + 2, '白气（水蒸气液化）', { size: 10, color: '#6f6c64', italic: true });
    } else if (BUB.length) BUB.length = 0;

    /* ---- 温度计 ---- */
    if (HAS_PROBE) {
      g.rect(ctx, PROBE.x - 42, PROBE.boxY, 84, PROBE.boxH, { color: '#3a3830', w: 1.3, fill: '#fdfcf8', fillAlpha: .92 });
      g.text(ctx, PROBE.x - 34, PROBE.boxY + 14, '温度计', { size: 9, color: '#8b8880' });
      g.text(ctx, PROBE.x + 34, PROBE.boxY + 25, S.Tprobe.toFixed(1) + '℃', { size: 13, color: '#ad1f26', align: 'right' });
      g.line(ctx, PROBE.x, PROBE.boxY + PROBE.boxH, PROBE.x, PROBE.bulbY - 8, { color: '#6f6c64', w: 2.2 });
      g.line(ctx, PROBE.x - 2, PROBE.boxY + PROBE.boxH, PROBE.x - 2, PROBE.bulbY - 8, { color: '#ffffff', w: .8, alpha: .5 });
      g.circle(ctx, PROBE.x, PROBE.bulbY, 8, { color: '#3a3830', w: 1.2, fill: '#e7b0a8', fillAlpha: .8 });
      if (!submerged()) g.text(ctx, PROBE.x + 12, PROBE.bulbY + 4, '感温泡露出液面', { size: 9, color: '#8b8880', italic: true });
    }

    /* ---- 左侧：水蒸气质量表 ---- */
    var bx = 46, by = 92, bw = 192, bh = 104;
    g.rect(ctx, bx, by, bw, bh, { color: '#3a3830', w: 1.4, fill: '#fdfcf8', fillAlpha: .85 });
    g.text(ctx, bx + 10, by + 18, '腔内水蒸气质量', { size: 11, color: '#4b4a41' });
    var fvg = fmtVapor(S.mv);
    g.text(ctx, bx + bw - 30, by + 54, fvg.v, { size: 24, color: '#33507d', align: 'right', weight: '600' });
    g.text(ctx, bx + bw - 24, by + 54, fvg.u, { size: 11, color: '#6f6c64' });
    // 条
    var barY = by + 62, barW = bw - 20;
    g.line(ctx, bx + 10, barY, bx + 10 + barW, barY, { color: '#c9c4b4', w: 6, alpha: .55 });
    var frac = Math.max(0, Math.min(1, S.mv / 6));
    if (frac > .01) g.line(ctx, bx + 10, barY, bx + 10 + barW * frac, barY, { color: '#33507d', w: 6, alpha: .9 });
    g.text(ctx, bx + 10, barY + 16, '0', { size: 8, color: '#8b8880' });
    g.text(ctx, bx + 10 + barW, barY + 16, '6 g', { size: 8, color: '#8b8880', align: 'right' });
    g.text(ctx, bx + 10, by + bh - 4, '液滴 ' + S.mdew.toFixed(2) + ' g · 霜 ' + S.mfrost.toFixed(2) + ' g', { size: 9, color: '#8b8880' });

    /* ---- 左侧：目标温度滑块 ---- */
    g.text(ctx, SLIDE.x, SLIDE.y - 46, '空腔目标温度', { size: 11, color: '#4b4a41' });
    g.text(ctx, SLIDE.x + SLIDE.w, SLIDE.y - 40, S.Ttgt.toFixed(0) + ' ℃', { size: 18, color: '#ad1f26', align: 'right', weight: '600' });
    g.line(ctx, SLIDE.x, SLIDE.y, SLIDE.x + SLIDE.w, SLIDE.y, { color: '#c9c4b4', w: 3, alpha: .8 });
    // 0℃ / 100℃ 刻度
    var zeroX = SLIDE.x + ((0 + 100) / 300) * SLIDE.w;
    var boilX = SLIDE.x + ((100 + 100) / 300) * SLIDE.w;
    g.line(ctx, zeroX, SLIDE.y - 5, zeroX, SLIDE.y + 5, { color: '#33507d', w: 1.2, alpha: .9 });
    g.line(ctx, boilX, SLIDE.y - 5, boilX, SLIDE.y + 5, { color: '#ad1f26', w: 1.2, alpha: .9 });
    g.text(ctx, zeroX, SLIDE.y + 16, '0℃', { size: 8, color: '#33507d', align: 'center' });
    g.text(ctx, boilX, SLIDE.y + 16, '100℃', { size: 8, color: '#ad1f26', align: 'center' });
    var hx = SLIDE.x + ((S.Ttgt + 100) / 300) * SLIDE.w;
    g.circle(ctx, hx, SLIDE.y, 6, { color: '#ad1f26', w: 1.6, fill: '#f0d7c2', fillAlpha: .8 });
    for (var q = 0; q < 4; q++) {
      var qx = SLIDE.x + q * 48;
      g.rect(ctx, qx, SLIDE.y + 26, 42, 24, { color: '#3a3830', w: 1.1, fill: '#fdfcf8', fillAlpha: .85 });
      g.text(ctx, qx + 21, SLIDE.y + 42, ['−50', '−10', '+10', '+50'][q], { size: 11, color: '#3a3830', align: 'center' });
    }
    g.text(ctx, SLIDE.x, SLIDE.y + 74, '可调 -100 ~ +200℃ · 点按钮快速调', { size: 9, color: '#8b8880' });

    /* ---- 左侧：状态 ---- */
    g.text(ctx, 46, 412, '当前：' + phaseName(), { size: 12, color: (Math.abs(S.Tc) < .15 || S.Tc >= 99.9) ? '#ad1f26' : '#3a3830' });
    wrapText(ctx, phaseDesc(), 46, 432, 196, 14, 9.5);

    /* ---- 批注 ---- */
    g.text(ctx, 46, 44, '标准大气压：凝固点 0℃ · 沸点 100℃', { size: 10, color: '#6f6c64' });
    g.text(ctx, 46, 62, 'Q吸 = cmΔt · Q相变 = mL', { size: 11, color: '#ad1f26' });

    g.text(ctx, 46, 500, '热量按温差传，不会瞬间到位', { size: 9, color: '#8b8880', italic: true });
    g.text(ctx, 46, 516, '平台期：热量都用来改变状态', { size: 9, color: '#8b8880', italic: true });

    /* ---- 腔内标注：热量流向（画在烧杯正上方，竖直箭头） ---- */
    var dT = S.Tenv - S.Tc;
    if (Math.abs(dT) > 1) {
      var ax = CUP.cx - topHalf + 26;
      if (dT > 0) {
        g.arrow(ctx, ax, CH.y + 78, ax, CUP.top - 26, { color: '#ad1f26', w: 1.2, alpha: .7, dash: [5, 4] });
        g.text(ctx, ax + 10, CH.y + 84, '热量 ↓ 传进水里（吸热）', { size: 10, color: '#ad1f26' });
      } else {
        g.arrow(ctx, ax, CUP.top - 26, ax, CH.y + 78, { color: '#33507d', w: 1.2, alpha: .7, dash: [5, 4] });
        g.text(ctx, ax + 10, CH.y + 84, '↑ 热量 从水里放出', { size: 10, color: '#33507d' });
      }
    }
  }


  function wrapText(ctx, str, x, y, maxW, lh, size) {
    ctx.save();
    ctx.font = size + 'px KaiTi, STKaiti, "Segoe Print", "Microsoft YaHei", serif';
    var line = '', yy = y;
    for (var i = 0; i < str.length; i++) {
      var test = line + str[i];
      if (ctx.measureText(test).width > maxW && line) {
        g.text(ctx, x, yy, line, { size: size, color: '#4b4a41' });
        line = str[i]; yy += lh;
      } else line = test;
    }
    if (line) g.text(ctx, x, yy, line, { size: size, color: '#4b4a41' });
    ctx.restore();
  }
})();








