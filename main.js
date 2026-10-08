(function () {
  'use strict';
  var NK = window.NK;
  var h = NK.h;
  var TABS = [
    ['play', 'あそぶ'],
    ['make', 'つくる'],
    ['chars', 'キャラ'],
    ['assets', '素材'],
    ['backup', '保存']
  ];

  NK.render = function () {
    var app = document.getElementById('app');
    var y = window.scrollY;
    NK.audio.stopPreview();
    app.textContent = '';
    app.appendChild(h('header', { class: 'top' }, h('h1', {}, 'ノベル工房'), h('span', { id: 'savestat', class: 'stat', role: 'status' }, NK.data.stat || '')));
    if (NK.store.isMemory()) {
      app.appendChild(h('div', { class: 'notice warn' }, 'この環境ではブラウザに保存できません。閉じると内容が消えるため、こまめに「保存」タブから書き出してください。'));
    }
    var view = NK.views[NK.ui.tab] || NK.views.play;
    app.appendChild(view());
    renderTabs();
    window.scrollTo(0, y);
  };

  function renderTabs() {
    var nav = document.getElementById('tabs');
    nav.textContent = '';
    var inner = h('div', { class: 'tabs-in' });
    TABS.forEach(function (t) {
      inner.appendChild(
        h(
          'button',
          {
            type: 'button',
            class: 'tab' + (NK.ui.tab === t[0] ? ' on' : ''),
            'aria-current': NK.ui.tab === t[0] ? 'page' : null,
            onclick: function () {
              if (NK.ui.tab === t[0]) {
                if (t[0] === 'make') NK.go({ scId: null, pageIdx: null, importing: false });
                if (t[0] === 'chars') NK.go({ charId: null });
                return;
              }
              NK.go({ tab: t[0] });
            }
          },
          t[1]
        )
      );
    });
    nav.appendChild(inner);
  }

  NK.go = function (patch) {
    Object.keys(patch).forEach(function (k) {
      NK.ui[k] = patch[k];
    });
    NK.render();
    window.scrollTo(0, 0);
  };

  /* ---------- sample content (first run only) ---------- */
  function drawImage(fn) {
    return new Promise(function (resolve) {
      var c = document.createElement('canvas');
      c.width = 540;
      c.height = 960;
      var g = c.getContext('2d');
      fn(g, 540, 960);
      c.toBlob(resolve, 'image/jpeg', 0.82);
    });
  }

  function vGrad(g, w, hh, top, bottom) {
    var gr = g.createLinearGradient(0, 0, 0, hh);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, hh);
  }

  var sampleDraws = {
    classroom: function (g, w, hh) {
      vGrad(g, w, hh, '#cfe3f0', '#f1e3c6');
      g.fillStyle = 'rgba(255,255,255,0.55)';
      [60, 290].forEach(function (x) {
        g.fillRect(x, 140, 190, 330);
      });
      g.strokeStyle = 'rgba(70,90,110,0.55)';
      g.lineWidth = 6;
      [60, 290].forEach(function (x) {
        g.strokeRect(x, 140, 190, 330);
        g.beginPath();
        g.moveTo(x + 95, 140);
        g.lineTo(x + 95, 470);
        g.moveTo(x, 305);
        g.lineTo(x + 190, 305);
        g.stroke();
      });
      g.fillStyle = '#b79b72';
      g.fillRect(0, 700, w, hh - 700);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(0, 700, w, 10);
    },
    yard: function (g, w, hh) {
      vGrad(g, w, hh * 0.62, '#9cc7e8', '#e3f1f7');
      g.fillStyle = '#7ea46a';
      g.fillRect(0, hh * 0.62, w, hh * 0.38);
      g.fillStyle = 'rgba(255,255,255,0.65)';
      g.beginPath();
      g.arc(140, 200, 55, 0, Math.PI * 2);
      g.arc(200, 215, 45, 0, Math.PI * 2);
      g.arc(100, 220, 40, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, hh * 0.62 + 90, w, 8);
    },
    wind: function (g, w, hh) {
      vGrad(g, w, hh, '#1c2540', '#7a4256');
      g.fillStyle = 'rgba(255,244,214,0.9)';
      g.beginPath();
      g.arc(390, 250, 90, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.14)';
      for (var i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(-40, 380 + i * 150);
        g.bezierCurveTo(160, 300 + i * 150, 330, 520 + i * 150, w + 40, 360 + i * 150);
        g.lineTo(w + 40, 410 + i * 150);
        g.bezierCurveTo(330, 570 + i * 150, 160, 350 + i * 150, -40, 430 + i * 150);
        g.closePath();
        g.fill();
      }
    }
  };

  async function sampleAsset(kind, name, draw) {
    try {
      var blob = await drawImage(draw);
      if (!blob) return null;
      var rec = { id: NK.uid(), kind: kind, name: name, type: 'image/jpeg', blob: blob, w: 540, h: 960 };
      await NK.store.assetPut(rec);
      rec.url = URL.createObjectURL(blob);
      NK.data.assets.set(rec.id, rec);
      return rec.id;
    } catch (e) {
      return null;
    }
  }

  async function seed() {
    var bg1 = await sampleAsset('bg', '朝の教室(サンプル)', sampleDraws.classroom);
    var bg2 = await sampleAsset('bg', '校庭(サンプル)', sampleDraws.yard);
    var il = await sampleAsset('illust', '風の中(サンプル)', sampleDraws.wind);
    var sc = NK.newScenario('【サンプル】朝の教室');
    function page(o) {
      return NK.fixPage(o);
    }
    sc.pages = [
      page({ bg: bg1, text: '今日はいつもより少し早く学校に着いた。\n教室にはまだ誰もいない。' }),
      page({ bg: bg2, text: '窓の外を見ると、校庭に一人の少女が立っていた。' }),
      page({ speaker: '少女', text: '「……おはよう」' }),
      page({ mode: 'illust', illust: il, text: 'ふいに風が吹き抜け、カーテンが大きく揺れた。' }),
      page({ mode: 'chara', bg: bg1, text: '気がつくと、彼女の姿はもうなかった。' })
    ];
    NK.data.project = { scenarios: [sc], characters: [] };
    await NK.store.kvSet('project', NK.data.project);
    await NK.store.kvSet('seeded', true);
  }

  /* ---------- boot ---------- */
  async function boot() {
    var app = document.getElementById('app');
    app.appendChild(h('p', { class: 'muted loading' }, '読み込み中…'));
    await NK.store.init();
    try {
      var saved = await NK.store.kvGet('project');
      var seeded = await NK.store.kvGet('seeded');
      NK.data.lastExport = (await NK.store.kvGet('lastExport')) || null;
      var recs = await NK.store.assetAll();
      recs.forEach(function (r) {
        r.url = URL.createObjectURL(r.blob);
        NK.data.assets.set(r.id, r);
      });
      if (saved) {
        NK.data.project = NK.normalize(saved);
      } else if (!seeded) {
        await seed();
      }
      try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      } catch (e) {
        /* optional */
      }
    } catch (e) {
      if (window.console) console.error(e);
    }
    NK.setStat(NK.store.isMemory() ? '未保存(この環境)' : '保存済み');
    NK.render();
  }

  boot();
})();
