<?php
/**
 * 单页控制台（教师端唯一页面）
 * 所有功能都在这一页里：本次课程、排课、网络、报表、AI、名单设置。
 * 不跳转、不开新页，切换靠页签。
 */
$pageTitle = '讲台控制台';
$S  = $session;
$live = $live ?? false;
$att = $attendees ?? [];
$cw = $network['counts'] ?? [];
$aiOk = !empty($ai['ok']);
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle) ?> · <?= e(config()['site_title']) ?></title>
<link rel="stylesheet" href="/assets/app.css?v=0.5.0">
<link rel="stylesheet" href="/assets/paper.css?v=0.4.0">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='78' font-size='72'>◉</text></svg>">
</head>
<body class="theme-teacher console-body">

<div class="c-head">
  <div class="c-brand">
    <span class="brand-mark">◉</span>
    <div>
      <b>Cohort 讲台</b>
      <small><?= e(config()['school']) ?> · <?= e(config()['class_name']) ?></small>
    </div>
  </div>

  <div class="c-status" id="c-status">
    <?php if ($live): ?>
      <span class="badge ok"><span class="dot"></span>上课中 · <?= e($S['title']) ?></span>
    <?php else: ?>
      <span class="badge">未开课</span>
    <?php endif; ?>
    <span class="c-addr mono" id="lan-url" title="学生浏览器填这个地址"><?= e($lan['url'] ?? '') ?></span>
    <button class="btn btn-sm" id="btn-copy">复制地址</button>
    <?php if ($live): ?>
      <button class="btn btn-sm btn-danger" data-stop>结束课程</button>
    <?php endif; ?>
  </div>

  <div class="c-user">
    <span class="small muted" id="ai-dot"><?= $aiOk ? '<span class="badge ok"><span class="dot"></span>AI 就绪</span>' : '<span class="badge bad"><span class="dot"></span>AI 未连接</span>' ?></span>
    <a href="/logout" class="quiet small">退出</a>
  </div>
</div>

<div class="c-tabs">
  <button class="c-tab is-on" data-tab="class">课堂</button>
  <button class="c-tab" data-tab="courses">排课</button>
  <button class="c-tab" data-tab="network">网络</button>
  <button class="c-tab" data-tab="reports">报表</button>
  <button class="c-tab" data-tab="ai">AI 引擎</button>
  <button class="c-tab" data-tab="lab">实验室</button>
  <button class="c-tab" data-tab="data">班级 / 名单</button>
</div>

<main class="c-main">

