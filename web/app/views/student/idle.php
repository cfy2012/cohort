<?php /** @var array $student */ $pageTitle = '等待开始'; ?>
<div class="s-top">
  <div class="flex"><span class="brand-mark" style="color:var(--accent)">◉</span><b><?= e(config()['site_title']) ?></b></div>
  <span class="who"><?= e($student['name']) ?></span>
</div>
<div class="s-wrap">
  <div class="s-hero">
    <div class="small dim" style="text-transform:uppercase;letter-spacing:.06em">等待中</div>
    <h1>教师还没有开启本节课程</h1>
    <p>先坐到位置上，等老师宣布开始后刷新这个页面。</p>
    <div class="flex mt16">
      <a class="btn btn-primary" href="/">刷新</a>
      <a class="btn btn-ghost" href="/logout">换人登录</a>
    </div>
  </div>
  <div class="notice">提示：连接的是教室自己的 Wi‑Fi，不是手机流量，否则访问不到这个页面。</div>
</div>
