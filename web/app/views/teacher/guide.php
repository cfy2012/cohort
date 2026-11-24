<?php
/** @var array $ai @var array $config */
$pageTitle = '环境配置';
$aiOk = $ai['ok'];
?>
<header class="page-head">
  <div>
    <div class="eyebrow">部署</div>
    <h1>环境配置引导</h1>
    <p>软件本身已经把服务都拉起来了，这里只剩两件事：网络是否通、AI 是否能连</p>
  </div>
</header>

<div class="grid cols-2">
  <div class="card">
    <div class="card-head">
      <h2>① 网络（课前 1 分钟）</h2>
      <span class="badge <?= $aiOk ? '' : '' ?>">每节课都检查</span>
    </div>
    <div class="kv">
      <div class="k">路由器</div>
      <div class="small">自带路由器 / 随身 WiFi，<b>务必在后台关闭 AP 隔离</b>，否则学生之间和教师机之间互相访问不了。</div>
      <div class="k">教师机</div>
      <div class="small">用网线接路由器（无线也能用，但有线更稳）。</div>
      <div class="k">学生端</div>
      <div class="small">连同一个路由器的 Wi‑Fi，打开浏览器访问 <span class="mono"><?= e(lan_url()) ?></span>。</div>
      <div class="k">防火墙</div>
      <div class="small">启动器首次运行会自动放行 443 端口；如果学生打不开，先确认它是用“管理员”启动的。</div>
    </div>
    <div class="notice mt16">判断网络是否正常的土办法：让学生打开地址后看到“输入学号”的页面，就说明通了。</div>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>② LM Studio 本地服务</h2>
      <?php if ($aiOk): ?><span class="badge ok"><span class="dot"></span>已连接</span>
      <?php else: ?><span class="badge bad"><span class="dot"></span>未连接</span><?php endif; ?>
    </div>
    <ol class="small" style="padding-left:18px;line-height:1.9;margin:0 0 14px">
      <li>打开 LM Studio → 左侧 <b>Developer</b> 标签页</li>
      <li>顶部把 <b>Start Server</b> 打开（端口保持 <span class="mono">1234</span>）</li>
      <li>确认模型已加载（右侧聊天框能正常回答）</li>
      <li>模型存放目录改到 <span class="mono">D:\LMStudio\Models</span>（设置 → Models Directory），别放 C 盘</li>
    </ol>
    <div class="flex">
      <button class="btn" data-action="test-ai">测试连接</button>
      <span class="small muted" id="ai-test-result"><?= $aiOk ? '已连接：' . e(implode('、', $ai['models'])) : '点击测试' ?></span>
    </div>
    <div class="kv mt16">
      <div class="k">上游地址</div><div class="mono small"><?= e($config['ai']['base_url']) ?></div>
      <div class="k">当前模型</div><div class="small"><?= e($config['ai']['model'] ?: '自动（取已加载的第一个）') ?></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-head"><h2>③ 实验目录约定</h2><span class="hint">以后加实验只动这里</span></div>
  <div class="kv">
    <div class="k">目录</div><div class="mono small">experiments/&lt;english-slug&gt;/</div>
    <div class="k">入口</div><div class="mono small">index.html（实验界面自己写，前端不依赖任何框架）</div>
    <div class="k">元信息</div><div class="mono small">meta.json：title / subject / summary / objectives / equipment / order</div>
    <div class="k">访问</div><div class="mono small">/exp/&lt;slug&gt;/　（只有教师开启了绑定的课程才能进）</div>
  </div>
  <div class="notice mt16">新建实验 = 复制一个目录 + 改 meta.json + 写 index.html，不需要改 PHP 任何代码。</div>
</div>