<!-- ===================== 课堂 ===================== -->
<section class="c-panel is-on" data-panel="class">
  <div class="grid cols-4">
    <div class="stat">
      <div class="label">当前课程</div>
      <div class="value" style="font-size:16px;line-height:1.5" id="st-course"><?= $live ? e($S['title']) : '未开启' ?></div>
      <div class="sub" id="st-course-sub"><?= $live ? '开始于 ' . e(mb_substr($S['started_at'], 11, 5)) : '在下面选一节课开启' ?></div>
    </div>
    <div class="stat">
      <div class="label">在场学生</div>
      <div class="value" id="st-count"><?= count($att) ?></div>
      <div class="sub" id="st-count-sub">名单共 <?= count($students) ?> 人</div>
    </div>
    <div class="stat">
      <div class="label">提问总数</div>
      <div class="value" id="st-q"><?= array_sum(array_map(fn($a) => (int)$a['questions'], $att)) ?></div>
      <div class="sub">这节课所有学生的问题</div>
    </div>
    <div class="stat">
      <div class="label">网络</div>
      <div class="value" style="font-size:16px;line-height:1.5"><?= (int)($cw['student_total'] ?? 0) ?> / <?= (int)count($students) ?></div>
      <div class="sub">已进班 / 名单</div>
    </div>
  </div>

  <div class="c-two mt16">
    <div class="card" style="margin:0">
      <div class="card-head">
        <h2>在场学生</h2>
        <span class="hint">每 15 秒自动刷新</span>
      </div>
      <div id="att-list">
        <?php if (!$att): ?>
          <div class="empty">还没有学生进入，让他们打开上面那个地址、输入学号姓名</div>
        <?php else: ?>
          <table>
            <thead><tr><th>学生</th><th style="width:130px">IP</th><th style="width:70px">提问</th><th style="width:90px">状态</th></tr></thead>
            <tbody>
            <?php foreach ($att as $a): ?>
              <tr>
                <td><div style="font-weight:600"><?= e($a['name']) ?></div><div class="small mono dim">#<?= e($a['no']) ?></div></td>
                <td class="mono small"><?= e($a['ip']) ?></td>
                <td class="num"><?= (int)$a['questions'] ?></td>
                <td><?= $a['online'] ? '<span class="badge ok"><span class="dot"></span>在线</span>' : '<span class="badge warn">离线</span>' ?></td>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
        <?php endif; ?>
      </div>
    </div>

    <div class="card" style="margin:0">
      <div class="card-head"><h2>开始一节课</h2><span class="hint">点一下就开</span></div>
      <div class="list" style="max-height:420px;overflow:auto">
        <?php foreach ($courses as $c): ?>
          <div class="list-item">
            <div>
              <div class="ttl"><?= e($c['title']) ?></div>
              <div class="sub"><?= e($c['date'] ?? '') ?><?= !empty($c['period']) ? ' · ' . e($c['period']) : '' ?>
                <?php if (!empty($c['experiment'])): ?> · 实验 <?= e($c['experiment']) ?><?php endif; ?>
              </div>
            </div>
            <?php if ($live && ($S['course_id'] ?? '') === ($c['id'] ?? '')): ?>
              <span class="badge ok"><span class="dot"></span>正在上</span>
            <?php else: ?>
              <button class="btn btn-sm btn-primary" data-start="<?= e($c['id']) ?>">开启</button>
            <?php endif; ?>
          </div>
        <?php endforeach; ?>
        <?php if (!$courses): ?><div class="empty">还没排课，去「排课」页加一节</div><?php endif; ?>
      </div>
      <?php if ($live): ?>
        <div class="flex mt16">
          <button class="btn btn-sm" id="btn-report-now" data-session="<?= e($S['id']) ?>">立即生成报表</button>
          <span class="small muted">下课时会自动跑一次</span>
        </div>
      <?php endif; ?>
    </div>
  </div>

  <div class="card" style="margin:16px 0 0">
    <div class="card-head">
      <h2>实验提交</h2>
      <div class="flex" style="gap:12px;align-items:center">
        <label class="small flex" style="gap:6px;align-items:center">
          <input type="checkbox" id="lab-overwrite"> 重复提交自动覆盖
        </label>
        <button class="btn btn-sm" id="lab-refresh" type="button">刷新</button>
      </div>
    </div>
    <div id="lab-subs"><div class="empty">还没有学生提交实验数据（每 6 秒自动刷新）</div></div>
  </div>
</section>

<!-- ===================== 排课 ===================== -->
<section class="c-panel" data-panel="courses">
  <div class="card">
    <div class="card-head">
      <h2>课程排表</h2>
      <div class="flex">
        <span class="hint">共 <?= count($courses) ?> 节</span>
        <button class="btn btn-primary btn-sm" id="btn-new-course">+ 新建课程</button>
      </div>
    </div>
    <table id="course-table">
      <thead><tr><th style="width:110px">日期</th><th>课程</th><th style="width:210px">实验</th><th style="width:100px">班级</th><th style="width:170px"></th></tr></thead>
      <tbody>
      <?php foreach ($courses as $c): ?>
        <tr>
          <td class="mono small"><?= e($c['date'] ?? '—') ?></td>
          <td>
            <div style="font-weight:600"><?= e($c['title']) ?></div>
            <?php if (!empty($c['note'])): ?><div class="small muted"><?= e($c['note']) ?></div><?php endif; ?>
            <?php if ($live && ($S['course_id'] ?? '') === ($c['id'] ?? '')): ?><span class="badge ok"><span class="dot"></span>正在上</span><?php endif; ?>
          </td>
          <td class="small"><?= !empty($c['experiment']) ? '<span class="mono">' . e($c['experiment']) . '</span>' : '<span class="dim">未绑定（纯答疑）</span>' ?></td>
          <td class="small"><?= e($c['class'] ?? '') ?></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-sm" data-edit="<?= e($c['id']) ?>">编辑</button>
            <button class="btn btn-sm btn-ghost" data-del="<?= e($c['id']) ?>">删除</button>
            <button class="btn btn-sm btn-primary" data-start="<?= e($c['id']) ?>">开启</button>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</section>

