<?php
/** @var array $student @var array $session @var array|null $experiment */
$pageTitle = '课堂';
$bodyClass = 'class-live';
?>
<div class="s-top">
  <div class="flex">
    <span class="brand-mark" style="color:var(--accent)">◉</span>
    <div>
      <div style="font-size:13px;font-weight:600"><?= e($session['title']) ?></div>
      <div class="who"><?= e($student['name']) ?> · #<?= e($student['no']) ?></div>
    </div>
  </div>
  <div class="flex">
    <span class="badge ok"><span class="dot"></span>上课中</span>
    <a href="/logout" class="quiet small">切换</a>
  </div>
</div>

<div class="s-wrap">

  <?php if ($experiment): ?>
  <div class="s-hero">
    <div class="small dim" style="letter-spacing:.06em;text-transform:uppercase">本节实验</div>
    <h1><?= e($experiment['title']) ?></h1>
    <p><?= e($experiment['summary'] ?: '按老师要求完成实验，边做边问 AI 助教') ?></p>
    <div class="flex mt16 wrap">
      <a class="btn btn-primary" id="btn-exp-open" href="/exp/<?= e($experiment['slug']) ?>" target="_blank" rel="noopener">进实验室</a>
      <?php if (!empty($experiment['equipment'])): ?>
        <span class="small muted">器材：<?= e(implode('、', (array)$experiment['equipment'])) ?></span>
      <?php endif; ?>
    </div>
    <p class="small muted mt16">实验室在单独的窗口里打开，摆器材、读数据都在那里；做完回这一页跟 AI 复盘。</p>
  </div>
  <?php endif; ?>

  <div class="s-cols">
    <div class="chat-box">
      <div class="chat-log" id="chat-log"></div>
      <div class="quote-chip" id="quote-chip" hidden>
        <span class="q-label">引用</span>
        <span class="q-text"></span>
        <button type="button" class="q-clear">取消</button>
      </div>
      <form class="chat-input" id="chat-form">
        <textarea id="chat-text" placeholder="问点什么……（Enter 发送，Shift+Enter 换行）" rows="1"></textarea>
        <button class="btn btn-primary" type="submit">发送</button>
      </form>
    </div>
  </div>

  <div class="s-nav">
    <a href="/api/chat/history" onclick="return false;" style="display:none"></a>
    <a href="/logout"><strong>退出</strong><span>换一个同学登录时点这里</span></a>
  </div>
</div>

<?php if ($experiment): ?>
<button class="exp-fab" type="button" id="btn-exp-fab" title="进实验室">实验</button>
<?php endif; ?>

<script>
(function () {
  var fab = document.getElementById('btn-exp-fab');
  if (!fab) return;
  var href = '/exp/<?= e($experiment['slug']) ?>';
  fab.addEventListener('click', function () { window.open(href, '_blank'); });
})();
</script>
