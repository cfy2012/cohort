<?php
/**
 * Cohort · 请求处理器
 * 每个函数对应 index.php 路由表中的一项。
 */

// ============================================================ 学生端

function web_home(): void {
    // 学生端软件会带着 ?no=&name= 直接打开，这里自动登录，省掉手填那一步
    if (!current_student() && isset($_GET['no'], $_GET['name'])) {
        $err = student_do_join((string)$_GET['no'], (string)$_GET['name']);
        if ($err === null) {
            header('Location: /');
            exit;
        }
    }
    $student = current_student();
    $session = session_current();
    if (!$student) {
        render('student/join', ['session' => $session]);
        return;
    }
    if (!$session || $session['status'] !== 'live') {
        render('student/idle', ['student' => $student]);
        return;
    }
    $experiment = $session['experiment'] ? experiment_get($session['experiment']) : null;
    // 这节课老师绑的是哪个实验室（自由实验台 / 自定义 / 内置模块），没绑就是纯答疑
    $labBind    = (string)($session['lab'] ?? '');
    $labHref    = lab_binding_href($labBind);
    render('student/home', [
        'student'    => $student,
        'session'    => $session,
        'experiment' => $experiment,
        'lab_bind'   => $labBind,
        'lab_label'  => lab_binding_label($labBind),
        'lab_href'   => $labHref,
    ]);
}

function api_join(array $args): void {
    $in = body_json();
    $err = student_do_join(trim((string)($in['no'] ?? '')), trim((string)($in['name'] ?? '')));
    if ($err !== null) json_out(['ok' => false, 'error' => $err], 400);
    json_out(['ok' => true, 'student' => current_student()]);
}

/** 学生登录的共用逻辑：成功返回 null，失败返回错误文案 */
function student_do_join(string $no, string $name): ?string {
    if ($no === '' || $name === '') return '学号和姓名都要填';
    if (mb_strlen($name) > 20) return '姓名过长';

    $roster = students_all();
    $hit = null;
    foreach ($roster as $s) if ((string)$s['no'] === $no) $hit = $s;
    if ($roster && !$hit) return '学号不在班级名单里，请核对';

    $student = ['no' => $no, 'name' => $name, 'class' => $hit['class'] ?? config()['class_name']];
    $_SESSION['student'] = $student;
    session_write_close();

    $session = session_current();
    if ($session && $session['status'] === 'live') {
        session_touch_attendee($session['id'], $no, $name);
    }
    return null;
}

function api_chat(array $args): void {
    $student = require_student();
    $in = body_json();
    $msg = trim((string)($in['message'] ?? ''));
    if ($msg === '') json_out(['ok' => false, 'error' => '消息为空'], 400);
    if (mb_strlen($msg) > 2000) $msg = mb_substr($msg, 0, 2000);

    $session = session_current();
    if (!$session || $session['status'] !== 'live') {
        json_out(['ok' => false, 'error' => '教师还没有开启本节课程', 'code' => 'NO_SESSION'], 409);
    }

    $experiment = $session['experiment'] ? experiment_get($session['experiment']) : null;
    $history    = chat_messages($session['id'], (string)$student['no']);
    $keep       = (int)config()['chat']['context_messages'];
    $history    = array_slice($history, -$keep);

    $messages = [['role' => 'system', 'content' => ai_system_prompt($session, $student, $experiment)]];
    // 长期记忆（旧对话已被压成摘要，省上下文）
    $mem = memory_get($session['id'], (string)$student['no']);
    if (!empty($mem['summary'])) {
        $messages[0]['content'] .= "\n\n【此前这位同学在课堂上的表现摘要（供你参考，不必重复）】\n"
            . chat_history_clean((string)$mem['summary']);
    }
    foreach ($history as $h) {
        $role = ($h['role'] ?? 'user') === 'assistant' ? 'assistant' : 'user';
        $messages[] = ['role' => $role, 'content' => chat_history_clean((string)($h['content'] ?? ''))];
    }
    $messages[] = ['role' => 'user', 'content' => $msg];
    $messages = ai_history_dedupe($messages);
    // 实验台状态（由实验页面带上来的读数/器材），让 AI 看到学生眼前的真实情况
    $ctx = trim((string)($in['context'] ?? ''));
    if ($ctx !== '') {
        $messages[0]['content'] .= "\n\n【学生此刻的实验台状态（实验页面上报，请据此回答，不要编造读数）】\n"
            . mb_substr($ctx, 0, 600);
    }

    // 先落盘提问，AI 失败也不会丢记录
    jsonl_append(chat_path($session['id'], (string)$student['no']), [
        'role' => 'user', 'content' => $msg, 'at' => now_iso(), 'ip' => client_ip(),
    ]);
    session_touch_attendee($session['id'], (string)$student['no'], $student['name']);

    $r = ai_chat($messages, ['student_name' => (string)$student['name']]);
    if (!$r['ok']) {
        json_out(['ok' => false, 'error' => 'AI 暂时不可用：' . ($r['error'] ?? '未知错误'), 'code' => 'AI_DOWN'], 503);
    }

    jsonl_append(chat_path($session['id'], (string)$student['no']), [
        'role' => 'assistant', 'content' => $r['content'], 'at' => now_iso(), 'model' => $r['model'] ?? '',
    ]);

    json_out(['ok' => true, 'reply' => $r['content'], 'model' => $r['model'] ?? null]);
}

function api_chat_history(array $args): void {
    $student = require_student();
    $session = session_current();
    if (!$session) json_out(['ok' => true, 'messages' => []]);
    $msgs = chat_messages($session['id'], (string)$student['no']);
    json_out(['ok' => true, 'messages' => $msgs]);
}

// ---------------------------------------------------------------- 草纸实验室

/** 笔记与读数落盘：data/lab/<场次>/<学号>.json */
function lab_record_path(array $student, array $session): string {
    return DATA_DIR . '/lab/' . preg_replace('/[^a-zA-Z0-9\-]/', '', $session['id'])
         . '/' . preg_replace('/[^a-zA-Z0-9\-]/', '', (string)$student['no']) . '.json';
}

function api_lab_record(array $args): void {
    $student = require_student();
    $session = session_current();
    if (!$session || $session['status'] !== 'live') {
        json_out(['ok' => false, 'error' => '教师还没有开启本节课程', 'code' => 'NO_SESSION'], 409);
    }

    $in  = body_json();
    $slug = preg_replace('/[^a-z0-9\-]/', '', strtolower((string)($in['experiment'] ?? '')));
    if ($slug === '') json_out(['ok' => false, 'error' => '缺少实验标识'], 400);

    $entries = [];
    foreach ((array)($in['records'] ?? []) as $r) {
        if (!is_array($r)) continue;
        $entries[] = [
            'at'   => mb_substr((string)($r['at'] ?? now_iso()), 0, 40),
            'kind' => mb_substr((string)($r['kind'] ?? 'note'), 0, 20),
            'text' => mb_substr((string)($r['text'] ?? ''), 0, 600),
        ];
        if (count($entries) >= 300) break;
    }
    $note = mb_substr(trim((string)($in['note'] ?? '')), 0, 4000);

    $file = lab_record_path($student, $session);
    $data = json_update($file, function ($d) use ($student, $session, $slug, $entries, $note) {
        $d['student'] = ['no' => (string)$student['no'], 'name' => (string)$student['name']];
        $d['session'] = $session['id'];
        $d['course']  = $session['title'];
        $d['experiments'][$slug] = [
            'records'    => $entries,
            'note'       => $note,
            'updated_at' => now_iso(),
        ];
        $d['updated_at'] = now_iso();
        return $d;
    }, []);

    json_out(['ok' => true, 'saved_at' => $data['updated_at'] ?? now_iso(), 'count' => count($entries)]);
}

function api_lab_records(array $args): void {
    $student = require_student();
    $session = session_current();
    if (!$session) json_out(['ok' => true, 'experiments' => []]);
    $data = json_read(lab_record_path($student, $session), []);
    json_out(['ok' => true, 'experiments' => $data['experiments'] ?? []]);
}

/**
 * 实验室的 AI 接口：学生（有 live 场次）或老师都能用。
 * 学生走课堂那份历史；老师/独立模式只带页面自己传上来的最近几轮，不落盘。
 * 这样实验室可以脱离学生端单独用（教师演示、公开课、没有学生登录的机器）。
 */
