<?php
/** @var array $report @var array $rounds */
$pageTitle = '课堂报表';
$cs = $report['class_summary'] ?? [];
$t  = $report['totals'] ?? [];
$rounds = $rounds ?? [];
?>
<header class="page-head">
  <div>
    <div class="eyebrow"><?= e($report['class']) ?> · <?= e(date('Y-m-d H:i', strtotime($report['generated_at']))) ?> 生成</div>
    <h1><?= e($report['title']) ?></h1>
    <p>共 <?= (int)($t['students'] ?? 0) ?> 人 · 发言 <?= (int)($t['active'] ?? 0) ?> 人 · 提问 <?= (int)($t['exchanges'] ?? 0) ?> 条 · <?= ($report['mode'] ?? '') === 'ai' ? 'AI 归纳' : '仅统计' ?></p>
  </div>
  <div class="flex">
    <a class="btn btn-ghost" href="/admin/reports">返回列表</a>
  </div>
</header>

<?php if (!empty($report['ai_note'])): ?>
  <div class="notice warn"><?= e($report['ai_note']) ?></div>
<?php endif; ?>

<?php if ($cs): ?>
<div class="grid cols-2 mt16">
  <div class="card">
    <div class="card-head"><h2>共性误区</h2><span class="hint">全班多人同时犯的错</span></div>
    <?php if (!empty($cs['common_misconceptions'])): ?>
      <div class="list">
        <?php foreach ($cs['common_misconceptions'] as $x): ?>
          <div class="list-item"><div class="small"><?= e(is_array($x) ? json_encode($x, JSON_UNESCAPED_UNICODE) : $x) ?></div></div>
        <?php endforeach; ?>
      </div>
    <?php else: ?><div class="empty">本课没有明显共性误区</div><?php endif; ?>
  </div>

  <div class="card">
    <div class="card-head"><h2>薄弱知识点</h2><span class="hint">下次课优先补</span></div>
    <?php if (!empty($cs['knowledge_gaps'])): ?>
      <div class="list">
        <?php foreach ($cs['knowledge_gaps'] as $x): ?>
          <div class="list-item"><div class="small"><?= e(is_array($x) ? json_encode($x, JSON_UNESCAPED_UNICODE) : $x) ?></div></div>
        <?php endforeach; ?>
      </div>
    <?php else: ?><div class="empty">暂无</div><?php endif; ?>
  </div>
</div>

<div class="card">
  <div class="card-head"><h2>课堂结论</h2></div>
  <div class="kv">
    <?php if (!empty($cs['highlights'])): ?>
      <div class="k">亮点</div>
      <div><?= e(implode('；', array_map(fn($x) => is_array($x) ? json_encode($x, JSON_UNESCAPED_UNICODE) : $x, (array)$cs['highlights']))) ?></div>
    <?php endif; ?>
    <?php if (isset($cs['silent_students'])): ?>
      <div class="k">全程沉默</div>
      <div><?= e(implode('、', (array)$cs['silent_students']) ?: '无') ?></div>
    <?php endif; ?>
    <?php if (!empty($cs['next_step'])): ?>
      <div class="k">下一步</div>
      <div style="font-weight:600"><?= e(is_array($cs['next_step']) ? json_encode($cs['next_step'], JSON_UNESCAPED_UNICODE) : $cs['next_step']) ?></div>
    <?php endif; ?>
  </div>
</div>
<?php endif; ?>

