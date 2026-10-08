(function () {
  'use strict';
  var NK = window.NK;
  var h = NK.h;

  /* One renderer draws a page for both the player and the editor preview. */
  NK.renderStage = function (host, sc, idx, opts) {
    opts = opts || {};
    host.textContent = '';
    var r = NK.resolve(sc, idx);
    var p = r.page;
    var st = h('div', { class: 'stage', 'data-mode': p.mode });

    var bgUrl = NK.assetUrl(r.bg);
    var bgLayer = h('div', { class: 'layer' + (bgUrl ? '' : ' ph') });
    if (bgUrl) bgLayer.style.backgroundImage = 'url("' + bgUrl + '")';
    st.appendChild(bgLayer);

    if (p.mode === 'illust') {
      var ilUrl = NK.assetUrl(r.illust);
      var ilLayer = h('div', { class: 'layer' + (ilUrl ? '' : ' ph ph-ill') });
      if (ilUrl) ilLayer.style.backgroundImage = 'url("' + ilUrl + '")';
      st.appendChild(ilLayer);
      if (!ilUrl && opts.hints) st.appendChild(h('div', { class: 'hint' }, 'イラスト未設定'));
    } else {
      if (!bgUrl && opts.hints && !r.chars.length) st.appendChild(h('div', { class: 'hint' }, '背景なし'));
      r.chars.forEach(function (c) {
        var u = NK.spriteUrl(c.cid, c.eid);
        if (!u) return;
        var sp = h('div', { class: 'sprite', 'data-pos': c.pos });
        sp.style.backgroundImage = 'url("' + u + '")';
        st.appendChild(sp);
      });
    }

    var hasName = p.speaker.trim().length > 0;
    var hasText = p.text.trim().length > 0;
    if (hasName || hasText) {
      var msg = h('div', { class: 'msg' });
      if (hasName) msg.appendChild(h('div', { class: 'name' }, p.speaker.trim()));
      msg.appendChild(h('div', { class: 'body' }, p.text));
      if (opts.next) msg.appendChild(h('span', { class: 'next', 'aria-hidden': 'true' }, '▼'));
      st.appendChild(msg);
    }
    host.appendChild(st);
    return st;
  };

  /* ---------- full-screen player ---------- */
  var cur = null;

  function render() {
    var s = cur;
    s.stageHost.textContent = '';
    s.end.hidden = !s.ended;
    if (s.ended) {
      s.count.textContent = '';
      return;
    }
    NK.renderStage(s.stageHost, s.sc, s.idx, { next: true });
    NK.audio.setTrack(NK.resolve(s.sc, s.idx).bgm);
    s.count.textContent = s.idx + 1 + ' / ' + s.sc.pages.length;
    s.back.hidden = s.idx === 0;
  }

  function advance() {
    if (!cur || cur.ended) return;
    if (cur.idx < cur.sc.pages.length - 1) cur.idx++;
    else cur.ended = true;
    render();
  }

  function previous() {
    if (!cur) return;
    if (cur.ended) cur.ended = false;
    else if (cur.idx > 0) cur.idx--;
    render();
  }

  function onKey(e) {
    if (!cur) return;
    if (e.key === 'Escape') NK.player.close();
    else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      advance();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      previous();
    }
  }

  NK.player = {
    isOpen: function () {
      return !!cur;
    },
    start: function (scId, idx) {
      var sc = NK.findScenario(scId);
      if (!sc || !sc.pages.length) {
        NK.toast('再生できるページがありません');
        return;
      }
      if (cur) NK.player.close();
      var stageHost = h('div', { class: 'p-stage' });
      var count = h('span', { class: 'p-count' });
      var back = h('button', { class: 'p-btn', type: 'button', 'aria-label': '前のページ', onclick: function (e) { e.stopPropagation(); previous(); } }, '‹ 前');
      var exit = h('button', { class: 'p-btn', type: 'button', 'aria-label': '再生をやめる', onclick: function (e) { e.stopPropagation(); NK.player.close(); } }, '終了');
      var hasBgm = sc.pages.some(function (p) {
        return p.bgm && p.bgm !== 'keep';
      });
      var mute = h(
        'button',
        {
          class: 'p-btn',
          type: 'button',
          hidden: !hasBgm,
          'aria-label': '音のオン・オフ',
          onclick: function (e) {
            e.stopPropagation();
            NK.audio.setMuted(!NK.audio.isMuted());
            mute.textContent = NK.audio.isMuted() ? '♪ オフ' : '♪ オン';
          }
        },
        NK.audio.isMuted() ? '♪ オフ' : '♪ オン'
      );
      var again = h('button', { class: 'btn', type: 'button', onclick: function (e) { e.stopPropagation(); cur.idx = 0; cur.ended = false; render(); } }, 'もう一度読む');
      var done = h('button', { class: 'btn primary', type: 'button', onclick: function (e) { e.stopPropagation(); NK.player.close(); } }, '選択に戻る');
      var end = h('div', { class: 'p-end', hidden: true }, h('p', { class: 'p-end-title' }, 'おわり'), h('div', { class: 'p-end-act' }, again, done));
      var wrap = h('div', { class: 'p-wrap' }, stageHost, end, h('div', { class: 'p-top' }, exit, back, mute, count));
      var overlay = h('div', { id: 'player', role: 'dialog', 'aria-modal': 'true', 'aria-label': sc.title + ' を再生中' }, wrap);
      overlay.addEventListener('click', advance);
      document.body.appendChild(overlay);
      document.body.classList.add('playing');
      document.addEventListener('keydown', onKey);
      cur = { sc: sc, idx: Math.max(0, Math.min(idx || 0, sc.pages.length - 1)), ended: false, overlay: overlay, stageHost: stageHost, count: count, back: back, end: end };
      render();
    },
    close: function () {
      if (!cur) return;
      document.removeEventListener('keydown', onKey);
      NK.audio.stop();
      cur.overlay.remove();
      document.body.classList.remove('playing');
      cur = null;
    }
  };
})();
