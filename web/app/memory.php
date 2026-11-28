<?php
/**
 * Cohort · 会话记忆（上下文压缩）
 * 借鉴 OpenClaw 的做法：长对话不整段塞进上下文，而是把旧内容压成滚动摘要（记忆），
 * 课堂结束后再把每个学生的会话「固化」一次，相当于睡眠期的记忆整理。
 */

function memory_path(string $sessionId, string $studentNo): string {
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $studentNo);
    return DATA_DIR . '/memory/' . $sessionId . '/' . $safe . '.json';
}

function memory_get(string $sessionId, string $studentNo): array {
    $m = json_read(memory_path($sessionId, $studentNo), []);
    return array_replace(['summary' => '', 'covered' => 0, 'updated_at' => null], is_array($m) ? $m : []);
}

function memory_save(string $sessionId, string $studentNo, array $data): void {
    json_atomic_write(memory_path($sessionId, $studentNo), $data);
}

/**
 * 把「已覆盖之后」的新对话压进摘要。
 * @return array{compacted:bool, summary:string, error?:string}
 */
function memory_compact(string $sessionId, string $studentNo, string $studentName, bool $force = false): array {
    $msgs = chat_messages($sessionId, $studentNo);
    $total = count($msgs);
    $mem = memory_get($sessionId, $studentNo);
    $covered = (int)$mem['covered'];

    // 触发条件：强制（课后整理），或 总条数超过 24 且新增超过 10 条
    $should = $force ? ($total > $covered + 2) : ($total >= 24 && ($total - $covered) >= 10);
    if (!$should) return ['compacted' => false, 'summary' => (string)$mem['summary']];

    $slice = array_slice($msgs, $covered);
    $text = '';
    foreach ($slice as $m) {
        $role = ($m['role'] ?? 'user') === 'user' ? '学生' : '助教';
        $text .= $role . '：' . mb_substr((string)($m['content'] ?? ''), 0, 200) . "\n";
    }
    if (mb_strlen($text) > 5000) $text = mb_substr($text, -5000);

    $prev = trim((string)$mem['summary']);
    $sys = '你在整理课堂对话的长期记忆。只输出 JSON，不要解释。';
    $user = ($prev !== '' ? "此前的记忆摘要：\n{$prev}\n\n" : '')
          . "学生【{$studentName}】之后的对话：\n{$text}\n\n"
          . '请合并成一份新的紧凑摘要（200 字以内），保留：主要问了什么、卡在哪、已经弄懂什么、有没有跑题。'
          . '输出格式：{"summary":"…"}';

    $r = ai_chat([
        ['role' => 'system', 'content' => $sys],
        ['role' => 'user',   'content' => $user],
    ], ['temperature' => 0.1, 'max_tokens' => 300]);

    if (!$r['ok']) return ['compacted' => false, 'summary' => $prev, 'error' => $r['error']];

    $new = extract_json_object($r['content']);
    $summary = is_array($new) && !empty($new['summary']) ? (string)$new['summary'] : trim($r['content']);
    $summary = mb_substr($summary, 0, 400);

    memory_save($sessionId, $studentNo, [
        'summary'    => $summary,
        'covered'    => $total,
        'updated_at' => now_iso(),
    ]);
    return ['compacted' => true, 'summary' => $summary];
}

/** 课堂结束后：把这节课所有人的会话固化一遍 */
function memory_compact_session(string $sessionId): array {
    $session = session_get($sessionId);
    if (!$session) return ['ok' => false, 'error' => '场次不存在'];
    $done = 0; $failed = 0;
    foreach (($session['attendees'] ?? []) as $no => $info) {
        $r = memory_compact($sessionId, (string)$no, (string)($info['name'] ?? ''), true);
        if (!empty($r['error'])) $failed++;
        elseif ($r['compacted']) $done++;
    }
    return ['ok' => true, 'compacted' => $done, 'failed' => $failed];
}
