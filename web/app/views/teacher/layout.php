<?php /** @var string $content */ ?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle ?? '控制台') ?> · <?= e(config()['site_title']) ?></title>
<link rel="stylesheet" href="/assets/app.css?v=0.4.0">
<link rel="stylesheet" href="/assets/paper.css?v=0.4.0">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='78' font-size='72'>◉</text></svg>">
</head>
<body class="theme-teacher">

<aside class="sidebar">
  <div class="brand">
    <span class="brand-mark">◉</span>
    <span class="brand-text"><b>Cohort</b><small>课堂 AI 助教</small></span>
  </div>
  <nav class="nav">
    <a href="/admin" class="<?= nav_active('/admin') ?>">控制台</a>
    <a href="/admin/courses" class="<?= nav_active('/admin/courses') ?>">课程排表</a>
    <a href="/admin/network" class="<?= nav_active('/admin/network') ?>">终端网络</a>
    <a href="/admin/students" class="<?= nav_active('/admin/students') ?>">学生名单</a>
    <a href="/admin/sessions" class="<?= nav_active('/admin/sessions') ?>">课堂记录</a>
    <a href="/admin/reports" class="<?= nav_active('/admin/reports') ?>">课堂报表</a>
    <div class="nav-sep"></div>
    <a href="/admin/ai" class="<?= nav_active('/admin/ai') ?>">AI 引擎</a>
    <a href="/admin/guide" class="<?= nav_active('/admin/guide') ?>">环境配置</a>
    <a href="/admin/settings" class="<?= nav_active('/admin/settings') ?>">系统设置</a>
  </nav>
  <div class="sidebar-foot">
    <a href="/logout" class="quiet">退出登录</a>
  </div>
</aside>

<main class="main">
  <?= $content ?>
</main>

<script src="/assets/app.js?v=0.4.4"></script>
</body>
</html>


