<?php
/**
 * Cohort · 数据模型
 * 课程、学生、场次、实验目录。全部基于 JSON 文件。
 */

// 实验目录：experiments/<slug>/meta.json
function experiments_all(): array {
    $out = [];
    foreach (glob(EXP_DIR . '/*', GLOB_ONLYDIR) ?: [] as $dir) {
        $slug = basename($dir);
        $meta = json_read($dir . '/meta.json', []);
        $out[] = array_replace([
            'slug'     => $slug,
            'title'    => $slug,
            'subject'  => '',
            'grade'    => '',
            'summary'  => '',
            'equipment'=> [],
            'objectives'=> [],
            'order'    => 999,
            'builtin'  => is_file($dir . '/index.html'),
        ], $meta);
    }
    usort($out, fn($a, $b) => ($a['order'] ?? 999) <=> ($b['order'] ?? 999));
    return $out;
}

function experiment_get(string $slug): ?array {
    foreach (experiments_all() as $x) if ($x['slug'] === $slug) return $x;
    return null;
}

// 学生名单
function students_all(): array {
    return json_read(DATA_DIR . '/students.json', []);
}

function students_save(array $list): void {
    json_atomic_write(DATA_DIR . '/students.json', array_values($list));
}

/** 班级：data/classes.json，每个班记一份成员学号；同一个学号可以同时在多个班 */
function classes_path(): string { return DATA_DIR . '/classes.json'; }

function classes_all(): array {
    $list = json_read(classes_path(), null);
    if (is_array($list)) {
        usort($list, fn($a, $b) => strcmp((string)($a['name'] ?? ''), (string)($b['name'] ?? '')));
        return $list;
    }
    // 第一次：按老名单里的 class 字段自动建班
    $byName = [];
    foreach (students_all() as $s) {
        $cn = trim((string)($s['class'] ?? ''));
        if ($cn === '') continue;
        $byName[$cn][] = (string)$s['no'];
    }
    $list = [];
    foreach ($byName as $name => $m) {
        $list[] = ['id' => 'k' . substr(md5($name), 0, 6), 'name' => $name,
                   'members' => array_values(array_unique($m)), 'created_at' => now_iso()];
    }
    json_atomic_write(classes_path(), $list);
    usort($list, fn($a, $b) => strcmp($a['name'], $b['name']));
    return $list;
}

function classes_save(array $list): void {
    usort($list, fn($a, $b) => strcmp((string)($a['name'] ?? ''), (string)($b['name'] ?? '')));
    json_atomic_write(classes_path(), array_values($list));
}

function class_get(string $id): ?array {
    foreach (classes_all() as $c) if (($c['id'] ?? '') === $id) return $c;
    return null;
}

/** 某个学号在哪些班里 */
function classes_of_student(string $no): array {
    $out = [];
    foreach (classes_all() as $c) {
        if (in_array($no, array_map('strval', (array)($c['members'] ?? [])), true)) $out[] = $c['name'];
    }
    return $out;
}

/** 导入名单后：没建过班的 class 自动补建，并把新学号并进去 */
function classes_sync_from_roster(): void {
    $list = classes_all();
    $byName = [];
    foreach ($list as $i => $c) $byName[$c['name']] = $i;
    foreach (students_all() as $s) {
        $cn = trim((string)($s['class'] ?? ''));
        if ($cn === '') continue;
        if (!isset($byName[$cn])) {
            $list[] = ['id' => 'k' . substr(md5($cn), 0, 6), 'name' => $cn, 'members' => [], 'created_at' => now_iso()];
            $byName[$cn] = count($list) - 1;
        }
        $i = $byName[$cn];
        $members = array_map('strval', (array)$list[$i]['members']);
        if (!in_array((string)$s['no'], $members, true)) $members[] = (string)$s['no'];
        $list[$i]['members'] = $members;
    }
    classes_save($list);
}

