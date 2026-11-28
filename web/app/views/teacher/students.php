<?php
/** @var array $students @var array $attendees @var array|null $session */
$pageTitle = '学生名单';
?>
<header class="page-head">
  <div>
    <div class="eyebrow">班级</div>
    <h1>学生名单</h1>
    <p>名单用于校验学号、统计在场人数；导入会把整份名单替换掉</p>
  </div>
</header>

<div class="grid cols-2">
  <div class="card">
    <div class="card-head"><h2>导入名单</h2><span class="hint">一行一个：学号 姓名 [班级]</span></div>
    <textarea id="import-text" data-voice placeholder="20260701 陈福尧&#10;20260702 李四&#10;20260703 王五"></textarea>
    <div class="flex mt16">
      <button class="btn btn-primary" data-action="import-students">导入并替换</button>
      <span class="small dim">支持空格、逗号、制表符分隔</span>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>本节入场情况</h2>
      <span class="hint"><?= $session ? '场次 ' . e($session['id']) : '当前无课程' ?></span>
    </div>
    <?php if ($attendees): ?>
      <table>
        <thead><tr><th>学号</th><th>姓名</th><th>IP</th><th>最后活动</th></tr></thead>
        <tbody>
        <?php foreach ($attendees as $no => $a): ?>
          <tr>
            <td class="mono small"><?= e($no) ?></td>
            <td><?= e($a['name']) ?></td>
            <td class="mono small muted"><?= e($a['ip'] ?? '') ?></td>
            <td class="small muted"><?= e(mb_substr($a['last_seen'] ?? '', 11, 8)) ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    <?php else: ?>
      <div class="empty">还没有学生进入</div>
    <?php endif; ?>
  </div>
</div>

<div class="card">
  <div class="card-head"><h2>全部名单</h2><span class="hint"><?= count($students) ?> 人</span></div>
  <?php if ($students): ?>
    <table>
      <thead><tr><th style="width:140px">学号</th><th>姓名</th><th style="width:160px">班级</th></tr></thead>
      <tbody>
        <?php foreach ($students as $s): ?>
          <tr><td class="mono small"><?= e($s['no']) ?></td><td><?= e($s['name']) ?></td><td class="small muted"><?= e($s['class'] ?? '') ?></td></tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  <?php else: ?>
    <div class="empty">名单为空，先在上方导入</div>
  <?php endif; ?>
</div>

