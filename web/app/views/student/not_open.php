<?php /** @var array $experiment @var array $session */ $pageTitle = '未开放'; ?>
<div class="s-top">
  <div class="flex"><span class="brand-mark" style="color:var(--accent)">◉</span><b><?= e(config()['site_title']) ?></b></div>
  <span class="who"><?= e($session['title']) ?></span>
</div>
<div class="s-wrap">
  <div class="exp-placeholder">
    <div class="small dim">NOT OPEN</div>
    <h2><?= e($experiment['title']) ?></h2>
    <p class="muted">本节正在做的是《<?= e($session['title']) ?>》，这个实验还没开放。</p>
    <a class="btn btn-primary mt16" href="/">回到课堂</a>
  </div>
</div>
