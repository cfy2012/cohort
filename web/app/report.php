<?php
/**
 * Cohort · 课堂报表流水线
 * 逐生摘要（map）→ 班级汇总（reduce）→ data/reports/<session>.json
 * AI 不可用时降级为纯统计报表，保证页面永远有东西看。
 */

function report_compile(string $sessionId): array {
    $session = session_get($sessionId);
    if (!$session) throw new RuntimeException('场次不存在');
    $experiment = $session['experiment'] ? experiment_get($session['experiment']) : null;
    $attendees  = $session['attendees'] ?? [];

    $ai = ai_models();
    $aiOn = $ai['ok'];

    $perStudent = [];
    $totals = ['students' => count($attendees), 'active' => 0, 'messages' => 0, 'exchanges' => 0];
    $parsedSummaries = 0;

    foreach ($attendees as $no => $info) {
        $msgs = chat_messages($sessionId, (string)$no);
        $userMsgs = array_values(array_filter($msgs, fn($m) => ($m['role'] ?? '') === 'user'));
        $row = [
            'no'         => (string)$no,
            'name'       => $info['name'] ?? '',
            'ip'         => $info['ip'] ?? '',
            'messages'   => count($msgs),
            'questions'  => count($userMsgs),
            'first_at'   => $msgs[0]['at'] ?? null,
            'last_at'    => $msgs ? ($msgs[count($msgs) - 1]['at'] ?? null) : null,
            'summary'    => null,
        ];
        $totals['messages'] += count($msgs);
        $totals['exchanges'] += count($userMsgs);
        if (count($msgs) > 0) $totals['active']++;

        if ($aiOn && count($userMsgs) > 0) {
            $row['summary'] = report_summarize_student($session, $experiment, $info['name'] ?? '', $msgs);
            if (!empty($row['summary']['structured'])) $parsedSummaries++;
        }
        $perStudent[] = $row;
    }

    $classSummary = null;
    if ($aiOn && $parsedSummaries > 0) {
        $classSummary = report_summarize_class($session, $experiment, $perStudent, $totals);
    }

    $mode = ($aiOn && $parsedSummaries > 0) ? 'ai' : 'stats';
    $note = null;
    if (!$aiOn) {
        $note = '生成时 LM Studio 未响应，本报表仅包含统计数据';
    } elseif ($parsedSummaries === 0) {
        $note = 'AI 有响应，但没能输出结构化摘要（已保留原始摘要原文），可以点"立即生成报表"重试一次';
    }

    $report = [
        'session_id'   => $sessionId,
        'title'        => $session['title'],
        'class'        => $session['class'],
        'experiment'   => $session['experiment'],
        'started_at'   => $session['started_at'],
        'ended_at'     => $session['ended_at'],
        'generated_at' => now_iso(),
        'mode'         => $mode,
        'totals'       => $totals,
        'students'     => $perStudent,
        'class_summary'=> $classSummary,
        'ai_note'      => $note,
    ];
    json_atomic_write(report_path($sessionId), $report);
    return $report;
}

/** 单个学生的对话压缩成结构化摘要 */
function report_summarize_student(array $session, ?array $experiment, string $name, array $msgs): ?array {
    $transcript = '';
    foreach ($msgs as $m) {
        $role = ($m['role'] ?? 'user') === 'user' ? '学生' : '助教';
        $text = mb_substr((string)($m['content'] ?? ''), 0, 300);
        $transcript .= $role . '：' . $text . "\n";
    }
    if (mb_strlen($transcript) > 6000) $transcript = mb_substr($transcript, -6000);

    $sys = '你是一名教研员，负责把课堂对话整理成结构化记录。只输出一个 JSON 对象：不要解释，不要 Markdown，不要复述题目或指令原文。';
    $user = "以下是学生【{$name}】在《{$session['title']}》"
          . ($experiment ? "（实验：{$experiment['title']}）" : '')
          . "课堂上的全部对话记录：\n\n{$transcript}\n\n"
          . "严格按要求输出 JSON，第一个字符必须是 {，最后一个字符必须是 }：\n"
          . '{"main_questions":["…"],"stuck_points":["…"],"mastered":["…"],"off_topic":false,"engagement":3,"advice":"…"}';

    $r = ai_chat([
        ['role' => 'system', 'content' => $sys],
        ['role' => 'user',   'content' => $user],
    ], ['temperature' => 0.1, 'max_tokens' => 500]);
    if (!$r['ok']) return null;

    $json = extract_json_object($r['content']);
    if (is_array($json)) {
        $json['structured'] = true;
        return $json;
    }

    // 模型没按格式输出：保留原文，别让教师看到空白
    return [
        'structured' => false,
        'raw'        => mb_substr(trim($r['content']), 0, 600),
        'model'      => $r['model'] ?? '',
    ];
}

