<?php
/** @var array $snapshot @var array|null $session */
$pageTitle = '终端网络';
$c = $snapshot['counts'];
?>
<header class="page-head">
  <div>
    <div class="eyebrow">局域网</div>
    <h1>终端网络</h1>
    <p>整段教室网段一眼看完：谁是讲台、谁进来了、谁在线、哪些地址还空着。</p>
  </div>
  <button class="btn btn-primary" id="btn-rescan">重新扫描</button>
</header>

<div class="grid cols-4">
  <div class="card" style="margin:0">
    <div class="card-head"><h2>讲台地址</h2></div>
    <div class="mono" style="font-size:20px;font-weight:600"><?= e($snapshot['lan_ip'] ?: '未获取') ?></div>
    <div class="small muted">学生手机浏览器填这个地址</div>
  </div>
  <div class="card" style="margin:0">
    <div class="card-head"><h2>已进班</h2></div>
    <div style="font-size:20px;font-weight:600"><?= (int)$c['student_total'] ?></div>
    <div class="small muted">其中在线 <?= (int)$c['attendee_online'] ?> 人 · 掉线 <?= (int)($c['student_total'] - $c['attendee_online']) ?> 人</div>
  </div>
  <div class="card" style="margin:0">
    <div class="card-head"><h2>在网设备</h2></div>
    <div style="font-size:20px;font-weight:600"><?= (int)$c['device'] ?></div>
    <div class="small muted">路由器/手机等，没进班的</div>
  </div>
  <div class="card" style="margin:0">
    <div class="card-head"><h2>本节课程</h2></div>
    <div style="font-size:15px;font-weight:600"><?= e($snapshot['session']['title'] ?? '还没开课') ?></div>
    <div class="small muted"><?= $snapshot['session'] ? ($snapshot['session']['status'] === 'live' ? '进行中' : '已下课') : '—' ?></div>
  </div>
</div>

<div class="card">
  <div class="card-head">
    <h2>地址网格 · <?= e($snapshot['prefix'] ?: '—') ?>.0/24</h2>
    <span class="hint" id="scan-time">扫描于 <?= e(substr((string)$snapshot['scanned_at'], 11, 8)) ?></span>
  </div>
  <div class="ip-legend" style="margin-bottom:14px">
    <span><i style="background:var(--accent)"></i>教师讲台</span>
    <span><i style="background:var(--ok)"></i>学生在线</span>
    <span><i style="background:var(--warn)"></i>进过班但离线</span>
    <span><i style="background:#7a8494"></i>其它设备</span>
    <span><i style="background:rgba(255,255,255,.2)"></i>空闲</span>
  </div>
  <div class="ip-grid" id="ip-grid">
    <?php foreach ($snapshot['hosts'] as $h): ?>
      <div class="ip-cell <?= e($h['role']) ?>" title="<?= e($h['ip'] . ' · ' . ($h['who'] ?: '空闲')) ?>">
        <?php if (in_array($h['role'], ['student','student-idle','teacher'], true)): ?><span class="flag"></span><?php endif; ?>
        <div class="who"><?= $h['who'] ? e($h['who']) : '空闲' ?></div>
        <div class="addr"><?= e($h['ip']) ?></div>
      </div>
    <?php endforeach; ?>
  </div>
  <?php if (!empty($snapshot['off_grid'])): ?>
    <div class="notice mt16">
      <b>以下同学不是从教室 Wi-Fi 进来的（多半是本机测试登录）：</b>
      <?php $ogs = array_values($snapshot['off_grid']); foreach ($ogs as $i => $o): ?>
        <span class="mono small"><?= e($o['name']) ?>(#<?= e($o['no']) ?> @ <?= e($o['ip'] ?: '未知') ?><?= $o['online'] ? ' 在线' : ' 离线' ?>)</span><?= $i < count($ogs) - 1 ? ' · ' : '' ?>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
  <p class="small muted mt16">说明：学生端每发一次消息就会刷新“在线”时间，超过 2 分钟没动静算离线；空闲格子是这段网段里目前没人用的地址。</p>
</div>

<script>
document.getElementById('btn-rescan').addEventListener('click', function () {
  var b = this; b.disabled = true; b.textContent = '扫描中…';
  api('/api/admin/network/scan').then(function (r) {
    if (!r.ok) { toast(r.error || '扫描失败', 'bad'); b.disabled = false; b.textContent = '重新扫描'; return; }
    location.reload();
  });
});
</script>