function student_find(string $no): ?array {
    foreach (students_all() as $s) {
        if ((string)($s['no'] ?? '') === $no) return $s;
    }
    return null;
}

// 课程排表
function courses_all(): array {
    $c = json_read(DATA_DIR . '/courses.json', []);
    usort($c, fn($a, $b) => strcmp((string)($a['date'] ?? ''), (string)($b['date'] ?? '')) ?: ($a['order'] ?? 0) <=> ($b['order'] ?? 0));
    return $c;
}

function course_get(string $id): ?array {
    foreach (courses_all() as $c) if (($c['id'] ?? '') === $id) return $c;
    return null;
}

// 当前讲台状态：data/state.json
function state_get(): array {
    return json_read(DATA_DIR . '/state.json', ['current_session' => null]);
}

function state_set(array $patch): array {
    $s = state_get();
    $s = array_replace($s, $patch);
    json_atomic_write(DATA_DIR . '/state.json', $s);
    return $s;
}

// 场次（一次课）
function session_path(string $id): string { return DATA_DIR . '/sessions/' . $id . '.json'; }

function session_get(string $id): ?array {
    $s = json_read(session_path($id), null);
    return $s ?: null;
}

function session_current(): ?array {
    $id = state_get()['current_session'] ?? null;
    return $id ? session_get($id) : null;
}

function sessions_all(): array {
    $out = [];
    foreach (glob(DATA_DIR . '/sessions/*.json') ?: [] as $f) {
        $s = json_read($f, null);
        if ($s) $out[] = $s;
    }
    usort($out, fn($a, $b) => strcmp($b['started_at'] ?? '', $a['started_at'] ?? ''));
    return $out;
}

function lesson_begin(string $courseId): array {
    $course = course_get($courseId);
    if (!$course) throw new RuntimeException('课程不存在');
    $id = date('Ymd-Hi') . '-' . substr(bin2hex(random_bytes(4)), 0, 6);
    $s = [
        'id'         => $id,
        'course_id'  => $courseId,
        'title'      => $course['title'] ?? '',
        'class'      => $course['class'] ?? config()['class_name'],
        'experiment' => $course['experiment'] ?? '',
        'lab'        => $course['lab'] ?? '',
        'note'       => $course['note'] ?? '',
        'started_at' => now_iso(),
        'ended_at'   => null,
        'status'     => 'live',
        'attendees'  => [],
        'join_code'  => strtoupper(substr(bin2hex(random_bytes(3)), 0, 5)),
    ];
    json_atomic_write(session_path($id), $s);
    state_set(['current_session' => $id]);
    return $s;
}

function lesson_end(string $id): ?array {
    $s = session_get($id);
    if (!$s) return null;
    $s['status']  = 'ended';
    $s['ended_at'] = now_iso();
    json_atomic_write(session_path($id), $s);
    if ((state_get()['current_session'] ?? null) === $id) state_set(['current_session' => null]);
    return $s;
}

function session_touch_attendee(string $sessionId, string $no, string $name): void {
    json_update(session_path($sessionId), function ($s) use ($no, $name) {
        if (!$s) return $s;
        $s['attendees'][$no] = [
            'name'      => $name,
            'ip'        => client_ip(),
            'joined_at' => $s['attendees'][$no]['joined_at'] ?? now_iso(),
            'last_seen' => now_iso(),
        ];
        return $s;
    }, []);
}

function session_attendees(string $sessionId): array {
    $s = session_get($sessionId);
    return $s['attendees'] ?? [];
}

// 聊天记录：data/chats/<session>/<studentNo>.jsonl
function chat_path(string $sessionId, string $studentNo): string {
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $studentNo);
    return DATA_DIR . '/chats/' . $sessionId . '/' . $safe . '.jsonl';
}

function chat_messages(string $sessionId, string $studentNo): array {
    return jsonl_read(chat_path($sessionId, $studentNo));
}

