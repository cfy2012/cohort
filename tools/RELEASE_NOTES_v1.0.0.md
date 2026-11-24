# Cohort v1.0.0

Cohort 课堂 AI 助教首个公开版本（MIT）。

## 包含

- 教师端「讲台」：课堂 / 排课 / 网络 / 报表 / AI 引擎 / 实验室 / 班级名单，全部一页切换
- 学生端单页课堂：本节实验就地展开 + AI 助教对话，记录与提交实时回传
- 草纸物理实验室：杠杆、凸透镜、伏安法、浮力，加一间通用实验台
  - 通用台：电学 + 光学同台自由摆放，支持导线 / 电阻箱 / 可换电压电池
  - 读数按节点法（MNA）真实求解，含电池内阻、电表内阻
  - 实验室可导出/导入 `*.lab.json`，服务端存列表，`/exp/lab?lab=<id>` 直达
- 班级与名单：CSV/Excel 粘贴导入、班级成员管理
- 纯 PHP + HTML/JS + Caddy + C# 启动器，无 Python、无数据库，数据全 JSON

## 安装

| 安装包 | 用途 |
|---|---|
| `Cohort-Setup-1.0.0.exe` | 教师机（含 PHP / Caddy 运行时与网页），默认装到 `C:\Cohort` |
| `CohortStudent-Setup-1.0.0.exe` | 学生机小窗口，默认装到 `C:\Program Files\CohortStudent` |

装完教师端会自动启动，控制台入口 `/admin`，默认口令 `cohort2026`，装机后请先在设置里改掉。

源码使用 MIT 许可，见仓库根目录 `LICENSE`。