<div class="card">
  <div class="card-head">
    <h2>逐生记录</h2>
    <span class="hint">按提问量排序</span>
  </div>
  <?php if (empty($report['students'])): ?>
    <div class="empty">这场课没有学生进入</div>
  <?php else: ?>
    <table>
      <thead>
        <tr>
          <th style="width:170px">学生</th>
          <th style="width:80px">提问</th>
          <th>AI 归纳</th>
          <th style="width:90px">参与度</th>
        </tr>
      </thead>
      <tbody>
      <?php foreach ($report['students'] as $s): $sm = $s['summary'] ?? []; ?>
        <tr>
          <td>
            <div style="font-weight:600"><?= e($s['name']) ?></div>
            <div class="small mono dim">#<?= e($s['no']) ?> · <?= e($s['ip']) ?></div>
          </td>
          <td class="num"><?= (int)$s['questions'] ?></td>
          <td>
            <?php if ($sm): ?>
              <?php if (!empty($sm['structured'])): ?>
                <?php if (!empty($sm['main_questions'])): ?>
                  <div class="small"><span class="dim">主要问题：</span><?= e(implode('；', array_map(fn($x)=>is_array($x)?json_encode($x,JSON_UNESCAPED_UNICODE):$x, (array)$sm['main_questions']))) ?></div>
                <?php endif; ?>
                <?php if (!empty($sm['stuck_points'])): ?>
                  <div class="small mt8"><span class="dim">卡点：</span><?= e(implode('；', array_map(fn($x)=>is_array($x)?json_encode($x,JSON_UNESCAPED_UNICODE):$x, (array)$sm['stuck_points']))) ?></div>
                <?php endif; ?>
                <?php if (!empty($sm['advice'])): ?>
                  <div class="small mt8 muted">建议：<?= e(is_array($sm['advice']) ? json_encode($sm['advice'], JSON_UNESCAPED_UNICODE) : $sm['advice']) ?></div>
                <?php endif; ?>
                <?php if (!empty($sm['off_topic'])): ?><span class="badge warn">话题偏离</span><?php endif; ?>
              <?php else: ?>
                <div class="small"><span class="dim">AI 摘要原文（未成结构）：</span><?= e($sm['raw'] ?? '') ?></div>
              <?php endif; ?>
            <?php elseif ($s['messages'] > 0): ?>
              <span class="dim small">未生成 AI 摘要</span>
            <?php else: ?>
              <span class="dim small">本节没有发言</span>
            <?php endif; ?>
          </td>
          <td class="num"><?= e((string)($sm['engagement'] ?? '—')) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  <?php endif; ?>
</div>

<div class="card">
  <div class="card-head">
    <h2>逐轮回放</h2>
    <span class="hint">每问一答算一轮，点开就是原始对话，讲评时可以直接念</span>
  </div>
  <?php
    $hasAny = false;
    foreach ($rounds as $rr) if (count($rr)) { $hasAny = true; break; }
  ?>
  <?php if (!$hasAny): ?>
    <div class="empty">这场课没有任何对话轮次</div>
  <?php else: ?>
    <?php foreach ($report['students'] as $s): $rows = $rounds[$s['no']] ?? []; if (!$rows) continue; ?>
      <details class="round-fold" style="border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin-bottom:10px;background:var(--panel-2)">
        <summary style="cursor:pointer;font-weight:600;font-size:14px">
          <?= e($s['name']) ?>
          <span class="small muted" style="font-weight:400"> · <?= count($rows) ?> 轮 · <?= e($s['ip']) ?></span>
        </summary>
        <div class="list" style="margin-top:12px">
          <?php foreach ($rows as $i => $rd): ?>
            <div class="list-item" style="flex-direction:column;align-items:stretch;gap:8px">
              <div class="small dim mono">第 <?= $i + 1 ?> 轮 · <?= e(substr((string)$rd['q_at'], 11, 8)) ?></div>
              <?php if ($rd['q'] !== ''): ?>
                <div class="small"><span class="dim">问：</span><?= e($rd['q']) ?></div>
              <?php endif; ?>
              <?php if ($rd['a'] !== ''): ?>
                <div class="small muted"><span class="dim">答：</span><?= e(mb_substr($rd['a'], 0, 500)) ?><?= mb_strlen($rd['a']) > 500 ? '…' : '' ?></div>
              <?php else: ?>
                <div class="small dim">（这一问没有等到回答）</div>
              <?php endif; ?>
            </div>
          <?php endforeach; ?>
        </div>
      </details>
    <?php endforeach; ?>
  <?php endif; ?>
</div>