/** 全班汇总 */
function report_summarize_class(array $session, ?array $experiment, array $perStudent, array $totals): ?array {
    $digest = '';
    foreach ($perStudent as $s) {
        if (!$s['summary']) continue;
        $digest .= "- {$s['name']}（提问{$s['questions']}条）："
                 . '卡点=' . implode('/', (array)($s['summary']['stuck_points'] ?? []))
                 . '；参与度=' . ($s['summary']['engagement'] ?? '-')
                 . '；偏离=' . (!empty($s['summary']['off_topic']) ? '是' : '否') . "\n";
    }
    if ($digest === '') return null;

    $sys = '你是教研组长，负责汇总一节实验课的学情。只输出 JSON，不要解释文字。语言要具体，不要空话。';
    $user = "课程《{$session['title']}》，共 {$totals['students']} 人，实际提问 {$totals['active']} 人，总提问 {$totals['exchanges']} 条。\n"
          . "各生摘要：\n{$digest}\n"
          . "请输出严格 JSON：{\"common_misconceptions\":[最多3条，多人共同出现的错误认识],"
          . "\"knowledge_gaps\":[最多3条，全班普遍薄弱的知识点],"
          . "\"highlights\":[最多2条，值得表扬或值得讲评的亮点],"
          . "\"silent_students\":[全程几乎没提问的学生姓名，可为空],"
          . "\"next_step\":\"下一次课最该补的一件事\"}";

    $r = ai_chat([
        ['role' => 'system', 'content' => $sys],
        ['role' => 'user',   'content' => $user],
    ], ['temperature' => 0.2, 'max_tokens' => 600]);
    if (!$r['ok']) return null;
    return extract_json_object($r['content']);
}

/** 从模型输出里抠出 JSON（模型常带 ```json 包裹、前后废话，甚至把指令原样复述一遍） */
function extract_json_object(string $text): ?array {
    $text = trim($text);
    $cands = [];

    if (preg_match_all('/```(?:json)?\s*(\{.*?\})\s*```/s', $text, $mm)) {
        foreach ($mm[1] as $c) $cands[] = $c;
    }

    // 逐个扫出配平的花括号对象（小模型会把题目和答案拼在一起输出两份）
    $len = strlen($text);
    $i = 0;
    while ($i < $len) {
        $p = strpos($text, '{', $i);
        if ($p === false) break;
        $depth = 0; $inStr = false; $esc = false; $done = false;
        for ($j = $p; $j < $len; $j++) {
            $ch = $text[$j];
            if ($inStr) {
                if ($esc) $esc = false;
                elseif ($ch === '\\') $esc = true;
                elseif ($ch === '"') $inStr = false;
                continue;
            }
            if ($ch === '"') { $inStr = true; continue; }
            if ($ch === '{') $depth++;
            elseif ($ch === '}') {
                $depth--;
                if ($depth === 0) {
                    $cands[] = substr($text, $p, $j - $p + 1);
                    $i = $j + 1;
                    $done = true;
                    break;
                }
            }
        }
        if (!$done) break;
    }

    // 从后往前挑：模型通常先复述模板，真正填好内容的在后面
    foreach (array_reverse($cands) as $c) {
        $d = json_decode($c, true);
        if (is_array($d) && $d) return $d;
    }
    return null;
}
