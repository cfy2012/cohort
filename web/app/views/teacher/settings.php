<?php
/** @var array $config @var array $ai */
$pageTitle = '系统设置';
$aiCfg = $config['ai'];
?>
<header class="page-head">
  <div>
    <div class="eyebrow">配置</div>
    <h1>系统设置</h1>
    <p>改完点保存，立即生效，不用重启服务</p>
  </div>
  <button class="btn btn-primary" data-action="save-settings">保存设置</button>
</header>

<div class="grid cols-2">
  <div class="card">
    <div class="card-head"><h2>基本信息</h2></div>
    <label class="field"><span>站点名称</span>
      <input type="text" id="cfg-site-title" value="<?= e($config['site_title']) ?>">
    </label>
    <label class="field"><span>学校</span>
      <input type="text" id="cfg-school" value="<?= e($config['school']) ?>" placeholder="例如：哈尔滨市松南学校">
    </label>
    <label class="field"><span>默认班级</span>
      <input type="text" id="cfg-class-name" value="<?= e($config['class_name']) ?>">
    </label>
  </div>

  <div class="card">
    <div class="card-head"><h2>AI 引擎</h2>
      <?php if ($ai['ok']): ?><span class="badge ok"><span class="dot"></span>在线</span><?php else: ?><span class="badge bad"><span class="dot"></span>离线</span><?php endif; ?>
    </div>
    <label class="field"><span>上游地址</span>
      <input type="text" id="cfg-ai-url" value="<?= e($aiCfg['base_url']) ?>">
    </label>
    <div class="form-row">
      <label class="field"><span>模型（留空自动）</span>
        <input type="text" id="cfg-ai-model" value="<?= e($aiCfg['model']) ?>" placeholder="<?= e($ai['models'][0] ?? '自动') ?>">
      </label>
      <label class="field"><span>温度</span>
        <input type="text" id="cfg-ai-temp" value="<?= e((string)$aiCfg['temperature']) ?>">
      </label>
    </div>
    <div class="form-row">
      <label class="field"><span>单次最大回复 token</span>
        <input type="text" id="cfg-ai-tokens" value="<?= e((string)$aiCfg['max_tokens']) ?>">
      </label>
      <label class="field"><span>超时（秒）</span>
        <input type="text" id="cfg-ai-timeout" value="<?= e((string)$aiCfg['timeout']) ?>">
      </label>
    </div>
    <label class="field"><span>携带历史条数</span>
      <input type="text" id="cfg-ai-context" value="<?= e((string)$config['chat']['context_messages']) ?>">
    </label>
    <label class="field"><span>附加系统提示（追加在助教人设后）</span>
      <textarea id="cfg-ai-extra" placeholder="例如：回答控制在 200 字以内；本班学生容易混淆电压表接法"><?= e($aiCfg['system_extra']) ?></textarea>
    </label>
  </div>
</div>

<div class="card">
  <div class="card-head"><h2>数据存放</h2></div>
  <div class="kv">
    <div class="k">名单</div><div class="mono small">data/students.json</div>
    <div class="k">课程</div><div class="mono small">data/courses.json</div>
    <div class="k">对话</div><div class="mono small">data/chats/&lt;场次&gt;/&lt;学号&gt;.jsonl</div>
    <div class="k">报表</div><div class="mono small">data/reports/&lt;场次&gt;.json</div>
  </div>
  <div class="notice mt16">全部是纯 JSON / JSONL，可以直接备份整个 data 文件夹。</div>
</div>
