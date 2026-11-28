<?php /** @var array|null $session */ $pageTitle = '进入课堂'; ?>
<div class="s-top">
  <div class="flex"><span class="brand-mark" style="color:var(--accent)">◉</span><b><?= e(config()['site_title']) ?></b></div>
  <span class="who"><?= e(config()['class_name']) ?></span>
</div>

<div class="s-wrap">
  <div class="s-hero">
    <h1>AI 助教已就绪</h1>
    <p>输入学号和姓名，进入本节课堂</p>
    <?php if ($session): ?>
      <div class="meta">
        <span class="badge ok"><span class="dot"></span>正在上课</span>
        <span class="badge"><?= e($session['title']) ?></span>
      </div>
    <?php else: ?>
      <div class="meta"><span class="badge">教师还未开启课程</span></div>
    <?php endif; ?>
  </div>

  <div class="s-hero">
    <form id="join-form">
      <label class="field"><span>学号</span>
        <input type="text" id="join-no" inputmode="numeric" placeholder="例如 20260701" autocomplete="off">
      </label>
      <label class="field"><span>姓名</span>
        <input type="text" id="join-name" placeholder="你的名字" autocomplete="off">
      </label>
      <button class="btn btn-primary" style="width:100%;justify-content:center;height:46px">进入课堂</button>
    </form>
  </div>
</div>

<script>
document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const no = document.getElementById('join-no').value.trim();
  const name = document.getElementById('join-name').value.trim();
  if (!no || !name) return toast('学号和姓名都要填', 'bad');
  const r = await api('/api/join', { no, name });
  if (!r.ok) return toast(r.error || '进入失败', 'bad');
  location.href = '/';
});
</script>
