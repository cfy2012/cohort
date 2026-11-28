<?php
/** @var array $items @var array $sessions */
$pageTitle = '课堂报表';
?>
<header class="page-head">
  <div>
    <div class="eyebrow">学情</div>
    <h1>课堂报表</h1>
    <p>每个学生的对话会被独立归纳成卡片，再汇总成班级学情</p>
  </div>
</header>

<div class="card">
  <div class="card-head"><h2>已生成报表</h2><span class="hint"><?= count($items) ?> 份</span></div>
  <?php if (!$items): ?>
    <div class="empty">还没有报表。到“课堂记录”里对某一场生成。</div>
  <?php else: ?>
    <div class="list">
      <?php foreach ($items as $it): ?>
        <div class="list-item">
          <div>
            <div class="ttl"><?= e($it['title']) ?></div>
            <div class="sub">
              <?= e($it['class']) ?> · <?= e(date('m-d H:i', strtotime($it['generated_at']))) ?> 生成
              · <?= (int)($it['totals']['active'] ?? 0) ?>/<?= (int)($it['totals']['students'] ?? 0) ?> 人参与
              · <?= (int)($it['totals']['exchanges'] ?? 0) ?> 条提问
            </div>
          </div>
          <div class="flex">
            <span class="badge <?= ($it['mode'] ?? '') === 'ai' ? 'ok' : 'warn' ?>"><?= ($it['mode'] ?? '') === 'ai' ? 'AI 归纳' : '仅统计' ?></span>
            <a class="btn btn-sm" href="/admin/reports/<?= e($it['session_id']) ?>">查看</a>
          </div>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</div>