function api_lab_chat(array $args): void {
    $student = current_student();
    if (!$student && !is_teacher()) {
        json_out(['ok' => false, 'error' => '需要学生登录，或老师登录后使用', 'code' => 'NO_AUTH'], 401);
    }

    $in  = body_json();
    $msg = trim((string)($in['message'] ?? ''));
    if ($msg === '') json_out(['ok' => false, 'error' => '消息为空'], 400);
    if (mb_strlen($msg) > 2000) $msg = mb_substr($msg, 0, 2000);

    $session = session_current();
    $live    = $session && ($session['status'] ?? '') === 'live';
    $useClass = $student && $live;

    $sys = ai_system_prompt($useClass ? $session : null, $student, experiment_get('lab'));
    $ctx = trim((string)($in['context'] ?? ''));
    if ($ctx !== '') {
        $sys .= "\n\n【学生此刻的实验台状态（实验页面上报，请据此回答，不要编造读数）】\n" . mb_substr($ctx, 0, 600);
    }

    $messages = [['role' => 'system', 'content' => $sys]];
    if ($useClass) {
        $history = chat_messages($session['id'], (string)$student['no']);
        $keep    = (int)config()['chat']['context_messages'];
    } else {
        $history = array_slice((array)($in['history'] ?? []), -8);
        $keep    = 8;
    }
    foreach (array_slice($history, -$keep) as $h) {
        if (!is_array($h)) continue;
        $messages[] = [
            'role'    => (($h['role'] ?? 'user') === 'assistant') ? 'assistant' : 'user',
            'content' => mb_substr(chat_history_clean((string)($h['content'] ?? '')), 0, 1000),
        ];
    }
    $messages[] = ['role' => 'user', 'content' => $msg];
    $messages = ai_history_dedupe($messages);

    if ($useClass) {
        jsonl_append(chat_path($session['id'], (string)$student['no']), [
            'role' => 'user', 'content' => $msg, 'at' => now_iso(), 'ip' => client_ip(),
        ]);
        session_touch_attendee($session['id'], (string)$student['no'], $student['name']);
    }

    $r = ai_chat($messages, ['student_name' => (string)$student['name']]);
    if (!$r['ok']) {
        json_out(['ok' => false, 'error' => 'AI 暂时不可用：' . ($r['error'] ?? '未知错误'), 'code' => 'AI_DOWN'], 503);
    }

    if ($useClass) {
        jsonl_append(chat_path($session['id'], (string)$student['no']), [
            'role' => 'assistant', 'content' => $r['content'], 'at' => now_iso(), 'model' => $r['model'] ?? '',
        ]);
    }

    json_out([
        'ok'     => true,
        'reply'  => $r['content'],
        'model'  => $r['model'] ?? null,
        'mode'   => $useClass ? 'class' : 'solo',
    ]);
}

/**
 * 提交实验数据：数据表攒够 3 条才能交，交上来的是表格，不是随笔。
 * 落盘到 data/lab/<场次>/<学号>.json 的 submissions.<实验>，老师端按场次汇总。
 */
function api_lab_submit(array $args): void {
    $student = require_student();
    $session = session_current();
    if (!$session) {
        json_out(['ok' => false, 'error' => '还没有课堂场次，老师开课后再提交', 'code' => 'NO_SESSION'], 409);
    }

    $in   = body_json();
    $slug = preg_replace('/[^a-z0-9\-]/', '', strtolower((string)($in['experiment'] ?? '')));
    if ($slug === '') json_out(['ok' => false, 'error' => '缺少实验标识'], 400);

    $cols = [];
    foreach ((array)($in['columns'] ?? []) as $c) {
        $c = mb_substr(trim((string)$c), 0, 20);
        if ($c !== '') $cols[] = $c;
        if (count($cols) >= 8) break;
    }

    $rows = [];
    foreach ((array)($in['rows'] ?? []) as $r) {
        if (!is_array($r)) continue;
        $cells = [];
        foreach ($r as $v) {
            $cells[] = mb_substr(trim((string)$v), 0, 40);
            if (count($cells) >= 8) break;
        }
        $rows[] = $cells;
        if (count($rows) >= 10) break;
    }
    if (count($rows) < 3) {
        json_out(['ok' => false, 'error' => '至少记满 3 条数据才能提交', 'code' => 'NOT_ENOUGH'], 400);
    }

    $item = [
        'at'         => now_iso(),
        'experiment' => $slug,
        'student'    => ['no' => (string)$student['no'], 'name' => (string)$student['name']],
        'columns'    => $cols,
        'rows'       => $rows,
        'count'      => count($rows),
    ];

    $file = lab_record_path($student, $session);
    $saved = json_update($file, function ($d) use ($item, $slug) {
        $d['student'] = $item['student'];
        $hist = $d['submissions'][$slug]['history'] ?? [];
        $hist[] = $item;
        if (count($hist) > 5) $hist = array_slice($hist, -5);
        $d['submissions'][$slug] = [
            'latest'  => $item,
            'history' => $hist,
            'times'   => count($hist),
        ];
        return $d;
    }, []);

    json_out(['ok' => true, 'at' => $item['at'], 'count' => $item['count'], 'times' => $saved['submissions'][$slug]['times'] ?? 1]);
}

/** 老师端：当前场次收到的实验提交 */
function api_admin_lab_submissions(array $args): void {
    require_teacher();
    $session = session_current();
    $overwrite = (bool)(config()['lab']['overwrite'] ?? true);
    $out = ['ok' => true, 'overwrite' => $overwrite, 'session' => $session['id'] ?? null, 'items' => []];
    if (!$session) json_out($out);

    $dir = DATA_DIR . '/lab/' . preg_replace('/[^a-zA-Z0-9\-]/', '', $session['id']);
    foreach (glob($dir . '/*.json') ?: [] as $f) {
        $d = json_read($f, []);
        $stu = $d['student'] ?? [];
        foreach ((array)($d['submissions'] ?? []) as $slug => $s) {
            $latest = $s['latest'] ?? null;
            if (!$latest) continue;
            $item = [
                'no'         => (string)($stu['no'] ?? ''),
                'name'       => (string)($stu['name'] ?? ''),
                'experiment' => $slug,
                'at'         => $latest['at'] ?? '',
                'count'      => (int)($latest['count'] ?? 0),
                'columns'    => $latest['columns'] ?? [],
                'rows'       => $latest['rows'] ?? [],
                'times'      => (int)($s['times'] ?? 1),
                'history'    => $overwrite ? [] : array_slice((array)($s['history'] ?? []), 0, -1),
            ];
            $out['items'][] = $item;
        }
    }
    usort($out['items'], fn($a, $b) => strcmp((string)$b['at'], (string)$a['at']));
    json_out($out);
}

/** 老师端：重复提交是否自动覆盖 */
function api_admin_lab_settings(array $args): void {
    require_teacher();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $in = body_json();
        $v = isset($in['overwrite']) ? (bool)$in['overwrite'] : true;
        config_save(['lab' => ['overwrite' => $v]]);
        json_out(['ok' => true, 'overwrite' => $v]);
    }
    json_out(['ok' => true, 'overwrite' => (bool)(config()['lab']['overwrite'] ?? true)]);
}

/** 实验入口：校验场次开启状态，然后直接吐出 experiments/<slug>/index.html */
function web_experiment_entry(array $args): void {
    $slug = $args[0];
    $exp  = experiment_get($slug);
    if (!$exp) { http_response_code(404); render('404', ['path' => '/exp/' . $slug]); return; }

    $session = session_current();
    $isTeacher = is_teacher();
    // meta.json 里 "open": true 的实验（比如草纸实验室）不登录也能打开，
    // 这样一个实验室可以脱离学生端单独用：演示机、投影、公开课都行。
    $isOpen = !empty($exp['open']);
    if (!$isTeacher && !$isOpen) {
        if (!current_student()) redirect('/');
        if (!$session || $session['status'] !== 'live') { render('student/idle', ['student' => current_student()]); return; }
        if (($session['experiment'] ?? '') !== '' && $session['experiment'] !== $slug) {
            http_response_code(403);
            render('student/not_open', ['experiment' => $exp, 'session' => $session]);
            return;
        }
    }
    cohort_serve_experiment($exp, 'index.html');
}

function web_experiment_asset(array $args): void {
    $slug = $args[0];
    $rel  = $args[1];
    $exp  = experiment_get($slug);
    if (!$exp) { http_response_code(404); return; }
    cohort_serve_experiment($exp, $rel);
}

function cohort_serve_experiment(array $exp, string $rel): void {
    $base = realpath(EXP_DIR . '/' . $exp['slug']);
    $file = realpath($base . '/' . str_replace('\\', '/', $rel));
    if (!$base || !$file || strpos($file, $base) !== 0 || !is_file($file)) {
        http_response_code(404);
        echo '404 Not Found';
        return;
    }
    header('Content-Type: ' . mime_of($file));
    header('Cache-Control: no-cache');
    readfile($file);
    exit;
}

// ============================================================ 教师鉴权

function web_teacher_login(): void {
    if (is_teacher()) redirect('/admin');
    render('teacher/login', ['error' => null], 'teacher/blank');
}

function web_teacher_do_login(): void {
    $pw = (string)($_POST['password'] ?? '');
    if (hash_equals((string)config()['teacher_password'], $pw)) {
        $_SESSION['teacher'] = true;
        session_write_close();
        redirect('/console');
    }
    render('teacher/login', ['error' => '密码不正确'], 'teacher/blank');
}

function web_logout(): void {
    $_SESSION = [];
    session_destroy();
    redirect('/teacher');
}

// ============================================================ 教师端页面

