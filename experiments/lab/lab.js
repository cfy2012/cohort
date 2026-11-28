/* ============================================================
   草纸物理实验室 · 引擎
   - 纸面 / 铅笔笔触 / 红蓝批注
   - 固定步长物理循环（120 Hz），不做关键帧动画
   - 器材架 → 实验台（点击 / 拖放）
   - 右侧实验笔记（自动保存到 /api/lab/record）
   - AI 面板走 /api/lab/chat（带实验台状态 context），学生和老师都能用
   ============================================================ */
(function () {
  'use strict';

  var DESIGN = { w: 1000, h: 620 };
  var STEP = 1 / 120;

  // ---------------------------------------------------------- 手绘笔触
  var G = (function () {
    function hash(x, y, i) {
      var s = Math.sin(x * 12.9898 + y * 78.233 + i * 37.719) * 43758.5453;
      return s - Math.floor(s);
    }
    function jit(x, y, i, amt) {
      return (hash(Math.round(x), Math.round(y), i) - 0.5) * 2 * (amt == null ? 1.1 : amt);
    }
    function stroke(ctx, o) {
      ctx.strokeStyle = o.color || '#3a3830';
      ctx.lineWidth = o.w == null ? 1.4 : o.w;
      ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
      if (o.dash) ctx.setLineDash(o.dash); else ctx.setLineDash([]);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    function reset(ctx) { ctx.globalAlpha = 1; ctx.setLineDash([]); }

    function linePath(ctx, pts, o, closed) {
      o = o || {};
      var n = pts.length, i;
      stroke(ctx, o);
      ctx.beginPath();
      for (i = 0; i < n; i++) {
        var p = pts[i];
        var x = p[0] + jit(p[0], p[1], i, o.jit), y = p[1] + jit(p[1], p[0], i + 7, o.jit);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      if (closed) ctx.closePath();
      ctx.stroke();
      reset(ctx);
    }

    function line(ctx, x1, y1, x2, y2, o) {
      o = o || {};
      var d = Math.hypot(x2 - x1, y2 - y1);
      var seg = Math.max(1, Math.round(d / 22));
      var pts = [];
      for (var i = 0; i <= seg; i++) {
        pts.push([x1 + (x2 - x1) * i / seg, y1 + (y2 - y1) * i / seg]);
      }
      linePath(ctx, pts, o, false);
      if (o.double) {
        var nx = -(y2 - y1) / (d || 1), ny = (x2 - x1) / (d || 1);
        linePath(ctx, pts.map(function (p) { return [p[0] + nx * 1.7, p[1] + ny * 1.7]; }), o, false);
      }
    }

    function poly(ctx, pts, o, closed) { linePath(ctx, pts, o, closed !== false); }

    function hatch(ctx, pts, o) {
      o = o || {};
      var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var gap = o.gap || 7;
      stroke(ctx, { color: o.color || '#4b4a41', w: o.w || 1, alpha: o.alpha == null ? .55 : o.alpha });
      ctx.save();
      // 只在图形内部画排线，绝不溢出
      ctx.beginPath();
      pts.forEach(function (p, i) { if (!i) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.closePath();
      ctx.clip();
      ctx.beginPath();
      for (var x = x0 - (y1 - y0); x < x1 + (y1 - y0); x += gap) {
        var ax = x, ay = y1, bx = x + (y1 - y0), by = y0;
        if (bx < x0) { by -= (x0 - bx); bx = x0; }
        if (ax > x1) { ay -= (ax - x1); ax = x1; }
        ctx.moveTo(ax + jit(ax, ay, 3, 1), ay);
        ctx.lineTo(bx + jit(bx, by, 5, 1), by);
      }
      ctx.stroke();
      ctx.restore();
      reset(ctx);
    }

    function circle(ctx, cx, cy, r, o) {
      o = o || {};
      var n = Math.max(14, Math.round(r * 1.4));
      var pts = [];
      for (var i = 0; i <= n; i++) {
        var a = Math.PI * 2 * i / n;
        var rr = r + jit(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), i, o.jit == null ? 1.2 : o.jit);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      linePath(ctx, pts, o, false);
      if (o.fill) {
        ctx.save(); ctx.globalAlpha = o.fillAlpha == null ? .5 : o.fillAlpha;
        ctx.fillStyle = o.fill; ctx.beginPath();
        pts.forEach(function (p, i) { if (!i) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }

    function rect(ctx, x, y, w, h, o) {
      o = o || {};
      poly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], o, true);
      if (o.fill) {
        ctx.save(); ctx.globalAlpha = o.fillAlpha == null ? .5 : o.fillAlpha;
        ctx.fillStyle = o.fill; ctx.fillRect(x, y, w, h); ctx.restore();
      }
    }

    function arc(ctx, cx, cy, r, a0, a1, o) {
      o = o || {};
      var n = Math.max(8, Math.round(Math.abs(a1 - a0) * r / 18));
      var pts = [];
      for (var i = 0; i <= n; i++) {
        var a = a0 + (a1 - a0) * i / n;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      linePath(ctx, pts, o, false);
    }

    function text(ctx, x, y, str, o) {
      o = o || {};
      ctx.save();
      ctx.font = (o.italic ? 'italic ' : '') + (o.weight ? o.weight + ' ' : '') + (o.size || 13) + 'px ' +
        (o.font || 'KaiTi, STKaiti, "Segoe Print", "Microsoft YaHei", serif');
      ctx.fillStyle = o.color || '#16150f';
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.baseline || 'alphabetic';
      ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
      if (o.rotate) { ctx.translate(x, y); ctx.rotate(o.rotate); ctx.fillText(str, 0, 0); }
      else ctx.fillText(str, x, y);
      ctx.restore();
    }

    function arrow(ctx, x1, y1, x2, y2, o) {
      o = o || {};
      line(ctx, x1, y1, x2, y2, o);
      var a = Math.atan2(y2 - y1, x2 - x1), L = o.head || 7;
      var w = o.w == null ? 1.4 : o.w;
      stroke(ctx, { color: o.color || '#3a3830', w: w, alpha: o.alpha == null ? 1 : o.alpha });
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(a - 0.4) * L, y2 - Math.sin(a - 0.4) * L);
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(a + 0.4) * L, y2 - Math.sin(a + 0.4) * L);
      ctx.stroke(); reset(ctx);
    }

    // 尺寸标注线（水平/竖直自动判断）
    function dim(ctx, x1, y1, x2, y2, label, o) {
      o = o || {};
      var color = o.color || '#33507d';
      line(ctx, x1, y1, x2, y2, { color: color, w: 1, alpha: .8 });
      var horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      var t1 = horiz ? [[x1, y1 - 4], [x1, y1 + 4]] : [[x1 - 4, y1], [x1 + 4, y1]];
      var t2 = horiz ? [[x2, y2 - 4], [x2, y2 + 4]] : [[x2 - 4, y2], [x2 + 4, y2]];
      line(ctx, t1[0][0], t1[0][1], t1[1][0], t1[1][1], { color: color, w: 1, alpha: .8 });
      line(ctx, t2[0][0], t2[0][1], t2[1][0], t2[1][1], { color: color, w: 1, alpha: .8 });
      if (label) text(ctx, (x1 + x2) / 2 + (horiz ? 0 : 8), (y1 + y2) / 2 + (horiz ? -6 : 0), label,
        { size: o.size || 11, color: color, align: horiz ? 'center' : 'left', font: 'KaiTi, "Segoe Print", serif' });
    }

    // 小箭头标注（写“这里”）
    function label(ctx, x, y, str, o) {
      o = o || {};
      text(ctx, x, y, str, { size: o.size || 11, color: o.color || '#ad1f26', italic: true });
      if (o.to) line(ctx, x + 3, y - 3, o.to[0], o.to[1], { color: o.color || '#ad1f26', w: 1, alpha: .75, dash: [3, 3] });
    }

    function coil(ctx, x, y, len, r, turns, o) {
      o = o || {};
      var pts = [];
      var n = Math.max(20, turns * 8);
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        var a = t * turns * Math.PI * 2;
        pts.push([x + t * len, y + Math.sin(a) * r]);
      }
      linePath(ctx, pts, o, false);
    }

    return {
      line: line, poly: poly, circle: circle, rect: rect, arc: arc,
      text: text, arrow: arrow, dim: dim, label: label, hatch: hatch, coil: coil,
      jit: jit, stroke: stroke, reset: reset, linePath: linePath
    };
  })();

  // ---------------------------------------------------------- 状态
  var App = {
    exps: [], byId: {}, active: null, inst: null,
    paused: false, grid: true, speed: 1,
    notes: {},       // exId -> [{at, kind, text}]
    tables: {},      // exId -> [ [c1..cn], ... ]
    drafts: {},      // exId -> string
    canvas: null, ctx: null, view: { scale: 1, offX: 0, offY: 0, dpr: 1, w: 0, h: 0 },
    historyLoaded: false, saving: false, saveTimer: 0,
    mode: 'solo',        // class = 学生在课堂里；solo = 独立使用（本机保存）
    chatRecent: [],
    submitted: {},       // exId -> 'HH:MM'
    joined: true
  };

  var $ = function (id) { return document.getElementById(id); };

  // ---------------------------------------------------------- 注册接口
  function register(def) {
    if (!def || !def.id) throw new Error('实验必须带 id');
    App.exps.push(def);
    App.byId[def.id] = def;
  }

  // ---------------------------------------------------------- 纸面
  var paperPattern = null, paperCanvas = null;
  function makePaperPattern(ctx) {
    if (paperPattern) return paperPattern;
    var size = 220;
    paperCanvas = document.createElement('canvas');
    paperCanvas.width = paperCanvas.height = size;
    var p = paperCanvas.getContext('2d');
    p.fillStyle = '#fcfbf6';
    p.fillRect(0, 0, size, size);
    var seed = 20261120;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    // 纸纤维
    for (var i = 0; i < 260; i++) {
      var x = rnd() * size, y = rnd() * size;
      p.strokeStyle = 'rgba(150,130,90,' + (0.03 + rnd() * 0.05).toFixed(3) + ')';
      p.lineWidth = 1;
      p.beginPath();
      p.moveTo(x, y);
      p.lineTo(x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 4);
      p.stroke();
    }
    // 斑点
    for (var j = 0; j < 160; j++) {
      var cx = rnd() * size, cy = rnd() * size, r = 0.4 + rnd() * 1.6;
      p.fillStyle = 'rgba(120,100,60,' + (0.02 + rnd() * 0.06).toFixed(3) + ')';
      p.beginPath(); p.arc(cx, cy, r, 0, Math.PI * 2); p.fill();
    }
    paperPattern = ctx.createPattern(paperCanvas, 'repeat');
    return paperPattern;
  }

  function paintPaper(ctx, w, h) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fcfbf6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = makePaperPattern(ctx);
    ctx.fillRect(0, 0, w, h);
    // 草稿格
    if (App.grid) {
      ctx.strokeStyle = 'rgba(90,120,160,.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = 12; x < w; x += 26) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); }
      for (var y = 12; y < h; y += 26) { ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); }
      ctx.stroke();
      // 左侧装订红线
      ctx.strokeStyle = 'rgba(187,74,62,.18)';
      ctx.beginPath(); ctx.moveTo(38.5, 0); ctx.lineTo(38.5, h); ctx.stroke();
    }
    // 四角暗一点
    var gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .35, w / 2, h / 2, Math.max(w, h) * .75);
    gr.addColorStop(0, 'rgba(120,100,60,0)');
    gr.addColorStop(1, 'rgba(120,100,60,.10)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
    // 毛边
    ctx.strokeStyle = 'rgba(160,145,110,.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(.5, .5, w - 1, h - 1);
    ctx.restore();
  }

  // ---------------------------------------------------------- 画布
  function resize() {
    var stage = $('stage-wrap');
    if (!stage || !App.canvas) return;
    var w = stage.clientWidth, h = stage.clientHeight;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    App.canvas.width = Math.round(w * dpr);
    App.canvas.height = Math.round(h * dpr);
    App.canvas.style.width = w + 'px';
    App.canvas.style.height = h + 'px';
    var scale = Math.min(w / DESIGN.w, h / DESIGN.h);
    App.view = { scale: scale, offX: (w - DESIGN.w * scale) / 2, offY: (h - DESIGN.h * scale) / 2, dpr: dpr, w: w, h: h };
  }

  function toDesign(ev) {
    var r = App.canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left - App.view.offX) / App.view.scale,
      y: (ev.clientY - r.top - App.view.offY) / App.view.scale
    };
  }

  function drawFrame(t) {
    if (!App.ctx) return;
    var ctx = App.ctx, v = App.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, App.canvas.width, App.canvas.height);
    paintPaper(ctx, App.canvas.width, App.canvas.height);

    ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.offX, v.dpr * v.offY);
    ctx.save();
    // 实验台范围
    if (App.inst && App.inst.draw) {
      try { App.inst.draw(ctx, G, App); } catch (e) { console.warn('draw', e); }
    }
    ctx.restore();

    // 角落批注：页脚
    ctx.save();
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    G.text(ctx, v.w - 14, v.h - 10, 'cohort · 物理', { size: 10, color: 'rgba(120,110,90,.55)', align: 'right', italic: true });
    ctx.restore();
  }

  // ---------------------------------------------------------- 循环
  var lastT = 0, acc = 0;
  function loop(t) {
    if (!lastT) lastT = t;
    var dt = Math.min(0.06, (t - lastT) / 1000);
    lastT = t;
    if (!App.paused) {
      acc += dt * (App.speed || 1);
      var guard = 0;
      while (acc >= STEP && guard++ < 8) {
        if (App.inst && App.inst.step) {
          try { App.inst.step(STEP); } catch (e) { console.warn('step', e); }
        }
        acc -= STEP;
      }
      if (guard >= 8) acc = 0;
    }
    drawFrame(t);
    App.frames = (App.frames || 0) + 1;
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------- 提示 / 印章
  var tipTimer = 0;
  function toast(msg, ms) {
    var el = $('tip');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
  }
  var stampTimer = 0;
  function stamp(msg) {
    var el = $('stamp');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(stampTimer);
    stampTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }

  // ---------------------------------------------------------- 笔记
  function nowHM() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function notesOf(id) { return App.notes[id] || (App.notes[id] = []); }

  function addNote(text, kind) {
    if (!App.active) return;
    notesOf(App.active.id).push({ at: nowHM(), kind: kind || 'note', text: text });
    renderNotes();
    scheduleSave();
  }

  function setDraft(v) {
    if (!App.active) return;
    App.drafts[App.active.id] = v;
    scheduleSave();
  }

  function renderNotes() {
    var exp = App.active;
    if (!exp) return;
    var list = notesOf(exp.id);
    var log = $('note-log');
    log.innerHTML = '';
    if (!list.length) {
      log.innerHTML = '<div class="note-empty">还没有记录。<br>摆好器材、动一动，读数会自动出现在这里。</div>';
    } else {
      list.slice(-120).forEach(function (n) {
        var d = document.createElement('div');
        d.className = 'note-line ' + (n.kind || 'note');
        var t = document.createElement('span'); t.className = 't'; t.textContent = n.at;
        var x = document.createElement('span'); x.className = 'x'; x.textContent = n.text;
        d.appendChild(t); d.appendChild(x); log.appendChild(d);
      });
      log.scrollTop = log.scrollHeight;
    }
    $('note-count').textContent = list.length + ' 条';
    renderTable();
    var ta = $('note-edit');
    if (document.activeElement !== ta) ta.value = App.drafts[exp.id] || '';
  }

  function renderTable() {
    var exp = App.active, box = $('data-table');
    if (!exp || !box) return;
    var hint = $('data-hint');
    if (hint) hint.textContent = exp.tableHint ? '　' + exp.tableHint : '';
    var cols = exp.columns || [];
    if (!cols.length) { box.innerHTML = '<div class="placeholder hand">这个实验不用填表，读数会写进笔记。</div>'; return; }
    var rows = App.tables[exp.id] || [];
    var html = '<table><thead><tr><th>#</th>';
    cols.forEach(function (c) { html += '<th>' + c + '</th>'; });
    html += '</tr></thead><tbody>';
    if (!rows.length) {
      html += '<tr><td class="empty">—</td>';
      cols.forEach(function () { html += '<td class="empty">—</td>'; });
      html += '</tr>';
    } else {
      rows.slice(-6).forEach(function (r, i) {
        html += '<tr><td>' + (rows.length - Math.min(6, rows.length) + i + 1) + '</td>';
        r.forEach(function (c) { html += '<td>' + (c == null ? '' : c) + '</td>'; });
        html += '</tr>';
      });
    }
    html += '</tbody></table>';
    box.innerHTML = html;
    updateSubmit();
  }

  // ---------------------------------------------------------- 提交给老师
  var NEED_ROWS = 3;

  function tableRows(exp) { return (exp && App.tables[exp.id]) || []; }

  function updateSubmit() {
    var btn = $('btn-save');
    if (!btn || !App.active) return;
    var n = tableRows(App.active).length;
    btn.textContent = n >= NEED_ROWS ? '提交给老师' : '提交给老师（' + n + '/' + NEED_ROWS + '）';
    btn.disabled = n < NEED_ROWS;
    var st = $('save-state');
    if (!st) return;
    var at = App.submitted[App.active.id];
    if (at) st.textContent = '已提交 ' + at;
    else if (n < NEED_ROWS) st.textContent = '还可记 ' + (NEED_ROWS - n) + ' 条再来提交';
    else st.textContent = '够 3 条了，可以交';
  }

  async function submitData() {
    var exp = App.active;
    if (!exp) return;
    var rows = tableRows(exp);
    if (rows.length < NEED_ROWS) { toast('数据表至少 3 条才能提交'); return; }

    stashLocal(exp);
    if (App.mode === 'class') doSave(true);

    try {
      var res = await fetch('/api/lab/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiment: exp.id, columns: exp.columns || [], rows: rows })
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 401) { toast('要先在学生端课堂登录，才能提交给老师'); return; }
      if (!res.ok || !data.ok) { toast(data.error || '提交失败'); return; }
      App.submitted[exp.id] = (data.at || '').slice(11, 16) || '刚刚';
      stashLocal(exp);
      addNote('提交给老师：' + data.count + ' 条数据（' + App.submitted[exp.id] + '）', 'ok');
      toast('已提交给老师（' + data.count + ' 条数据）');
      updateSubmit();
    } catch (e) {
      toast('提交失败：' + e.message);
    }
  }

  // ---------------------------------------------------------- 保存
  // 本机优先：不管有没有登录课堂，笔记都先写进 localStorage；
  // 学生在课堂里用的时候，再顺手同步一份到 data/lab/ 给老师看。
  var LS_KEY = 'cohort.lab.v1';
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeLocal(all) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch (e) { }
  }
  function stashLocal(exp) {
    var all = readLocal();
    all[exp.id] = {
      records: notesOf(exp.id).map(function (n) { return { at: n.at, kind: n.kind, text: n.text }; }),
      note: App.drafts[exp.id] || '',
      tables: App.tables[exp.id] || [],
      submitted: App.submitted[exp.id] || '',
      updated_at: new Date().toISOString()
    };
    writeLocal(all);
  }

  function scheduleSave() {
    clearTimeout(App.saveTimer);
    App.saveTimer = setTimeout(doSave, 1400);
    var st = $('save-state');
    if (st) st.textContent = '待保存…';
  }

  function collectPayload(exp) {
    var records = notesOf(exp.id).map(function (n) { return { at: n.at, kind: n.kind, text: n.text }; });
    return { experiment: exp.id, records: records, note: (App.drafts[exp.id] || '') };
  }

  async function doSave(force) {
    if (!App.active) return;
    if (App.saving) { clearTimeout(App.saveTimer); App.saveTimer = setTimeout(doSave, 600); return; }
    var exp = App.active;
    var payload = collectPayload(exp);
    var st = $('save-state');
    stashLocal(exp);                       // 本机先落，断网 / 没登录也不会丢

    if (App.mode !== 'class') {
      if (st) st.textContent = '已存本机';
      $('lab-save').textContent = '本机保存';
      if (force) toast('已存在这台电脑上');
      return;
    }

    App.saving = true;
    try {
      var res = await fetch('/api/lab/record', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 401 || res.status === 409) { App.mode = 'solo'; throw new Error(data.error || '未连课堂'); }
      if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
      if (st) st.textContent = App.submitted[exp.id] ? '已提交 ' + App.submitted[exp.id] : '已保存';
      $('lab-save').textContent = '记录已保存';
      if (force) toast('记录已保存到课堂');
    } catch (e) {
      if (st) st.textContent = App.mode === 'class' ? '同步失败（本机已存）' : '已存本机';
      if (force) toast('已存本机；' + e.message);
    } finally {
      App.saving = false;
    }
  }

  async function loadRecords() {
    var local = readLocal();
    Object.keys(local).forEach(function (id) {
      var it = local[id] || {};
      App.notes[id] = Array.isArray(it.records) ? it.records : [];
      App.drafts[id] = it.note || '';
      App.tables[id] = Array.isArray(it.tables) ? it.tables : [];
      App.submitted[id] = it.submitted || '';
    });
    renderNotes();

    var st = $('save-state');
    App.mode = 'solo';
    $('lab-save').textContent = '本机保存';
    if (st) st.textContent = '本机保存';

    try {
      var res = await fetch('/api/lab/records');
      if (res.status === 401) return;                    // 没登录：就当一个独立的实验室用
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var all = data.experiments || {};
      var has = Object.keys(all).length > 0;
      if (!has) { App.mode = 'class'; return; }
      Object.keys(all).forEach(function (id) {
        var it = all[id] || {};
        App.notes[id] = (it.records || []).map(function (r) { return { at: r.at, kind: r.kind, text: r.text }; });
        App.drafts[id] = it.note || '';
      });
      App.mode = 'class';
      $('lab-save').textContent = '记录已保存';
      renderNotes();
      if (st) st.textContent = '已载入上次记录';
    } catch (e) {
      if (st) st.textContent = '本机保存';
    }
  }

  // ---------------------------------------------------------- AI
  // 模型爱写 LaTeX，页面上没有公式渲染，先转成一行纯文字再显示
  var TEX_SYM = {
    times: '×', cdot: '·', div: '÷', pm: '±', approx: '≈', leq: '≤', geq: '≥', neq: '≠',
    Omega: 'Ω', rho: 'ρ', mu: 'μ', pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', eta: 'η',
    Delta: 'Δ', lambda: 'λ', degree: '°', Rightarrow: '→', rightarrow: '→', to: '→',
    left: '', right: '', mathrm: '', text: '', mathbf: '', displaystyle: ''
  };
  function texPlain(src) {
    var s = String(src);
    s = s.replace(/\$\$([\s\S]*?)\$\$/g, '$1').replace(/\\\[([\s\S]*?)\\\]/g, '$1')
         .replace(/\\\(([\s\S]*?)\\\)/g, '$1').replace(/\$([^$\n]+)\$/g, '$1');
    for (var i = 0; i < 3; i++) s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, function (m, a, b) {
      var wrap = function (x) { return (/[+\-×·]/.test(x) && !/^[0-9.]+$/.test(x) ? '(' + x + ')' : x); };
      return wrap(a) + '/' + wrap(b);
    });
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
    var sup = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    s = s.replace(/\^\{?([0-9+\-]+)\}?/g, function (m, d) { return d.split('').map(function (c) { return sup[c] || c; }).join(''); });
    var sub = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
    s = s.replace(/_\{?([0-9+\-]+)\}?/g, function (m, d) { return d.split('').map(function (c) { return sub[c] || c; }).join(''); });
    s = s.replace(/\\([a-zA-Z]+)/g, function (m, n) { return TEX_SYM.hasOwnProperty(n) ? TEX_SYM[n] : ''; });
    return s.replace(/[{}]/g, '').replace(/[ \t]{2,}/g, ' ');
  }

  var chatLoaded = false;
  function chatAppend(role, text, who) {
    var log = $('chat-log');
    if (!log) return;
    var empty = log.querySelector('.empty'); if (empty) empty.remove();
    var d = document.createElement('div');
    d.className = 'msg ' + role;
    if (who) {
      var w = document.createElement('div'); w.className = 'who'; w.textContent = who; d.appendChild(w);
    }
    d.appendChild(document.createTextNode(texPlain(text)));
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    if (role === 'user' || role === 'ai') {
      App.chatRecent.push({ role: role === 'user' ? 'user' : 'assistant', content: text });
      if (App.chatRecent.length > 12) App.chatRecent.shift();
    }
    return d;
  }

  function contextSnapshot() {
    if (!App.inst) return '';
    var parts = [];
    parts.push('实验：' + App.active.name + '（' + (App.active.grade || '') + '）');
    try {
      var rs = App.inst.readings ? App.inst.readings() : [];
      if (rs && rs.length) {
        parts.push('读数：' + rs.map(function (r) { return r.label + ' ' + r.value + (r.unit || ''); }).join('，'));
      }
      if (App.inst.placed) {
        var has = (App.active.tools || []).filter(function (t) {
          return App.inst.placed.has(t.id) && (!t.qty || (App.inst.counts[t.id] || 0) > 0);
        }).map(function (t) { return t.name; });
        var miss = (App.active.tools || []).filter(function (t) { return !App.inst.placed.has(t.id); }).map(function (t) { return t.name; });
        parts.push('器材：已放 ' + (has.join('、') || '无') + (miss.length ? '；未放 ' + miss.join('、') : ''));
      }
      if (App.inst.snapshot) parts.push(App.inst.snapshot());
    } catch (e) { }
    var list = App.notes[App.active.id] || [];
    if (list.length) {
      parts.push('最近记录：' + list.slice(-4).map(function (n) { return n.text; }).join(' / '));
    }
    return parts.join('｜').slice(0, 560);
  }

  async function loadChatHistory() {
    if (chatLoaded) return;
    chatLoaded = true;
    if (App.mode !== 'class') {
      chatAppend('sys', '实验室可以单独用。AI 需要先登录一次（老师用 /teacher，学生从课堂页进），不登录也能做实验、记笔记。');
      return;
    }
    try {
      var res = await fetch('/api/chat/history');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var msgs = data.messages || [];
      if (!msgs.length) {
        chatAppend('sys', '这是课堂里同一个 AI 助教。它能看到你实验台的读数，问它“为什么”比问它“答案”更有用。');
      }
      msgs.forEach(function (m) {
        if (m.role === 'user') chatAppend('user', m.content, '我');
        else if (m.role === 'assistant') chatAppend('ai', m.content, 'AI 助教');
      });
    } catch (e) {
      chatAppend('sys', '没连上课堂历史，可以直接问；AI 会读你实验台的当前读数。');
    }
  }

  async function ask(text) {
    var input = $('chat-text');
    if (text && input) input.value = text;
    var msg = (text || (input ? input.value : '')).trim();
    if (!msg) return;
    if (input) { input.value = ''; input.style.height = 'auto'; }
    chatAppend('user', msg, '我');
    var pending = chatAppend('ai', '正在思考…', 'AI 助教');
    pending.style.opacity = '.55';
    var sendBtn = document.querySelector('#chat-form button');
    if (sendBtn) sendBtn.disabled = true;
    try {
      var res = await fetch('/api/lab/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          context: contextSnapshot(),
          history: App.mode === 'class' ? [] : App.chatRecent.slice(-8)
        })
      });
      var data = await res.json().catch(function () { return {}; });
      pending.remove();
      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          chatAppend('sys', 'AI 要先登录才能用：老师打开 /teacher 输一次口令，学生从课堂页进来。实验和笔记不登录也能用。');
        } else if (data.code === 'NO_SESSION') {
          chatAppend('sys', '教师还没有开启本节课程。');
        } else {
          chatAppend('sys', data.error || 'AI 暂时不可用');
        }
      } else {
        chatAppend('ai', data.reply, 'AI 助教');
        $('ai-dot').className = 'dot ok';
      }
    } catch (e) {
      pending.remove();
      chatAppend('sys', '网络断了：' + e.message);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  function switchTab(name) {
    document.querySelectorAll('.side-tabs button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    $('pane-note').classList.toggle('hidden', name !== 'note');
    $('pane-ai').classList.toggle('hidden', name !== 'ai');
    if (name === 'ai') loadChatHistory();
  }

  // ---------------------------------------------------------- 器材图标（小画）
  function drawIcon(ctx, id, w, h) {
    ctx.clearRect(0, 0, w, h);
    var g = G, c = '#4b4a41';
    var cx = w / 2, cy = h / 2;
    ctx.save();
    switch (id) {
      case 'lever':
        g.line(ctx, 4, h - 9, w - 4, h - 9, { color: c, w: 1.6 });
        g.poly(ctx, [[cx - 5, h - 9], [cx, h - 18], [cx + 5, h - 9]], { color: c, w: 1.2 });
        break;
      case 'weights':
      case 'hook':
        g.line(ctx, cx, 5, cx, 12, { color: c, w: 1.5 });
        g.rect(ctx, cx - 9, 12, 18, 14, { color: c, w: 1.3, fill: '#cfc2a5', fillAlpha: .5 });
        g.text(ctx, cx, 23, '50g', { size: 8, color: c, align: 'center' });
        break;
      case 'candle':
        g.rect(ctx, cx - 5, 12, 10, h - 20, { color: c, w: 1.2, fill: '#f0e5c8', fillAlpha: .7 });
        g.arc(ctx, cx, 10, 4, 0, Math.PI * 2, { color: '#ad1f26', w: 1.2 });
        break;
      case 'lens':
        g.arc(ctx, cx - 4, cy, 11, -1.2, 1.2, { color: c, w: 1.4 });
        g.arc(ctx, cx + 4, cy, 11, Math.PI - 1.2, Math.PI + 1.2, { color: c, w: 1.4 });
        g.line(ctx, cx - 4, cy - 10, cx + 4, cy - 10, { color: c, w: 1 });
        g.line(ctx, cx - 4, cy + 10, cx + 4, cy + 10, { color: c, w: 1 });
        break;
      case 'screen':
        g.rect(ctx, 7, 8, w - 14, h - 18, { color: c, w: 1.2, fill: '#e8e0cb', fillAlpha: .6 });
        g.hatch(ctx, [[7, 8], [w - 7, 8], [w - 7, h - 10], [7, h - 10]], { color: c, gap: 6, alpha: .3 });
        break;
      case 'bench':
        g.line(ctx, 3, h - 8, w - 3, h - 8, { color: c, w: 1.6 });
        for (var i = 6; i < w - 4; i += 8) g.line(ctx, i, h - 8, i, h - 5, { color: c, w: 1, alpha: .7 });
        break;
      case 'battery':
        g.rect(ctx, 6, 10, 12, 18, { color: c, w: 1.2, fill: '#d9cdb0', fillAlpha: .6 });
        g.rect(ctx, 20, 14, 12, 14, { color: c, w: 1.2, fill: '#e4d9ba', fillAlpha: .6 });
        g.line(ctx, 18, 16, 20, 16, { color: c, w: 1 });
        g.text(ctx, 26, 8, '3V', { size: 8, color: '#33507d', align: 'center' });
        break;
      case 'switch':
        g.line(ctx, 5, 22, w - 5, 22, { color: c, w: 1.2 });
        g.line(ctx, 8, 22, 14, 22, { color: c, w: 2.4 });
        g.line(ctx, w - 14, 22, w - 8, 22, { color: c, w: 2.4 });
        g.line(ctx, 14, 22, w - 14, 11, { color: c, w: 1.6 });
        break;
      case 'ammeter':
      case 'voltmeter':
        g.rect(ctx, 5, 7, w - 10, h - 16, { color: c, w: 1.2, fill: '#fdfdfa', fillAlpha: .7 });
        g.arc(ctx, cx, h - 16, 10, Math.PI, 0, { color: c, w: 1 });
        g.line(ctx, cx, h - 16, cx + 4, h - 25, { color: '#ad1f26', w: 1.2 });
        g.text(ctx, cx, h - 4, id === 'ammeter' ? 'A' : 'V', { size: 9, color: '#33507d', align: 'center' });
        break;
      case 'resistor':
        g.rect(ctx, 8, 14, w - 16, 12, { color: c, w: 1.3, fill: '#e7dcc2', fillAlpha: .7 });
        g.line(ctx, 3, 20, 8, 20, { color: c, w: 1.2 });
        g.line(ctx, w - 8, 20, w - 3, 20, { color: c, w: 1.2 });
        g.text(ctx, cx, 32, 'Rx', { size: 8, color: '#ad1f26', align: 'center' });
        break;
      case 'rheostat':
        g.rect(ctx, 4, 13, w - 8, 10, { color: c, w: 1.2, fill: '#eee3c8', fillAlpha: .6 });
        g.coil(ctx, 8, 18, w - 16, 4, 5, { color: c, w: 1, alpha: .8 });
        g.line(ctx, cx, 8, cx, 25, { color: '#ad1f26', w: 1.4 });
        g.line(ctx, cx - 4, 8, cx + 4, 8, { color: '#ad1f26', w: 1.4 });
        break;
      case 'spring':
        g.rect(ctx, cx - 6, 6, 12, h - 14, { color: c, w: 1.2, fill: '#f2ead4', fillAlpha: .7 });
        g.line(ctx, cx, h - 8, cx, h - 3, { color: c, w: 1.4 });
        g.line(ctx, 6, h - 8, w - 6, h - 8, { color: c, w: 1, alpha: .6 });
        break;
      case 'beaker':
      case 'water':
        g.poly(ctx, [[6, 10], [w - 6, 10], [w - 9, h - 5], [9, h - 5]], { color: c, w: 1.2 });
        g.line(ctx, 8, 20, w - 8, 20, { color: '#33507d', w: 1, alpha: .7 });
        g.hatch(ctx, [[8, 20], [w - 8, 20], [w - 9, h - 6], [9, h - 6]], { color: '#33507d', gap: 5, alpha: .25 });
        break;
      case 'stand':
        g.line(ctx, 8, h - 6, 8, 10, { color: c, w: 1.6 });
        g.line(ctx, 8, 10, w - 8, 10, { color: c, w: 1.4 });
        g.line(ctx, 4, h - 6, 16, h - 6, { color: c, w: 1.6 });
        break;
      case 'cylinder':
        g.poly(ctx, [[cx - 7, 10], [cx + 7, 10], [cx + 7, h - 8], [cx - 7, h - 8]], { color: c, w: 1.2, fill: '#e4d3aa', fillAlpha: .6 });
        g.line(ctx, cx, 4, cx, 10, { color: c, w: 1.2 });
        break;
      case 'wire':
        g.line(ctx, 4, h - 8, cx - 6, 8, { color: c, w: 1.3 });
        g.line(ctx, cx - 6, 8, cx + 8, h - 10, { color: c, w: 1.3 });
        g.line(ctx, cx + 8, h - 10, w - 4, 12, { color: c, w: 1.3 });
        break;
      case 'probe':
        g.rect(ctx, cx - 5, 6, 10, 14, { color: c, w: 1.2, fill: '#fdfcf8', fillAlpha: .85 });
        g.line(ctx, cx, 20, cx, h - 10, { color: c, w: 1.6 });
        g.circle(ctx, cx, h - 8, 5, { color: c, w: 1.1, fill: '#e7b0a8', fillAlpha: .8 });
        g.text(ctx, cx + 2, 16, '℃', { size: 8, color: '#ad1f26' });
        break;
      case 'ice':
        g.poly(ctx, [[8, 16], [w - 9, 11], [w - 7, h - 8], [11, h - 10]], { color: c, w: 1.2, fill: '#cfe8f2', fillAlpha: .5 });
        g.line(ctx, 14, 20, 22, 28, { color: '#ffffff', w: 1, alpha: .9 });
        g.line(ctx, 22, 28, 30, 24, { color: '#ffffff', w: 1, alpha: .9 });
        break;
      case 'rbox':
        g.rect(ctx, 5, 12, w - 10, h - 24, { color: c, w: 1.3, fill: '#efe8d6', fillAlpha: .6 });
        g.rect(ctx, 10, 18, 12, 16, { color: c, w: 1 });
        g.rect(ctx, w - 22, 18, 12, 16, { color: c, w: 1 });
        g.text(ctx, 16, 30, '0', { size: 8, color: c, align: 'center' });
        g.text(ctx, w - 16, 30, 'Ω', { size: 8, color: '#ad1f26', align: 'center' });
        break;
      default:
        g.circle(ctx, cx, cy, 9, { color: c, w: 1.3 });
        g.text(ctx, cx, cy + 4, (id || '?').slice(0, 1), { size: 10, color: c, align: 'center' });
    }
    ctx.restore();
  }

  // ---------------------------------------------------------- 器材架
  function renderShelf() {
    var exp = App.active, box = $('shelf');
    if (!exp || !box) return;
    box.innerHTML = '';
    var lastGroup = '';
    var tools = exp.tools || [];
    // 只有一组器材的实验也给它一个组头（没有分组字段时兜底），和通用台「电学 9 / 光学 4」同一套视觉
    if (tools.length && !tools.some(function (t) { return !!t.group; })) {
      var gh0 = document.createElement('div');
      gh0.className = 'shelf-group';
      gh0.innerHTML = '<span>器材</span><em>' + tools.length + '</em>';
      box.appendChild(gh0);
    }
    (exp.tools || []).forEach(function (t) {
      if (t.group && t.group !== lastGroup) {
        var gh = document.createElement('div');
        gh.className = 'shelf-group';
        gh.innerHTML = '<span>' + t.group + '</span><em>' + (exp.tools || []).filter(function (x) { return x.group === t.group; }).length + '</em>';
        box.appendChild(gh);
        lastGroup = t.group;
      }
      var placed = App.inst && App.inst.placed && App.inst.placed.has(t.id);
      if (t.qty && App.inst && App.inst.counts) placed = (App.inst.counts[t.id] || 0) > 0;
      var row = document.createElement('div');
      row.className = 'shelf-item' + (placed ? ' placed' : '');
      row.draggable = true;
      row.dataset.tool = t.id;
      var cv = document.createElement('canvas');
      cv.className = 'ico'; cv.width = 84; cv.height = 76;
      cv.style.width = '42px'; cv.style.height = '38px';
      var c = cv.getContext('2d');
      c.scale(2, 2);
      drawIcon(c, t.icon || t.id, 42, 38);
      var info = document.createElement('div');
      info.innerHTML = '<div class="shelf-name">' + t.name + '</div><span class="shelf-hint">' + (t.hint || '') + '</span>';
      if (t.qty && App.inst && App.inst.counts) {
        var n = App.inst.counts[t.id] || 0;
        info.querySelector('.shelf-hint').textContent = n + ' / ' + t.qty + ' 已放';
      }
      row.appendChild(cv); row.appendChild(info);
      row.addEventListener('click', function () { toggleTool(t.id); });
      row.addEventListener('dragstart', function (e) {
        App.dragTool = t.id;
        row.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'copy'; } catch (err) { }
      });
      row.addEventListener('dragend', function () { row.classList.remove('dragging'); App.dragTool = null; });
      box.appendChild(row);
    });
  }

  function toggleTool(id, pos) {
    if (!App.inst) return;
    var t = (App.active.tools || []).filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var placed = App.inst.placed && App.inst.placed.has(id);
    if (!t.qty) {
      if (placed) {
        App.inst.placed.delete(id);
        if (App.inst.onRemove) App.inst.onRemove(id);
        toast('已把' + t.name + '收回器材架');
      } else {
        App.inst.placed.add(id);
        if (App.inst.onPlace) App.inst.onPlace(id, pos || t.pos || null);
        toast('放上' + t.name);
      }
    } else {
      if (!App.inst.counts) App.inst.counts = {};
      var n = App.inst.counts[id] || 0;
      if (n >= t.qty) {
        n = 0; App.inst.placed.delete(id);
        if (App.inst.onRemove) App.inst.onRemove(id);
        toast('把' + t.name + '全部收回');
      } else {
        n += 1;
        App.inst.placed.add(id);
        if (App.inst.onPlace) App.inst.onPlace(id, pos || t.pos || null);
        toast('放上第 ' + n + ' 个' + t.name);
      }
      App.inst.counts[id] = n;
    }
    renderShelf();
  }

  // ---------------------------------------------------------- HUD
  var hudTimer = 0;
  function renderHud() {
    var box = $('hud');
    if (!box || !App.inst) return;
    var rs = [];
    try { rs = App.inst.readings ? App.inst.readings() : []; } catch (e) { rs = []; }
    if (!rs || !rs.length) { box.innerHTML = ''; return; }
    box.innerHTML = rs.map(function (r) {
      return '<span class="chip ' + (r.tone || '') + '">' + r.label + ' <b>' + r.value + '</b>' + (r.unit || '') + '</span>';
    }).join('');
    var hint = (App.inst && App.inst.hint) ? App.inst.hint()
             : (App.active.hint ? App.active.hint(App.inst) : '');
    var bh = $('bar-hint'); if (bh) bh.textContent = hint || '';
  }

  // ---------------------------------------------------------- 切换实验
  function makeInstance(exp) {
    var ctxApi = {
      placed: new Set(),
      counts: {},
      note: function (t, k) { addNote(t, k); },
      toast: toast,
      stamp: stamp,
      save: scheduleSave,
      Lab: window.CohortLab
    };
    var inst = exp.create(ctxApi) || {};
    inst.placed = ctxApi.placed;
    inst.counts = ctxApi.counts || {};
    return inst;
  }

  function activate(id, silent) {
    var exp = App.byId[id];
    if (!exp) return;
    App.active = exp;
    if (App.inst && App.inst.onLeave) { try { App.inst.onLeave(); } catch (e) { console.warn('leave', e); } }
    App.inst = makeInstance(exp);
    App.paused = false;
    $('btn-pause').textContent = '暂停';
    // 顶栏
    document.querySelectorAll('.exp-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.exp === id);
    });
    $('brief-title').textContent = exp.name;
    $('brief-aim').textContent = exp.aim || '';
    $('brief-formula').textContent = exp.formula || '';
    var steps = $('brief-steps');
    steps.innerHTML = '<ol>' + (exp.steps || []).map(function (s, i) { return '<li><b>' + (i + 1) + '.</b><span>' + s + '</span></li>'; }).join('') + '</ol>';
    steps.hidden = true;
    renderShelf();
    renderNotes();
    renderHud();
    var chips = $('chat-chips');
    chips.innerHTML = (exp.ask || []).map(function (q) { return '<button type="button">' + q + '</button>'; }).join('');
    if (!silent) toast(exp.tip || ('进入实验：' + exp.name));
    if (App.inst.onEnter) App.inst.onEnter();
    scheduleSave();
  }

  // ---------------------------------------------------------- 交互
  function bindCanvas() {
    var cv = App.canvas;
    var dragging = false;
    cv.addEventListener('pointerdown', function (e) {
      if (!App.inst || !App.inst.down) return;
      var p = toDesign(e);
      cv.setPointerCapture(e.pointerId);
      if (App.inst.down(p, e) !== false) { dragging = true; e.preventDefault(); }
    });
    cv.addEventListener('pointermove', function (e) {
      var p = toDesign(e);
      if (dragging && App.inst && App.inst.move) App.inst.move(p, e);
      else if (App.inst && App.inst.hover) App.inst.hover(p, e);
      if (App.inst && App.inst.cursor) {
        var cur = App.inst.cursor(p);
        cv.style.cursor = cur || 'default';
      }
    });
    cv.addEventListener('pointerup', function (e) {
      if (dragging && App.inst && App.inst.up) App.inst.up(toDesign(e), e);
      dragging = false;
      if (cv.releasePointerCapture) try { cv.releasePointerCapture(e.pointerId); } catch (err) { }
    });
    cv.addEventListener('pointercancel', function () { dragging = false; });

    var stage = $('stage-wrap');
    stage.addEventListener('dragover', function (e) { e.preventDefault(); stage.classList.add('drop-over'); });
    stage.addEventListener('dragleave', function () { stage.classList.remove('drop-over'); });
    stage.addEventListener('drop', function (e) {
      e.preventDefault(); stage.classList.remove('drop-over');
      var id = App.dragTool || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      if (!id) return;
      var t = (App.active.tools || []).filter(function (x) { return x.id === id; })[0];
      if (!t) return;
      var p = toDesign(e);
      var okToAdd = t.qty
        ? ((App.inst.counts[id] || 0) < t.qty)
        : !App.inst.placed.has(id);
      if (okToAdd) toggleTool(id, p);
      if (App.inst.onDrop) App.inst.onDrop(id, p);
      renderShelf();
    });
  }

  // 地址栏上的 ?m=<模块id>：这节课老师指定了用哪个实验室
  function urlModule() {
    var q = (location.search || '').replace(/^\?/, '').split('&');
    for (var i = 0; i < q.length; i++) {
      var kv = q[i].split('=');
      if (kv[0] === 'm') return decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')).toLowerCase();
    }
    return '';
  }

  // 老师后台开放了哪些实验页签（拿不到就全开）
  function loadLabConfig() {
    return fetch('/api/lab/config', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && d.ok ? d : null; })
      .catch(function () { return null; });
  }

  // ---------------------------------------------------------- 启动
  function boot() {
    App.canvas = $('pad');
    if (!App.canvas) return;
    App.ctx = App.canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    // 实验页签：按老师后台的开放清单过滤，再按「力学 / 热学 / 光学 / 电学 / 综合」归组
    var tabs = $('exp-tabs');
    var FAMILIES = ['力学', '热学', '光学', '电学', '综合'];
    function renderTabs(enabled) {
      var list = enabled && enabled.length ? App.exps.filter(function (e) { return enabled.indexOf(e.id) >= 0; }) : App.exps.slice();
      if (!list.length) list = App.exps.slice(0, 1);
      var rank = {};
      FAMILIES.forEach(function (f, i) { rank[f] = i; });
      list.sort(function (a, b) { return (rank[a.group] == null ? 99 : rank[a.group]) - (rank[b.group] == null ? 99 : rank[b.group]); });
      var html = '', last = '', n = 0;
      // 每组先数一下有几件实验，页签组标签上带一个计数胶囊，和控制台「实验室页签」的分组头对齐
      var cnt = {};
      list.forEach(function (e) { var f = e.group || ''; cnt[f] = (cnt[f] || 0) + 1; });
      list.forEach(function (e) {
        var fam = e.group || '';
        if (fam && fam !== last) {
          html += '<span class="exp-group"><span>' + fam + '</span><em>' + (cnt[fam] || 0) + '</em></span>';
          last = fam;
        }
        html += '<button class="exp-tab" type="button" data-exp="' + e.id + '"><span class="no">' + ('0' + (++n)).slice(-2) + '</span>' + e.name + '</button>';
      });
      tabs.innerHTML = html;
      return list;
    }
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('.exp-tab');
      if (b) activate(b.dataset.exp);
    });

    // 笔记 / AI
    document.querySelectorAll('.side-tabs button').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.tab); });
    });
    $('chat-form').addEventListener('submit', function (e) {
      e.preventDefault(); ask();
    });
    $('chat-text').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(); }
    });
    $('chat-text').addEventListener('input', function () {
      this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 78) + 'px';
    });
    $('chat-chips').addEventListener('click', function (e) {
      if (e.target.tagName === 'BUTTON') ask(e.target.textContent);
    });
    $('btn-ask-data').addEventListener('click', function () {
      switchTab('ai');
      var rows = App.tables[App.active.id] || [];
      var text = rows.length
        ? '这是我刚记的 ' + rows.length + ' 组数据：' + rows.slice(-5).map(function (r, i) { return '(' + r.join('，') + ')'; }).join('；') + '。从这些数据能得出什么结论？我哪里理解偏了？'
        : '我现在实验台上的读数是：' + (App.inst.readings ? App.inst.readings().map(function (r) { return r.label + r.value + (r.unit || ''); }).join('，') : '') + '。帮我判断一下现象对不对。';
      ask(text);
    });

    $('note-edit').addEventListener('input', function () { setDraft(this.value); });
    $('btn-clear').addEventListener('click', function () {
      if (!confirm('清空这个实验的笔记和数据表？')) return;
      App.notes[App.active.id] = [];
      App.tables[App.active.id] = [];
      App.drafts[App.active.id] = '';
      renderNotes(); scheduleSave(); toast('已清空');
    });
    $('btn-save').addEventListener('click', submitData);
    $('btn-record').addEventListener('click', function () {
      if (!App.inst || !App.inst.dataRow) return;
      var row = App.inst.dataRow();
      if (!row) { toast('现在还没有可记录的读数'); return; }
      if (!App.tables[App.active.id]) App.tables[App.active.id] = [];
      App.tables[App.active.id].push(row);
      renderTable(); scheduleSave();
      toast('已记入数据表第 ' + App.tables[App.active.id].length + ' 条');
    });

    $('btn-pause').addEventListener('click', function () {
      App.paused = !App.paused;
      this.textContent = App.paused ? '继续' : '暂停';
    });
    $('btn-reset').addEventListener('click', function () {
      if (App.inst && App.inst.reset) App.inst.reset();
      renderShelf();
      renderTable();
      toast('已复位');
    });
    $('btn-grid').addEventListener('click', function () {
      App.grid = !App.grid;
      this.classList.toggle('on', App.grid);
      this.textContent = App.grid ? '草稿格' : '无格';
    });
    $('btn-grid').classList.toggle('on', App.grid);
    $('speed').addEventListener('change', function () { App.speed = parseFloat(this.value) || 1; });
    $('btn-full').addEventListener('click', function () {
      window.open(location.pathname + '?full=1', '_blank');
    });
    $('brief-steps-btn').addEventListener('click', function () {
      var s = $('brief-steps'); s.hidden = !s.hidden;
    });

    bindCanvas();
    loadLabConfig().then(function (cfg) {
      var list = renderTabs(cfg && cfg.enabled ? cfg.enabled : null);
      // 排课时老师选的实验室会带在地址上（?m=lever / ?m=sandbox&lab=xxx），优先打开它
      var want = urlModule();
      var def = (want && list.some(function (e) { return e.id === want; })) ? want
        : (cfg && cfg.default && list.some(function (e) { return e.id === cfg.default; }) ? cfg.default : list[0].id);
      activate(def, true);
      // 上课中：页签只放本节课选中的实验室，并在顶部标出来
      if (cfg && cfg.scope === 'lesson') {
        var tag = $('lesson-tag');
        if (tag) {
          var names = (list || []).map(function (e) { return e.name; }).join(' / ');
          tag.textContent = '本节课：' + (cfg.lesson || '实验') + (names ? ' · ' + names : '');
          document.title = (cfg.lesson || '实验') + ' · 草纸物理实验室';
        }
      }
      // 本节课指定了自定义实验室：直接载入那一间
      if (cfg && cfg.custom) {
        try {
          var u = new URL(location.href);
          if (!u.searchParams.get('lab')) {
            u.searchParams.set('lab', cfg.custom);
            u.searchParams.set('m', 'sandbox');
            location.replace(u.toString());
            return;
          }
        } catch (e) { }
      }
      if (cfg && cfg.free === false) {
        toast('老师这次只开放了课堂内使用，自由练习已关闭');
      }
      loadRecords();
    });
    // AI 状态点
    fetch('/api/ai/models').then(function (r) { return r.json(); }).then(function (d) {
      $('ai-dot').className = 'dot ' + (d.ok ? 'ok' : 'bad');
      $('ai-dot').title = d.ok ? 'AI 在线' : 'AI 未连接：' + (d.error || '');
    }).catch(function () { $('ai-dot').className = 'dot bad'; });

    setInterval(renderHud, 220);
    requestAnimationFrame(loop);
  }

  // 暴露接口（实验插件用它注册；外部也可以调）
  window.CohortLab = {
    register: register,
    G: G,
    toast: toast,
    stamp: stamp,
    note: function (t, k) { addNote(t, k); },
    ask: ask,
    switchTab: switchTab,
    context: contextSnapshot,
    _debug: function () {
      return { exp: App.active && App.active.id, frames: App.frames || 0, paused: App.paused, scale: App.view.scale, placed: App.inst ? Array.from(App.inst.placed) : [] };
    },
    version: '1.0.0'
  };

  window.addEventListener('load', boot);
})();
