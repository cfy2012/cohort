# 草纸物理实验室 · 接口说明

一个放在 `experiments/lab/` 里的物理仿真实验室，页面分三栏（视觉跟项目现在这套纸片主题一致：
纸色 `#fcfbf6`、墨线、红笔批注、宋体；画布里的器材仍是手绘草图）：

```
┌──────────┬──────────────────────────────┬──────────────┐
│ 器材架   │ 实验台（Canvas，草纸手绘）    │ 记录表 ⇄ AI  │
│ 点击/拖放 │ 逐帧物理推演，可拖可测        │ 3 条起可交老师 │
└──────────┴──────────────────────────────┴──────────────┘
```

访问：`/exp/lab`（在课堂里由排课绑定 `lab` 后学生可进；教师登录后可预览）。

学生课堂页已经没有「实验区」侧栏 iframe 了：点「进实验室」/右下角「实验」浮钮，
直接用 `window.open('/exp/<slug>', '_blank')` 开一个新窗口。所有实验都这样，不再区分是否整页。

页内资源用的是相对路径，`index.html` 顶部的 `<base>` 会按当前路径补成 `/exp/lab/`，
所以 `/exp/lab`、`/exp/lab/`、`/exp/lab/index.html` 三种地址都能正确加载 CSS/JS。

---

## 一、文件

| 文件 | 作用 |
|---|---|
| `index.html` | 三栏页面结构 |
| `lab.css` | 草纸 / 铅笔 / 红蓝批注的视觉 |
| `lab.js` | 引擎：纸面、手绘笔触、120 Hz 固定步长循环、器材架、笔记、AI 面板 |
| `exp-lever.js` | 杠杆平衡（力矩动力学） |
| `exp-lens.js` | 凸透镜成像（薄透镜作图 + 离焦模糊） |
| `exp-circuit.js` | 伏安法测电阻（真实回路求解 + 电表内阻误差） |
| `exp-buoyancy.js` | 浮力大小（阿基米德 + 水面上升） |
| `exp-states.js` | 物态变化（密闭空腔 + 烧杯，牛顿冷却 + 潜热相变） |
| `exp-sandbox.js` | 通用实验台（电学 + 光学同台自由摆放、接线、自定义实验室导出导入） |
| `meta.json` | 教师端课程页显示的实验信息 |

不用改任何 PHP 就能出现在「排课」的实验下拉框里。

---

## 二、实验插件接口

新增一个实验 = 新建一个 `exp-xxx.js`，在 `index.html` 里加一行 `<script>`，然后：

```js
(function () {
  var g = window.CohortLab.G;

  window.CohortLab.register({
    id: 'xxx',                 // 唯一，同时是记录文件名
    name: '实验名',
    grade: '八年级下',
    aim: '一句话说明要探究什么',
    formula: 'F = ma',         // 右上角的原理式
    tip: '第一次进入时的提示',
    steps: ['步骤 1', '步骤 2'],
    columns: ['列 1', '列 2'], // 右侧数据记录表
    tableHint: '单位说明',
    tools: [                   // 左侧器材架
      { id: 'foo', icon: 'foo', name: '器材名', hint: '一句话', qty: 4 }
      // qty 省略 = 单件，点击放上/收回；有 qty = 可放多件
    ],
    ask: ['快捷提问 1', '快捷提问 2'],

    create: function (api) {
      // api.placed   Set，已放上器材 id
      // api.counts   { 器材id: 数量 }
      // api.note(text, kind)  kind: note | obs | ok | bad，写进右侧笔记
      // api.stamp(text)       右上角红章
      // api.toast(text)       底部提示
      // api.save()            立即落盘
      api.placed.add('foo');

      return {
        placed: api.placed,
        counts: {},
        onPlace: function (id, pt) {},   // 从器材架放上时（pt 是落点，设计坐标）
        onRemove: function (id) {},
        reset: function () {},
        step: function (dt) {},          // dt 恒为 1/120 s；在这里做物理
        down / move / up: function (p) {}, // p = {x, y}，设计坐标（1000 × 620）
        cursor: function (p) { return 'grab' | 'pointer' | 'default'; },
        readings: function () { return [{ label, value, unit, tone }]; },
        dataRow: function () { return ['…']; },  // null = 暂无可记录读数
        snapshot: function () { return '一句话状态，会随提问发给 AI'; },
        hint: function () { return '底部操作提示'; },
        draw: function (ctx, g) {}       // 全部画在这里
      };
    }
  });
})();
```

