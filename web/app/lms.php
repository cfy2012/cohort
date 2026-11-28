<?php
/**
 * Cohort · LM Studio 命令行封装
 * 老师们不用开 LM Studio 图形界面，这里用官方 lms.exe 干活：
 *   lms server start     起本地服务（1234）
 *   lms ls --json        已下载模型清单
 *   lms get -y <key>     自动下载并让 LM Studio 索引（模型落在 LM Studio 自己的目录里）
 *   lms load <key>       加载进内存
 */

function lms_candidates(): array {
    $home = getenv('USERPROFILE') ?: '';
    $local = getenv('LOCALAPPDATA') ?: '';
    return [
        trim((string)config_or('lms_path', '')),
        $home ? $home . '\\.lmstudio\\bin\\lms.exe' : '',
        $local ? $local . '\\Programs\\LM Studio\\resources\\app\\.webpack\\lms.exe' : '',
        $local ? $local . '\\Programs\\lm-studio\\resources\\app\\.webpack\\lms.exe' : '',
    ];
}

function config_or(string $key, $default = null) {
    $c = config();
    return $c[$key] ?? $default;
}

function lms_path(): string {
    static $p = null;
    if ($p !== null) return $p;
    foreach (lms_candidates() as $c) {
        if ($c !== '' && is_file($c)) { $p = $c; return $p; }
    }
    // 退化：PATH 里找
    $out = @shell_exec('where lms 2>nul');
    if ($out && preg_match('/([A-Z]:\\\\[^\r\n]+lms\.exe)/i', $out, $m)) { $p = trim($m[1]); return $p; }
    $p = '';
    return $p;
}

function lms_dir(): string { return COHORT_ROOT . '/runtime/tasks'; }

/** 同步执行一条 lms 命令，返回 [code, stdout+stderr] */
function lms_exec(array $args, int $timeoutSec = 20): array {
    $exe = lms_path();
    if ($exe === '') return [127, '未找到 lms.exe'];
    $cmd = '"' . $exe . '" ' . implode(' ', array_map(fn($a) => '"' . str_replace('"', '', $a) . '"', $args)) . ' 2>&1';
    $out = @shell_exec($cmd);
    return [0, (string)$out];
}

/** 后台跑一条 lms 命令，返回任务信息（PID + 日志路径） */
function lms_run_bg(string $kind, string $label, array $args): array {
    $exe = lms_path();
    if ($exe === '') return ['ok' => false, 'error' => '没找到 LM Studio 的命令行工具 lms.exe'];

    $dir = lms_dir();
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    $id  = date('YmdHis') . '-' . substr(bin2hex(random_bytes(3)), 0, 5);
    $out = $dir . '/task-' . $id . '.out.log';
    $err = $dir . '/task-' . $id . '.err.log';

    // 用单引号包 PowerShell 字符串，内部单引号成对转义
    $q = function (string $s): string { return "'" . str_replace("'", "''", $s) . "'"; };
    $argList = implode(',', array_map(fn($a) => $q((string)$a), $args));

    $script = "\$ErrorActionPreference = 'Continue'\r\n"
            . "\$p = Start-Process -FilePath " . $q($exe) . " -ArgumentList @(" . $argList . ")"
            . " -RedirectStandardOutput " . $q($out) . " -RedirectStandardError " . $q($err)
            . " -WindowStyle Hidden -PassThru\r\n"
            . "Write-Output \$p.Id\r\n";

    $psFile = $dir . '/run-' . $id . '.ps1';
    file_put_contents($psFile, $script);

    $pidStr = trim((string)@shell_exec('powershell -NoProfile -ExecutionPolicy Bypass -File "' . $psFile . '"'));
    $pid = (int)$pidStr;

    $task = [
        'id'         => $id,
        'kind'       => $kind,
        'label'      => $label,
        'args'       => $args,
        'pid'        => $pid,
        'out'        => $out,
        'err'        => $err,
        'started_at' => now_iso(),
    ];
    json_atomic_write(DATA_DIR . '/ai-task.json', $task);
    return ['ok' => true, 'task' => $task];
}

function lms_ps_alive(int $pid): bool {
    if ($pid <= 0) return false;
    $out = @shell_exec('tasklist /FI "PID eq ' . $pid . '" /NH 2>nul');
    return is_string($out) && stripos($out, 'lms') !== false;
}

function lms_task_status(): ?array {
    $task = json_read(DATA_DIR . '/ai-task.json', null);
    if (!$task) return null;
    $running = lms_ps_alive((int)$task['pid']);
    $log = '';
    foreach ([$task['out'], $task['err']] as $f) {
        if (is_file($f)) {
            $raw = @file_get_contents($f);
            if ($raw !== false && $raw !== '') $log .= $raw;
        }
    }
    if (mb_strlen($log) > 3000) $log = mb_substr($log, -3000);
    $task['running'] = $running;
    $task['finished'] = !$running;
    $task['log'] = trim($log);
    $task['log_size'] = is_file($task['out']) ? filesize($task['out']) : 0;
    return $task;
}

