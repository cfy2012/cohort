/* Cohort · 前端脚本（原生 JS，无框架） */
(function () {
  'use strict';

  async function api(path, body, method) {
    const opt = { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' } };
    if (body) opt.body = JSON.stringify(body);
    let res;
    try { res = await fetch(path, opt); }
    catch (e) { return { ok: false, error: '网络不通：' + e.message, code: 'NET' }; }
    let data = null;
    try { data = await res.json(); }
    catch (e) {
      data = {
        ok: false,
        code: res.status === 404 ? 'NO_ROUTE' : 'BAD_JSON',
        error: res.status === 404
          ? '接口不存在：' + path + '（HTTP 404）'
          : '返回格式异常（HTTP ' + res.status + '）'
      };
    }
    if (!res.ok && data && !data.error) data.error = 'HTTP ' + res.status;
    return data;
  }

  function toast(msg, kind) {
    let el = document.querySelector('.cohort-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'cohort-toast';
      Object.assign(el.style, {
        position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
        padding: '10px 18px', borderRadius: '10px', fontSize: '13.5px', zIndex: 9999,
        maxWidth: '80vw', boxShadow: '0 8px 24px rgba(0,0,0,.35)', transition: 'opacity .2s',
        background: '#1f232b', color: '#fff', border: '1px solid rgba(255,255,255,.12)'
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    if (kind === 'bad') el.style.background = '#3a1e1e';
    if (kind === 'ok') el.style.background = '#14352a';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2600);
  }

  // 暴露到全局：页面内联脚本直接写 api() / toast() 就能用
  window.api = api;
  window.toast = toast;
  window.cohortApi = api;
  window.cohortToast = toast;

  // --------- 教师端：开启 / 结束课程 ---------
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;

    if (action === 'start-session') {
      const courseId = t.dataset.course;
      if (!courseId) return toast('请选择课程', 'bad');
      t.disabled = true;
      const r = await api('/api/admin/session/start', { course_id: courseId });
      t.disabled = false;
      if (!r.ok) return toast(r.error || '开启失败', 'bad');
      toast('本节课程已开启：' + r.session.title, 'ok');
      setTimeout(() => location.reload(), 600);
    }

    if (action === 'stop-session') {
      if (!confirm('结束本次课程？学生将无法继续提问。')) return;
      t.disabled = true;
      const r = await api('/api/admin/session/stop', {});
      t.disabled = false;
      if (!r.ok) return toast(r.error || '操作失败', 'bad');
      toast('课程已结束', 'ok');
      setTimeout(() => location.reload(), 600);
    }

    if (action === 'build-report') {
      const sid = t.dataset.session;
      t.disabled = true;
      t.textContent = '正在生成…';
      const r = await api('/api/admin/report/build', { session_id: sid });
      t.disabled = false;
      t.textContent = '生成报表';
      if (!r.ok) return toast(r.error || '生成失败', 'bad');
      toast(r.report.mode === 'ai' ? '报表已生成（AI 归纳）' : '报表已生成（仅统计）', 'ok');
      setTimeout(() => location.href = '/admin/reports/' + r.report.session_id, 800);
    }

    if (action === 'import-students') {
      const ta = document.querySelector('#import-text');
      if (!ta || !ta.value.trim()) return toast('先粘贴名单', 'bad');
      const r = await api('/api/admin/students/import', { text: ta.value, mode: 'replace' });
      if (!r.ok) return toast(r.error || '导入失败', 'bad');
      toast('已导入 ' + r.count + ' 名学生', 'ok');
      setTimeout(() => location.reload(), 700);
    }

    if (action === 'save-settings') {
      const get = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
      const r = await api('/api/admin/settings', {
        site_title: get('cfg-site-title'),
        school: get('cfg-school'),
        class_name: get('cfg-class-name'),
        ai: {
          base_url: get('cfg-ai-url'),
          model: get('cfg-ai-model'),
          temperature: parseFloat(get('cfg-ai-temp') || '0.4'),
          max_tokens: parseInt(get('cfg-ai-tokens') || '700', 10),
          timeout: parseInt(get('cfg-ai-timeout') || '180', 10),
          system_extra: get('cfg-ai-extra')
        },
        chat: { context_messages: parseInt(get('cfg-ai-context') || '14', 10) }
      });
      if (!r.ok) return toast(r.error || '保存失败', 'bad');
      toast('已保存', 'ok');
    }

    if (action === 'test-ai') {
      const box = document.getElementById('ai-test-result');
      if (box) box.textContent = '测试中…';
      const r = await api('/api/ai/models', null, 'GET');
      if (box) {
        box.textContent = r.ok
          ? '连接成功，已加载模型：' + (r.models.join('、') || '（无）')
          : '连接失败：' + (r.error || '未知');
      }
    }
  });

  // --------- 学生端：聊天 ---------
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    const log = document.getElementById('chat-log');
    const input = chatForm.querySelector('textarea');
    const sendBtn = chatForm.querySelector('button');

    const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    /* 模型偶尔会写 LaTeX（\[ I=\frac{U}{R} \]）。浏览器里没有公式渲染，
       直接显示就成了天书，所以先把常见写法转成一行纯文字。 */
    const TEX_SYM = {
      times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓',
      approx: '≈', leq: '≤', geq: '≥', leqslant: '≤', geqslant: '≥', neq: '≠', equiv: '≡',
      Omega: 'Ω', omega: 'ω', rho: 'ρ', mu: 'μ', pi: 'π', theta: 'θ', alpha: 'α', beta: 'β',
      gamma: 'γ', delta: 'δ', Delta: 'Δ', lambda: 'λ', eta: 'η', sigma: 'σ', phi: 'φ',
      degree: '°', circ: '°',
      Rightarrow: '→', rightarrow: '→', leftarrow: '←', to: '→',
      left: '', right: '', mathrm: '', text: '', textbf: '', mathbf: '', mathit: '', displaystyle: '',
      quad: ' ', qquad: '  ', ldots: '…', dots: '…', cdots: '…'
    };
    function texToPlain(src) {
      let s = String(src);
      s = s.replace(/\$\$([\s\S]*?)\$\$/g, '$1')
           .replace(/\\\[([\s\S]*?)\\\]/g, '$1')
           .replace(/\\\(([\s\S]*?)\\\)/g, '$1')
           .replace(/\$([^$\n]+)\$/g, '$1');
      for (let i = 0; i < 3; i++) {
        s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (m, a, b) => {
          const wrap = (x) => (/[+\-×·]/.test(x) && !/^[0-9.]+$/.test(x) ? '(' + x + ')' : x);
          return wrap(a) + '/' + wrap(b);
        });
      }
      s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
      const sup = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻' };
      s = s.replace(/\^\{?([0-9+\-]+)\}?/g, (m, d) => d.split('').map((c) => sup[c] || c).join(''));
      const sub = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋' };
      s = s.replace(/_\{?([0-9+\-]+)\}?/g, (m, d) => d.split('').map((c) => sub[c] || c).join(''));
      s = s.replace(/\\([a-zA-Z]+)/g, (m, name) => (name in TEX_SYM ? TEX_SYM[name] : ''));
      s = s.replace(/[{}]/g, '');
      return s.replace(/[ \t]{2,}/g, ' ');
    }

    /* 极简 Markdown：代码块、行内代码、标题、加粗、斜体、列表、引用、链接。
       先整体转义再套标签，不会把内容当 HTML 执行。 */
    function mdToHtml(src) {
      let s = escHtml(texToPlain(src));
      const blocks = [];
      s = s.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, (m, code) => {
        blocks.push('<pre><code>' + code.replace(/\n$/,'') + '</code></pre>');
        return '\u0001' + (blocks.length - 1) + '\u0001';
      });
      const inls = [];
      s = s.replace(/`([^`\n]+)`/g, (m, code) => {
        inls.push('<code>' + code + '</code>');
        return '\u0002' + (inls.length - 1) + '\u0002';
      });

      const inline = (t) => t
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
                 '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
        .replace(/\u0002(\d+)\u0002/g, (m, i) => inls[+i]);

      const out = [];
      let list = null;
      const flush = () => {
        if (!list) return;
        out.push('<' + list.t + '>' + list.items.map((i) => '<li>' + i + '</li>').join('') + '</' + list.t + '>');
        list = null;
      };

      s.split(/\n/).forEach((raw) => {
        const l = raw.trim();
        const fence = l.match(/^\u0001(\d+)\u0001$/);
        if (fence) { flush(); out.push(blocks[+fence[1]]); return; }
        if (!l) { flush(); return; }
        if (/^#{1,6}\s+/.test(l)) { flush(); out.push('<div class="md-h">' + inline(l.replace(/^#{1,6}\s+/, '')) + '</div>'); return; }
        if (/^&gt;\s?/.test(l)) { flush(); out.push('<blockquote>' + inline(l.replace(/^&gt;\s?/, '')) + '</blockquote>'); return; }
        const ul = l.match(/^[-*•]\s+(.*)$/);
        if (ul) { if (!list || list.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(inline(ul[1])); return; }
        const ol = l.match(/^\d+[.)]\s+(.*)$/);
        if (ol) { if (!list || list.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(inline(ol[1])); return; }
        flush();
        out.push('<p>' + inline(l) + '</p>');
      });
      flush();
      return out.join('');
    }

    const copyText = (txt) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(txt).catch(() => fallbackCopy(txt));
      }
      fallbackCopy(txt);
    };
    const fallbackCopy = (txt) => {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove();
    };

    let quote = null;
    const chip = document.getElementById('quote-chip');
    const chipText = chip ? chip.querySelector('.q-text') : null;
    const setQuote = (text) => {
      quote = text;
      if (chip && chipText) {
        chip.hidden = !text;
        chipText.textContent = text ? text.replace(/\s+/g, ' ').slice(0, 90) : '';
      }
      input.focus();
    };
    if (chip) {
      const clr = chip.querySelector('.q-clear');
      if (clr) clr.addEventListener('click', () => setQuote(null));
    }

    const append = (role, text, who, opts) => {
      const o = opts || {};
      const div = document.createElement('div');
      div.className = 'msg ' + role + (role === 'sys' ? '' : ' md');
      div.dataset.raw = text;
      if (who) {
        const w = document.createElement('div');
        w.className = 'who';
        w.textContent = who;
        div.appendChild(w);
      }
      const body = document.createElement('div');
      body.className = 'msg-body';
      body.innerHTML = mdToHtml(text);
      div.appendChild(body);

      if (role !== 'sys') {
        const bar = document.createElement('div');
        bar.className = 'msg-actions';
        const bCopy = document.createElement('button');
        bCopy.type = 'button'; bCopy.textContent = '复制';
        bCopy.addEventListener('click', () => {
          copyText(div.dataset.raw || '');
          toast('已复制', 'ok');
        });
        const bQuote = document.createElement('button');
        bQuote.type = 'button'; bQuote.textContent = '引用';
        bQuote.addEventListener('click', () => {
          setQuote(div.dataset.raw || '');
          toast('已引用这条，接着问就行', 'ok');
        });
        bar.appendChild(bCopy); bar.appendChild(bQuote);
        div.appendChild(bar);
      }

      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
      return div;
    };

    const autoGrow = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    };
    input.addEventListener('input', autoGrow);

    const submit = async () => {
      const text = input.value.trim();
      if (!text) return;
      let outgoing = text;
      let shown = text;
      if (quote) {
        const q = quote.replace(/\s+\n/g, '\n');
        outgoing = '> ' + q.replace(/\n/g, '\n> ') + '\n\n' + text;
        shown = outgoing;
      }
      append('user', shown, '我');
      input.value = '';
      autoGrow();
      setQuote(null);
      sendBtn.disabled = true;
      const pending = append('sys', '正在思考…');
      pending.style.opacity = '0.6';

      const r = await api('/api/chat', { message: outgoing });
      pending.remove();
      sendBtn.disabled = false;
      if (!r.ok) {
        if (r.code === 'NO_SESSION' || r.code === 'SESSION_CLOSED') {
          append('sys', '教师还没有开启本节课程，稍后再试。');
        } else {
          append('sys', r.error || 'AI 暂时不可用');
        }
        return;
      }
      append('ai', r.reply, 'AI 助教');
    };

    chatForm.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });

    // 载入历史
    api('/api/chat/history', null, 'GET').then((r) => {
      if (!r || !r.ok) return;
      (r.messages || []).forEach((m) => {
        if (m.role === 'user') append('user', m.content, '我');
        else if (m.role === 'assistant') append('ai', m.content, 'AI 助教');
      });
      if ((r.messages || []).length === 0) {
        append('sys', '有问题随时问，AI 助教会结合本节实验内容回答。');
      }
    });
  }

  // --------- 教师端：实验提交 ---------
  const labSubs = document.getElementById('lab-subs');
  if (labSubs) {
    const ow = document.getElementById('lab-overwrite');
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    let openKey = '';

    function dataTable(it) {
      const cols = it.columns || [];
      const rows = it.rows || [];
      let h = '<table class="small"><thead><tr>';
      cols.forEach((c) => { h += '<th>' + esc(c) + '</th>'; });
      h += '</tr></thead><tbody>';
      rows.forEach((r) => {
        h += '<tr>';
        cols.forEach((_, i) => { h += '<td class="mono">' + esc(r[i]) + '</td>'; });
        h += '</tr>';
      });
      return h + '</tbody></table>';
    }

    function render(d) {
      const items = d.items || [];
      if (ow) ow.checked = !!d.overwrite;
      if (!items.length) {
        labSubs.innerHTML = '<div class="empty">还没有学生提交实验数据（每 6 秒自动刷新）</div>';
        return;
      }
      let h = '<table><thead><tr><th style="width:150px">学生</th><th>实验</th>' +
        '<th style="width:80px">条数</th><th style="width:90px">次数</th><th style="width:96px"></th></tr></thead><tbody>';
      const NAME = { lever: '杠杆平衡', lens: '凸透镜成像', circuit: '伏安法测电阻', buoyancy: '浮力大小' };
      items.forEach((it, i) => {
        const key = esc(it.no + '|' + it.experiment);
        h += '<tr>' +
          '<td><div style="font-weight:600">' + esc(it.name) + '</div><div class="small mono muted">' + esc(it.no) + '</div></td>' +
          '<td class="small">' + esc(NAME[it.experiment] || it.experiment) +
          '<div class="small mono dim">' + esc(it.experiment) + '</div></td>' +
          '<td class="mono">' + (+it.count || 0) + '</td>' +
          '<td class="mono small">' + (+it.times || 1) + ' 次</td>' +
          '<td><button class="btn btn-sm" type="button" style="white-space:nowrap" data-lab-toggle="' + key + '">数据</button></td>' +
          '</tr>' +
          '<tr data-lab-row="' + key + '" hidden><td colspan="5">' + dataTable(it) +
          '<div class="small muted" style="margin-top:6px">提交于 ' + esc(it.at) + '</div></td></tr>';
      });
      labSubs.innerHTML = h + '</tbody></table>';
    }

    async function load() {
      const r = await api('/api/admin/lab/submissions', null, 'GET');
      if (!r.ok) { labSubs.innerHTML = '<div class="empty">读取失败：' + esc(r.error || '') + '</div>'; return; }
      render(r);
    }

    labSubs.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-lab-toggle]');
      if (!b) return;
      const row = labSubs.querySelector('[data-lab-row="' + CSS.escape(b.dataset.labToggle) + '"]');
      if (!row) return;
      row.hidden = !row.hidden;
      b.textContent = row.hidden ? '数据' : '收起';
    });

    if (ow) {
      ow.addEventListener('change', async () => {
        const r = await api('/api/admin/lab/settings', { overwrite: ow.checked });
        if (!r.ok) { toast(r.error || '保存失败', 'bad'); ow.checked = !ow.checked; return; }
        toast(ow.checked ? '重复提交将自动覆盖' : '保留全部历史提交', 'ok');
        load();
      });
    }

    const refreshBtn = document.getElementById('lab-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', load);

    load();
    setInterval(() => { if (!document.hidden) load(); }, 6000);
  }
})();
