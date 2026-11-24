<?php
/**
 * Cohort · 前端控制器
 * 所有动态请求都从这里分发。路由表见下方 $routes。
 */

require __DIR__ . '/../app/core.php';
require __DIR__ . '/../app/models.php';
require __DIR__ . '/../app/ai.php';
require __DIR__ . '/../app/lms.php';
require __DIR__ . '/../app/memory.php';
require __DIR__ . '/../app/report.php';
require __DIR__ . '/../app/handlers.php';

$method = $_SERVER['REQUEST_METHOD'];
$path   = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/') ?: '/';

// ---------- API 兜底：无论中间出什么岔子，都保证吐 JSON ----------
// 以前任何一个 Warning / Fatal 混进输出，前端就只会看到「返回格式异常」。
if (strpos($path, '/api/') === 0) {
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    ini_set('error_log', COHORT_ROOT . '/runtime/logs/php-api.log');
    ob_start();
    register_shutdown_function(function () {
        $err = error_get_last();
        if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            while (ob_get_level()) ob_end_clean();
            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
            }
            echo json_encode([
                'ok'    => false,
                'error' => '服务端出错：' . $err['message'],
                'code'  => 'PHP_FATAL',
            ], JSON_UNESCAPED_UNICODE);
        }
    });
}

// ---------- 路由表 ----------
// [方法, 正则, 处理器闭包(数组参数为捕获组)]
$routes = [
    ['GET',  '#^/$#',                      'web_home'],
    ['POST', '#^/api/join$#',              'api_join'],
    ['POST', '#^/api/chat$#',              'api_chat'],
    ['GET',  '#^/api/chat/history$#',      'api_chat_history'],
    ['POST', '#^/api/lab/record$#',        'api_lab_record'],
    ['GET',  '#^/api/lab/records$#',       'api_lab_records'],
    ['POST', '#^/api/lab/chat$#',          'api_lab_chat'],
    ['POST', '#^/api/lab/submit$#',        'api_lab_submit'],
    ['GET',  '#^/api/admin/lab/submissions$#','api_admin_lab_submissions'],
    ['GET',  '#^/api/admin/lab/settings$#',   'api_admin_lab_settings'],
    ['POST', '#^/api/admin/lab/settings$#',   'api_admin_lab_settings'],
    ['GET',  '#^/exp/([a-z0-9\-]+)$#',     'web_experiment_entry'],
    ['GET',  '#^/exp/([a-z0-9\-]+)/(.+)$#','web_experiment_asset'],

    ['GET',  '#^/teacher$#',               'web_teacher_login'],
    ['POST', '#^/teacher/login$#',         'web_teacher_do_login'],
    ['GET',  '#^/logout$#',                'web_logout'],

    ['GET',  '#^/console$#',               'web_console'],
    ['GET',  '#^/console(/.*)?$#',         'web_console_redirect'],
    ['GET',  '#^/admin(/.*)?$#',           'web_console_redirect'],
    ['GET',  '#^/api/admin/console$#',     'api_admin_console'],
    ['GET',  '#^/api/admin/report/([a-z0-9\-]+)$#', 'api_admin_report_json'],
    ['POST', '#^/api/admin/course/save$#', 'api_admin_course_save'],
    ['POST', '#^/api/admin/course/delete$#','api_admin_course_delete'],
    ['GET',  '#^/api/admin/network/scan$#','api_admin_network_scan'],
    ['GET',  '#^/api/admin/ai/env$#',      'api_admin_ai_env'],
    ['GET',  '#^/api/admin/ai/task$#',     'api_admin_ai_task'],
    ['POST', '#^/api/admin/ai/server/start$#','api_admin_ai_server_start'],
    ['POST', '#^/api/admin/ai/model/download$#','api_admin_ai_model_download'],
    ['POST', '#^/api/admin/ai/model/load$#','api_admin_ai_model_load'],
    ['POST', '#^/api/admin/ai/model/unload$#','api_admin_ai_model_unload'],
    ['POST', '#^/api/admin/ai/quick$#',    'api_admin_ai_quick'],
    ['GET',  '#^/api/admin/ai/quick$#',    'api_admin_ai_quick'],
    ['POST', '#^/api/admin/settings$#',    'api_admin_save_settings'],
    ['POST', '#^/api/admin/session/start$#','api_admin_session_start'],
    ['POST', '#^/api/admin/session/stop$#', 'api_admin_session_stop'],
    ['GET',  '#^/api/admin/session/stop$#', 'api_admin_session_stop'],
    ['POST', '#^/api/admin/students/import$#','api_admin_students_import'],
    ['POST', '#^/api/admin/students/import_file$#','api_admin_students_import_file'],
    ['POST', '#^/api/admin/students/import-file$#','api_admin_students_import_file'],
    ['GET',  '#^/api/admin/classes$#',     'api_admin_classes'],
    ['POST', '#^/api/admin/class/save$#',  'api_admin_class_save'],
    ['POST', '#^/api/admin/class/delete$#','api_admin_class_delete'],
    ['POST', '#^/api/admin/student/save$#','api_admin_student_save'],
    ['POST', '#^/api/admin/student/delete$#','api_admin_student_delete'],
    ['GET',  '#^/api/lab/config$#',        'api_lab_config'],
    ['GET',  '#^/api/lab/labs$#',          'api_lab_labs'],
    ['GET',  '#^/api/admin/lab/config$#',  'api_admin_lab_config'],
    ['POST', '#^/api/admin/lab/config$#',  'api_admin_lab_config'],
    ['POST', '#^/api/admin/lab/lab$#',     'api_admin_lab_lab'],
    ['POST', '#^/api/admin/lab/lab/delete$#','api_admin_lab_lab_delete'],
    ['POST', '#^/api/admin/report/build$#', 'api_admin_report_build'],
    ['GET',  '#^/api/ping$#',              'api_ping'],
    ['GET',  '#^/api/status$#',            'api_status'],
    ['GET',  '#^/api/ai/models$#',         'api_ai_models'],
    ['POST', '#^/api/asr$#',               'api_asr'],
];

foreach ($routes as [$m, $re, $fn]) {
    if ($m === $method && preg_match($re, $path, $mt)) {
        array_shift($mt);
        return $fn($mt);
    }
}

http_response_code(404);
render('404', ['path' => $path]);
