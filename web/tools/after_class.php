<?php
/**
 * 下课后的后台整理：固化每个学生的会话记忆 → 生成本节课报表（"上交"）。
 * 由 api_admin_session_stop 用 run_php_bg 拉起，老师不用管。
 * 用法：php after_class.php <sessionId>
 */

if (PHP_SAPI !== 'cli') { exit; }
require __DIR__ . '/../app/core.php';
require __DIR__ . '/../app/models.php';
require __DIR__ . '/../app/ai.php';
require __DIR__ . '/../app/lms.php';
require __DIR__ . '/../app/memory.php';
require __DIR__ . '/../app/report.php';

$sessionId = (string)($argv[1] ?? '');
if ($sessionId === '' || !session_get($sessionId)) {
    fwrite(STDERR, "场次不存在：{$sessionId}\n");
    exit(1);
}

$start = microtime(true);
echo "[" . now_iso() . "] 开始整理场次 {$sessionId}\n";

try {
    $mem = memory_compact_session($sessionId);
    echo "记忆固化：压缩 {$mem['compacted']} 人，失败 " . ($mem['failed'] ?? 0) . " 人\n";
} catch (Throwable $e) {
    echo "记忆固化出错：" . $e->getMessage() . "\n";
}

try {
    $report = report_compile($sessionId);
    echo "报表已生成，模式：{$report['mode']}，用时 " . round(microtime(true) - $start, 1) . "s\n";
} catch (Throwable $e) {
    echo "报表生成失败：" . $e->getMessage() . "\n";
    exit(2);
}

echo "[done]\n";
