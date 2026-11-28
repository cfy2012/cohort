<?php /** @var string $content */ ?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f5f6f8">
<title><?= e($pageTitle ?? '课堂') ?> · <?= e(config()['site_title']) ?></title>
<link rel="stylesheet" href="/assets/app.css?v=0.4.0">
<link rel="stylesheet" href="/assets/paper.css?v=0.4.1">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='78' font-size='72'>◉</text></svg>">
</head>
<body class="theme-student <?= e($bodyClass ?? '') ?>">
<?= $content ?>
<script src="/assets/app.js?v=0.4.4"></script>
<script src="/assets/voice.js?v=0.1.1"></script>
</body>
</html>



