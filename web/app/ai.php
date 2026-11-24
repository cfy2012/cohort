<?php
/**
 * Cohort · AI 网关
 * 本机 LM Studio（OpenAI 兼容接口，默认 127.0.0.1:1234）。
 * 学生端永不直连 1234，一律经这里中转：便于限流、审计、上下文隔离。
 */

function ai_base(): string { return rtrim(config()['ai']['base_url'], '/'); }

function http_json_request(string $method, string $url, ?array $payload = null, int $timeout = 10): array {
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json', 'Accept: application/json'];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_CONNECTTIMEOUT => min(5, $timeout),
        CURLOPT_TIMEOUT        => $timeout,
    ]);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    }
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($raw === false || $raw === '') {
        return ['ok' => false, 'error' => $err ?: '连接失败', 'code' => $code, 'data' => null];
    }
    $data = json_decode($raw, true);
    return ['ok' => $code >= 200 && $code < 300, 'error' => $data['error']['message'] ?? null, 'code' => $code, 'data' => $data, 'raw' => $raw];
}

/** 服务是否在线（同一次请求内缓存结果） */
function ai_models(): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    $r = http_json_request('GET', ai_base() . '/v1/models', null, 4);
    if (!$r['ok'] || !is_array($r['data']['data'] ?? null)) {
        $cache = ['ok' => false, 'models' => [], 'error' => $r['error'] ?? 'LM Studio 未响应'];
        return $cache;
    }
    $models = array_map(fn($m) => $m['id'] ?? '', $r['data']['data']);
    $cache = ['ok' => true, 'models' => array_values(array_filter($models))];
    return $cache;
}

function ai_model_name(): string {
    $cfg = config()['ai']['model'] ?? '';
    if ($cfg !== '') return $cfg;
    $m = ai_models();
    return $m['models'][0] ?? '';
}

/**
 * 一次对话补全。自动跳过加载失败的模型（LM Studio 里未下载完 / 显存放不下的模型很常见）。
 * @return array{ok:bool, content:string, error?:string, model?:string}
 */
function ai_chat(array $messages, array $opts = []): array {
    $cfg = config()['ai'];

    $candidates = [];
    if (!empty($opts['model'])) {
        $candidates[] = $opts['model'];
    } elseif (($cfg['model'] ?? '') !== '') {
        $candidates[] = $cfg['model'];
    }
    foreach (ai_models()['models'] as $m) {
        if (!in_array($m, $candidates, true)) $candidates[] = $m;
    }
    if (!$candidates) {
        return ['ok' => false, 'content' => '', 'error' => 'LM Studio 中没有已加载的模型'];
    }

    $tryCount = max(1, min(6, (int)($opts['try'] ?? 3)));
    $lastError = '未知错误';

    foreach (array_slice($candidates, 0, $tryCount) as $model) {
        $payload = [
            'model'       => $model,
            'messages'    => $messages,
            'temperature' => $opts['temperature'] ?? $cfg['temperature'],
            'max_tokens'  => $opts['max_tokens'] ?? $cfg['max_tokens'],
            'frequency_penalty' => 0.35,
            'presence_penalty'  => 0.3,
            'stream'      => false,
        ];
        $r = http_json_request('POST', ai_base() . '/v1/chat/completions', $payload, (int)($opts['timeout'] ?? $cfg['timeout']));
        if ($r['ok']) {
            $content = trim((string)($r['data']['choices'][0]['message']['content'] ?? ''));
            if ($content !== '') {
                return ['ok' => true, 'content' => ai_strip_self_talk(ai_trim_repeats(ai_plain_text($content)), (string)($opts['student_name'] ?? '')), 'model' => $model, 'usage' => $r['data']['usage'] ?? null];
            }
            // 推理型模型常把 token 花在思考过程上，正文为空 —— 换下一个模型再试
            $lastError = '模型返回了空内容（可能 token 预算被思考过程占满）';
            continue;
        }
        $lastError = $r['error'] ?? ('HTTP ' . $r['code']);
        $retriable = stripos($lastError, 'load model') !== false
                  || stripos($lastError, 'not found') !== false
                  || stripos($lastError, 'no models') !== false
                  || stripos($lastError, 'invalid model') !== false;
        // LM Studio 对「模型加载失败」常常只回 400 而带不出错误信息，所以 4xx 也换下一个试
        if ($r['code'] >= 400 && $r['code'] < 500 && $r['code'] != 401 && $r['code'] != 429) $retriable = true;
        if (!$retriable) break;
    }
    return ['ok' => false, 'content' => '', 'error' => $lastError];
}