// 报表
function report_path(string $sessionId): string { return DATA_DIR . '/reports/' . $sessionId . '.json'; }

// ---------- 局域网 IP 视图 ----------
/**
 * 把整段 /24 展开成网格：谁是讲台、谁是学生、谁在线、谁空着。
 * 在线判定=本节课内上报过的 last_seen 在 2 分钟内；ARP 表里出现过算"设备在网"。
 */
function network_snapshot(): array {
    $lan = lan_ip();
    $parts = explode('.', (string)$lan);
    $prefix = count($parts) >= 3 ? implode('.', array_slice($parts, 0, 3)) : '';

    $arp = [];
    $out = @shell_exec('arp -a 2>NUL');
    if (is_string($out)) {
        foreach (preg_split('/\r?\n/', $out) as $line) {
            if (preg_match('/(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F:\-]{11,})/', $line, $m)) {
                $arp[$m[1]] = strtoupper($m[2]);
            }
        }
    }

    $session = session_current();
    $attendees = $session['attendees'] ?? [];
    $byIp = [];
    $offGrid = [];
    foreach ($attendees as $no => $a) {
        $ip = (string)($a['ip'] ?? '');
        $seen = strtotime((string)($a['last_seen'] ?? '')) ?: 0;
        $row = [
            'no'     => (string)$no,
            'name'   => (string)($a['name'] ?? ''),
            'ip'     => $ip,
            'online' => (time() - $seen) < 120,
            'last_seen' => $a['last_seen'] ?? null,
        ];
        if ($prefix === '' || $ip === '' || strpos($ip, $prefix . '.') !== 0) {
            $offGrid[] = $row;   // 本机测试登录（127.0.0.1）或不在同一网段
            continue;
        }
        $byIp[$ip] = $row;
    }

    $hosts = [];
    for ($i = 1; $i <= 254; $i++) {
        $ip = $prefix !== '' ? $prefix . '.' . $i : '';
        if ($ip === '') break;
        $role = 'empty';
        $who  = null;
        if ($ip === $lan) { $role = 'teacher'; $who = '教师讲台'; }
        elseif (isset($byIp[$ip])) {
            $role = 'student';
            $who  = $byIp[$ip]['name'] . '（' . $byIp[$ip]['no'] . '）';
            if (!$byIp[$ip]['online']) $role = 'student-idle';
        } elseif (isset($arp[$ip])) {
            $role = 'device';
            $who  = $arp[$ip];
        }
        $hosts[] = ['ip' => $ip, 'seq' => $i, 'role' => $role, 'who' => $who];
    }

    // 有内容的格子排前面（讲台 → 学生 → 设备），其余空位按地址排
    usort($hosts, function ($a, $b) {
        $rank = ['teacher' => 0, 'student' => 1, 'student-idle' => 2, 'device' => 3, 'empty' => 4];
        $ra = $rank[$a['role']] ?? 9; $rb = $rank[$b['role']] ?? 9;
        return $ra === $rb ? $a['seq'] <=> $b['seq'] : $ra <=> $rb;
    });

    $counts = ['teacher' => 0, 'student' => 0, 'student-idle' => 0, 'device' => 0, 'empty' => 0];
    foreach ($hosts as $h) $counts[$h['role']]++;
    $counts['student_total'] = count($attendees);
    $counts['off_grid'] = count($offGrid);
    $counts['attendee_online'] = 0;
    foreach ($attendees as $a) {
        $seen = strtotime((string)($a['last_seen'] ?? '')) ?: 0;
        if ((time() - $seen) < 120) $counts['attendee_online']++;
    }

    return [
        'lan_ip'   => $lan,
        'prefix'   => $prefix,
        'hosts'    => $hosts,
        'off_grid' => $offGrid,
        'counts'   => $counts,
        'session'  => $session ? ['id' => $session['id'], 'title' => $session['title'], 'status' => $session['status']] : null,
        'scanned_at' => now_iso(),
    ];
}