function web_admin_dashboard(): void {
    require_teacher();
    $session    = session_current();
    $experiment = $session && $session['experiment'] ? experiment_get($session['experiment']) : null;
    $ai         = ai_models();
    $reports    = glob(DATA_DIR . '/reports/*.json') ?: [];
    $attendees  = $session ? session_attendees($session['id']) : [];
    $chatCount  = 0;
    if ($session) {
        foreach ($attendees as $no => $_) {
            $chatCount += count(chat_messages($session['id'], (string)$no));
        }
    }
    render('teacher/dashboard', [
        'session'    => $session,
        'experiment' => $experiment,
        'ai'         => $ai,
        'attendees'  => $attendees,
        'chatCount'  => $chatCount,
        'reportCount'=> count($reports),
        'students'   => count(students_all()),
        'courses'    => courses_all(),
        'experiments'=> experiments_all(),
    ]);
}

function web_admin_courses(): void {
    require_teacher();
    render('teacher/courses', [
        'courses'     => courses_all(),
        'experiments' => experiments_all(),
        'session'     => session_current(),
    ]);
}

function web_admin_students(): void {
    require_teacher();
    $session = session_current();
    render('teacher/students', [
        'students' => students_all(),
        'attendees'=> $session ? session_attendees($session['id']) : [],
        'session'  => $session,
    ]);
}

function web_admin_sessions(): void {
    require_teacher();
    $sessions = sessions_all();
    foreach ($sessions as &$s) {
        $s['_attendee_count'] = count($s['attendees'] ?? []);
        $s['_report'] = is_file(report_path($s['id']));
    }
    unset($s);
    render('teacher/sessions', ['sessions' => $sessions, 'current' => session_current()]);
}

function web_admin_reports(): void {
    require_teacher();
    $items = [];
    foreach (glob(DATA_DIR . '/reports/*.json') ?: [] as $f) {
        $r = json_read($f, null);
        if ($r) $items[] = [
            'session_id'   => $r['session_id'],
            'title'        => $r['title'],
            'class'        => $r['class'] ?? '',
            'generated_at' => $r['generated_at'],
            'mode'         => $r['mode'] ?? 'stats',
            'totals'       => $r['totals'] ?? [],
        ];
    }
    usort($items, fn($a, $b) => strcmp($b['generated_at'], $a['generated_at']));
    render('teacher/reports', ['items' => $items, 'sessions' => sessions_all()]);
}

function web_admin_report_detail(array $args): void {
    require_teacher();
    $r = json_read(report_path($args[0]), null);
    if (!$r) { http_response_code(404); render('404', ['path' => '/admin/reports/' . $args[0]]); return; }

    // 逐轮回放：把每生的问答配对成一轮一轮
    $rounds = [];
    foreach (($r['students'] ?? []) as $s) {
        $msgs = chat_messages($r['session_id'], (string)$s['no']);
        $rows = [];
        $pend = null;
        foreach ($msgs as $m) {
            if (($m['role'] ?? '') === 'user') {
                if ($pend) $rows[] = $pend;
                $pend = ['q' => (string)($m['content'] ?? ''), 'q_at' => $m['at'] ?? null, 'a' => '', 'a_at' => null];
            } else {
                if (!$pend) $pend = ['q' => '', 'q_at' => $m['at'] ?? null, 'a' => '', 'a_at' => null];
                $pend['a'] = (string)($m['content'] ?? '');
                $pend['a_at'] = $m['at'] ?? null;
                $rows[] = $pend;
                $pend = null;
            }
        }
        if ($pend) $rows[] = $pend;
        $rounds[(string)$s['no']] = $rows;
    }

    render('teacher/report_detail', ['report' => $r, 'rounds' => $rounds]);
}

function web_admin_guide(): void {
    require_teacher();
    render('teacher/guide', ['ai' => ai_models(), 'config' => config()]);
}

function web_admin_settings(): void {
    require_teacher();
    render('teacher/settings', ['config' => config(), 'ai' => ai_models()]);
}

// ============================================================ 教师端接口

function api_admin_save_settings(array $args): void {
    require_teacher();
    $in = body_json();
    $patch = [];
    foreach (['site_title', 'school', 'class_name', 'teacher_password'] as $k) {
        if (isset($in[$k]) && trim((string)$in[$k]) !== '') $patch[$k] = trim((string)$in[$k]);
    }
    if (isset($in['ai']) && is_array($in['ai'])) {
        $ai = config()['ai'] ?: [];
        if (isset($in['ai']['base_url']))    $ai['base_url']    = trim((string)$in['ai']['base_url']);
        if (isset($in['ai']['model']))       $ai['model']       = trim((string)$in['ai']['model']);
        if (isset($in['ai']['api_key']))     $ai['api_key']     = trim((string)$in['ai']['api_key']);
        if (isset($in['ai']['key_header']))  $ai['key_header']  = trim((string)$in['ai']['key_header']) ?: 'Authorization';
        if (isset($in['ai']['key_prefix']))  $ai['key_prefix']  = trim((string)$in['ai']['key_prefix']);
        if (isset($in['ai']['temperature'])) $ai['temperature'] = max(0, min(2, (float)$in['ai']['temperature']));
        if (isset($in['ai']['max_tokens']))  $ai['max_tokens']  = max(64, min(4096, (int)$in['ai']['max_tokens']));
        if (isset($in['ai']['timeout']))     $ai['timeout']     = max(10, min(600, (int)$in['ai']['timeout']));
        if (isset($in['ai']['system_extra']))$ai['system_extra']= trim((string)$in['ai']['system_extra']);
        $patch['ai'] = $ai;
    }
    if (isset($in['chat']['context_messages'])) {
        $patch['chat'] = ['context_messages' => max(2, min(40, (int)$in['chat']['context_messages']))];
    }
    config_save($patch);
    json_out(['ok' => true, 'config' => config()]);
}

/** 测试 AI 连接：体感 3 秒内给出到底是地址错、key 错还是模型名错 */
function api_admin_ai_test(array $args): void {
    require_teacher();
    $t0 = microtime(true);
    $m = ai_models(true);
    $ms = (int)round((microtime(true) - $t0) * 1000);
    $cfg = config()['ai'] ?? [];
    if (!$m['ok']) {
        json_out(['ok' => false, 'latency_ms' => $ms, 'error' => $m['error'] ?: '连不上',
                  'base_url' => $cfg['base_url'] ?? '', 'model' => $cfg['model'] ?? '']);
    }
    $models = $m['models'];
    $want = trim((string)($cfg['model'] ?? ''));
    json_out([
        'ok'         => true,
        'latency_ms' => $ms,
        'models'     => $models,
        'model_ok'   => $want === '' || in_array($want, $models, true),
        'model'      => $want,
        'note'       => count($models) ? '' : '接口没返回模型清单（不少外部服务是这样），只要有模型名就能用',
    ]);
}

function api_admin_session_start(array $args): void {
    require_teacher();
    $in = body_json();
    $courseId = (string)($in['course_id'] ?? '');
    $cur = session_current();
    if ($cur && $cur['status'] === 'live') {
        lesson_end($cur['id']);
    }
    $s = lesson_begin($courseId);
    json_out(['ok' => true, 'session' => $s]);
}

function api_admin_session_stop(array $args): void {
    require_teacher();
    $cur = session_current();
    if (!$cur) json_out(['ok' => false, 'error' => '当前没有进行中的课程'], 409);
    $s = lesson_end($cur['id']);
    // 下课即"上交"：后台固化记忆 + 生成报表，老师不用再手动点
    $job = run_php_bg([COHORT_ROOT . '/web/tools/after_class.php', $cur['id']]);
    json_out(['ok' => true, 'session' => $s, 'job' => $job]);
}

// ============================================================ 课程编辑

function api_admin_course_save(array $args): void {
    require_teacher();
    $in = body_json();
    $id = trim((string)($in['id'] ?? ''));
    $fields = [
        'title'      => trim((string)($in['title'] ?? '')),
        'date'       => trim((string)($in['date'] ?? '')),
        'period'     => trim((string)($in['period'] ?? '')),
        'class'      => trim((string)($in['class'] ?? config()['class_name'])),
        'experiment' => trim((string)($in['experiment'] ?? '')),
        'lab'        => trim((string)($in['lab'] ?? '')),
        'note'       => trim((string)($in['note'] ?? '')),
    ];
    if ($fields['title'] === '') json_out(['ok' => false, 'error' => '课程名字不能空'], 400);
    if ($fields['experiment'] !== '' && !experiment_get($fields['experiment'])) {
        json_out(['ok' => false, 'error' => '实验不存在：' . $fields['experiment'], 'code' => 'BAD_EXP'], 400);
    }
    // 这节课用哪个实验室：'' 不开放 / sandbox 自由实验台 / custom:<id> / module:<mid>
    $labErr = lab_binding_error($fields['lab']);
    if ($labErr !== null) json_out(['ok' => false, 'error' => $labErr, 'code' => 'BAD_LAB'], 400);

    $newId = $id !== '' ? $id : 'c' . date('ymdHi') . substr(bin2hex(random_bytes(2)), 0, 3);
    $result = null;
    json_update(DATA_DIR . '/courses.json', function ($list) use ($newId, $fields, &$result) {
        $list = is_array($list) ? $list : [];
        $found = false;
        foreach ($list as &$c) {
            if (($c['id'] ?? '') === $newId) {
                $c = array_replace($c, $fields);
                $result = $c;
                $found = true;
            }
        }
        unset($c);
        if (!$found) {
            $order = count($list);
            $result = array_merge(['id' => $newId, 'order' => $order], $fields);
            $list[] = $result;
        }
        return $list;
    }, []);
    json_out(['ok' => true, 'course' => $result, 'courses' => courses_all()]);
}

