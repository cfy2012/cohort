<?php /** @var string $content */ ?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle ?? '登录') ?> · Cohort</title>
<link rel="stylesheet" href="/assets/app.css?v=0.1.1">
</head>
<body class="theme-teacher is-plain">
<?= $content ?>
<script src="/assets/app.js?v=0.4.4"></script>
</body>
</html>