/** 已下载的模型（解析 lms ls --json） */
function lms_models(): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    [$code, $out] = lms_exec(['ls', '--json'], 25);
    $start = strpos($out, '[');
    $end   = strrpos($out, ']');
    $rows  = ($start !== false && $end !== false) ? json_decode(substr($out, $start, $end - $start + 1), true) : null;
    if (!is_array($rows)) { $cache = []; return $cache; }

    $loaded = lms_loaded_keys();
    $list = [];
    foreach ($rows as $r) {
        if (($r['type'] ?? '') !== 'llm') continue;
        $key = (string)($r['modelKey'] ?? '');
        $list[] = [
            'key'     => $key,
            'name'    => (string)($r['displayName'] ?? $key),
            'params'  => (string)($r['paramsString'] ?? ''),
            'arch'    => (string)($r['architecture'] ?? ''),
            'size'    => (int)($r['sizeBytes'] ?? 0),
            'size_h'  => human_size((int)($r['sizeBytes'] ?? 0)),
            'context' => (int)($r['maxContextLength'] ?? 0),
            'vision'  => (bool)($r['vision'] ?? false),
            'loaded'  => in_array($key, $loaded, true),
        ];
    }
    $cache = $list;
    return $cache;
}

function lms_loaded_keys(): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    [, $out] = lms_exec(['ps', '--json'], 20);
    $start = strpos($out, '['); $end = strrpos($out, ']');
    $rows = ($start !== false && $end !== false) ? json_decode(substr($out, $start, $end - $start + 1), true) : null;
    $keys = [];
    if (is_array($rows)) {
        foreach ($rows as $r) {
            $k = $r['modelKey'] ?? $r['identifier'] ?? $r['path'] ?? '';
            if ($k !== '') $keys[] = (string)$k;
        }
    }
    $cache = $keys;
    return $cache;
}

/** 卸下一个模型，把显存还给系统 */
function lms_unload(string $key): array {
    if ($key === '') return [1, '没指定模型'];
    return lms_exec(['unload', $key], 40);
}

/** 卸下所有已加载模型（换模型前先清场，省得显存被占双份） */
function lms_unload_all(): array {
    return lms_exec(['unload', '--all'], 60);
}

/** 当前加载中的每个实例（含重复加载的同名实例），用于界面显示与逐个卸载 */
function lms_loaded_instances(): array {
    [, $out] = lms_exec(['ps', '--json'], 20);
    $start = strpos($out, '['); $end = strrpos($out, ']');
    $rows = ($start !== false && $end !== false) ? json_decode(substr($out, $start, $end - $start + 1), true) : null;
    $list = [];
    if (is_array($rows)) {
        foreach ($rows as $r) {
            $key = (string)($r['identifier'] ?? $r['modelKey'] ?? '');
            if ($key === '') continue;
            $list[] = [
                'id'     => $key,
                'key'    => (string)($r['modelKey'] ?? $key),
                'size'   => (int)($r['sizeBytes'] ?? 0),
                'context'=> (int)($r['contextLength'] ?? 0),
            ];
        }
    }
    return $list;
}

function lms_server_status(): array {    [$code, $out] = lms_exec(['server', 'status'], 20);
    $running = stripos($out, 'running on port') !== false;
    $port = 1234;
    if (preg_match('/running on port (\d+)/i', $out, $m)) $port = (int)$m[1];
    return ['running' => $running, 'port' => $port, 'raw' => trim($out)];
}

function human_size(int $bytes): string {
    if ($bytes >= 1073741824) return number_format($bytes / 1073741824, 2) . ' GB';
    if ($bytes >= 1048576)    return number_format($bytes / 1048576, 1) . ' MB';
    return (int)$bytes . ' B';
}

/** 推荐模型档位：按显存/内存给建议 */
function lms_recommended(): array {
    $vramGb = detect_gpu_vram_gb();
    if ($vramGb >= 10) {
        return ['tier' => '标准', 'key' => 'Qwen/Qwen2.5-7B-Instruct-GGUF', 'note' => '约 4.7 GB，中文问答质量好，适合有独显的机器'];
    }
    if ($vramGb >= 6) {
        return ['tier' => '均衡', 'key' => 'Qwen/Qwen2.5-3B-Instruct-GGUF', 'note' => '约 2 GB，速度和质量的折中'];
    }
    return ['tier' => '轻量', 'key' => 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', 'note' => '约 1 GB，纯 CPU 也能跑，课堂上响应快'];
}

function detect_gpu_vram_gb(): float {
    static $v = null;
    if ($v !== null) return $v;
    $out = (string)@shell_exec('nvidia-smi --query-gpu=memory.total --format=csv,noheader 2>nul');
    if ($out && preg_match('/(\d+)\s*MiB/i', $out, $m)) { $v = (float)$m[1] / 1024.0; return $v; }
    $out2 = (string)@shell_exec('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Measure-Object -Property AdapterRAM -Sum).Sum"');
    if ($out2 && preg_match('/(\d+)/', $out2, $m2)) {
        $bytes = (float)$m2[1];
        if ($bytes > 0) { $v = $bytes / 1073741824.0; return $v; }
    }
    $v = 0.0;
    return $v;
}