function api_admin_course_delete(array $args): void {
    require_teacher();
    $in = body_json();
    $id = trim((string)($in['id'] ?? ''));
    if ($id === '') json_out(['ok' => false, 'error' => '缺少课程 id'], 400);
    $live = session_current();
    if ($live && ($live['course_id'] ?? '') === $id && ($live['status'] ?? '') === 'live') {
        json_out(['ok' => false, 'error' => '这节课正在进行，先下课再删'], 409);
    }
    json_update(DATA_DIR . '/courses.json', function ($list) use ($id) {
        return array_values(array_filter((array)$list, fn($c) => ($c['id'] ?? '') !== $id));
    }, []);
    json_out(['ok' => true, 'courses' => courses_all()]);
}

// ============================================================ IP 网格

function api_admin_network_scan(array $args): void {
    require_teacher();
    json_out(['ok' => true] + network_snapshot());
}

// ============================================================ AI 一键化

function api_admin_ai_env(array $args): void {
    require_teacher();
    $models = lms_models();
    $loaded = [];
    foreach ($models as $m) if ($m['loaded']) $loaded[] = $m['key'];
    $instances = lms_loaded_instances();
    $loadedBytes = 0;
    foreach ($instances as $i) $loadedBytes += $i['size'];
    json_out([
        'ok'           => true,
        'lms_path'     => lms_path(),
        'lms_ok'       => lms_path() !== '',
        'server'       => lms_server_status(),
        'models'       => $models,
        'loaded'       => $loaded,
        'instances'    => $instances,
        'loaded_bytes' => $loadedBytes,
        'loaded_h'     => human_size($loadedBytes),
        'recommend'    => lms_recommended(),
        'vram_gb'      => round(detect_gpu_vram_gb(), 1),
        'ai_probe'     => ai_models(),
        'lms_downloads' => is_dir(COHORT_ROOT . '/runtime/tasks'),
    ]);
}

function api_admin_ai_task(array $args): void {
    require_teacher();
    $t = lms_task_status();
    json_out(['ok' => true, 'task' => $t]);
}

function api_admin_ai_server_start(array $args): void {
    require_teacher();
    $st = lms_server_status();
    if ($st['running']) json_out(['ok' => true, 'already' => true, 'server' => $st]);
    $r = lms_run_bg('server', '启动 AI 服务', ['server', 'start', '--port', '1234']);
    json_out($r['ok'] ? ['ok' => true, 'task' => $r['task']] : ['ok' => false, 'error' => $r['error']], $r['ok'] ? 200 : 400);
}

function api_admin_ai_model_download(array $args): void {
    require_teacher();
    $in = body_json();
    $key = trim((string)($in['key'] ?? ''));
    if ($key === '') $key = lms_recommended()['key'];
    $r = lms_run_bg('download', '下载模型 ' . $key, ['get', $key, '-y']);
    json_out($r['ok'] ? ['ok' => true, 'task' => $r['task']] : ['ok' => false, 'error' => $r['error']], $r['ok'] ? 200 : 400);
}

function api_admin_ai_model_load(array $args): void {
    require_teacher();
    $in = body_json();
    $key = trim((string)($in['key'] ?? ''));
    if ($key === '') json_out(['ok' => false, 'error' => '没指定模型'], 400);
    $st = lms_server_status();
    if (!$st['running']) {
        lms_run_bg('server', '启动 AI 服务', ['server', 'start', '--port', '1234']);
        json_out(['ok' => false, 'error' => 'AI 服务还没开，正在帮你启动，等它起来再点一次"加载"', 'code' => 'SERVER_STARTING'], 409);
    }
    // 先清场：同一个模型被反复点"加载"会堆出好几个实例，显存直接翻倍
    $instances = lms_loaded_instances();
    $sameKeyLoaded = false;
    foreach ($instances as $i) if ($i['key'] === $key) $sameKeyLoaded = true;
    if ($instances) lms_unload_all();

    // 带 --ttl：一节多没人用就自动卸下，省显存（相当于"睡眠"）
    $r = lms_run_bg('load', '加载模型 ' . $key, ['load', $key, '--gpu', 'max', '--ttl', '1800', '-y']);
    if ($r['ok']) config_save(['ai' => ['model' => $key]]);
    json_out($r['ok'] ? ['ok' => true, 'task' => $r['task'], 'unloaded_first' => count($instances), 'same_key' => $sameKeyLoaded]
        : ['ok' => false, 'error' => $r['error']], $r['ok'] ? 200 : 400);
}

/** 卸载一个模型（也可以传 all=true 一次清空），把显存还给系统 */
function api_admin_ai_model_unload(array $args): void {
    require_teacher();
    $in = body_json();
    $all = !empty($in['all']);
    $key = trim((string)($in['key'] ?? ''));
    if (!$all && $key === '') json_out(['ok' => false, 'error' => '没指定要卸载哪个模型'], 400);

    $before = lms_loaded_instances();
    if (!$before) json_out(['ok' => true, 'already' => true, 'hint' => '当前没有加载中的模型，显存已经是空的']);
    if (!$all) lms_exec(['unload', $key], 40);
    else       lms_unload_all();

    $after = lms_loaded_instances();
    $freed = 0;
    foreach ($before as $b) {
        $still = false;
        foreach ($after as $a) if ($a['id'] === $b['id']) $still = true;
        if (!$still) $freed += $b['size'];
    }
    json_out([
        'ok'        => true,
        'left'      => count($after),
        'freed'     => $freed,
        'freed_h'   => human_size($freed),
        'instances' => $after,
    ]);
}

/** 一键：起服务 → 有模型就直接用，没模型就下载推荐的那个 */
function api_admin_ai_quick(array $args): void {
    require_teacher();
    if (lms_path() === '') {
        json_out(['ok' => false, 'error' => '这台电脑上没装 LM Studio，先装一下再回来点这个按钮', 'code' => 'NO_LMS'], 400);
    }
    $steps = [];
    $st = lms_server_status();
    if (!$st['running']) {
        $r = lms_run_bg('server', '启动 AI 服务', ['server', 'start', '--port', '1234']);
        $steps[] = ['step' => 'server', 'ok' => $r['ok'], 'task' => $r['task'] ?? null];
        json_out(['ok' => true, 'stage' => 'server', 'steps' => $steps,
                  'hint' => '正在启动 AI 服务，服务起来后会自动进行下一步']);
    }

    $models = lms_models();
    if (!$models) {
        $rec = lms_recommended();
        $r = lms_run_bg('download', '下载推荐模型 ' . $rec['key'], ['get', $rec['key'], '-y']);
        $steps[] = ['step' => 'download', 'ok' => $r['ok'], 'task' => $r['task'] ?? null];
        json_out(['ok' => true, 'stage' => 'download', 'steps' => $steps, 'recommend' => $rec]);
    }

    $loaded = null;
    foreach ($models as $m) if ($m['loaded']) { $loaded = $m['key']; break; }
    if (!$loaded) {
        // 优先挑小一点的通用对话模型
        usort($models, fn($a, $b) => $a['size'] <=> $b['size']);
        $pick = $models[0]['key'];
        $r = lms_run_bg('load', '加载模型 ' . $pick, ['load', $pick, '--gpu', 'max', '--ttl', '1800', '-y']);
        $steps[] = ['step' => 'load', 'ok' => $r['ok'], 'task' => $r['task'] ?? null, 'key' => $pick];
        config_save(['ai' => ['model' => $pick]]);
    } else {
        config_save(['ai' => ['model' => $loaded]]);
    }
    json_out(['ok' => true, 'stage' => 'done', 'steps' => $steps, 'loaded' => $loaded]);
}

// ============================================================ 单页控制台

function console_data(): array {
    $session = session_current();
    $attendees = [];
    if ($session) {
        foreach (($session['attendees'] ?? []) as $no => $a) {
            $msgs = chat_messages($session['id'], (string)$no);
            $seen = strtotime((string)($a['last_seen'] ?? '')) ?: 0;
            $attendees[] = [
                'no'        => (string)$no,
                'name'      => (string)($a['name'] ?? ''),
                'ip'        => (string)($a['ip'] ?? ''),
                'last_seen' => $a['last_seen'] ?? null,
                'online'    => (time() - $seen) < 120,
                'questions' => count(array_filter($msgs, fn($m) => ($m['role'] ?? '') === 'user')),
            ];
        }
    }

    $reports = [];
    foreach (glob(DATA_DIR . '/reports/*.json') ?: [] as $f) {
        $r = json_read($f, null);
        if (!$r) continue;
        $reports[] = [
            'session_id'   => $r['session_id'],
            'title'        => $r['title'],
            'class'        => $r['class'] ?? '',
            'generated_at' => $r['generated_at'],
            'mode'         => $r['mode'] ?? 'stats',
            'totals'       => $r['totals'] ?? [],
        ];
    }
    usort($reports, fn($a, $b) => strcmp($b['generated_at'], $a['generated_at']));

    return [
        'session'     => $session,
        'live'        => $session && $session['status'] === 'live',
        'attendees'   => $attendees,
        'courses'     => courses_all(),
        'experiments' => experiments_all(),
        'students'    => students_all(),
        'reports'     => $reports,
        'lan'         => ['ip' => lan_ip(), 'url' => lan_url()],
        'ai'          => ai_models(),
        'recommend'   => lms_recommended(),
        'vram'        => round(detect_gpu_vram_gb(), 1),
    ];
}