<!-- ===================== 网络 ===================== -->
<section class="c-panel" data-panel="network">
  <div class="card">
    <div class="card-head">
      <h2>地址网格 · <span class="mono" id="net-prefix"><?= e($network['prefix']) ?>.0/24</span></h2>
      <div class="flex">
        <span class="hint" id="net-time">扫描于 <?= e(substr((string)$network['scanned_at'], 11, 8)) ?></span>
        <button class="btn btn-sm btn-primary" id="btn-rescan">重新扫描</button>
      </div>
    </div>
    <div class="ip-legend" style="margin-bottom:14px">
      <span><i style="background:var(--accent)"></i>教师讲台</span>
      <span><i style="background:var(--ok)"></i>学生在线</span>
      <span><i style="background:var(--warn)"></i>掉线</span>
      <span><i style="background:#7a8494"></i>其它设备</span>
      <span><i style="background:rgba(255,255,255,.2)"></i>空闲</span>
    </div>
    <div class="ip-grid" id="ip-grid"><?= console_ip_grid_html($network) ?></div>
    <div id="net-offgrid"></div>
    <p class="small muted mt16">学生端每发一次消息就刷新一次在线时间，超过 2 分钟没动静算离线。</p>
  </div>
</section>

<!-- ===================== 报表 ===================== -->
<section class="c-panel" data-panel="reports">
  <div class="card">
    <div class="card-head">
      <h2>课堂报表</h2>
      <span class="hint">下课后自动生成；点开是完整的逐生归纳 + 逐轮回放</span>
    </div>
    <?php if (!$reports): ?>
      <div class="empty">还没有报表。上一节课并点「结束课程」后会自动生成。</div>
    <?php else: ?>
      <div class="list">
        <?php foreach ($reports as $r): ?>
          <div class="list-item" style="cursor:pointer" data-report="<?= e($r['session_id']) ?>">
            <div>
              <div class="ttl"><?= e($r['title']) ?></div>
              <div class="sub"><?= e(date('m 月 d 日 H:i', strtotime($r['generated_at']))) ?> · <?= (int)($r['totals']['students'] ?? 0) ?> 人 · 提问 <?= (int)($r['totals']['exchanges'] ?? 0) ?> 条 · <?= $r['mode'] === 'ai' ? 'AI 归纳' : '仅统计' ?></div>
            </div>
            <span class="small" style="color:var(--accent)">查看 →</span>
          </div>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </div>
  <div class="card" id="report-view" hidden></div>
</section>

<!-- ===================== AI ===================== -->
<section class="c-panel" data-panel="ai">
  <div class="card">
    <div class="card-head">
      <h2>AI 引擎</h2>
      <div class="flex">
        <span class="hint" id="rec-line">推荐 <?= e($recommend['key']) ?>（<?= e($recommend['note']) ?>）</span>
        <button class="btn btn-primary btn-sm" id="btn-quick">一键启动</button>
      </div>
    </div>
    <div class="steps">
      <div class="step" id="st-srv"><span class="n">1</span><div class="t"><b>启动 AI 服务</b><small>后台开 1234 端口</small></div><span class="badge" id="bd-srv">检查中</span></div>
      <div class="step" id="st-dl"><span class="n">2</span><div class="t"><b>下载适配模型</b><small>按显存挑档位，下完 LM Studio 自己就认得</small></div><span class="badge" id="bd-dl">检查中</span></div>
      <div class="step" id="st-ld"><span class="n">3</span><div class="t"><b>加载进内存</b><small>30 分钟没人用会自动卸载，省显存</small></div><span class="badge" id="bd-ld">检查中</span></div>
    </div>
    <div class="mt16">
      <div class="log-box" id="task-log">（没有正在跑的任务）</div>
    </div>
    <div class="card-head mt16"><h3 style="font-size:13.5px;margin:0">本机模型</h3>
      <div class="flex">
        <span class="hint" id="loaded-line"></span>
        <button class="btn btn-sm" id="btn-unload-all">全部卸载</button>
        <button class="btn btn-sm" id="btn-models">刷新</button>
      </div>
    </div>
    <table id="model-table"><tbody><tr><td class="empty">读取中…</td></tr></tbody></table>
  </div>
</section>

