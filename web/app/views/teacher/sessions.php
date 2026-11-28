<?php
/** @var array $sessions @var array|null $current */
$pageTitle = '课堂记录';
?>
<header class="page-head">
  <div>
    <div class="eyebrow">历史</div>
    <h1>课堂记录</h1>
    <p>每次“开启课程”都会生成一个场次，学生对话按场次归档</p>
  </div>
</header>

<div class="card">
  <div class="card-head"><h2>场次列表</h2><span class="hint"><?= count($sessions) ?> 场</span></div>
  <?php if (!$sessions): ?>
    <div class="empty">还没有课堂记录</div>
  <?php else: ?>
    <table>
      <thead>
        <tr><th>开始时间</th><th>课程</th><th style="width:100px">在场</th><th style="width:90px">状态</th><th style="width:90px">报表</th><th style="width:170px"></th></tr>
      </thead>
      <tbody>
      <?php foreach ($sessions as $s): ?>
        <tr>
          <td class="mono small muted"><?= e(date('m-d H:i', strtotime($s['started_at']))) ?></td>
          <td>
            <div style="font-weight:600"><?= e($s['title']) ?></div>
            <div class="small muted"><?= e($s['class'] ?? '') ?><?= $s['experiment'] ? ' · ' . e($s['experiment']) : '' ?></div>
          </td>
          <td class="num"><?= (int)$s['_attendee_count'] ?></td>
          <td>
            <?php if (($s['status'] ?? '') === 'live'): ?>
              <span class="badge ok"><span class="dot"></span>进行中</span>
            <?php else: ?>
              <span class="badge">已结束</span>
            <?php endif; ?>
          </td>
          <td><?= $s['_report'] ? '<span class="badge ok">有</span>' : '<span class="dim small">—</span>' ?></td>
          <td style="text-align:right">
            <button class="btn btn-sm" data-action="build-report" data-session="<?= e($s['id']) ?>">生成报表</button>
            <?php if ($s['_report']): ?><a class="btn btn-sm btn-ghost" href="/admin/reports/<?= e($s['id']) ?>">查看</a><?php endif; ?>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  <?php endif; ?>
</div>