function web_console(): void {
    require_teacher();
    $d = console_data();
    render('teacher/console', $d + ['network' => network_snapshot()], 'none');
}

function api_admin_console(array $args): void {
    require_teacher();
    $d = console_data();
    json_out([
        'ok'        => true,
        'live'      => $d['live'],
        'session'   => $d['session'] ? [
            'id' => $d['session']['id'], 'title' => $d['session']['title'],
            'class' => $d['session']['class'], 'status' => $d['session']['status'],
        ] : null,
        'attendees' => $d['attendees'],
        'ai'        => $d['ai'],
    ]);
}

/** 报表 JSON（含逐轮回放数据），供单页控制台内联渲染 */
function api_admin_report_json(array $args): void {
    require_teacher();
    $id = (string)$args[0];
    $r = json_read(report_path($id), null);
    if (!$r) json_out(['ok' => false, 'error' => '报表不存在'], 404);

    $rounds = [];
    foreach (($r['students'] ?? []) as $s) {
        $msgs = chat_messages($r['session_id'], (string)$s['no']);
        $rows = []; $pend = null;
        foreach ($msgs as $m) {
            if (($m['role'] ?? '') === 'user') {
                if ($pend) $rows[] = $pend;
                $pend = ['q' => (string)($m['content'] ?? ''), 'q_at' => $m['at'] ?? null, 'a' => '', 'a_at' => null];
            } else {
                if (!$pend) $pend = ['q' => '', 'q_at' => $m['at'] ?? null, 'a' => '', 'a_at' => null];
                $pend['a'] = (string)($m['content'] ?? '');
                $pend['a_at'] = $m['at'] ?? null;
                $rows[] = $pend; $pend = null;
            }
        }
        if ($pend) $rows[] = $pend;
        $rounds[(string)$s['no']] = $rows;
    }
    json_out(['ok' => true, 'report' => $r, 'rounds' => $rounds]);
}

function web_console_redirect(array $args): void {
    // 老地址一律收回单页入口，避免老师在不同页面之间找不到北
    header('Location: /console');
    exit;
}

function web_admin_ai(): void {
    require_teacher();
    render('teacher/ai', ['config' => config(), 'recommend' => lms_recommended(), 'vram' => round(detect_gpu_vram_gb(), 1)]);
}

function web_admin_network(): void {
    require_teacher();
    render('teacher/network', [
        'snapshot' => network_snapshot(),
        'session'  => session_current(),
    ]);
}


function api_admin_students_import(array $args): void {
    require_teacher();
    $in = body_json();
    $text = (string)($in['text'] ?? '');
    $rows = [];
    foreach (preg_split('/\r?\n/', $text) as $line) {
        $line = trim($line);
        if ($line === '') continue;
        $parts = preg_split('/[\s,，\t]+/u', $line);
        if (count($parts) < 2) continue;
        $no = trim($parts[0]);
        $name = trim($parts[1]);
        $class = trim($parts[2] ?? config()['class_name']);
        if ($no === '' || $name === '') continue;
        $rows[] = ['no' => $no, 'name' => $name, 'class' => $class];
    }
    if (!$rows) json_out(['ok' => false, 'error' => '没有解析到有效行（格式：学号 姓名）'], 400);
    $mode = (string)($in['mode'] ?? 'replace');
    json_update(DATA_DIR . '/students.json', function ($cur) use ($rows, $mode) {
        if ($mode === 'replace') return $rows;
        $map = [];
        foreach ((array)$cur as $s) $map[(string)$s['no']] = $s;
        foreach ($rows as $s) $map[(string)$s['no']] = $s;
        return array_values($map);
    }, []);
    classes_sync_from_roster();
    json_out(['ok' => true, 'count' => count($rows), 'students' => students_all()]);
}

// ============================================================ 班级 / 学生

function api_admin_classes(array $args): void {
    require_teacher();
    json_out([
        'ok'       => true,
        'classes'  => classes_all(),
        'students' => students_all(),
        'default'  => config()['class_name'],
    ]);
}

/** 把某个班设为默认班级（系统设置里的"默认班级"跟着走） */
function api_admin_class_default(array $args): void {
    require_teacher();
    $in = body_json();
    $id = trim((string)($in['id'] ?? ''));
    $c = $id !== '' ? class_get($id) : null;
    if (!$c) json_out(['ok' => false, 'error' => '班级不存在'], 404);
    config_save(['class_name' => (string)$c['name']]);
    json_out(['ok' => true, 'default' => config()['class_name']]);
}

/** 新建/编辑班级。copy_from = 勾选其他班，成员直接并进来（合班） */
function api_admin_class_save(array $args): void {
    require_teacher();
    $in = body_json();
    $id   = trim((string)($in['id'] ?? ''));
    $name = trim((string)($in['name'] ?? ''));
    if ($name === '') json_out(['ok' => false, 'error' => '班级名称不能空'], 400);
    if (mb_strlen($name) > 24) json_out(['ok' => false, 'error' => '班级名太长'], 400);

    $roster = [];
    foreach (students_all() as $s) $roster[(string)$s['no']] = $s;

    $members = [];
    foreach ((array)($in['members'] ?? []) as $no) {
        $no = trim((string)$no);
        if ($no !== '' && isset($roster[$no])) $members[] = $no;
    }
    foreach ((array)($in['copy_from'] ?? []) as $cid) {
        $c = class_get((string)$cid);
        if (!$c) continue;
        foreach ((array)($c['members'] ?? []) as $no) $members[] = (string)$no;
    }
    $members = array_values(array_unique($members));

    $list = classes_all();
    $new = null;
    if ($id !== '') {
        foreach ($list as &$c) {
            if (($c['id'] ?? '') === $id) {
                $c['name'] = $name;
                $c['members'] = $members;
                $c['updated_at'] = now_iso();
                $new = $c;
            }
        }
        unset($c);
    }
    if (!$new) {
        // 同名班级不重复建：直接接管现有那条（改成员/改默认都走它）
        foreach ($list as &$c) {
            if (($c['name'] ?? '') === $name) {
                if ($members) $c['members'] = $members;   // 没勾人就不动原名单，避免手滑清空
                $c['updated_at'] = now_iso();
                $new = $c;
            }
        }
        unset($c);
    }
    if (!$new) {
        $new = ['id' => 'k' . substr(md5($name . microtime(true)), 0, 8), 'name' => $name,
                'members' => $members, 'created_at' => now_iso()];
        $list[] = $new;
    }
    classes_save($list);
    if (!empty($in['default'])) config_save(['class_name' => $name]);
    json_out(['ok' => true, 'class' => $new, 'classes' => classes_all(), 'default' => config()['class_name']]);
}

function api_admin_class_delete(array $args): void {
    require_teacher();
    $in = body_json();
    $id = trim((string)($in['id'] ?? ''));
    if ($id === '') json_out(['ok' => false, 'error' => '缺少班级 id'], 400);
    $list = array_values(array_filter(classes_all(), fn($c) => ($c['id'] ?? '') !== $id));
    classes_save($list);
    json_out(['ok' => true, 'classes' => $list]);
}

/** 注册/修改单个学生：同时维护他属于哪几个班 */
function api_admin_student_save(array $args): void {
    require_teacher();
    $in = body_json();
    $no   = trim((string)($in['no'] ?? ''));
    $name = trim((string)($in['name'] ?? ''));
    if ($no === '' || $name === '') json_out(['ok' => false, 'error' => '学号和姓名都要填'], 400);
    if (mb_strlen($name) > 20) json_out(['ok' => false, 'error' => '姓名过长'], 400);

    $classIds = array_map('strval', (array)($in['classes'] ?? []));
    $classes  = classes_all();
    $names    = [];
    foreach ($classes as $c) if (in_array($c['id'], $classIds, true)) $names[] = $c['name'];

    $list = students_all();
    $hit = false;
    foreach ($list as &$s) {
        if ((string)$s['no'] === $no) {
            $s['name'] = $name;
            $s['class'] = $names[0] ?? '';
            $hit = true;
        }
    }
    unset($s);
    if (!$hit) $list[] = ['no' => $no, 'name' => $name, 'class' => $names[0] ?? ''];
    students_save($list);

    foreach ($classes as &$c) {
        $members = array_map('strval', (array)($c['members'] ?? []));
        if (in_array($c['id'], $classIds, true)) {
            if (!in_array($no, $members, true)) $members[] = $no;
        } else {
            $members = array_values(array_filter($members, fn($m) => $m !== $no));
        }
        $c['members'] = $members;
    }
    unset($c);
    classes_save($classes);

    json_out(['ok' => true, 'students' => students_all(), 'classes' => classes_all()]);
}