<!-- ===================== 实验室后台 ===================== -->
<section class="c-panel" data-panel="lab">
  <div class="card">
    <div class="card-head">
      <h2>实验室页签</h2>
      <span class="hint">学生进实验室看到哪几个实验、默认进哪个</span>
    </div>
    <div id="lab-mod-list" class="list"><div class="empty">读取中…</div></div>
    <div class="form" style="padding-top:0">
      <label style="flex-direction:row;align-items:center;gap:8px;color:var(--ink);margin:14px 0 2px">
        <input type="checkbox" id="lab-free"> 不排课也能直接用实验室（自由练习）
      </label>
      <div class="form-foot">
        <button class="btn btn-primary" id="btn-lab-cfg-save">保存实验室设置</button>
        <span class="small muted" id="lab-cfg-msg"></span>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-head">
      <h2>自定义实验室</h2>
      <span class="hint">通用台里存下的、或从 JSON 导入的场景，学生端也能直接载入</span>
    </div>
    <div id="lab-labs" class="list"><div class="empty">读取中…</div></div>
    <div class="form-foot" style="padding-top:0">
      <button class="btn btn-sm" id="btn-lab-import">导入实验室 JSON</button>
      <input type="file" id="lab-import-file" accept=".json,application/json" style="display:none">
      <span class="small muted" id="lab-labs-msg">导出：进通用实验台 → 导出，得到一个 .lab.json 文件</span>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h2>通用实验台怎么用</h2><span class="hint">学生端「05 通用实验台」</span></div>
    <div class="small muted" style="line-height:1.8">
      左边器材架点一下上墙，电学器材之间用「连线」模式拖端子接线，光学器材按位置摆，读数自动算。
      摆好之后点「存为实验室」，这份场景就进了上面的列表；也能「导出」成 JSON 存档或发给别人，再在后台「导入」。
      实验室 JSON 里每件器材是 <span class="mono">{type,x,y,params}</span>，连线是 <span class="mono">[器材序号,端子,器材序号,端子]</span>，
      没写坐标的器材会按网格自动排。
    </div>
  </div>
</section>

<!-- ===================== 名单 / 设置 ===================== -->
<section class="c-panel" data-panel="data">
  <div class="c-two">
    <div class="card" style="margin:0">
      <div class="card-head">
        <h2>班级</h2>
        <div class="flex">
          <span class="hint" id="class-count"></span>
          <button class="btn btn-sm btn-primary" id="btn-new-class" type="button">+ 新建班级</button>
        </div>
      </div>
      <div id="class-list" style="max-height:460px;overflow:auto"><div class="empty">加载中…</div></div>
      <div class="small muted mt8">新建班级时可以勾选别的班，把他们的成员一起并进来（合班）。</div>
    </div>

    <div class="card" style="margin:0">
      <div class="card-head">
        <h2>学生名单</h2>
        <div class="flex">
          <button class="btn btn-sm" id="btn-new-student" type="button">+ 注册学生</button>
          <button class="btn btn-sm" id="btn-import-file" type="button">导入 Excel</button>
          <input type="file" id="import-file" accept=".xlsx,.csv,.txt" hidden>
        </div>
      </div>
      <div class="form" style="padding-bottom:0">
        <div class="row-2">
          <label>按班级筛选<select id="stu-filter"><option value="">全部</option></select></label>
          <label>搜学号 / 姓名<input id="stu-search" placeholder="输入即过滤"></label>
        </div>
      </div>
      <div id="stu-list" style="max-height:430px;overflow:auto"></div>
      <div class="small muted" style="padding:8px 2px" id="stu-msg">名单为空时任何学号都能进；导入后只认真名单。</div>
    </div>
  </div>

  <div class="c-two mt16">
    <div class="card" style="margin:0">
      <div class="card-head"><h2>系统设置</h2></div>
      <div class="form">
        <label>站点名<input id="cfg-title" value="<?= e(config()['site_title']) ?>"></label>
        <div class="row-2">
          <label>学校<input id="cfg-school" value="<?= e(config()['school']) ?>"></label>
          <label>默认班级<input id="cfg-class" value="<?= e(config()['class_name']) ?>"></label>
        </div>
        <div class="row-2">
          <label>教师口令<input id="cfg-pass" value="<?= e(config()['teacher_password']) ?>"></label>
          <label>上下文轮数<input id="cfg-ctx" type="number" min="2" max="40" value="<?= (int)config()['chat']['context_messages'] ?>"></label>
        </div>
        <div class="row-2">
          <label>AI 地址<input id="cfg-base" value="<?= e(config()['ai']['base_url']) ?>"></label>
          <label>默认模型<input id="cfg-model" value="<?= e(config()['ai']['model']) ?>" placeholder="留空=自动挑"></label>
        </div>
        <div class="form-foot">
          <button class="btn btn-primary" id="btn-save-cfg">保存设置</button>
          <span class="small muted" id="cfg-msg"></span>
        </div>
      </div>
    </div>

    <div class="card" style="margin:0">
      <div class="card-head"><h2>粘贴导入（备用）</h2><span class="hint">没有 Excel 文件时用这个</span></div>
      <div class="form">
        <label>一行一个：学号 姓名 [班级]<textarea id="roster-text" placeholder="20120331 陈福尧 九年七班" style="min-height:150px"></textarea></label>
        <div class="form-foot">
          <button class="btn btn-primary btn-sm" id="btn-import">整份替换</button>
          <button class="btn btn-sm" id="btn-import-merge">追加/更新</button>
          <span class="small muted" id="roster-msg"></span>
        </div>
      </div>
    </div>
  </div>
