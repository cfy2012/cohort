<?php
/** @var array|null $session @var array|null $experiment @var array $ai @var array $attendees @var int $chatCount @var int $reportCount @var int $students @var array $courses */
$pageTitle = '控制台';
$live = $session && $session['status'] === 'live';
?>
<header class="page-head">
  <div>
    <div class="eyebrow"><?= e(config()['site_title']) ?> · <?= e(date('Y-m-d H:i')) ?></div>
    <h1>讲台控制台</h1>
    <p>本机服务地址 <span class="mono"><?= e(lan_url()) ?></span>　学生连同一个 Wi‑Fi 后直接打开这个地址</p>
  </div>
  <div class="flex">
    <a class="btn btn-ghost" href="/" target="_blank">打开学生端预览</a>
    <?php if ($live): ?>
      <button class="btn btn-danger" data-action="stop-session">结束本次课程</button>
    <?php endif; ?>
  </div>
</header>

<div class="grid cols-4">
  <div class="stat">
    <div class="label">当前课程</div>
    <div class="value" style="font-size:17px;line-height:1.5">
      <?= $live ? e($session['title']) : '未开启' ?>
    </div>
    <div class="sub">
      <?php if ($live): ?>
        <span class="badge ok"><span class="dot"></span>进行中 · <?= e(mb_substr($session['started_at'], 11, 5)) ?> 开始</span>
      <?php else: ?>
        到“课程排表”选一节点开启
      <?php endif; ?>
    </div>
  </div>
  <div class="stat">
    <div class="label">在场学生</div>
    <div class="value"><?= (int)count($attendees) ?></div>
    <div class="sub">名单共 <?= (int)$students ?> 人</div>
  </div>
  <div class="stat">
    <div class="label">本轮提问</div>
    <div class="value"><?= (int)$chatCount ?></div>
    <div class="sub">对话记录条数</div>
  </div>
  <div class="stat">
    <div class="label">AI 引擎</div>
    <div class="value" style="font-size:17px;line-height:1.5">
      <?php if ($ai['ok']): ?>
        <span class="badge ok"><span class="dot"></span>已连接</span>
      <?php else: ?>
        <span class="badge bad"><span class="dot"></span>未连接</span>
      <?php endif; ?>
    </div>
    <div class="sub"><?= $ai['ok'] ? e(mb_substr(implode('、', $ai['models']), 0, 40)) : '打开 LM Studio 并启动本地服务（1234 端口）' ?></div>
  </div>
</div>

<?php if ($live): ?>
<div class="card mt24">
  <div class="card-head">
    <h2>本节课堂</h2>
    <span class="hint">场次 <?= e($session['id']) ?> · 班级 <?= e($session['class']) ?></span>
  </div>
  <div class="grid cols-2">
    <div class="kv">
      <div class="k">课程</div><div><?= e($session['title']) ?></div>
      <div class="k">实验</div><div><?= $experiment ? e($experiment['title']) : '<span class="dim">未绑定实验</span>' ?></div>
      <div class="k">实验页</div><div>
        <?php if ($experiment): ?>
          <a href="/exp/<?= e($experiment['slug']) ?>" target="_blank">/exp/<?= e($experiment['slug']) ?></a>
        <?php else: ?>—<?php endif; ?>
      </div>
      <div class="k">教师备注</div><div><?= $session['note'] ? e($session['note']) : '<span class="dim">无</span>' ?></div>
    </div>
    <div>
      <div class="small dim" style="margin-bottom:8px">学生进入状态</div>
      <?php if ($attendees): ?>
        <div class="list">
          <?php foreach (array_slice($attendees, 0, 6, true) as $no => $a): ?>
            <div class="list-item">
              <div>
                <div class="ttl"><?= e($a['name']) ?> <span class="dim mono small">#<?= e($no) ?></span></div>
                <div class="sub mono"><?= e($a['ip'] ?? '') ?> · <?= e(mb_substr($a['last_seen'] ?? '', 11, 8)) ?></div>
              </div>
              <span class="badge ok"><span class="dot"></span>在线</span>
            </div>
          <?php endforeach; ?>
          <?php if (count($attendees) > 6): ?>
            <div class="small dim">… 另外 <?= (int)(count($attendees) - 6) ?> 人，见“学生名单”</div>
          <?php endif; ?>
        </div>
      <?php else: ?>
        <div class="empty">还没有学生进入，等他们打开地址输入学号</div>
      <?php endif; ?>
    </div>
  </div>
  <div class="flex mt16">
    <button class="btn btn-primary" data-action="build-report" data-session="<?= e($session['id']) ?>">生成课堂报表</button>
    <a class="btn btn-ghost" href="/admin/sessions">查看课堂记录</a>
  </div>
</div>
<?php else: ?>
<div class="card mt24">
  <div class="card-head">
    <h2>开启一节新课</h2>
    <span class="hint">开启后学生端才会出现实验入口和 AI 对话</span>
  </div>
  <?php if ($courses): ?>
    <div class="list">
      <?php foreach ($courses as $c): ?>
        <div class="list-item">
          <div>
            <div class="ttl"><?= e($c['title']) ?></div>
            <div class="sub">
              <?= e($c['date'] ?? '') ?>
              <?php if (!empty($c['experiment'])): ?> · 实验 <a href="/exp/<?= e($c['experiment']) ?>" target="_blank"><?= e($c['experiment']) ?></a><?php endif; ?>
              <?php if (!empty($c['note'])): ?> · <?= e($c['note']) ?><?php endif; ?>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" data-action="start-session" data-course="<?= e($c['id']) ?>">开启本节课</button>
        </div>
      <?php endforeach; ?>
    </div>
  <?php else: ?>
    <div class="empty">还没有课程，请到“课程排表”添加</div>
  <?php endif; ?>
</div>
<?php endif; ?>

<div class="card">
  <div class="card-head">
    <h2>快速入口</h2>
  </div>
  <div class="grid cols-3">
    <a class="list-item" href="/admin/students"><div><div class="ttl">导入班级名单</div><div class="sub">学号 + 姓名，一行一人</div></div></a>
    <a class="list-item" href="/admin/courses"><div><div class="ttl">课程排表</div><div class="sub">给每节课绑定实验目录</div></div></a>
    <a class="list-item" href="/admin/guide"><div><div class="ttl">环境配置引导</div><div class="sub">LM Studio / 网络 / 防火墙</div></div></a>
  </div>
</div>




