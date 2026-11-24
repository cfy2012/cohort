<?php /** @var string $path */ ?>
<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>404</title>
<link rel="stylesheet" href="/assets/app.css?v=0.1.1"></head>
<body class="theme-teacher" style="display:grid;place-items:center;min-height:100vh">
<div style="text-align:center">
  <div class="eyebrow">404</div>
  <h1 style="margin:8px 0 6px">页面不存在</h1>
  <p class="muted mono small"><?= e($path) ?></p>
  <a class="btn mt16" href="/">回到首页</a>
</div>
</body></html>