function api_admin_student_delete(array $args): void {
    require_teacher();
    $in = body_json();
    $no = trim((string)($in['no'] ?? ''));
    if ($no === '') json_out(['ok' => false, 'error' => '缺少学号'], 400);
    $list = array_values(array_filter(students_all(), fn($s) => (string)($s['no'] ?? '') !== $no));
    students_save($list);
    $classes = classes_all();
    foreach ($classes as &$c) {
        $c['members'] = array_values(array_filter(array_map('strval', (array)($c['members'] ?? [])), fn($m) => $m !== $no));
    }
    unset($c);
    classes_save($classes);
    json_out(['ok' => true, 'students' => $list, 'classes' => classes_all()]);
}

/** 读 xlsx：PHP 没编 zip 扩展，这里自己走 zip 中央目录 + gzinflate，纯 PHP 不依赖外部工具 */
function xlsx_rows(string $path): array {
    $data = file_get_contents($path);
    if ($data === false) return [];
    $len = strlen($data);

    $eocd = strrpos($data, "PK\x05\x06");
    if ($eocd === false) return [];
    $count = unpack('v', substr($data, $eocd + 10, 2))[1];
    $cdOff = unpack('V', substr($data, $eocd + 16, 4))[1];

    $files = [];
    $p = $cdOff;
    for ($i = 0; $i < $count && $p + 46 <= $len; $i++) {
        if (substr($data, $p, 4) !== "PK\x01\x02") break;
        $method  = unpack('v', substr($data, $p + 10, 2))[1];
        $csize   = unpack('V', substr($data, $p + 20, 4))[1];
        $usize   = unpack('V', substr($data, $p + 24, 4))[1];
        $nameLen = unpack('v', substr($data, $p + 28, 2))[1];
        $extra   = unpack('v', substr($data, $p + 30, 2))[1];
        $cmt     = unpack('v', substr($data, $p + 32, 2))[1];
        $local   = unpack('V', substr($data, $p + 42, 4))[1];
        $name    = substr($data, $p + 46, $nameLen);
        $files[$name] = ['method' => $method, 'csize' => $csize, 'usize' => $usize, 'local' => $local];
        $p += 46 + $nameLen + $extra + $cmt;
    }
    if (!isset($files['xl/workbook.xml'])) return [];

    $read = function (string $name) use ($data, $files, $len): string {
        if (!isset($files[$name])) return '';
        $f = $files[$name];
        $lh = 30;
        $nameLen = unpack('v', substr($data, $f['local'] + 26, 2))[1];
        $extra   = unpack('v', substr($data, $f['local'] + 28, 2))[1];
        $start   = $f['local'] + $lh + $nameLen + $extra;
        $raw = substr($data, $start, $f['csize']);
        if ($f['method'] === 0) return $raw;
        $out = @gzinflate($raw);
        return $out === false ? '' : $out;
    };

    // 共享字符串
    $shared = [];
    $ss = $read('xl/sharedStrings.xml');
    if ($ss !== '') {
        $xml = @simplexml_load_string($ss);
        $nodes = null;
        if ($xml) {
            // <sst> 是根节点，si 直接挂在下面；兼容带包装层的写法
            if (isset($xml->si)) $nodes = $xml->si;
            elseif (isset($xml->sst->si)) $nodes = $xml->sst->si;
        }
        if ($nodes !== null) foreach ($nodes as $si) {
            $txt = '';
            if (isset($si->t)) $txt = (string)$si->t;
            else foreach ($si->r as $r) $txt .= (string)$r->t;
            $shared[] = $txt;
        }
    }

    // 第一张工作表（有的表不叫 sheet1.xml，按 worksheets/ 下第一份取）
    $sheetPath = isset($files['xl/worksheets/sheet1.xml']) ? 'xl/worksheets/sheet1.xml' : '';
    if ($sheetPath === '') foreach (array_keys($files) as $n) {
        if (strpos($n, 'xl/worksheets/') === 0 && substr($n, -4) === '.xml') { $sheetPath = $n; break; }
    }
    if ($sheetPath === '') return [];
    $sheetXml = $read($sheetPath);
    if ($sheetXml === '') return [];
    $xml = @simplexml_load_string($sheetXml);
    if (!$xml) return [];
    $sheetData = isset($xml->sheetData) ? $xml->sheetData : ($xml->worksheet->sheetData ?? null);
    if (!$sheetData) return [];

    $rows = [];
    foreach ($sheetData->row as $row) {
        $cells = [];
        foreach ($row->c as $c) {
            $ref = (string)$c['r'];
            $col = 0;
            if (preg_match('/([A-Z]+)/', $ref, $m)) {
                for ($k = 0; $k < strlen($m[1]); $k++) $col = $col * 26 + (ord($m[1][$k]) - 64);
                $col--;
            }
            $type = (string)$c['t'];
            $v = (string)$c->v;
            if ($type === 's') $v = $shared[(int)$v] ?? '';
            elseif ($type === 'inlineStr') {
                $v = '';
                foreach ($c->is->children() as $n) {
                    if ($n->getName() === 't') $v .= (string)$n;
                    elseif ($n->getName() === 'r') $v .= (string)$n->t;
                }
            }
            $cells[$col] = trim($v);
        }
        if (!$cells) continue;
        $max = max(array_keys($cells));
        $line = [];
        for ($i = 0; $i <= $max; $i++) $line[] = $cells[$i] ?? '';
        $rows[] = $line;
    }
    return $rows;
}

/** 上传 Excel/CSV 导入名单：第一列学号、第二列姓名、第三列（可选）班级 */
function api_admin_students_import_file(array $args): void {
    require_teacher();
    if (empty($_FILES['file']['tmp_name'])) json_out(['ok' => false, 'error' => '没有收到文件'], 400);
    $tmp  = $_FILES['file']['tmp_name'];
    $orig = (string)($_FILES['file']['name'] ?? '');
    $ext  = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    if ($_FILES['file']['size'] > 8 * 1024 * 1024) json_out(['ok' => false, 'error' => '文件太大（上限 8 MB）'], 400);

    $lines = [];
    if ($ext === 'xlsx') {
        $lines = xlsx_rows($tmp);
    } else {
        $raw = file_get_contents($tmp);
        $raw = str_replace(["\r\n", "\r"], "\n", (string)$raw);
        if (strpos($raw, "\xEF\xBB\xBF") === 0) $raw = substr($raw, 3);
        foreach (explode("\n", $raw) as $line) {
            if (trim($line) === '') continue;
            $lines[] = str_getcsv($line, ',', '"', '\\');
        }
    }
    if (!$lines) json_out(['ok' => false, 'error' => '文件里没读到内容（xlsx 请用第一张工作表）'], 400);

    $rows = [];
    foreach ($lines as $i => $cells) {
        if (!is_array($cells)) $cells = [$cells];
        $cells = array_map(fn($v) => trim((string)$v), $cells);
        $no = $cells[0] ?? '';
        $name = $cells[1] ?? '';
        if ($i === 0 && preg_match('/学号|编号|no|id/i', $no)) continue;   // 跳过表头
        if ($no === '' || $name === '') continue;
        $class = trim($cells[2] ?? '') ?: config()['class_name'];
        $rows[] = ['no' => $no, 'name' => $name, 'class' => $class];
    }
    if (!$rows) json_out(['ok' => false, 'error' => '没解析到有效行（需要：学号 / 姓名 / 班级）'], 400);

    $mode = (string)($_POST['mode'] ?? 'merge');
    json_update(DATA_DIR . '/students.json', function ($cur) use ($rows, $mode) {
        if ($mode === 'replace') return $rows;
        $map = [];
        foreach ((array)$cur as $s) $map[(string)$s['no']] = $s;
        foreach ($rows as $s) $map[(string)$s['no']] = $s;
        return array_values($map);
    }, []);
    classes_sync_from_roster();

    json_out(['ok' => true, 'count' => count($rows), 'students' => students_all(), 'classes' => classes_all()]);
}

// ============================================================ 实验室后台

function lab_config(): array {
    $c = json_read(DATA_DIR . '/lab_config.json', []);
    return array_replace([
        'enabled' => ['lever', 'lens', 'circuit', 'buoyancy'],
        'default' => 'lever',
        'free'    => true,
    ], is_array($c) ? $c : []);
}

function lab_config_save(array $next): void {
    json_atomic_write(DATA_DIR . '/lab_config.json', $next);
}