</section>

</main>

<!-- 课程编辑弹窗 -->
<div class="modal" id="course-modal" hidden>
  <div class="modal-box">
    <div class="card-head"><h2 id="cm-title">新建课程</h2><button class="btn btn-sm btn-ghost" id="cm-close">关闭</button></div>
    <div class="form">
      <input type="hidden" id="cm-id">
      <label>课程名称<input id="cm-name" placeholder="例如：探究电流与电阻的关系"></label>
      <div class="row-2">
        <label>日期<input id="cm-date" type="date"></label>
        <label>节次<input id="cm-period" placeholder="第 3 节"></label>
      </div>
      <div class="row-2">
        <label>班级<input id="cm-class" value="<?= e(config()['class_name']) ?>"></label>
        <label>绑定实验
          <select id="cm-exp">
            <option value="">（不绑定，纯 AI 答疑）</option>
            <?php foreach ($experiments as $x): ?>
              <option value="<?= e($x['slug']) ?>"><?= e($x['title']) ?> · <?= e($x['slug']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
      </div>
      <label>备注<input id="cm-note" placeholder="只给你自己看"></label>
      <div class="form-foot"><button class="btn btn-primary" id="cm-save">保存</button><span class="small muted" id="cm-msg"></span></div>
    </div>
  </div>
</div>

<!-- 班级弹窗 -->
<div class="modal" id="class-modal" hidden>
  <div class="modal-box">
    <div class="card-head"><h2 id="clm-title">新建班级</h2><button class="btn btn-sm btn-ghost" id="clm-close">关闭</button></div>
    <div class="form">
      <input type="hidden" id="clm-id">
      <label>班级名称<input id="clm-name" placeholder="例如：九年七班 / 物理提高班"></label>
      <div id="clm-copy-wrap">
        <div class="small" style="font-weight:600;margin-bottom:6px">把别班的成员一起并进来（可不选）</div>
        <div id="clm-copy" class="list" style="max-height:200px;overflow:auto"></div>
      </div>
      <div class="form-foot"><button class="btn btn-primary" id="clm-save">保存</button><span class="small muted" id="clm-msg"></span></div>
    </div>
  </div>
</div>

<!-- 学生弹窗 -->
<div class="modal" id="student-modal" hidden>
  <div class="modal-box">
    <div class="card-head"><h2 id="sm-title">注册学生</h2><button class="btn btn-sm btn-ghost" id="sm-close">关闭</button></div>
    <div class="form">
      <input type="hidden" id="sm-orig">
      <div class="row-2">
        <label>学号<input id="sm-no" placeholder="20120331"></label>
        <label>姓名<input id="sm-name" placeholder="陈福尧"></label>
      </div>
      <div>
        <div class="small" style="font-weight:600;margin-bottom:6px">所属班级（可多选）</div>
        <div id="sm-classes" class="list" style="max-height:200px;overflow:auto"></div>
      </div>
      <div class="form-foot">
        <button class="btn btn-primary" id="sm-save">保存</button>
        <button class="btn btn-sm btn-ghost" id="sm-del" type="button">删除该学生</button>
        <span class="small muted" id="sm-msg"></span>
      </div>
    </div>
  </div>
</div>

<script>
window.COHORT_CONSOLE = {
  courses: <?= json_encode($courses, JSON_UNESCAPED_UNICODE) ?>,
  sessionId: <?= json_encode($live ? $S['id'] : null) ?>,
  ctx: <?= (int)config()['chat']['context_messages'] ?>,
  recKey: <?= json_encode($recommend['key']) ?>
};
</script>
<script src="/assets/app.js?v=0.4.5"></script>
<script src="/assets/console.js?v=0.5.3"></script>
</body>
</html>
<?php
/** 网格格子：渲染成 HTML 片段，初次加载和重新扫描共用 */
function console_ip_grid_html(array $net): string {
    $out = '';
    foreach (($net['hosts'] ?? []) as $h) {
        $cls = e($h['role']);
        $who = $h['who'] ? e($h['who']) : '空闲';
        $flag = in_array($h['role'], ['student','student-idle','teacher'], true) ? '<span class="flag"></span>' : '';
        $out .= '<div class="ip-cell ' . $cls . '" title="' . e($h['ip']) . '">' . $flag
              . '<div class="who">' . $who . '</div><div class="addr">' . e($h['ip']) . '</div></div>';
    }
    return $out;
}