/**
 * 把模型偶尔吐出的 LaTeX 拉回一行纯文字（\[ I=\frac{U}{R} \] → I=U/R）。
 * 前端也有一层同样的处理，这里再做一道，保证老师端/报表里看到的也是干净的。
 */
function ai_plain_text(string $s): string {
    // 没有反斜杠/美元号就不是 LaTeX：原样返回，别把 JSON 的花括号削掉（报表解析就靠它）
    if (strpos($s, '\\') === false && strpos($s, '$') === false) {
        return trim(preg_replace('/[ \t]{2,}/', ' ', $s));
    }
    $sym = [
        'times' => '×', 'cdot' => '·', 'div' => '÷', 'pm' => '±',
        'approx' => '≈', 'leq' => '≤', 'geq' => '≥', 'neq' => '≠',
        'Omega' => 'Ω', 'omega' => 'ω', 'rho' => 'ρ', 'mu' => 'μ',
        'pi' => 'π', 'theta' => 'θ', 'alpha' => 'α', 'beta' => 'β',
        'gamma' => 'γ', 'delta' => 'δ', 'Delta' => 'Δ', 'lambda' => 'λ',
        'degree' => '°', 'circ' => '°', 'rightarrow' => '→', 'to' => '→',
        'left' => '', 'right' => '', 'mathrm' => '', 'text' => '', 'quad' => ' ', 'qquad' => ' ',
    ];
    $s = preg_replace('/\$\$([\s\S]*?)\$\$/', '$1', $s);
    $s = preg_replace('/\\\\\[([\s\S]*?)\\\\\]/', '$1', $s);
    $s = preg_replace('/\\\\\(([\s\S]*?)\\\\\)/', '$1', $s);
    for ($i = 0; $i < 3; $i++) {
        $s = preg_replace_callback('/\\\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/', function ($m) {
            $wrap = fn($x) => (preg_match('/[+\-×·]/u', $x) && !preg_match('/^[0-9.]+$/', $x)) ? '(' . $x . ')' : $x;
            return $wrap(trim($m[1])) . '/' . $wrap(trim($m[2]));
        }, $s);
    }
    $s = preg_replace('/\\\\sqrt\s*\{([^{}]*)\}/', '√($1)', $s);
    $s = preg_replace_callback('/\\\\?([a-zA-Z]+)/', function ($m) use ($sym) {
        $n = $m[1];
        return array_key_exists($n, $sym) ? $sym[$n] : $m[0];
    }, $s);
    $s = preg_replace('/\\\\[a-zA-Z]+/', '', $s);
    $s = str_replace(['{', '}'], '', $s);
    return trim(preg_replace('/[ \t]{2,}/', ' ', $s));
}

/** 历史里去重：同一段问答重复喂给 3B 小模型，它就学会无脑复读 */
function ai_history_dedupe(array $messages): array {
    $out = []; $seen = [];
    foreach ($messages as $m) {
        if (($m['role'] ?? '') === 'system') { $out[] = $m; continue; }
        $k = ($m['role'] ?? '') . '|' . md5(mb_substr((string)($m['content'] ?? ''), 0, 200));
        if (isset($seen[$k])) continue;
        $seen[$k] = true;
        $out[] = $m;
    }
    return $out;
}

/** 小模型容易陷进「复读」：同一段话连刷好几遍。这里一旦发现整段重复就截断 */
function ai_trim_repeats(string $s): string {
    $lines = preg_split('/\r?\n/', $s);
    $seen = [];
    $out  = [];
    foreach ($lines as $ln) {
        if (preg_match('/^\s*(Human|Assistant|AI|H|A)\s*[:：]/u', $ln)) break;
        $key = trim($ln);
        if ($key !== '' && isset($seen[$key]) && mb_strlen($key) > 8) break;
        $seen[$key] = true;
        $out[] = $ln;
    }
    return trim(implode("\n", $out));
}