### 手绘笔触 `g`

```js
g.line(ctx, x1, y1, x2, y2, { color, w, alpha, dash, double });
g.poly(ctx, [[x,y], …], { color, w, fill, fillAlpha, closed });
g.circle(ctx, cx, cy, r, { color, w, fill });
g.rect(ctx, x, y, w, h, { color, w, fill });
g.arc(ctx, cx, cy, r, a0, a1, { color, w });
g.hatch(ctx, [[x,y], …], { color, gap, alpha });   // 排线，自动裁剪在图内
g.coil(ctx, x, y, len, r, turns, o);              // 电阻丝
g.text(ctx, x, y, '字', { size, color, align, italic, rotate, font });
g.arrow(ctx, x1, y1, x2, y2, o);
g.dim(ctx, x1, y1, x2, y2, '20 cm', { color });   // 尺寸标注
g.label(ctx, x, y, '批注', { to: [x2, y2] });     // 红笔引线
```

画布坐标系固定为 **1000 × 620**，自动缩放居中，不需要关心 DPR / 窗口大小。

---

## 三、后端接口（已接进 Cohort）

### 1. 保存实验记录

```
POST /api/lab/record        （需学生已登录、课堂已开启）
{ "experiment": "lever", "records": [{ "at": "21:30", "kind": "obs", "text": "…" }], "note": "自由笔记" }
→ { "ok": true, "saved_at": "…", "count": 12 }
```

落盘位置：`data/lab/<场次id>/<学号>.json`，一门课里每个实验一份记录（`experiments.<id>`）。

### 2. 读取实验记录

```
GET /api/lab/records
→ { "ok": true, "experiments": { "lever": { "records": [...], "note": "…", "updated_at": "…" } } }
```

页面切换实验、刷新、换设备都会自动读回；输入笔记后 1.4 s 防抖自动保存。

笔记是「本机优先」：不管有没有登录，都先写进浏览器 `localStorage`（键 `cohort.lab.v1`）；
只有学生登录且课堂开着时，才再同步一份到 `data/lab/`。所以断网、没登录、单独演示都不会丢记录。

### 2.5 提交数据给老师

右下角「记录读数」把当前读数写进数据表（不重复往笔记里塞一条），表里攒满 **3 条**，
「提交给老师」才会亮；不够 3 条时按钮是灰的，旁边写着还差几条。

```
POST /api/lab/submit        （需学生已登录、课堂已开启）
{ "experiment": "lever", "columns": ["左钩码", …], "rows": [["1", "0.07", …], …] }
→ { "ok": true, "at": "2026-11-22T12:34:44+08:00", "count": 3, "times": 2 }
```

落盘在同一份 `data/lab/<场次id>/<学号>.json` 的 `submissions.<实验>` 里：
`latest` 是这次提交，`history` 留最近 5 次，`times` 是累计提交次数。
提交成功会在记录表里留一条「提交给老师：3 条数据（12:34）」，按钮下方显示「已提交 12:34」。

老师端在「课堂」面板底部多一张**实验提交**卡片：列出当前场次每个学生、哪个实验、
几行数据、提交几次，点「数据」展开看他填的整张表；右上角「重复提交自动覆盖」勾选
（`GET/POST /api/admin/lab/settings`，存 `config.json` 的 `lab.overwrite`）——
勾上只显示最新一次，取消则保留历史次数。

### 3. AI 助教

```
POST /api/lab/chat
{ "message": "…", "context": "实验：凸透镜成像｜读数：…｜器材：已放 …；未放 …",
  "history": [{ "role": "user", "content": "…" }] }
```