/** 前端实验室页读这个：哪些页签开着、默认进哪个。上课期间只放本节课选中的实验室。 */
function api_lab_config(array $args): void {
    $c = lab_config();
    $mods = lab_modules();
    $modIds = array_map(fn($m) => $m['id'], $mods);
    $enabled = [];
    foreach ($mods as $m) if (in_array($m['id'], (array)$c['enabled'], true)) $enabled[] = $m['id'];
    if (!$enabled) $enabled = [$mods[0]['id'] ?? 'lever'];
    if (!in_array($c['default'], $enabled, true)) $c['default'] = $enabled[0];

    $scope   = 'global';
    $lesson  = '';
    $custom  = '';
    $s = session_current();
    if ($s && ($s['status'] ?? '') === 'live' && trim((string)($s['lab'] ?? '')) !== '') {
        $picked = [];
        $customIds = [];
        foreach (preg_split('/[\s,，+]+/u', (string)$s['lab']) as $tok) {
            $tok = trim($tok);
            if ($tok === '') continue;
            if (strpos($tok, 'module:') === 0) {
                $id = substr($tok, 7);
                if (in_array($id, $modIds, true)) $picked[] = $id;
            } elseif (strpos($tok, 'custom:') === 0) {
                $customIds[] = substr($tok, 7);
            } elseif (in_array($tok, $modIds, true)) {
                $picked[] = $tok;
            } elseif ($tok === 'sandbox') {
                $picked[] = 'sandbox';
            } else {
                $customIds[] = $tok;
            }
        }
        $picked = array_values(array_unique($picked));
        if ($customIds) {
            // 自定义实验室统一走通用台载入
            $picked[] = 'sandbox';
            $picked = array_values(array_unique($picked));
            $custom = (string)($customIds[0] ?? '');
        }
        if ($picked) {
            $enabled = $picked;
            $scope = 'lesson';
            $lesson = (string)($s['title'] ?? '');
            if (!in_array($c['default'], $enabled, true)) $c['default'] = $enabled[0];
        }
    }

    json_out([
        'ok'      => true,
        'enabled' => $enabled,
        'default' => $c['default'],
        'free'    => (bool)$c['free'],
        'scope'   => $scope,
        'lesson'  => $lesson,
        'custom'  => $custom,
    ]);
}

/** 六个实验模块清单（实验页里的页签，力学/热学/光学/电学/综合），后台用来做开关 */
function lab_modules(): array {
    return [
        ['id' => 'lever',    'name' => '杠杆实验室',      'note' => '力矩动力学，可挂 6 只 50g 钩码', 'group' => '力学'],
        ['id' => 'buoyancy', 'name' => '浮力实验室',      'note' => '阿基米德原理，水面上涨', 'group' => '力学'],
        ['id' => 'states',   'name' => '水温变化实验室',  'note' => '密闭空腔，牛顿冷却 + 潜热相变，看 0℃ / 100℃ 平台', 'group' => '热学'],
        ['id' => 'lens',     'name' => '凸透镜实验室',    'note' => '1/f = 1/u + 1/v，光屏可移动', 'group' => '光学'],
        ['id' => 'circuit',  'name' => '伏安法实验室',    'note' => '真实回路 + 电表内阻误差', 'group' => '电学'],
        ['id' => 'sandbox',  'name' => '通用实验台',      'note' => '电学 + 光学自由摆放，可载入自定义实验室', 'group' => '综合'],
    ];
}

function api_admin_lab_config(array $args): void {
    require_teacher();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $in = body_json();
        $enabled = [];
        foreach ((array)($in['enabled'] ?? []) as $id) {
            $id = preg_replace('/[^a-z0-9\-]/', '', strtolower((string)$id));
            if ($id !== '') $enabled[] = $id;
        }
        $mods = array_column(lab_modules(), 'id');
        $enabled = array_values(array_intersect($mods, array_unique($enabled)));
        $default = preg_replace('/[^a-z0-9\-]/', '', strtolower((string)($in['default'] ?? '')));
        if (!in_array($default, $enabled, true)) $default = $enabled[0] ?? '';
        $next = ['enabled' => $enabled ?: $mods, 'default' => $default ?: $mods[0], 'free' => !empty($in['free'])];
        lab_config_save($next);
        json_out(['ok' => true, 'config' => $next]);
    }
    json_out(['ok' => true, 'config' => lab_config(), 'modules' => lab_modules()]);
}

// ============================================================ 自定义实验室（通用台场景）

function labs_all(): array {
    $list = json_read(DATA_DIR . '/labs.json', []);
    return is_array($list) ? $list : [];
}

/**
 * 校验一节课绑定的实验室。返回 null 表示合法，否则返回给前端看的错误文案。
 * 格式约定：''（不开放） | sandbox（自由实验台） | custom:<实验室id> | module:<模块id>
 */
function lab_binding_error(string $raw): ?string {
    $raw = trim($raw);
    if ($raw === '' || $raw === 'sandbox') return null;
    // 一节课可以勾多间：module:states,module:circuit / custom:xxx
    $parts = preg_split('/[\s,，+]+/u', $raw, -1, PREG_SPLIT_NO_EMPTY);
    foreach ($parts as $p) {
        $err = lab_binding_one_error(trim($p));
        if ($err !== null) return $err;
    }
    return null;
}

function lab_binding_one_error(string $raw): ?string {
    if ($raw === '' || $raw === 'sandbox') return null;
    if (strpos($raw, 'custom:') === 0) {
        $id = substr($raw, 7);
        foreach (labs_all() as $l) {
            if ((string)($l['id'] ?? '') === $id) return null;
        }
        return '自定义实验室不存在：' . $id;
    }
    if (strpos($raw, 'module:') === 0) {
        $mid = substr($raw, 7);
        foreach (lab_modules() as $m) {
            if ($m['id'] === $mid) return null;
        }
        return '内置实验模块不存在：' . $mid;
    }
    return '实验室绑定格式不对（应为 sandbox / custom:id / module:id）';
}

/** 把一节课的实验室绑定翻成学生端能用的打开地址；不开放则返回 null */
function lab_binding_href(string $raw): ?string {
    if ($raw === '') return null;
    if ($raw === 'sandbox') return '/exp/lab?m=sandbox';
    if (strpos($raw, 'custom:') === 0) {
        return '/exp/lab?m=sandbox&lab=' . rawurlencode(substr($raw, 7));
    }
    if (strpos($raw, 'module:') === 0) {
        return '/exp/lab?m=' . rawurlencode(substr($raw, 7));
    }
    return '/exp/lab';
}

/** 实验室绑定的人类可读名字，控制台列表里直接显示 */
function lab_binding_label(string $raw): string {
    if ($raw === '') return '不开放';
    if ($raw === 'sandbox') return '自由实验台';
    if (strpos($raw, 'custom:') === 0) {
        $id = substr($raw, 7);
        foreach (labs_all() as $l) {
            if ((string)($l['id'] ?? '') === $id) return '自定义 · ' . ($l['name'] ?? $id);
        }
        return '自定义 · ' . $id . '（已删除）';
    }
    if (strpos($raw, 'module:') === 0) {
        $mid = substr($raw, 7);
        foreach (lab_modules() as $m) {
            if ($m['id'] === $mid) return '内置 · ' . $m['name'];
        }
        return '内置 · ' . $mid;
    }
    return $raw;
}

/** 控制台排课弹窗要用的实验室清单 */
function lab_picker_options(): array {
    $out = [['value' => '', 'label' => '本节不开放实验室（纯 AI 答疑）']];
    $out[] = ['value' => 'sandbox', 'label' => '自由实验台（学生随便摆）'];
    foreach (labs_all() as $l) {
        $out[] = [
            'value' => 'custom:' . (string)($l['id'] ?? ''),
            'label' => '自定义 · ' . (string)($l['name'] ?? '未命名') . '（' . count((array)($l['data']['items'] ?? [])) . ' 件器材）',
        ];
    }
    foreach (lab_modules() as $m) {
        $out[] = ['value' => 'module:' . $m['id'], 'label' => '内置 · ' . $m['name'] . '（' . $m['group'] . '）'];
    }
    return $out;
}

/** 公开：学生端/通用台拉取可用实验室列表（只给元信息 + 场景数据） */
function api_lab_labs(array $args): void {
    $out = [];
    foreach (labs_all() as $l) {
        $out[] = [
            'id' => (string)($l['id'] ?? ''),
            'name' => (string)($l['name'] ?? '未命名实验室'),
            'count' => count((array)($l['data']['items'] ?? [])),
            'updated_at' => (string)($l['updated_at'] ?? ''),
            'data' => $l['data'] ?? null,
        ];
    }
    json_out(['ok' => true, 'labs' => $out]);
}

