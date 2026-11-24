/**
 * 语音输入：点一下说一句话，说完再点一下，自动转成文字填进输入框。
 * 走本地 ASR（老师机上跑的小模型），不联网、不上传云端。
 * 用法：<textarea data-voice></textarea>，脚本会在右上角挂一个「语音」按钮。
 */
(function () {
  var MAX_MS = 60000;   // 一句最长 60 秒，超了自动截断
  var busy = false;

  function style() {
    if (document.getElementById('cv-voice-style')) return;
    var s = document.createElement('style');
    s.id = 'cv-voice-style';
    s.textContent = [
      '.cv-voice-wrap{position:relative;display:block;flex:1 1 auto;min-width:0}',
      '.cv-voice-wrap>.cv-mic{position:absolute;right:6px;top:5px;z-index:3;',
      'font:11.5px/1.5 inherit;letter-spacing:.02em;padding:3px 7px;border-radius:3px;',
      'border:1px solid #d9d5c6;background:#fff;color:#4b4a41;cursor:pointer;',
      'box-shadow:0 1px 0 rgba(0,0,0,.04);user-select:none}',
      '.cv-voice-wrap>.cv-mic:hover{border-color:#16150f;color:#16150f}',
      '.cv-voice-wrap>.cv-mic.rec{border-color:#ad1f26;color:#ad1f26;background:#fdf3f3}',
      '.cv-voice-wrap>.cv-mic.rec::before{content:"";display:inline-block;width:6px;height:6px;',
      'border-radius:50%;background:#ad1f26;margin-right:5px;vertical-align:1px}',
      '.cv-voice-wrap>.cv-mic.wait{opacity:.6;cursor:default}',
      '.cv-voice-wrap>textarea,.cv-voice-wrap>input{padding-right:62px!important;width:100%;box-sizing:border-box}'
    ].join('');
    document.head.appendChild(s);
  }

  function fmt(ms) {
    var s = Math.floor(ms / 1000);
    return '0:' + (s < 10 ? '0' + s : s);
  }

  // 浮点 PCM → 16k 单声道 16bit WAV
  function toWav(chunks, rate) {
    var i, j;
    var len = 0;
    for (i = 0; i < chunks.length; i++) len += chunks[i].length;
    var flat = new Float32Array(len), off = 0;
    for (i = 0; i < chunks.length; i++) { flat.set(chunks[i], off); off += chunks[i].length; }

    var target = 16000, data = flat;
    if (rate !== target) {
      var ratio = rate / target, outLen = Math.floor(flat.length / ratio);
      data = new Float32Array(outLen);
      for (i = 0; i < outLen; i++) {
        var start = Math.floor(i * ratio);
        var end = Math.min(flat.length, Math.floor((i + 1) * ratio));
        var sum = 0, n = 0;
        for (j = start; j < end; j++) { sum += flat[j]; n++; }
        data[i] = n ? sum / n : (flat[Math.min(flat.length - 1, start)] || 0);
      }
    }

    var buffer = new ArrayBuffer(44 + data.length * 2);
    var view = new DataView(buffer);
    function str(pos, s) { for (var k = 0; k < s.length; k++) view.setUint8(pos + k, s.charCodeAt(k)); }
    str(0, 'RIFF'); view.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, target, true);
    view.setUint32(28, target * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, data.length * 2, true);
    var pos = 44;
    for (i = 0; i < data.length; i++, pos += 2) {
      var v = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(pos, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  function toastVoice(msg) {
    if (window.toast) { try { window.toast(msg, 'bad'); return; } catch (e) { } }
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:99;' +
      'background:#16150f;color:#fcfbf6;font:12px/1.6 inherit;padding:7px 14px;border-radius:3px;opacity:.94';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 2200);
  }

  function attach(el) {
    if (!el || el.dataset.voiceReady) return;
    el.dataset.voiceReady = '1';
    style();

    var wrap = document.createElement('span');
    wrap.className = 'cv-voice-wrap';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cv-mic';
    btn.textContent = '语音';
    btn.title = '点一下开始说，说完再点一下';
    wrap.appendChild(btn);

    var ctx = null, proc = null, src = null, stream = null, chunks = [], t0 = 0, timer = null;

    function releaseAudio() {
      if (timer) { clearInterval(timer); timer = null; }
      if (proc) { try { proc.disconnect(); } catch (e) { } proc = null; }
      if (src) { try { src.disconnect(); } catch (e) { } src = null; }
      if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { } stream = null; }
      if (ctx) { try { ctx.close(); } catch (e) { } ctx = null; }
    }

    function idle() {
      btn.className = 'cv-mic';
      btn.textContent = '语音';
    }

    function finish(dropped) {
      var rate = ctx ? ctx.sampleRate : 16000;
      var parts = chunks.slice();
      chunks = [];
      releaseAudio();
      idle();
      if (dropped || !parts.length) return;

      var blob = toWav(parts, rate);
      if (blob.size < 2000) { el.focus(); return; }
      btn.className = 'cv-mic wait';
      btn.textContent = '识别中…';
      var fd = new FormData();
      fd.append('audio', blob, 'voice.wav');
      fetch('/api/asr', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          idle();
          if (!d || !d.ok) { toastVoice((d && d.error) || '没听清，再说一次'); return; }
          var text = String(d.text || '').trim();
          if (!text) { toastVoice('没听清，再说一次'); return; }
          var cur = el.value || '';
          el.value = cur ? (cur.replace(/\s+$/, '') + ' ' + text) : text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.focus();
        })
        .catch(function () { idle(); toastVoice('语音识别没连上服务'); });
    }

    function start() {
      if (busy) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toastVoice('这个浏览器不支持录音，用 Edge 试试');
        return;
      }
      busy = true;
      chunks = [];
      navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      }).then(function (st) {
        stream = st;
        var AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        src = ctx.createMediaStreamSource(stream);
        proc = ctx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = function (e) {
          chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        src.connect(proc);
        proc.connect(ctx.destination);
        t0 = Date.now();
        btn.className = 'cv-mic rec';
        btn.textContent = '录音 0:00';
        timer = setInterval(function () {
          var ms = Date.now() - t0;
          if (btn.className.indexOf('rec') >= 0) btn.textContent = '录音 ' + fmt(ms);
          if (ms > MAX_MS) finish(false);
        }, 500);
        busy = false;
      }).catch(function () {
        busy = false;
        idle();
        toastVoice('没拿到麦克风权限');
      });
    }

    btn.addEventListener('click', function () {
      if (btn.className.indexOf('wait') >= 0) return;
      if (btn.className.indexOf('rec') >= 0) finish(false);
      else start();
    });

    // 说完了直接按回车发送，也先把录音收掉
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && btn.className.indexOf('rec') >= 0) finish(false);
    });
  }

  function boot() {
    document.querySelectorAll('[data-voice]').forEach(attach);
  }

  window.CohortVoice = { attach: attach, boot: boot };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