学生（有 live 场次）或老师都可以用：学生走课堂那份历史（和 `/api/chat` 共用，会落盘）；
老师/独立模式只带页面传上来的最近 8 轮，不落盘。`context` 会拼进系统提示词的
「学生此刻的实验台状态」段，AI 因此知道学生眼前摆了什么、读数是多少、缺哪件器材。

底层仍然是 `web/app/ai.php → ai_chat()`（本机 LM Studio，页面不直连 1234）。
模型回答里的 LaTeX（`\frac`、`\[ \]` 之类）会在前端转成一行纯文字，不会把公式源码露出来。

### 4. 不登录也能进

`meta.json` 里 `"open": true` 的实验，入口 `web_experiment_entry` 不校验学生/场次，
任何人打开 `/exp/lab` 都能用。配套地，`api_lab_record` 仍要求学生登录——
没登录时页面自动退回本机保存，AI 需要老师登录一次（`/teacher`）。

---

## 三·五、老师后台控制开放哪几个实验页签

老师控制台「实验室」页可以开关页签、定默认页签、关自由练习。页面启动时先读
`GET /api/lab/config`（公开，不需要登录）：

```
{ "ok": true, "enabled": ["lever","lens","circuit","buoyancy"], "default": "lever", "free": true }
```

- `enabled`：只渲染这些 id 的页签，顺序按这里的先后；
- `default`：进页面时激活哪个（不在 `enabled` 里就退到第一个）；
- `free: false`：老师这次只让课堂内用，自由练习会提示一句。

配置落在 `data/lab_config.json`，读不到就用上面这份默认值（四个全开、默认杠杆）。
接口挂了或文件坏了，页面自动退回"六个全开"，不会白屏。

老师端 `GET|POST /api/admin/lab/config`，POST 体：`{ enabled: [...], default: "lever", free: true }`。

---

## 四、物理内核（逐帧算，不做动画假象）

| 实验 | 真实计算 |
|---|---|
| 杠杆 | `τ = +g·cosθ·Σ(m s) − M杆 g d sinθ`（正号：左边挂重物 = 左端下沉；后一项是横梁自重，重心在支点下方所以会自己回水平），`I = Σ m s² + 杆转动惯量`，阻尼 + 25° 限位 |
| 凸透镜 | 薄透镜 `1/f = 1/u + 1/v`，三条特殊光线真实作图；光屏模糊量 ∝ 离焦距离；`u<f` 时画虚像并说明光屏接不到 |
| 伏安法 | `I = E/(r + R_A + R滑 + Rx∥Rv)`，电压表 3000 Ω 参与并联，所以测得 9.97 Ω 而不是 10.00 Ω（真实系统误差） |
| 浮力 | `F浮 = ρ水 g V排`，`示数 = G − F浮`；水面上涨 `Δh = V排 / 底面积`；完全浸没后 V排 封顶 |
| 物态变化 | 传热 `Q = hA·ΔT·dt`（按温差，不瞬间到位），升温 `Q = C·ΔT`，相变 `Q = mL`；到 0℃ / 100℃ 自动停在平台，冰水共存时凝固与熔化互相抵消；水蒸气按饱和蒸气压 `p_s(T)` 算，超过饱和在 >0℃ 壁面液化、<0℃ 直接凝华；温度计有感温惯性，露出水面就改测腔内气体 |

时间步长固定 1/120 s，速度档只改变推进速率，不改变物理本身。

---

## 五、加一个新实验

1. 复制 `exp-circuit.js` 改个 id；
2. `index.html` 底部加一行 `<script src="exp-新名字.js"></script>`；
3. 刷新，页签自动多一个；
4. 后端不用动：记录按 id 自动分文件，AI 自动读到新实验的 `snapshot()`。

---

## 六、通用实验台（sandbox）与自定义实验室

页签「05 通用实验台」，引擎在 `exp-sandbox.js`。一张画布同时放电学器材（电池组 / 开关 / 电流表 / 电压表 /
定值电阻 / 滑动变阻器 / 小灯泡）和光学器材（蜡烛 / 凸透镜 / 凹透镜 / 光屏），自由摆放、自由接线。

