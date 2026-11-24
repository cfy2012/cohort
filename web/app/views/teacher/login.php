<?php /** @var string|null $error */ $pageTitle = '教师登录'; ?>
<div class="login-wrap">
  <div class="login-card">
    <div class="brand" style="padding:0 0 14px">
      <span class="brand-mark">◉</span>
      <span class="brand-text"><b>Cohort</b><small>课堂 AI 助教</small></span>
    </div>
    <h1>教师登录</h1>
    <p><?= e(config()['school'] ?: '本机课堂服务') ?> · <?= e(config()['class_name']) ?></p>
    <?php if ($error): ?><div class="notice bad" style="margin-bottom:14px"><?= e($error) ?></div><?php endif; ?>
    <form method="post" action="/teacher/login">
      <label class="field">
        <span>口令</span>
        <input type="password" name="password" autofocus autocomplete="current-password" placeholder="输入教师口令">
      </label>
      <button class="btn btn-primary" style="width:100%;justify-content:center;height:42px">进入控制台</button>
    </form>
    <p class="small dim mt16" style="margin-bottom:0">学生不需要口令，直接打开首页输入学号姓名即可。</p>
  </div>
</div>
