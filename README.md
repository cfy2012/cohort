# Cohort · 课堂 AI 助教

一台教师机 + 全班学生机，把「上课、做实验、提问、收数据、出报表」收进一间教室。

- **Cohort 讲台（教师端）**：同时是服务端。启动只有一个窗口，「课堂 / 排课 / 网络 / 报表 / AI 引擎 / 实验室 / 名单设置」都在同一页的页签里。
- **Cohort 学生端**：填一次地址 + 学号姓名，进入课堂后就停在**一个页面**：上方是本节的实验（就地展开），下方是和 AI 助教的对话。
- **草纸物理实验室**：杠杆 / 凸透镜 / 伏安法 / 浮力四个独立实验，加一间「通用实验台」——电学与光学器材同台自由摆放、自由接线，读数按真实回路计算；老师摆好可以导出成 `*.lab.json`，也能存进服务端列表，学生用 `?lab=<id>` 直达。
- **语音输入（本地识别）**：凡是能打字的地方（学生提问框、教师端名单 / 课表 / AI 设置、实验室笔记与 AI 对话）右侧都挂一个「语音」按钮。点一下开始录，再点一下收尾，识别在本机用 whisper 小模型跑完，**不联网、不上传**；模型随安装包一起装在 `runtime/asr`。
- **安卓端（可选）**：`android/` 里是一个 WebView 壳，一套代码出两个 APK——`Cohort-讲台` 打开 `/teacher`，`Cohort-学生端` 填地址 + 学号姓名直接进课堂，不用浏览器地址栏。它不是服务器，连的还是老师这台机器。

技术栈：**PHP（后端）+ HTML/CSS/JS（前端）+ Caddy（HTTPS / 负载均衡）+ 两个 C# 启动器（+ 一个安卓 WebView 壳）**。没有 Python、没有数据库，数据全是 JSON 文件。

## 排课时指定实验室

控制台「排课」里每节课都能单独选**本节实验室**：

| 选项 | 学生点「进实验室」去哪 |
|---|---|
| 不开放实验室 | 只有 AI 答疑，没有实验入口 |
| 自由实验台 | `/exp/lab?m=sandbox`，学生随便摆 |
| 自定义 · <名字> | `/exp/lab?lab=<id>`，直接载入你存的那份场景 |
| 内置 · <实验名> | `/exp/lab?m=<模块id>`，直接开到那一页 |

## 目录

## 快速开始

1. 到 [Releases](../../releases/latest) 下载安装包：
   | 安装包 | 装到哪 |
   |---|---|
   | `Cohort-Setup.exe` | 教师机，默认 `C:\Cohort`（无权限时退到用户目录） |
   | `CohortStudent-Setup.exe` | 学生机，默认 `C:\Program Files\CohortStudent` |
2. 教师端启动后打开 `https://<本机IP>/`，学生端填这个地址和学号姓名即可进课堂。
3. 教师控制台入口 `/admin`，默认口令在 `data/config.json` 里，首次使用请改掉。

## 目录

```
web/           PHP 后端 + 前端页面与资源（路由在 public/index.php）
  app/         业务：路由带出的处理函数、模型、教师/学生视图、AI 调用
  public/      入口、assets（app.css / console.js）
experiments/   草纸物理实验室（只有 lab/：五个实验页签 + 通用台）
android/       安卓端 Gradle 工程（teacher / student 两个 flavor）
student/       学生端静态页面
launcher/      C# 启动器源码（教师端 / 学生端）
pack/          安装包构建脚本（Setup.cs）
runtime/       运行时（PHP / Caddy / 配置），不纳入源码仓库
data/          运行时数据（名单、课程、场次、笔记…），不纳入源码仓库
```

## 实验室 JSON

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

`type` 支持 `battery / switch / ammeter / voltmeter / resistor / rbox / rheostat / bulb / wire / candle / lens / lensNeg / screen`；省略 `x/y` 会按网格自动摆。细节见 `experiments/lab/README.md`。

## 许可

MIT，见 [LICENSE](LICENSE)。