/**
 * 小模型爱「自问自答」：答完自己接一句「陈福尧：好的」「学生：明白了」。
 * 这里把这一类的假对白掐掉——只删「说话人：」开头的短句尾巴，不动正经内容。
 */
function ai_strip_self_talk(string $s, string $name = ''): string {
    if ($s === '') return $s;
    $labels = ['学生', '同学', '生', '我'];
    if ($name !== '') $labels[] = $name;
    $alt = implode('|', array_map(fn($x) => preg_quote($x, '/'), $labels));

    // 整行都是「某人：…」→ 丢掉该行（老师/家长不在此列，免得误删正常内容）
    $lines = preg_split('/\r?\n/', $s);
    $out = [];
    foreach ($lines as $ln) {
        if (preg_match('/^\s*(?:' . $alt . ')\s*[:：]/u', $ln) && mb_strlen(trim($ln)) <= 40) continue;
        $out[] = $ln;
    }
    $s = implode("\n", $out);

    // 紧跟在句子标点后面的同类片段，从那个标点往后整段截掉
    if (preg_match('/([。！？!?]|\.)\s*(?:' . $alt . ')\s*[:：]/u', $s, $m, PREG_OFFSET_CAPTURE)) {
        $punct = $m[1][0];
        $keep  = rtrim(substr($s, 0, $m[0][1])) . $punct;
        if (mb_strlen($keep) >= 4 && mb_strlen($keep) < mb_strlen($s)) $s = $keep;
    }
    return trim($s);
}

/** 历史里可能夹着旧的 "Human./AI:" 转写块，回答前先切掉，免得小模型照着复读 */function chat_history_clean(string $s): string {
    foreach (['Human', 'Assistant', 'AI', 'H:', 'A:'] as $mark) {
        $pos = mb_stripos($s, $mark);
        if ($pos !== false && $pos > 0) return trim(mb_substr($s, 0, $pos));
    }
    return trim($s);
}

/** 组装学生对话的系统提示词：只注入本课/本实验的上下文，绝不串台 */
function ai_system_prompt(?array $session, ?array $student, ?array $experiment): string {
    $cfg = config();
    $lines = [
        '你是一名中学课堂里的 AI 助教，服务于' . ($cfg['school'] ?: '学校') . '的课堂。',
        '你的回答对象是中学生，请用简洁、直白、口语化的中文，不要长篇大论，不要复述问题。',
        '优先给出可操作的做法、关键步骤和判断依据；涉及计算时把过程写清楚。',
        '如果学生问的内容与本节实验无关，先用一句话把话题拉回实验，再简单回答。',
        '禁止编造实验现象和数据；不确定时直接说"这点需要你亲手测一下"。',
        '输出用纯文本：不要用 Markdown 标记（#、**、反引号），更不要写 LaTeX（\frac、\[ \]、\rho 这类）。',
        '公式和代数式直接写成一行普通文字，例如 I = U/R、F浮 = ρgV排、1/f = 1/u + 1/v。',
    ];
    if ($session) {
        $lines[] = '本节课程：' . $session['title'] . '（班级：' . $session['class'] . '）';
        if (!empty($session['note'])) $lines[] = '教师备注：' . $session['note'];
    }
    if ($experiment) {
        $lines[] = '实验名称：' . $experiment['title'];
        if (!empty($experiment['summary'])) $lines[] = '实验目标：' . $experiment['summary'];
        if (!empty($experiment['objectives'])) $lines[] = '要点：' . implode('；', (array)$experiment['objectives']);
        if (!empty($experiment['equipment'])) $lines[] = '器材：' . implode('、', (array)$experiment['equipment']);
    }
    if ($student) {
        $lines[] = '当前学生：' . ($student['name'] ?? '') . '。只针对这名学生的问题作答，不要提及其他学生。';
        $lines[] = '你只写你自己说的话。不要替学生说话，不要编「' . ($student['name'] ?? '学生') . '：…」「学生：…」这类对白，也不要自问自答。';
    }
    if (!empty($cfg['ai']['system_extra'])) $lines[] = $cfg['ai']['system_extra'];
    return implode("\n", $lines);
}
