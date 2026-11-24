/* Cohort 单页控制台：页签切换 + 各区块交互（不跳页） */
(function () {
  'use strict';

  var C = window.COHORT_CONSOLE || { courses: [], sessionId: null, ctx: 6 };

  // ---------------- 页签 ----------------
  document.querySelectorAll('.c-tab').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-tab');
      document.querySelectorAll('.c-tab').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      document.querySelectorAll('.c-panel').forEach(function (p) {
        p.classList.toggle('is-on', p.getAttribute('data-panel') === t);
      });
      location.hash = t;
    });
  });
  var h = (location.hash || '').replace('#', '');
  if (h) {
    var tab = document.querySelector('.c-tab[data-tab="' + h + '"]');
    if (tab) tab.click();
  }

  // ---------------- 顶部：复制地址 ----------------
  var copyBtn = document.getElementById('btn-copy');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var txt = (document.getElementById('lan-url') || {}).textContent || '';
    navigator.clipboard.writeText(txt.trim()).then(function () { toast('地址已复制：' + txt.trim(), 'ok'); });
  });

  // ---------------- 开课 / 停课 ----------------
  function startSession(courseId) {
    api('/api/admin/session/start', { course_id: courseId }).then(function (r) {
      if (!r.ok) return toast(r.error || '开启失败', 'bad');
      toast('已开课', 'ok');
      setTimeout(function () { location.reload(); }, 400);
    });
  }

  document.querySelectorAll('[data-start]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!confirm('开启这节课？学生端会立刻出现实验入口。')) return;
      startSession(b.getAttribute('data-start'));
    });
  });

  var stopBtn = document.querySelector('[data-stop]');
  if (stopBtn) stopBtn.addEventListener('click', function () {
    if (!confirm('结束本次课程？结束后学生端会回到等待状态。')) return;
    stopBtn.disabled = true;
    api('/api/admin/session/stop', {}).then(function (r) {
      if (!r.ok) { stopBtn.disabled = false; return toast(r.error || '结束失败', 'bad'); }
      toast('已下课，报表在后台生成中，稍后进「报表」页看', 'ok');
      setTimeout(function () { location.reload(); }, 1200);
    });
  });

  var repBtn = document.getElementById('btn-report-now');
  if (repBtn) repBtn.addEventListener('click', function () {
    repBtn.disabled = true;
    repBtn.textContent = '生成中…';
    api('/api/admin/report/build', { session_id: repBtn.getAttribute('data-session') }).then(function (r) {
      repBtn.disabled = false;
      repBtn.textContent = '立即生成报表';
      if (!r.ok) return toast(r.error || '生成失败', 'bad');
      toast('报表已生成，去「报表」页查看', 'ok');
      setTimeout(function () { location.reload(); }, 800);
    });
  });

  // ---------------- 实时状态 ----------------
  function refreshLive() {
    api('/api/admin/console', null, 'GET').then(function (r) {
      if (!r.ok) return;
      var el = document.getElementById('st-count');
      if (el) el.textContent = r.attendees.length;
      var q = document.getElementById('st-q');
      if (q) q.textContent = r.attendees.reduce(function (s, a) { return s + (a.questions || 0); }, 0);
      var list = document.getElementById('att-list');
      if (list && r.attendees.length) {
        var rows = r.attendees.map(function (a) {
          return '<tr><td><div style="font-weight:600">' + esc(a.name) + '</div><div class="small mono dim">#' + esc(a.no) + '</div></td>'
            + '<td class="mono small">' + esc(a.ip) + '</td><td class="num">' + a.questions + '</td>'
            + '<td>' + (a.online ? '<span class="badge ok"><span class="dot"></span>在线</span>' : '<span class="badge warn">离线</span>') + '</td></tr>';
        }).join('');
        list.innerHTML = '<table><thead><tr><th>学生</th><th style="width:130px">IP</th><th style="width:70px">提问</th><th style="width:90px">状态</th></tr></thead><tbody>' + rows + '</tbody></table>';
      }
    });
  }
  if (C.sessionId) setInterval(refreshLive, 15000);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------------- 排课 ----------------
  var modal = document.getElementById('course-modal');
  function openModal(c) {
    c = c || {};
    document.getElementById('cm-title').textContent = c.id ? '编辑课程' : '新建课程';
    document.getElementById('cm-id').value = c.id || '';
    document.getElementById('cm-name').value = c.title || '';
    document.getElementById('cm-date').value = c.date || '';
    document.getElementById('cm-period').value = c.period || '';
    document.getElementById('cm-class').value = c.class || '';
    document.getElementById('cm-exp').value = c.experiment || '';
    var cmLab = document.getElementById('cm-lab');
    if (cmLab) {
      // 老课程没有 lab 字段时，按实验页签给个默认：绑了实验就默认开自由台
      var v = c.lab != null ? c.lab : (c.experiment ? 'sandbox' : '');
      var has = false;
      for (var i = 0; i < cmLab.options.length; i++) {
        if (cmLab.options[i].value === v) { has = true; break; }
      }
      cmLab.value = has ? v : '';
    }
    document.getElementById('cm-note').value = c.note || '';
    document.getElementById('cm-msg').textContent = '';
    modal.hidden = false;
  }
  var newBtn = document.getElementById('btn-new-course');
  if (newBtn) newBtn.addEventListener('click', function () { openModal(null); });
  var closeBtn = document.getElementById('cm-close');
  if (closeBtn) closeBtn.addEventListener('click', function () { modal.hidden = true; });

  document.querySelectorAll('[data-edit]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-edit');
      var c = C.courses.filter(function (x) { return x.id === id; })[0];
      openModal(c);
    });
  });

  document.querySelectorAll('[data-del]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!confirm('删除这节课？历史记录不受影响。')) return;
      api('/api/admin/course/delete', { id: b.getAttribute('data-del') }).then(function (r) {
        if (!r.ok) return toast(r.error || '删除失败', 'bad');
        toast('已删除', 'ok');
        setTimeout(function () { location.reload(); }, 400);
      });
    });
  });

  var saveBtn = document.getElementById('cm-save');
  if (saveBtn) saveBtn.addEventListener('click', function () {
    var p = {
      id: document.getElementById('cm-id').value,
      title: document.getElementById('cm-name').value.trim(),
      date: document.getElementById('cm-date').value,
      period: document.getElementById('cm-period').value.trim(),
      class: document.getElementById('cm-class').value.trim(),
      experiment: document.getElementById('cm-exp').value,
      lab: document.getElementById('cm-lab') ? document.getElementById('cm-lab').value : '',
      note: document.getElementById('cm-note').value.trim()
    };
    if (!p.title) { document.getElementById('cm-msg').textContent = '课程名称不能空'; return; }
    api('/api/admin/course/save', p).then(function (r) {
      if (!r.ok) { document.getElementById('cm-msg').textContent = r.error || '保存失败'; return; }
      toast('已保存', 'ok');
      setTimeout(function () { location.reload(); }, 400);
    });
  });

  // ---------------- 网络 ----------------
  var rescan = document.getElementById('btn-rescan');
  if (rescan) rescan.addEventListener('click', function () {
    rescan.disabled = true;
    api('/api/admin/network/scan', null, 'GET').then(function (r) {
      rescan.disabled = false;
      if (!r.ok) return toast(r.error || '扫描失败', 'bad');
      document.getElementById('ip-grid').innerHTML = gridHtml(r.hosts);
      document.getElementById('net-prefix').textContent = r.prefix + '.0/24';
      document.getElementById('net-time').textContent = '扫描于 ' + (r.scanned_at || '').slice(11, 19);
      toast('已刷新', 'ok');
    });
  });

  function gridHtml(hosts) {
    return (hosts || []).map(function (h) {
      var who = h.who ? esc(h.who) : '空闲';
      var flag = ['student', 'student-idle', 'teacher'].indexOf(h.role) >= 0 ? '<span class="flag"></span>' : '';
      return '<div class="ip-cell ' + h.role + '" title="' + esc(h.ip) + '">' + flag
        + '<div class="who">' + who + '</div><div class="addr">' + esc(h.ip) + '</div></div>';
    }).join('');
  }

  // ---------------- 报表（内联查看） ----------------
  document.querySelectorAll('[data-report]').forEach(function (el) {
    el.addEventListener('click', function () {
      loadReport(el.getAttribute('data-report'));
    });
  });

  function loadReport(id) {
    var box = document.getElementById('report-view');
    box.hidden = false;
    box.innerHTML = '<div class="empty">读取中…</div>';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    api('/api/admin/report/' + id, null, 'GET').then(function (r) {
      if (!r.ok) { box.innerHTML = '<div class="empty">报表不存在</div>'; return; }
      box.innerHTML = renderReport(r.report, r.rounds || {});
      var closeBtn = box.querySelector('[data-close-report]');
      if (closeBtn) closeBtn.addEventListener('click', function () { box.hidden = true; });
    });
  }

  function li(list) {
    if (!list || !list.length) return '<div class="empty">无</div>';
    return '<div class="list">' + list.map(function (x) {
      return '<div class="list-item"><div class="small">' + esc(typeof x === 'object' ? JSON.stringify(x) : x) + '</div></div>';
    }).join('') + '</div>';
  }

  function renderReport(rep, rounds) {
    var cs = rep.class_summary || {};
    var t = rep.totals || {};
    var html = '<div class="card-head"><h2>' + esc(rep.title) + '</h2>'
      + '<button class="btn btn-sm btn-ghost" data-close-report>收起</button></div>'
      + '<div class="small muted">' + esc(rep.class || '') + ' · ' + esc((rep.generated_at || '').replace('T', ' ').slice(0, 16))
      + ' · ' + (t.students || 0) + ' 人 · 提问 ' + (t.exchanges || 0) + ' 条 · ' + (rep.mode === 'ai' ? 'AI 归纳' : '仅统计') + '</div>';

    if (rep.ai_note) html += '<div class="notice warn mt16">' + esc(rep.ai_note) + '</div>';

    if (cs && (cs.common_misconceptions || cs.knowledge_gaps)) {
      html += '<div class="c-two mt16"><div><div class="card-head"><h3 style="font-size:13.5px;margin:0">共性误区</h3></div>' + li(cs.common_misconceptions)
        + '</div><div><div class="card-head"><h3 style="font-size:13.5px;margin:0">薄弱知识点</h3></div>' + li(cs.knowledge_gaps) + '</div></div>';
      var kv = '';
      if (cs.highlights) kv += '<div class="k">亮点</div><div>' + esc([].concat(cs.highlights).join('；')) + '</div>';
      if (cs.silent_students) kv += '<div class="k">全程沉默</div><div>' + esc([].concat(cs.silent_students).join('、') || '无') + '</div>';
      if (cs.next_step) kv += '<div class="k">下一步</div><div style="font-weight:600">' + esc(typeof cs.next_step === 'object' ? JSON.stringify(cs.next_step) : cs.next_step) + '</div>';
      if (kv) html += '<div class="kv mt16">' + kv + '</div>';
    }

    html += '<div class="card-head mt24"><h3 style="font-size:13.5px;margin:0">逐生记录</h3></div>';
    html += '<table><thead><tr><th style="width:150px">学生</th><th style="width:70px">提问</th><th>AI 归纳</th><th style="width:80px">参与度</th></tr></thead><tbody>';
    (rep.students || []).forEach(function (s) {
      var sm = s.summary || {};
      var sum = '';
      if (sm.structured) {
        if (sm.main_questions) sum += '<div class="small"><span class="dim">主要问题：</span>' + esc([].concat(sm.main_questions).join('；')) + '</div>';
        if (sm.stuck_points) sum += '<div class="small mt8"><span class="dim">卡点：</span>' + esc([].concat(sm.stuck_points).join('；')) + '</div>';
        if (sm.advice) sum += '<div class="small mt8 muted">建议：' + esc(typeof sm.advice === 'object' ? JSON.stringify(sm.advice) : sm.advice) + '</div>';
      } else if (sm.raw) {
        sum = '<div class="small"><span class="dim">AI 原文：</span>' + esc(sm.raw) + '</div>';
      } else {
        sum = '<span class="dim small">' + (s.messages > 0 ? '未生成 AI 摘要' : '本节没提问') + '</span>';
      }
      html += '<tr><td><div style="font-weight:600">' + esc(s.name) + '</div><div class="small mono dim">#' + esc(s.no) + ' · ' + esc(s.ip) + '</div></td>'
        + '<td class="num">' + (s.questions || 0) + '</td><td>' + sum + '</td><td class="num">' + esc(String(sm.engagement || '—')) + '</td></tr>';
    });
    html += '</tbody></table>';

    // 逐轮回放
    html += '<div class="card-head mt24"><h3 style="font-size:13.5px;margin:0">逐轮回放</h3>'
      + '<span class="hint">每问一答算一轮，点开折叠就是原始对话</span></div>';
    var any = false;
    (rep.students || []).forEach(function (s) {
      var rows = rounds[s.no] || [];
      if (!rows.length) return;
      any = true;
      html += '<details style="border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-bottom:8px;background:var(--panel-2)">'
        + '<summary style="cursor:pointer;font-weight:600;font-size:13.5px">' + esc(s.name)
        + ' <span class="small muted" style="font-weight:400">· ' + rows.length + ' 轮</span></summary>'
        + '<div class="list" style="margin-top:10px">';
      rows.forEach(function (rd, i) {
        html += '<div class="list-item" style="flex-direction:column;align-items:stretch;gap:6px">'
          + '<div class="small dim mono">第 ' + (i + 1) + ' 轮 · ' + esc(String(rd.q_at || '').slice(11, 19)) + '</div>';
        if (rd.q) html += '<div class="small"><span class="dim">问：</span>' + esc(rd.q) + '</div>';
        if (rd.a) html += '<div class="small muted"><span class="dim">答：</span>' + esc(rd.a.length > 500 ? rd.a.slice(0, 500) + '…' : rd.a) + '</div>';
        html += '</div>';
      });
      html += '</div></details>';
    });
    if (!any) html += '<div class="empty">这场课没有对话轮次</div>';
    return html;
  }

  // ---------------- AI ----------------
  var pollTimer = null;

  function renderAi(env) {
    var srv = document.getElementById('bd-srv');
    var dl = document.getElementById('bd-dl');
    var ld = document.getElementById('bd-ld');
    if (!env.lms_ok) {
      srv.className = 'badge warn'; srv.textContent = '需先装 LM Studio';
      dl.className = 'badge'; dl.textContent = '—';
      ld.className = 'badge'; ld.textContent = '—';
      return;
    }
    srv.className = 'badge ' + (env.server.running ? 'ok' : 'warn');
    srv.textContent = env.server.running ? ('运行中 :' + env.server.port) : '未启动';
    dl.className = 'badge ' + (env.models.length ? 'ok' : 'warn');
    dl.textContent = env.models.length ? ('已下载 ' + env.models.length) : '未下载';
    ld.className = 'badge ' + (env.loaded.length ? 'ok' : '');
    ld.textContent = env.loaded.length ? env.loaded[0] : '未加载';

    var tb = document.querySelector('#model-table tbody');
    var loadedLine = document.getElementById('loaded-line');
    if (loadedLine) {
      var n = (env.instances || []).length;
      loadedLine.textContent = n ? ('已加载 ' + n + ' 个实例，占 ' + (env.loaded_h || '—')) : '未占用显存';
    }
    if (!tb) return;
    tb.innerHTML = env.models.length ? env.models.map(function (m) {
      var btn = m.loaded
        ? '<button class="btn btn-sm btn-ghost" data-unload="' + esc(m.key) + '">卸载</button>'
        : '<button class="btn btn-sm" data-load="' + esc(m.key) + '">加载</button>';
      return '<tr><td><div style="font-weight:600">' + esc(m.name) + '</div><div class="small mono muted">' + esc(m.key) + '</div></td>'
        + '<td class="num small">' + esc(m.size_h) + '</td><td class="small mono">' + (m.context || '—') + '</td>'
        + '<td>' + (m.loaded ? '<span class="badge ok"><span class="dot"></span>已加载</span>' : '<span class="badge">未加载</span>') + '</td>'
        + '<td style="text-align:right">' + btn + '</td></tr>';
    }).join('') : '<tr><td class="empty">还没有模型，点上面的「一键启动」</td></tr>';
    tb.querySelectorAll('[data-load]').forEach(function (b) {
      b.addEventListener('click', function () { loadModel(b.getAttribute('data-load')); });
    });
    tb.querySelectorAll('[data-unload]').forEach(function (b) {
      b.addEventListener('click', function () { unloadModel(b.getAttribute('data-unload')); });
    });
  }

  function refreshAi() { api('/api/admin/ai/env', null, 'GET').then(renderAi); }

  function pollTask(after) {
    clearTimeout(pollTimer);
    api('/api/admin/ai/task', null, 'GET').then(function (r) {
      var t = r.task;
      if (!t) return;
      var box = document.getElementById('task-log');
      box.textContent = '[' + t.kind + '] ' + t.label + '\n' + (t.log || '（等待输出…）');
      box.scrollTop = box.scrollHeight;
      if (t.running) pollTimer = setTimeout(function () { pollTask(after); }, 2000);
      else { refreshAi(); if (after) after(t); }
    });
  }

  function loadModel(key) {
    api('/api/admin/ai/model/load', { key: key }).then(function (r) {
      if (!r.ok) return toast(r.error || '加载失败', 'bad');
      toast(r.unloaded_first ? ('先卸下 ' + r.unloaded_first + ' 个旧实例，正在加载 ' + key) : ('正在加载 ' + key), 'ok');
      pollTask(function () { toast('加载完成，可以上课了', 'ok'); });
    });
  }

  function unloadModel(key) {
    api('/api/admin/ai/model/unload', { key: key }).then(function (r) {
      if (!r.ok) return toast(r.error || '卸载失败', 'bad');
      toast(r.already ? '本来就没加载' : ('已卸载，释放 ' + (r.freed_h || '—')), 'ok');
      refreshAi();
    });
  }

  var quick = document.getElementById('btn-quick');
  if (quick) quick.addEventListener('click', function () {
    api('/api/admin/ai/quick', {}).then(function (r) {
      if (!r.ok) return toast(r.error || '启动失败', 'bad');
      toast('开始启动，进度看下面的日志', 'ok');
      pollTask(function () { refreshAi(); });
    });
  });

  var mBtn = document.getElementById('btn-models');
  if (mBtn) mBtn.addEventListener('click', refreshAi);
  var uAll = document.getElementById('btn-unload-all');
  if (uAll) uAll.addEventListener('click', function () {
    api('/api/admin/ai/model/unload', { all: true }).then(function (r) {
      if (!r.ok) return toast(r.error || '卸载失败', 'bad');
      toast(r.already ? '本来就是空的' : ('全部卸载完成，释放 ' + (r.freed_h || '—')), 'ok');
      refreshAi();
    });
  });
  refreshAi();

  // ---------------- 名单 / 设置 ----------------
  function doImport(mode) {
    var txt = document.getElementById('roster-text').value;
    api('/api/admin/students/import', { text: txt, mode: mode }).then(function (r) {
      var m = document.getElementById('roster-msg');
      if (!r.ok) { m.textContent = r.error || '导入失败'; return; }
      m.textContent = '已导入 ' + r.count + ' 条';
      toast('名单已更新', 'ok');
    });
  }
  var bi = document.getElementById('btn-import');
  if (bi) bi.addEventListener('click', function () { doImport('replace'); });
  var bm = document.getElementById('btn-import-merge');
  if (bm) bm.addEventListener('click', function () { doImport('merge'); });

  // ---------------- 班级 / 学生 ----------------
  var clData = { classes: [], students: [] };
  var clModal = document.getElementById('class-modal');
  var stModal = document.getElementById('student-modal');

  function readClasses() {
    return api('/api/admin/classes', null, 'GET').then(function (r) {
      if (!r.ok) return toast(r.error || '读取班级失败', 'bad');
      clData.classes = r.classes || [];
      clData.students = r.students || [];
      renderClasses();
      renderStudents();
      fillClassFilter();
    });
  }

  function stuName(no) {
    var s = clData.students.filter(function (x) { return String(x.no) === String(no); })[0];
    return s ? s.name : '';
  }

  function renderClasses() {
    var box = document.getElementById('class-list');
    if (!box) return;
    var cnt = document.getElementById('class-count');
    if (cnt) cnt.textContent = clData.classes.length + ' 个班 · ' + clData.students.length + ' 人';
    if (!clData.classes.length) { box.innerHTML = '<div class="empty">还没班级，点右上角新建一个</div>'; return; }
    box.innerHTML = clData.classes.map(function (c) {
      var mem = (c.members || []);
      var who = mem.length ? mem.slice(0, 24).map(function (no) {
        var n = stuName(no);
        return '<span class="badge">' + esc(n || no) + '</span>';
      }).join(' ') + (mem.length > 24 ? ' <span class="small dim">…共 ' + mem.length + ' 人</span>' : '') : '<span class="dim">暂无成员</span>';
      return '<div class="list-item" style="flex-direction:column;align-items:stretch;gap:8px">'
        + '<div class="flex" style="justify-content:space-between;align-items:flex-start">'
        + '<div><div class="ttl">' + esc(c.name) + '</div><div class="sub">' + mem.length + ' 人</div></div>'
        + '<div class="flex" style="gap:6px">'
        + '<button class="btn btn-sm btn-ghost" data-cl-edit="' + esc(c.id) + '">编辑</button>'
        + '<button class="btn btn-sm btn-ghost" data-cl-del="' + esc(c.id) + '">删除</button>'
        + '</div></div>'
        + '<div class="small" style="line-height:2">' + who + '</div>'
        + '</div>';
    }).join('');
    box.querySelectorAll('[data-cl-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openClass(b.getAttribute('data-cl-edit')); });
    });
    box.querySelectorAll('[data-cl-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-cl-del');
        var c = clData.classes.filter(function (x) { return x.id === id; })[0] || {};
        if (!confirm('删除班级「' + (c.name || '') + '」？学生本身不会被删。')) return;
        api('/api/admin/class/delete', { id: id }).then(function (r) {
          if (!r.ok) return toast(r.error || '删除失败', 'bad');
          toast('班级已删除', 'ok');
          readClasses();
        });
      });
    });
  }

  function fillClassFilter() {
    var sel = document.getElementById('stu-filter');
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">全部</option>' + clData.classes.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    }).join('');
    sel.value = cur;
  }

  function classesOf(no) {
    return clData.classes.filter(function (c) {
      return (c.members || []).some(function (m) { return String(m) === String(no); });
    });
  }

  function renderStudents() {
    var box = document.getElementById('stu-list');
    if (!box) return;
    var f = (document.getElementById('stu-filter') || {}).value || '';
    var q = ((document.getElementById('stu-search') || {}).value || '').trim().toLowerCase();
    var rows = clData.students.filter(function (s) {
      if (f && !classesOf(s.no).some(function (c) { return c.id === f; })) return false;
      if (q && (String(s.no) + s.name).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (!rows.length) { box.innerHTML = '<div class="empty">没有符合条件的学生</div>'; return; }
    box.innerHTML = '<table><thead><tr><th style="width:96px">学号</th><th>姓名</th><th>班级</th><th style="width:56px"></th></tr></thead><tbody>'
      + rows.map(function (s) {
        var cs = classesOf(s.no);
        return '<tr><td class="mono small">' + esc(s.no) + '</td>'
          + '<td style="font-weight:600">' + esc(s.name) + '</td>'
          + '<td class="small">' + (cs.length ? cs.map(function (c) { return esc(c.name); }).join('、') : '<span class="dim">未分班</span>') + '</td>'
          + '<td style="text-align:right"><button class="btn btn-sm btn-ghost" data-st-edit="' + esc(s.no) + '">改</button></td></tr>';
      }).join('') + '</tbody></table>';
    box.querySelectorAll('[data-st-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openStudent(b.getAttribute('data-st-edit')); });
    });
  }

  function openClass(id) {
    if (!clModal) return;
    if (!clData.classes.length && !id) { readClasses().then(function () { openClass(id); }); return; }
    document.getElementById('clm-id').value = id || '';
    document.getElementById('clm-msg').textContent = '';
    document.getElementById('clm-title').textContent = id ? '编辑班级' : '新建班级';
    var c = null;
    if (id) c = clData.classes.filter(function (x) { return x.id === id; })[0];
    document.getElementById('clm-name').value = c ? c.name : '';
    var wrap = document.getElementById('clm-copy-wrap');
    wrap.hidden = !!id;
    var CHK = 'display:flex;flex-direction:row;align-items:center;gap:8px;padding:5px 0;font-size:13px;color:var(--ink)';
    document.getElementById('clm-copy').innerHTML = clData.classes.filter(function (x) { return x.id !== id; }).map(function (x) {
      return '<label style="' + CHK + '">'
        + '<input type="checkbox" value="' + esc(x.id) + '"> ' + esc(x.name)
        + ' <span class="small dim">' + (x.members || []).length + ' 人</span></label>';
    }).join('') || '<div class="empty">还没有别的班</div>';
    clModal.hidden = false;
  }

  function openStudent(no) {
    if (!stModal) return;
    if (!clData.classes.length && !clData.students.length) { readClasses().then(function () { openStudent(no); }); return; }
    document.getElementById('sm-orig').value = no || '';
    document.getElementById('sm-msg').textContent = '';
    document.getElementById('sm-title').textContent = no ? '编辑学生' : '注册学生';
    var s = no ? clData.students.filter(function (x) { return String(x.no) === String(no); })[0] : null;
    var noInput = document.getElementById('sm-no');
    noInput.value = s ? s.no : '';
    noInput.disabled = !!no;
    document.getElementById('sm-name').value = s ? s.name : '';
    var mine = s ? classesOf(s.no).map(function (c) { return c.id; }) : [];
    var CHK = 'display:flex;flex-direction:row;align-items:center;gap:8px;padding:5px 0;font-size:13px;color:var(--ink)';
    document.getElementById('sm-classes').innerHTML = clData.classes.map(function (c) {
      return '<label style="' + CHK + '">'
        + '<input type="checkbox" value="' + esc(c.id) + '"' + (mine.indexOf(c.id) >= 0 ? ' checked' : '') + '> '
        + esc(c.name) + ' <span class="small dim">' + (c.members || []).length + ' 人</span></label>';
    }).join('') || '<div class="empty">先去「班级」里建一个班</div>';
    document.getElementById('sm-del').hidden = !no;
    stModal.hidden = false;
  }

  var bnC = document.getElementById('btn-new-class');
  if (bnC) bnC.addEventListener('click', function () { openClass(null); });
  var clClose = document.getElementById('clm-close');
  if (clClose) clClose.addEventListener('click', function () { clModal.hidden = true; });
  var clSave = document.getElementById('clm-save');
  if (clSave) clSave.addEventListener('click', function () {
    var id = document.getElementById('clm-id').value;
    var name = document.getElementById('clm-name').value.trim();
    if (!name) { document.getElementById('clm-msg').textContent = '班级名不能空'; return; }
    var copy = [];
    document.querySelectorAll('#clm-copy input:checked').forEach(function (x) { copy.push(x.value); });
    clSave.disabled = true;
    api('/api/admin/class/save', { id: id, name: name, copy_from: copy }).then(function (r) {
      clSave.disabled = false;
      if (!r.ok) { document.getElementById('clm-msg').textContent = r.error || '保存失败'; return; }
      clModal.hidden = true;
      toast('班级已保存', 'ok');
      readClasses();
    });
  });

  var bnS = document.getElementById('btn-new-student');
  if (bnS) bnS.addEventListener('click', function () { openStudent(null); });
  var stClose = document.getElementById('sm-close');
  if (stClose) stClose.addEventListener('click', function () { stModal.hidden = true; });
  var stSave = document.getElementById('sm-save');
  if (stSave) stSave.addEventListener('click', function () {
    var no = document.getElementById('sm-no').value.trim();
    var name = document.getElementById('sm-name').value.trim();
    var m = document.getElementById('sm-msg');
    if (!no || !name) { m.textContent = '学号和姓名都要填'; return; }
    var cls = [];
    document.querySelectorAll('#sm-classes input:checked').forEach(function (x) { cls.push(x.value); });
    stSave.disabled = true;
    api('/api/admin/student/save', { no: no, name: name, classes: cls }).then(function (r) {
      stSave.disabled = false;
      if (!r.ok) { m.textContent = r.error || '保存失败'; return; }
      stModal.hidden = true;
      toast('学生已保存', 'ok');
      readClasses();
    });
  });
  var stDel = document.getElementById('sm-del');
  if (stDel) stDel.addEventListener('click', function () {
    var no = document.getElementById('sm-orig').value;
    if (!no) return;
    if (!confirm('把学号 ' + no + ' 从名单里删掉？')) return;
    api('/api/admin/student/delete', { no: no }).then(function (r) {
      if (!r.ok) return toast(r.error || '删除失败', 'bad');
      stModal.hidden = true;
      toast('已删除', 'ok');
      readClasses();
    });
  });

  var sf = document.getElementById('stu-filter');
  if (sf) sf.addEventListener('change', renderStudents);
  var sq = document.getElementById('stu-search');
  if (sq) sq.addEventListener('input', renderStudents);

  // Excel 上传
  var bFile = document.getElementById('btn-import-file');
  var fInput = document.getElementById('import-file');
  if (bFile && fInput) {
    bFile.addEventListener('click', function () { fInput.click(); });
    fInput.addEventListener('change', function () {
      var file = fInput.files[0];
      if (!file) return;
      var m = document.getElementById('stu-msg');
      m.textContent = '正在导入 ' + file.name + ' …';
      var fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'merge');
      fetch('/api/admin/students/import-file', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (x) { return x.json(); })
        .then(function (r) {
          fInput.value = '';
          if (!r || !r.ok) { m.textContent = (r && r.error) || '导入失败'; return; }
          m.textContent = '已导入 ' + r.count + ' 条（同学号自动覆盖）';
          toast('名单已导入', 'ok');
          readClasses();
        })
        .catch(function () { m.textContent = '上传失败，检查网络或文件大小'; });
    });
  }

  // ---------------- 实验室后台 ----------------
  var labCfg = null;
  function readLabCfg() {
    api('/api/admin/lab/config', null, 'GET').then(function (r) {
      if (!r.ok) return toast(r.error || '读取实验室设置失败', 'bad');
      labCfg = r.config || { enabled: [], default: '', free: true };
      var mods = r.modules || [];
      var box = document.getElementById('lab-mod-list');
      if (box) {
        var html = '', lastG = '';
        mods.forEach(function (m) {
          if (m.group && m.group !== lastG) {
            html += '<div class="mod-group"><span>' + esc(m.group) + '</span><em>' + mods.filter(function (x) { return x.group === m.group; }).length + '</em></div>';
            lastG = m.group;
          }
          var on = (labCfg.enabled || []).indexOf(m.id) >= 0;
          html += '<div class="list-item"><div><div class="ttl">' + esc(m.name)
            + ' <span class="small mono dim">' + esc(m.id) + '</span></div><div class="sub">' + esc(m.note || '') + '</div></div>'
            + '<div class="flex" style="gap:14px;align-items:center">'
            + '<label class="small flex" style="gap:6px;align-items:center"><input type="checkbox" data-mod-on="' + esc(m.id) + '"' + (on ? ' checked' : '') + '> 开放</label>'
            + '<label class="small flex" style="gap:6px;align-items:center"><input type="radio" name="lab-def" value="' + esc(m.id) + '"' + (labCfg.default === m.id ? ' checked' : '') + '> 默认</label>'
            + '</div></div>';
        });
        box.innerHTML = html || '<div class="empty">没有实验模块</div>';
      }
      var free = document.getElementById('lab-free');
      if (free) free.checked = !!labCfg.free;
    });
  }
  var labSave = document.getElementById('btn-lab-cfg-save');
  if (labSave) labSave.addEventListener('click', function () {
    var on = [];
    document.querySelectorAll('[data-mod-on]').forEach(function (x) { if (x.checked) on.push(x.getAttribute('data-mod-on')); });
    var def = (document.querySelector('input[name="lab-def"]:checked') || {}).value || '';
    var msg = document.getElementById('lab-cfg-msg');
    if (!on.length) { msg.textContent = '至少开放一个实验'; return; }
    if (on.indexOf(def) < 0) def = on[0];
    labSave.disabled = true;
    api('/api/admin/lab/config', {
      enabled: on, default: def,
      free: (document.getElementById('lab-free') || {}).checked ? true : false
    }).then(function (r) {
      labSave.disabled = false;
      if (!r.ok) { msg.textContent = r.error || '保存失败'; return; }
      msg.textContent = '已保存，学生下次进实验室生效';
      toast('实验室设置已保存', 'ok');
      readLabCfg();
    });
  });

  // 自定义实验室列表
  function readLabs(msg) {
    var box = document.getElementById('lab-labs');
    if (!box) return;
    fetch('/api/lab/labs', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
      var labs = (d && d.labs) || [];
      box.innerHTML = labs.map(function (l) {
        return '<div class="list-item"><div><div class="ttl">' + esc(l.name)
          + ' <span class="small mono dim">' + esc(l.id) + '</span></div>'
          + '<div class="sub">' + (l.count || 0) + ' 件器材' + (l.updated_at ? ' · ' + esc(l.updated_at.slice(0, 16).replace('T', ' ')) : '') + '</div></div>'
          + '<div class="flex"><button class="btn btn-sm" data-lab-link="' + esc(l.id) + '">复制链接</button>'
          + '<button class="btn btn-sm" data-lab-del="' + esc(l.id) + '">删除</button></div></div>';
      }).join('') || '<div class="empty">还没有自定义实验室。通用台里点「存为实验室」，或在下面导入一份 JSON。</div>';
      if (msg) {
        var m = document.getElementById('lab-labs-msg');
        if (m) m.textContent = msg;
      }
    }).catch(function () {
      box.innerHTML = '<div class="empty">读取失败</div>';
    });
  }

  document.addEventListener('click', function (e) {
    var ln = e.target.closest && e.target.closest('[data-lab-link]');
    if (ln) {
      var link = location.origin + '/exp/lab?lab=' + ln.getAttribute('data-lab-link');
      var ok = function () { toast('链接已复制，发给学生就能直接进这间', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(ok).catch(function () { prompt('复制这个链接发给学生', link); });
      } else {
        prompt('复制这个链接发给学生', link);
      }
      return;
    }
    var b = e.target.closest && e.target.closest('[data-lab-del]');
    if (!b) return;
    var id = b.getAttribute('data-lab-del');
    if (confirm('删除这个实验室？学生端就看不到了。')) {
      api('/api/admin/lab/lab/delete', { id: id }).then(function (r) {
        if (!r.ok) return toast(r.error || '删除失败', 'bad');
        readLabs('已删除');
        toast('实验室已删除', 'ok');
      });
    }
  });

  var labImport = document.getElementById('btn-lab-import');
  var labFile = document.getElementById('lab-import-file');
  if (labImport && labFile) {
    labImport.addEventListener('click', function () { labFile.click(); });
    labFile.addEventListener('change', function () {
      var f = labFile.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var lab;
        try { lab = JSON.parse(fr.result); } catch (e) { toast('JSON 读不懂：' + e.message, 'bad'); labFile.value = ''; return; }
        api('/api/admin/lab/lab', lab).then(function (r) {
          labFile.value = '';
          if (!r.ok) return toast(r.error || '导入失败', 'bad');
          readLabs('已导入：' + (r.name || ''));
          toast('实验室已导入', 'ok');
        });
      };
      fr.readAsText(f);
    });
  }

  document.querySelectorAll('.c-tab').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.getAttribute('data-tab') === 'lab') { readLabCfg(); readLabs(); }
      if (b.getAttribute('data-tab') === 'data') readClasses();
    });
  });

  readClasses();
  readLabCfg();
  readLabs();

  var saveCfg = document.getElementById('btn-save-cfg');
  if (saveCfg) saveCfg.addEventListener('click', function () {
    var payload = {
      site_title: document.getElementById('cfg-title').value,
      school: document.getElementById('cfg-school').value,
      class_name: document.getElementById('cfg-class').value,
      teacher_password: document.getElementById('cfg-pass').value,
      ai: {
        base_url: document.getElementById('cfg-base').value,
        model: document.getElementById('cfg-model').value,
        max_tokens: 700, timeout: 180
      },
      chat: { context_messages: parseInt(document.getElementById('cfg-ctx').value, 10) || 6 }
    };
    api('/api/admin/settings', payload).then(function (r) {
      var m = document.getElementById('cfg-msg');
      if (!r.ok) { m.textContent = r.error || '保存失败'; return; }
      m.textContent = '已保存';
      toast('设置已保存', 'ok');
    });
  });
})();
