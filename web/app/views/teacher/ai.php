<?php
/** @var array $config @var array $recommend @var float $vram */
$pageTitle = 'AI 引擎';
?>
<header class="page-head">
  <div>
    <div class="eyebrow">一键搞定</div>
    <h1>AI 引擎</h1>
    <p>不用打开 LM Studio 界面。下面的按钮会在后台把服务起起来、把模型下好、再加载进内存，你只需要等进度条走完。</p>
  </div>
</header>

<div class="notice" id="env-line">正在检查本机的 LM Studio…</div>

<div class="card">
  <div class="card-head">
    <h2>一键启动</h2>
    <button class="btn btn-primary" id="btn-quick">开始 / 一步到位</button>
  </div>
  <div class="steps">
    <div class="step" id="st-server"><span class="n">1</span><div class="t"><b>启动 AI 服务</b><small>在本机后台开 1234 端口（LM Studio server）</small></div><span class="badge" id="bd-server">未知</span></div>
    <div class="step" id="st-model"><span class="n">2</span><div class="t"><b>下载适配模型</b><small id="rec-line">按你的显存挑一个能跑的模型</small></div><span class="badge" id="bd-model">未知</span></div>
    <div class="step" id="st-load"><span class="n">3</span><div class="t"><b>加载进内存</b><small>加载完成后课堂就能开始对话</small></div><span class="badge" id="bd-load">未知</span></div>
  </div>
  <div class="mt16" id="progress-wrap" hidden>
    <div class="card-head"><h3 style="font-size:13.5px;margin:0">任务日志</h3><span class="hint" id="task-label"></span></div>
    <div class="log-box" id="task-log">（等待输出…）</div>
  </div>
</div>

<div class="card">
  <div class="card-head">
    <h2>本机已有模型</h2>
    <button class="btn btn-sm" id="btn-refresh">刷新</button>
  </div>
  <table id="model-table">
    <thead><tr><th>模型</th><th style="width:100px">大小</th><th style="width:110px">上下文</th><th style="width:120px">状态</th><th style="width:110px"></th></tr></thead>
    <tbody><tr><td colspan="5" class="empty">读取中…</td></tr></tbody>
  </table>
</div>