/** 老师保存一份实验室（通用台里点「存为实验室」，或后台导入 JSON） */
function api_admin_lab_lab(array $args): void {
    require_teacher();
    $in = body_json();
    $data = $in['data'] ?? $in;
    if (!is_array($data) || !isset($data['items']) || !is_array($data['items'])) {
        json_out(['ok' => false, 'error' => '场景数据不完整（缺 items）'], 400);
    }
    $name = trim((string)($data['name'] ?? ($in['name'] ?? '未命名实验室')));
    if (mb_strlen($name) > 32) json_out(['ok' => false, 'error' => '实验室名太长'], 400);
    $data['name'] = $name;

    $list = labs_all();
    $id = trim((string)($in['id'] ?? ''));
    if ($id === '') $id = 'lab' . substr(md5($name . json_encode($data['items']) . microtime(true)), 0, 8);

    $hit = false;
    foreach ($list as &$l) {
        if (($l['id'] ?? '') === $id) {
            $l['name'] = $name;
            $l['data'] = $data;
            $l['updated_at'] = now_iso();
            $hit = true;
        }
    }
    unset($l);
    if (!$hit) {
        $list[] = ['id' => $id, 'name' => $name, 'data' => $data, 'created_at' => now_iso(), 'updated_at' => now_iso()];
    }
    json_atomic_write(DATA_DIR . '/labs.json', $list);
    json_out(['ok' => true, 'id' => $id, 'name' => $name, 'labs' => array_map(function ($l) {
        return ['id' => $l['id'], 'name' => $l['name'], 'count' => count((array)($l['data']['items'] ?? []))];
    }, labs_all())]);
}

function api_admin_lab_lab_delete(array $args): void {
    require_teacher();
    $in = body_json();
    $id = trim((string)($in['id'] ?? ''));
    if ($id === '') json_out(['ok' => false, 'error' => '缺少实验室 id'], 400);
    $list = array_values(array_filter(labs_all(), fn($l) => (string)($l['id'] ?? '') !== $id));
    json_atomic_write(DATA_DIR . '/labs.json', $list);
    json_out(['ok' => true, 'labs' => array_map(function ($l) {
        return ['id' => $l['id'], 'name' => $l['name'], 'count' => count((array)($l['data']['items'] ?? []))];
    }, $list)]);
}

function api_admin_report_build(array $args): void {    require_teacher();
    @set_time_limit(600);
    $in = body_json();
    $sessionId = (string)($in['session_id'] ?? '');
    if ($sessionId === '') {
        $cur = session_current();
        $sessionId = $cur['id'] ?? '';
    }
    if ($sessionId === '' || !session_get($sessionId)) json_out(['ok' => false, 'error' => '场次不存在'], 404);
    try {
        $report = report_compile($sessionId);
    } catch (Throwable $e) {
        json_out(['ok' => false, 'error' => $e->getMessage()], 500);
    }
    json_out(['ok' => true, 'report' => [
        'session_id' => $report['session_id'],
        'mode'       => $report['mode'],
        'totals'     => $report['totals'],
    ]]);
}

// ============================================================ 系统接口（启动器用）

function api_ping(array $args): void {
    json_out(['ok' => true, 'app' => 'cohort', 'version' => '0.1.0', 'time' => now_iso()]);
}

function api_status(array $args): void {
    $session = session_current();
    $ai = ai_models();
    json_out([
        'ok'      => true,
        'teacher' => is_teacher(),
        'ai'      => ['ok' => $ai['ok'], 'models' => $ai['models'], 'error' => $ai['error'] ?? null],
        'session' => $session ? ['id' => $session['id'], 'title' => $session['title'], 'status' => $session['status'],
                                 'attendees' => count($session['attendees'] ?? [])] : null,
        'students'=> count(students_all()),
    ]);
}

function api_ai_models(array $args): void {
    json_out(ai_models());
}




// ============================================================ 语音输入（本地 ASR）

/** whisper-cli 在哪（runtime/asr 里有就用，没有再退 CohortAsr.exe） */
function asr_whisper_bin(): ?string {
    foreach (['whisper-cli.exe', 'main.exe'] as $n) {
        $direct = COHORT_ROOT . '/runtime/asr/' . $n;
        if (is_file($direct)) return $direct;
        $hit = glob(COHORT_ROOT . '/runtime/asr/**/' . $n);
        if ($hit) return $hit[0];
    }
    return null;
}

/** 挑模型：优先 base（准一些），其次 tiny（快） */
function asr_whisper_model(): ?string {
    foreach (['ggml-base-q5_1.bin', 'ggml-base.bin', 'ggml-tiny-q5_1.bin', 'ggml-tiny.bin'] as $n) {
        $p = COHORT_ROOT . '/runtime/asr/' . $n;
        if (is_file($p)) return $p;
    }
    $any = glob(COHORT_ROOT . '/runtime/asr/*.bin');
    return $any ? $any[0] : null;
}

/** 跑一条命令，超时就掐掉；返回 [退出码, 标准输出, 标准错误] */
function run_cmd(string $cmd, int $timeoutSec = 90): array {
    $desc = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $p = @proc_open($cmd, $desc, $pipes);
    if (!is_resource($p)) return [-1, '', 'proc_open 失败'];
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $out = '';
    $err = '';
    $t0 = time();
    while (true) {
        $st = proc_get_status($p);
        $out .= (string)stream_get_contents($pipes[1]);
        $err .= (string)stream_get_contents($pipes[2]);
        if (!$st['running']) break;
        if (time() - $t0 > $timeoutSec) {
            @proc_terminate($p, 9);
            $err .= ' (超时)';
            break;
        }
        usleep(120000);
    }
    $out .= (string)stream_get_contents($pipes[1]);
    $err .= (string)stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($p);
    return [$code, $out, $err];
}

/**
 * POST /api/asr   （multipart，字段 audio=16k 单声道 wav）
 * 学生端、实验页、控制台都用这一个口。不登录也能用，但只认短的 wav。
 */
function api_asr(array $args): void {
    $f = $_FILES['audio'] ?? null;
    if (!$f || (int)($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_out(['ok' => false, 'error' => '没收到录音'], 400);
    }
    if ((int)$f['size'] > 12 * 1024 * 1024) {
        json_out(['ok' => false, 'error' => '一段别超过 60 秒'], 413);
    }
    $dir = COHORT_ROOT . '/runtime/tasks/asr';
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    $stamp = date('Hi') . '-' . bin2hex(random_bytes(4));
    $wav = $dir . '/a' . $stamp . '.wav';
    if (!move_uploaded_file($f['tmp_name'], $wav)) {
        json_out(['ok' => false, 'error' => '录音没存下来'], 500);
    }

    $head = (string)@file_get_contents($wav, false, null, 0, 12);
    if (strncmp($head, 'RIFF', 4) !== 0) {
        @unlink($wav);
        json_out(['ok' => false, 'error' => '只认 wav 录音'], 400);
    }

    $text = '';
    $engine = 'sapi';
    $bin = asr_whisper_bin();
    $model = asr_whisper_model();

    if ($bin !== null && $model !== null) {
        $engine = 'whisper';
        $base = $dir . '/a' . $stamp;
        $cmd = escapeshellarg($bin)
             . ' -m ' . escapeshellarg($model)
             . ' -f ' . escapeshellarg($wav)
             . ' -l zh -t 4 -nt -otxt -of ' . escapeshellarg($base)
             . ' 2>&1';
        run_cmd($cmd, 120);
        $txtFile = $base . '.txt';
        if (is_file($txtFile)) $text = (string)file_get_contents($txtFile);
        @unlink($txtFile);
    }

    if (trim($text) === '' && is_file(COHORT_ROOT . '/runtime/asr/CohortAsr.exe')) {
        $engine = 'sapi';
        $outFile = $dir . '/a' . $stamp . '.txt';
        $cmd = escapeshellarg(COHORT_ROOT . '/runtime/asr/CohortAsr.exe')
             . ' ' . escapeshellarg($wav) . ' ' . escapeshellarg($outFile) . ' 2>&1';
        run_cmd($cmd, 60);
        if (is_file($outFile)) $text = (string)file_get_contents($outFile);
        @unlink($outFile);
    }

    // 清理音频，别把磁盘塞满；只留最近 200 个
    $keep = glob($dir . '/*.wav');
    if ($keep && count($keep) > 200) {
        usort($keep, fn($a, $b) => filemtime($a) <=> filemtime($b));
        foreach (array_slice($keep, 0, count($keep) - 200) as $old) @unlink($old);
    }
    @unlink($wav);

    $text = trim(preg_replace('/\s+/u', ' ', (string)$text));
    $text = asr_to_simplified($text);
    json_out(['ok' => true, 'text' => $text, 'engine' => $engine]);
}

/** whisper 对中文默认吐繁体字；用一份字级映射表转回简体（表在 web/app/t2s.json） */
function asr_to_simplified(string $text): string {
    static $map = null;
    if ($text === '') return $text;
    if ($map === null) {
        $raw = @file_get_contents(WEB_DIR . '/app/t2s.json');
        $j = $raw ? json_decode($raw, true) : null;
        $map = is_array($j) ? $j : ['chars' => [], 'phrases' => []];
    }
    foreach ((array)($map['phrases'] ?? []) as $from => $to) {
        $text = str_replace($from, $to, $text);
    }
    $chars = (array)($map['chars'] ?? []);
    if (!$chars) return $text;
    $out = '';
    $len = mb_strlen($text, 'UTF-8');
    for ($i = 0; $i < $len; $i++) {
        $ch = mb_substr($text, $i, 1, 'UTF-8');
        $out .= $chars[$ch] ?? $ch;
    }
    return $out;
}


