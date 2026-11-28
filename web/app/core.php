<?php
/**
 * Cohort · 核心
 * 路径常量、配置、JSON 存储（原子写 + 文件锁）、会话、视图渲染、HTTP 工具。
 */

define('COHORT_ROOT', dirname(__DIR__, 2));           // D:\Cohort
define('DATA_DIR',    COHORT_ROOT . '/data');
define('EXP_DIR',     COHORT_ROOT . '/experiments');
define('WEB_DIR',     COHORT_ROOT . '/web');
define('LOGS_DIR',    COHORT_ROOT . '/runtime/logs');

define('IS_WIN', DIRECTORY_SEPARATOR === '\\');

mb_internal_encoding('UTF-8');
date_default_timezone_set('Asia/Shanghai');

if (session_status() === PHP_SESSION_NONE) {
    session_name('COHORTSESS');
    session_start();
}

// ---------------------------------------------------------------- 输出

function e($v): string { return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function json_out($data, int $code = 200): void {
    while (ob_get_level()) ob_end_clean();      // 丢掉可能混进来的 Warning / BOM
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function body_json(): array {
    $raw = file_get_contents('php://input');
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function redirect(string $to): void { header('Location: ' . $to); exit; }

// ---------------------------------------------------------------- 配置

function config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $defaults = [
        'site_title'        => 'Cohort 课堂',
        'school'            => '',
        'teacher_password'  => 'cohort2026',
        'class_name'        => '九年七班',
        'ai' => [
            'base_url'    => 'http://127.0.0.1:1234',
            'model'       => '',          // 留空 = 自动取 /v1/models 第一个
            'temperature' => 0.4,
            'max_tokens'  => 700,
            'timeout'     => 180,
            'system_extra'=> '',
        ],
        'chat' => [
            'context_messages' => 14,     // 每次请求携带的历史条数
        ],
    ];
    $file = DATA_DIR . '/config.json';
    $user = is_file($file) ? (json_decode(file_get_contents($file), true) ?: []) : [];
    $cfg = array_replace_recursive($defaults, $user);
    return $cfg;
}

function config_save(array $patch): array {
    $cur = config();
    $new = array_replace_recursive($cur, $patch);
    json_atomic_write(DATA_DIR . '/config.json', $new);
    return $new;
}

// ---------------------------------------------------------------- JSON 存储

function json_atomic_write(string $file, $data): bool {
    $dir = dirname($file);
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    $tmp = $file . '.tmp.' . bin2hex(random_bytes(4));
    $fp = fopen($tmp, 'wb');
    if (!$fp) return false;
    if (flock($fp, LOCK_EX)) {
        fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
    $ok = @rename($tmp, $file);
    if (!$ok) { @unlink($tmp); }
    return $ok;
}

function json_read(string $file, $default = []) {
    if (!is_file($file)) return $default;
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') return $default;
    $d = json_decode($raw, true);
    return $d === null ? $default : $d;
}

/** 带读-改-写锁的更新：回调返回新数据 */
function json_update(string $file, callable $mutator, $default = []) {
    $lock = $file . '.lock';
    $dir = dirname($lock);
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    $lf = fopen($lock, 'c');
    flock($lf, LOCK_EX);
    $data = json_read($file, $default);
    $data = $mutator($data);
    json_atomic_write($file, $data);
    flock($lf, LOCK_UN);
    fclose($lf);
    return $data;
}

/** 追加一行 JSON（聊天记录用，避免整文件重写） */
function jsonl_append(string $file, array $row): void {
    $dir = dirname($file);
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    $fp = fopen($file, 'ab');
    if (!$fp) return;
    flock($fp, LOCK_EX);
    fwrite($fp, json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function jsonl_read(string $file): array {
    if (!is_file($file)) return [];
    $rows = [];
    $fp = fopen($file, 'rb');
    if (!$fp) return [];
    flock($fp, LOCK_SH);
    while (($line = fgets($fp)) !== false) {
        $line = trim($line);
        if ($line === '') continue;
        $d = json_decode($line, true);
        if (is_array($d)) $rows[] = $d;
    }
    flock($fp, LOCK_UN);
    fclose($fp);
    return $rows;
}

// ---------------------------------------------------------------- 身份

function is_teacher(): bool { return ($_SESSION['teacher'] ?? false) === true; }

function require_teacher(): void {
    if (!is_teacher()) redirect('/teacher');
    // 身份已读出来，立刻放开会话锁：老师端会并发打好几个接口，
    // 只要有一个慢请求（比如探 AI 环境）握着锁，新建班级这种请求就会一直排队。
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
}

function current_student(): ?array {
    return $_SESSION['student'] ?? null;
}

function require_student(): array {
    $s = current_student();
    if (!$s) json_out(['ok' => false, 'error' => '未登录，请先输入姓名学号', 'code' => 'NO_STUDENT'], 401);
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    return $s;
}

// ---------------------------------------------------------------- 视图

function render(string $view, array $vars = [], ?string $layout = null): void {
    $file = WEB_DIR . '/app/views/' . $view . '.php';
    if (!is_file($file)) { http_response_code(500); echo 'view missing: ' . e($view); exit; }
    extract($vars, EXTR_SKIP);
    if ($layout === null) $layout = str_starts_with($view, 'student/') ? 'student/layout' : 'teacher/layout';

    ob_start();
    include $file;
    $content = ob_get_clean();

    $layoutFile = WEB_DIR . '/app/views/' . $layout . '.php';
    if (is_file($layoutFile)) {
        include $layoutFile;
    } else {
        echo $content;
    }
}

// ---------------------------------------------------------------- 杂项

function now_iso(): string { return date('c'); }

function mime_of(string $file): string {
    static $map = [
        'html' => 'text/html; charset=utf-8', 'htm' => 'text/html; charset=utf-8',
        'css'  => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8',
        'json' => 'application/json; charset=utf-8', 'png' => 'image/png',
        'jpg'  => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif',
        'svg'  => 'image/svg+xml', 'webp' => 'image/webp', 'ico' => 'image/x-icon',
        'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf',
        'txt'  => 'text/plain; charset=utf-8', 'map' => 'application/json',
    ];
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    return $map[$ext] ?? 'application/octet-stream';
}

function client_ip(): string {
    return $_SERVER['REMOTE_ADDR'] ?? '';
}

/** 后台跑一个 PHP 脚本（课堂结束后的整理任务用），立刻返回 */
function run_php_bg(array $args): array {
    $php = PHP_BINARY;
    $dir = COHORT_ROOT . '/runtime/logs';
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    $tag = 'job-' . date('YmdHis') . '-' . substr(bin2hex(random_bytes(3)), 0, 5);
    $log = $dir . '/' . $tag . '.log';

    $q = function (string $s): string { return "'" . str_replace("'", "''", $s) . "'"; };
    $argList = implode(',', array_map(fn($a) => $q((string)$a), $args));

    $script = "\$ErrorActionPreference='Continue'\r\n"
            . "\$p = Start-Process -FilePath " . $q($php) . " -ArgumentList @(" . $argList . ")"
            . " -RedirectStandardOutput " . $q($log) . " -RedirectStandardError " . $q($log . '.err')
            . " -WindowStyle Hidden -PassThru\r\nWrite-Output \$p.Id\r\n";

    $psFile = $dir . '/' . $tag . '.ps1';
    file_put_contents($psFile, $script);
    $pid = (int)trim((string)@shell_exec('powershell -NoProfile -ExecutionPolicy Bypass -File "' . $psFile . '"'));
    return ['pid' => $pid, 'log' => $log];
}

function current_path(): string {
    return rtrim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/', '/') ?: '/';
}

function nav_active(string $prefix): string {
    $p = current_path();
    if ($prefix === '/admin') return $p === '/admin' ? 'active' : '';
    return str_starts_with($p, $prefix) ? 'active' : '';
}

/** 启动器探测到的局域网地址；没有就用请求的 Host */
function lan_ip(): string {
    static $ip = null;
    if ($ip !== null) return $ip;
    $f = COHORT_ROOT . '/runtime/runtime-info.json';
    $info = is_file($f) ? json_read($f, []) : [];
    $ip = (string)($info['ip'] ?? '');
    if ($ip === '') $ip = (string)($_SERVER['SERVER_ADDR'] ?? '127.0.0.1');
    return $ip;
}

function lan_url(): string {
    $f = COHORT_ROOT . '/runtime/runtime-info.json';
    $info = is_file($f) ? json_read($f, []) : [];
    $u = (string)($info['lan_url'] ?? '');
    return $u !== '' ? $u : 'https://' . lan_ip() . '/';
}