<script>
(function () {
  var rec = <?= json_encode($recommend, JSON_UNESCAPED_UNICODE) ?>;
  var vram = <?= json_encode($vram) ?>;
  var pollTimer = null;
  var chain = null;   // 下载完成后自动加载

  function badge(el, state, text) {
    el.className = 'badge ' + (state || '');
    el.textContent = text;
  }

  function renderEnv(env) {
    var line = document.getElementById('env-line');
    if (!env.lms_ok) {
      line.className = 'notice bad';
      line.innerHTML = '<b>这台电脑没装 LM Studio。</b> 请让管理员装好 LM Studio（含 lms 命令行）再回来点这里，装好后本页会自动认出它。';
      badge(document.getElementById('bd-server'), 'warn', '需先安装');
      return;
    }
    line.className = 'notice';
    line.innerHTML = '本机 LM Studio 已就绪 · 显卡可用显存约 <b>' + vram + ' GB</b> · 推荐档位 <b>' + rec.tier + '</b>（' + rec.note + '）';
    document.getElementById('rec-line').textContent = '推荐：' + rec.key + '（' + rec.note + '）';
    badge(document.getElementById('bd-server'), env.server.running ? 'ok' : 'warn', env.server.running ? ('运行中 :' + env.server.port) : '未启动');

    var body = document.querySelector('#model-table tbody');
    if (!env.models.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty">还没有下载任何模型，点上面的“一步到位”就行</td></tr>';
      badge(document.getElementById('bd-model'), 'warn', '未下载');
    } else {
      var rows = env.models.map(function (m) {
        return '<tr><td><div style="font-weight:600">' + m.name + '</div><div class="small mono muted">' + m.key + '</div></td>'
          + '<td class="num small">' + m.size_h + '</td>'
          + '<td class="small mono">' + (m.context || '—') + '</td>'
          + '<td>' + (m.loaded ? '<span class="badge ok"><span class="dot"></span>已加载</span>' : '<span class="badge">未加载</span>') + '</td>'
          + '<td style="text-align:right"><button class="btn btn-sm" data-load="' + m.key + '">加载</button></td></tr>';
      }).join('');
      body.innerHTML = rows;
      badge(document.getElementById('bd-model'), 'ok', '已下载 ' + env.models.length + ' 个');
      body.querySelectorAll('[data-load]').forEach(function (b) {
        b.addEventListener('click', function () { loadModel(b.getAttribute('data-load')); });
      });
    }
    badge(document.getElementById('bd-load'), env.loaded.length ? 'ok' : '', env.loaded.length ? (env.loaded[0] + ' 已加载') : '未加载');
  }

  function refresh() {
    api('/api/admin/ai/env').then(renderEnv);
  }  function pollTask(afterDone) {
    clearTimeout(pollTimer);
    api('/api/admin/ai/task').then(function (r) {
      var t = r.task;
      if (!t) return;
      document.getElementById('progress-wrap').hidden = false;
      document.getElementById('task-label').textContent = t.label + '（' + t.kind + '）';
      var box = document.getElementById('task-log');
      box.textContent = t.log || '（等待输出…）';
      box.scrollTop = box.scrollHeight;
      if (t.running) {
        pollTimer = setTimeout(function () { pollTask(afterDone); }, 2000);
      } else {
        refresh();
        if (typeof afterDone === 'function') afterDone(t);
      }
    });
  }

  function startServer(then) {
    api('/api/admin/ai/server/start').then(function (r) {
      if (!r.ok) { toast(r.error || '启动失败', 'bad'); return; }
      toast('正在启动 AI 服务…', 'ok');
      pollTask(function () { setTimeout(function () { refresh(); then && then(); }, 1500); });
    });
  }

  function downloadModel(key, then) {
    api('/api/admin/ai/model/download', { key: key }).then(function (r) {
      if (!r.ok) { toast(r.error || '下载启动失败', 'bad'); return; }
      toast('开始下载模型，文件较大请耐心等', 'ok');
      pollTask(function (t) {
        if (t.log && /error|failed|not found/i.test(t.log)) { toast('下载没成功，看下面的日志', 'bad'); return; }
        then && then();
      });
    });
  }

  function loadModel(key) {
    api('/api/admin/ai/model/load', { key: key }).then(function (r) {
      if (!r.ok) { toast(r.error || '加载失败', 'bad'); return; }
      toast('正在加载 ' + key, 'ok');
      pollTask(function () {
        toast('模型加载完成，可以上课了', 'ok');
        refresh();
      });
    });
  }

  document.getElementById('btn-refresh').addEventListener('click', refresh);

  document.getElementById('btn-quick').addEventListener('click', function () {
    api('/api/admin/ai/quick').then(function (r) {
      if (!r.ok) { toast(r.error || '启动失败', 'bad'); return; }
      toast('已开始，进度在下面', 'ok');
      // 按阶段推进：服务 → 下载 → 加载
      var stage = r.stage;
      if (stage === 'server') {
        pollTask(function () {
          api('/api/admin/ai/env').then(function (env) {
            if (env.models.length) { loadFirstOrLoad(env); }
            else { downloadModel(rec.key, function () { refresh(); toast('模型已装好，点“本机已有模型”里的“加载”即可', 'ok'); }); }
          });
        });
      } else if (stage === 'download') {
        pollTask(function () { refresh(); toast('下载任务结束，刷新看结果', 'ok'); });
      } else {
        pollTask(function () { refresh(); });
      }
    });
  });

  function loadFirstOrLoad(env) {
    if (env.loaded.length) { toast('已有模型在内存里，可以直接上课', 'ok'); return; }
    var m = env.models.slice().sort(function (a, b) { return a.size - b.size; })[0];
    loadModel(m.key);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
})();
</script>