- **器材架**：点一下上墙，再点收回。电学器材有端子小圆圈（电池 `+`/`-`，其它 `a`/`b`）。
- **连线模式**：从端子拖到端子；同一对端子重复接线会去重；删线用删除模式点导线。
- **选择模式**：拖器材换位置，点开关开合，拖变阻器滑片；开关断开时电流自动归 0。
- **读数**：电流表读该支路电流，电压表读两端电压，灯泡给功率；HUD 只显示台上真有的表。
- **场景自动存本机**：`localStorage['cohort.sandbox.v1']`，下次进来原样恢复。

### 求解方式

电学用节点法（MNA）：连线用并查集把端子并成节点，按 `find()` 的根归并后编号，地取电池 `-` 端子所在节点；
电阻类 stamp 导纳，电池走理想电压源支路且内阻 **串在支路里**（`V(a)-V(b)+I·r = emf`），
所以端电压低于电动势、电流与手算一致（3 V / 0.3 Ω 内阻 / 0.05 Ω 电流表 / 10 Ω → 0.289 A）。
每个节点对地加 1e-9 S 漏电导，开关断开时矩阵不奇异，自然解出全 0。

光学沿 x 轴逐片薄透镜：`1/f = 1/u + 1/v`，前一片的像当后一片的物；`PX_PER_CM = 6`；
光屏清晰度按离像面距离线性衰减；凹透镜 `v < 0` 画虚线反向延长，并注明"光屏接不到"。

### 实验室 JSON（老师自己造实验室就靠这个）

```json
{
  "v": 1,
  "name": "串联电路（测电流）",
  "items": [
    { "type": "battery", "x": 260, "y": 500 },
    { "type": "switch",  "x": 380, "y": 500, "params": { "closed": true } },
    { "type": "ammeter", "x": 480, "y": 480 }
  ],
  "wires": [[0, "+", 1, "a"], [1, "b", 2, "a"]]
}
```

- `type`：`battery` / `switch` / `ammeter` / `voltmeter` / `resistor` / `rheostat` / `bulb` / `candle` / `lens` / `lensNeg` / `screen`；
- `params` 可省略，用默认值（电池 3 V / 0.3 Ω、电流表 0.05 Ω、电压表 3000 Ω、定值电阻 10 Ω、
  变阻器 0–20 Ω、灯泡 6 Ω、凸透镜 f=10 cm、凹透镜 f=-10 cm）；
- `x` / `y` 是设计坐标（画布 1000 × 620），省略就按 5 列网格自动排；
- `wires` 每项是 `[器材序号, 端子, 器材序号, 端子]`，器材序号就是 `items` 数组的下标。

### 导出 / 导入 / 存为实验室

工具条上：

| 按钮 | 行为 |
|---|---|
| 导出 | 当前台面存成 `名字.lab.json` 下载到本机 |
| 导入 | 选一个 `.lab.json`，按里面的坐标和连线自动摆好 |
| 存为实验室 | 起个名字，`POST /api/admin/lab/lab` 存进服务端列表（需老师登录） |
| 实验室下拉 | 内置 6 套预设 + 「自定义」分组里所有存过的实验室，选中即自动摆放 |

后端：

```
GET  /api/lab/labs             → { ok, labs: [{ id, name, count, updated_at, data }] }   公开
POST /api/admin/lab/lab        → body 就是实验室 JSON（也可 { data, id } 覆盖旧的）     老师
POST /api/admin/lab/lab/delete → { id }                                                老师
```

数据落在 `data/labs.json`。老师控制台「实验室」页里的「自定义实验室」卡片会列出这些条目，
带「导入实验室 JSON」「复制链接」「删除」；导入的立刻进学生端下拉。

### 链接直达

`/exp/lab?lab=<实验室id>` 打开后自动切到通用台并摆好这一间，学生不用自己去下拉里找；
控制台每条实验室右侧的「复制链接」就是这个地址。链接里的 id 失效时只提示一句，不会白屏。


