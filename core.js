(function () {
  'use strict';
  var NK = (window.NK = window.NK || {});

  /* ---------- DOM helper ---------- */
  NK.h = function (tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    function add(kid) {
      if (kid === null || kid === undefined || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else if (kid instanceof Node) el.appendChild(kid);
      else el.appendChild(document.createTextNode(String(kid)));
    }
    for (var i = 2; i < arguments.length; i++) add(arguments[i]);
    return el;
  };

  NK.uid = function () {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  };

  /* ---------- state ---------- */
  NK.data = { project: { scenarios: [], characters: [], folders: [], folderOf: {} }, assets: new Map(), lastExport: null, stat: '' };
  NK.ui = { tab: 'play', scId: null, pageIdx: null, charId: null, pending: null, importing: false, scriptText: '', scriptResult: null, assetFlt: { q: '', f: 'all' } };
  NK.POS = ['L', 'C', 'R'];
  NK.POS_LABEL = { L: '左', C: '中央', R: '右' };

  /* ---------- page / scenario model ---------- */
  NK.newPage = function (prev) {
    return {
      id: NK.uid(),
      mode: prev ? prev.mode : 'illust',
      bg: 'keep',
      illust: 'keep',
      speaker: '',
      text: '',
      chars: 'keep',
      bgm: 'keep',
      se: null,
      fx: 'none'
    };
  };

  /* 'keep' = same characters as the previous page; an array = exactly these (max one per position). */
  NK.fixChars = function (c) {
    if (c === undefined || c === 'keep') return 'keep';
    if (!Array.isArray(c)) return 'keep';
    var seen = {};
    var out = [];
    c.forEach(function (x) {
      if (!x || NK.POS.indexOf(x.pos) < 0 || seen[x.pos] || !x.cid || !x.eid) return;
      seen[x.pos] = true;
      out.push({ pos: x.pos, cid: String(x.cid), eid: String(x.eid) });
    });
    return out;
  };

  NK.fixPage = function (p) {
    p = p || {};
    return {
      id: String(p.id || NK.uid()),
      mode: p.mode === 'illust' ? 'illust' : 'chara',
      bg: p.bg === undefined ? 'keep' : p.bg,
      illust: p.illust === undefined ? 'keep' : p.illust,
      speaker: String(p.speaker || ''),
      text: String(p.text || ''),
      chars: NK.fixChars(p.chars),
      bgm: p.bgm === undefined ? 'keep' : p.bgm,
      se: p.se === undefined ? null : p.se,
      fx: p.fx || 'none'
    };
  };

  NK.newScenario = function (title) {
    return { id: NK.uid(), title: title || '新しいシナリオ', pages: [NK.newPage(null)] };
  };

  NK.newCharacter = function (name) {
    return { id: NK.uid(), name: name || '新しいキャラ', expressions: [{ id: NK.uid(), name: '通常', asset: null }] };
  };

  NK.findChar = function (id) {
    var list = NK.data.project.characters;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  NK.findExpr = function (ch, eid) {
    if (!ch) return null;
    for (var i = 0; i < ch.expressions.length; i++) if (ch.expressions[i].id === eid) return ch.expressions[i];
    return null;
  };

  NK.normalize = function (project) {
    var out = { scenarios: [], characters: [], folders: [], folderOf: {} };
    var fl = project && Array.isArray(project.folders) ? project.folders : [];
    fl.forEach(function (f) {
      if (f && f.id) out.folders.push({ id: String(f.id), name: String(f.name || 'フォルダ').slice(0, 30) });
    });
    var fo = project && project.folderOf && typeof project.folderOf === 'object' ? project.folderOf : {};
    Object.keys(fo).forEach(function (k) {
      if (out.folders.some(function (f) { return f.id === fo[k]; })) out.folderOf[k] = fo[k];
    });
    var chars = project && Array.isArray(project.characters) ? project.characters : [];
    chars.forEach(function (c) {
      var ex = (Array.isArray(c.expressions) ? c.expressions : []).map(function (e) {
        return { id: String(e.id || NK.uid()), name: String(e.name || '表情'), asset: e.asset || null };
      });
      if (!ex.length) ex.push({ id: NK.uid(), name: '通常', asset: null });
      out.characters.push({ id: String(c.id || NK.uid()), name: String(c.name || '無名'), expressions: ex });
    });
    var list = project && Array.isArray(project.scenarios) ? project.scenarios : [];
    list.forEach(function (s) {
      var pages = (Array.isArray(s.pages) ? s.pages : []).map(NK.fixPage);
      if (!pages.length) pages.push(NK.newPage(null));
      out.scenarios.push({ id: String(s.id || NK.uid()), title: String(s.title || '無題'), pages: pages });
    });
    return out;
  };

  NK.findScenario = function (id) {
    var list = NK.data.project.scenarios;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  /* Pages carry only what changes; this walks 0..i and returns the effective state. */
  NK.resolve = function (sc, i) {
    var bg = null;
    var illust = null;
    var chars = [];
    var bgm = null;
    if (i < 0) return { bg: bg, illust: illust, chars: chars, bgm: bgm, page: null };
    var last = Math.min(i, sc.pages.length - 1);
    for (var k = 0; k <= last; k++) {
      var p = sc.pages[k];
      if (p.bg !== 'keep') bg = p.bg;
      if (p.illust !== 'keep') illust = p.illust;
      if (p.chars !== 'keep') chars = p.chars;
      if (p.bgm !== 'keep') bgm = p.bgm;
    }
    return { bg: bg, illust: illust, chars: chars, bgm: bgm, page: sc.pages[last] };
  };

  NK.spriteUrl = function (cid, eid) {
    var e = NK.findExpr(NK.findChar(cid), eid);
    return e && e.asset ? NK.assetUrl(e.asset) : null;
  };

  NK.assetUrl = function (id) {
    if (!id) return null;
    var a = NK.data.assets.get(id);
    return a ? a.url : null;
  };

  NK.assetName = function (id) {
    if (!id) return '';
    var a = NK.data.assets.get(id);
    return a ? a.name : '';
  };

  NK.countUsage = function (id) {
    var n = 0;
    NK.data.project.scenarios.forEach(function (sc) {
      sc.pages.forEach(function (p) {
        if (p.bg === id || p.illust === id || p.bgm === id) n++;
      });
    });
    NK.data.project.characters.forEach(function (c) {
      c.expressions.forEach(function (e) {
        if (e.asset === id) n++;
      });
    });
    return n;
  };


  /* ---------- organising assets: folders, usage, filters ---------- */
  NK.folders = function () {
    var p = NK.data.project;
    if (!Array.isArray(p.folders)) p.folders = [];
    if (!p.folderOf || typeof p.folderOf !== 'object') p.folderOf = {};
    return p.folders;
  };

  NK.folderOf = function (id) {
    var list = NK.folders();
    var f = NK.data.project.folderOf[id];
    return f && list.some(function (x) { return x.id === f; }) ? f : '';
  };

  NK.setFolder = function (id, fid) {
    NK.folders();
    if (fid) NK.data.project.folderOf[id] = fid;
    else delete NK.data.project.folderOf[id];
    NK.save();
  };

  NK.folderName = function (fid) {
    var list = NK.folders();
    for (var i = 0; i < list.length; i++) if (list[i].id === fid) return list[i].name;
    return '';
  };

  /* scenarios whose pages use this asset (sprites count through the characters on the pages) */
  NK.usedBy = function (id) {
    var out = [];
    NK.data.project.scenarios.forEach(function (sc) {
      var hit = sc.pages.some(function (p) {
        if (p.bg === id || p.illust === id || p.bgm === id) return true;
        if (Array.isArray(p.chars)) {
          return p.chars.some(function (c) {
            var e = NK.findExpr(NK.findChar(c.cid), c.eid);
            return e && e.asset === id;
          });
        }
        return false;
      });
      if (hit) out.push({ id: sc.id, title: sc.title });
    });
    return out;
  };

  NK.usageLabel = function (id) {
    var n = NK.countUsage(id);
    if (!n) return '未使用';
    var list = NK.usedBy(id);
    if (!list.length) return '使用中';
    var s = list.slice(0, 2).map(function (x) { return x.title; }).join('、');
    return list.length > 2 ? s + ' ほか' + (list.length - 2) : s;
  };

  /* newest first; images added before this feature have no date and come last */
  NK.listAssets = function (kind) {
    return Array.from(NK.data.assets.values())
      .filter(function (a) { return a.kind === kind; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  };

  NK.filterOptions = function () {
    var opts = [['all', 'すべて'], ['unused', '未使用だけ']];
    var fl = NK.folders();
    if (fl.length) opts.push(['nofd', 'フォルダなし']);
    fl.forEach(function (f) { opts.push(['fd:' + f.id, 'フォルダ: ' + f.name]); });
    NK.data.project.scenarios.forEach(function (s) { opts.push(['sc:' + s.id, 'シナリオ: ' + s.title]); });
    return opts;
  };

  NK.filterAssets = function (list, flt) {
    var q = String((flt && flt.q) || '').trim().toLowerCase();
    var f = (flt && flt.f) || 'all';
    return list.filter(function (a) {
      if (q && String(a.name).toLowerCase().indexOf(q) < 0) return false;
      if (f === 'unused') return NK.countUsage(a.id) === 0;
      if (f === 'nofd') return !NK.folderOf(a.id);
      if (f.slice(0, 3) === 'fd:') return NK.folderOf(a.id) === f.slice(3);
      if (f.slice(0, 3) === 'sc:') return NK.usedBy(a.id).some(function (s) { return s.id === f.slice(3); });
      return true;
    });
  };

  NK.renameAsset = async function (id, name) {
    var a = NK.data.assets.get(id);
    if (!a) return;
    a.name = String(name || '').trim().slice(0, 40) || '無題';
    await NK.store.assetPut(a);
  };

  /* ---------- status + toast + autosave ---------- */
  NK.setStat = function (text) {
    NK.data.stat = text;
    var el = document.getElementById('savestat');
    if (el) el.textContent = text;
  };

  var toastTimer = null;
  NK.toast = function (msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 2800);
  };

  var saveTimer = null;
  NK.save = function () {
    NK.setStat('保存中…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      NK.store
        .kvSet('project', NK.data.project)
        .then(function () {
          NK.setStat(NK.store.isMemory() ? '未保存(この環境)' : '保存済み');
        })
        .catch(function () {
          NK.setStat('保存できませんでした');
        });
    }, 400);
  };
})();
