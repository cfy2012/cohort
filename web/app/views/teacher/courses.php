<?php
/** @var array $courses @var array $experiments @var array|null $session */
$pageTitle = '课程排表';
$live = $session && $session['status'] === 'live';
?>
<header class="page-head">
  <div>
    <div class="eyebrow">课表</div>
    <h1>课程排表</h1>
    <p>在这里直接增删改。右侧“实验”下拉框决定这节课学生能打开哪个实验页，留空就是纯 AI 答疑课。</p>
  </div>
  <?php if ($live): ?><button class="btn btn-danger" data-action="stop-session">结束当前课程</button><?php endif; ?>
</header>

<div class="card">
  <div class="card-head">
    <h2>课程列表</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <span class="hint">共 <?= count($courses) ?> 节</span>
      <button class="btn btn-primary btn-sm" id="btn-new-course">+ 新建课程</button>
    </div>
  </div>
  <?php if (!$courses): ?>
    <div class="empty">还没有课程。点右上角“新建课程”加一节。</div>
  <?php else: ?>
  <table>
    <thead>
      <tr><th style="width:110px">日期</th><th>课程</th><th style="width:220px">绑定实验</th><th style="width:110px">班级</th><th style="width:180px"></th></tr>
    </thead>
    <tbody>
      <?php foreach ($courses as $c): ?>
        <tr>
          <td class="mono small"><?= e($c['date'] ?? '—') ?></td>
          <td>
            <div style="font-weight:600"><?= e($c['title']) ?></div>
            <?php if (!empty($c['note'])): ?><div class="small muted"><?= e($c['note']) ?></div><?php endif; ?>
            <?php if ($live && $session['course_id'] === ($c['id'] ?? '')): ?><span class="badge ok"><span class="dot"></span>正在上</span><?php endif; ?>
          </td>
          <td class="small">
            <?php if (!empty($c['experiment'])): ?>
              <span class="mono"><?= e($c['experiment']) ?></span>
              <?php if (!is_dir(EXP_DIR . '/' . $c['experiment'])): ?>
                <div class="small" style="color:var(--warn)">目录还不存在</div>
              <?php endif; ?>
            <?php else: ?><span class="dim">没绑定（纯答疑）</span><?php endif; ?>
          </td>
          <td class="small"><?= e($c['class'] ?? '') ?></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-sm" data-edit-course="<?= e($c['id']) ?>">编辑</button>
            <button class="btn btn-sm btn-ghost" data-del-course="<?= e($c['id']) ?>">删除</button>
            <button class="btn btn-sm <?= ($live && $session['course_id'] === ($c['id'] ?? '')) ? '' : 'btn-primary' ?>"
                    data-action="start-session" data-course="<?= e($c['id']) ?>">
              <?= ($live && $session['course_id'] === ($c['id'] ?? '')) ? '重开' : '开启' ?>
            </button>
          </td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>
</div>

<!-- 课程编辑面板 -->
<div class="modal" id="course-modal" hidden>
  <div class="modal-box">
    <div class="card-head">
      <h2 id="cm-title">新建课程</h2>
      <button class="btn btn-sm btn-ghost" id="cm-close">关闭</button>
    </div>
    <div class="form">
      <input type="hidden" id="cm-id">
      <label>课程名称<input id="cm-name" placeholder="例如：探究电流与电阻的关系"></label>
      <div class="row-2">
        <label>日期<input id="cm-date" type="date"></label>
        <label>节次<input id="cm-period" placeholder="第 3 节 / 上午"></label>
      </div>
      <div class="row-2">
        <label>班级<input id="cm-class" value="<?= e(config()['class_name']) ?>"></label>
        <label>绑定实验
          <select id="cm-exp">
            <option value="">（不绑定，纯 AI 答疑）</option>
            <?php foreach ($experiments as $x): ?>
              <option value="<?= e($x['slug']) ?>"><?= e($x['title']) ?> · <?= e($x['slug']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
      </div>
      <label>备注（学生看不到，只给你自己看）<input id="cm-note" placeholder="例如：带 5 个教具箱"></label>
      <div class="form-foot">
        <button class="btn btn-primary" id="cm-save">保存</button>
        <span class="small muted" id="cm-msg"></span>
      </div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-head">
    <h2>可用实验目录</h2>
    <span class="hint">experiments/ 下自动扫描，<?= count($experiments) ?> 个</span>
  </div>
  <div class="grid cols-3">
    <?php foreach ($experiments as $x): ?>
      <div class="list-item" style="flex-direction:column;align-items:flex-start;gap:6px">
        <div class="ttl"><?= e($x['title']) ?></div>
        <div class="sub mono"><?= e($x['slug']) ?></div>
        <div class="small muted"><?= e($x['summary'] ?: '待补充实验说明') ?></div>
        <a class="small" href="/exp/<?= e($x['slug']) ?>" target="_blank">预览实验页</a>
      </div>
    <?php endforeach; ?>
  </div>
</div>

<script>
(function () {
  var COURSES = <?= json_encode($courses, JSON_UNESCAPED_UNICODE) ?>;
  var modal = document.getElementById('course-modal');
  var msg = document.getElementById('cm-msg');

  function openModal(c) {
    c = c || {};
    document.getElementById('cm-title').textContent = c.id ? '编辑课程' : '新建课程';
    document.getElementById('cm-id').value = c.id || '';
    document.getElementById('cm-name').value = c.title || '';
    document.getElementById('cm-date').value = c.date || '';
    document.getElementById('cm-period').value = c.period || '';
    document.getElementById('cm-class').value = c.class || '';
    document.getElementById('cm-exp').value = c.experiment || '';
    document.getElementById('cm-note').value = c.note || '';
    msg.textContent = '';
    modal.hidden = false;
  }

  document.getElementById('btn-new-course').addEventListener('click', function () { openModal(null); });
  document.getElementById('cm-close').addEventListener('click', function () { modal.hidden = true; });

  document.querySelectorAll('[data-edit-course]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-edit-course');
      openModal(COURSES.filter(function (c) { return c.id === id; })[0]);
    });
  });

  document.querySelectorAll('[data-del-course]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-del-course');
      if (!confirm('确定删除这节课？（历史记录不受影响）')) return;
      api('/api/admin/course/delete', { id: id }).then(function (r) {
        if (!r.ok) return toast(r.error || '删除失败', 'bad');
        toast('已删除', 'ok');
        setTimeout(function () { location.reload(); }, 600);
      });
    });
  });

  document.getElementById('cm-save').addEventListener('click', function () {
    var payload = {
      id: document.getElementById('cm-id').value,
      title: document.getElementById('cm-name').value.trim(),
      date: document.getElementById('cm-date').value,
      period: document.getElementById('cm-period').value.trim(),
      class: document.getElementById('cm-class').value.trim(),
      experiment: document.getElementById('cm-exp').value,
      note: document.getElementById('cm-note').value.trim()
    };
    if (!payload.title) { msg.textContent = '课程名称不能空'; msg.style.color = 'var(--warn)'; return; }
    api('/api/admin/course/save', payload).then(function (r) {
      if (!r.ok) { msg.textContent = r.error || '保存失败'; msg.style.color = 'var(--warn)'; return; }
      toast('已保存', 'ok');
      setTimeout(function () { location.reload(); }, 500);
    });
  });
})();
</script>
