(function () {
  'use strict';
  var NK = window.NK;
  var h = NK.h;

  var KEYS = { 背景: 'bg', イラスト: 'illust', 立ち絵: 'chars', bgm: 'bgm', 話者: 'speaker', シナリオ: 'title', タイトル: 'title' };
  var NONE = /^(なし|無し|none)$/i;
  var STOP = /^(停止|なし|無し|stop|none)$/i;
  var POSMAP = { 左: 'L', 中央: 'C', 中: 'C', 右: 'R', l: 'L', c: 'C', r: 'R', left: 'L', center: 'C', right: 'R' };
  var DEFAULT_POS = { 1: ['C'], 2: ['L', 'R'], 3: ['L', 'C', 'R'] };

  function norm(s) {
    return String(s || '')
      .replace(/[　]/g, ' ')
      .trim()
      .toLowerCase();
  }

  /* exact name first, then a single partial match */
  function pickByName(list, name) {
    var n = norm(name);
    if (!n) return null;
    var i;
    for (i = 0; i < list.length; i++) if (norm(list[i].name) === n) return list[i];
    var hits = list.filter(function (x) {
      var m = norm(x.name);
      return m.indexOf(n) >= 0 || n.indexOf(m) >= 0;
    });
    return hits.length === 1 ? hits[0] : null;
  }

  function assetsOf(kind) {
    return Array.from(NK.data.assets.values()).filter(function (a) {
      return a.kind === kind;
    });
  }

  function parseChars(value, warn) {
    if (NONE.test(value.trim())) return [];
    var tokens = value
      .split(/[,、，]/)
      .map(function (t) {
        return t.trim();
      })
      .filter(Boolean);
    var found = [];
    tokens.forEach(function (tok) {
      var pos = null;
      var m = tok.match(/[@＠]\s*(左|中央|中|右|left|center|right|l|c|r)\s*$/i);
      if (m) {
        pos = POSMAP[m[1].toLowerCase()] || POSMAP[m[1]];
        tok = tok.slice(0, m.index).trim();
      }
      var exprName = null;
      var e = tok.match(/[(（]([^)）]*)[)）]\s*$/);
      if (e) {
        exprName = e[1].trim();
        tok = tok.slice(0, e.index).trim();
      }
      var ch = pickByName(NK.data.project.characters, tok);
      if (!ch) {
        warn('キャラ「' + tok + '」が登録されていません(表示しません)');
        return;
      }
      var ex = null;
      if (exprName) {
        ex = pickByName(
          ch.expressions.map(function (x) {
            return x;
          }),
          exprName
        );
        if (!ex) warn('「' + ch.name + '」に表情「' + exprName + '」がありません(' + ch.expressions[0].name + 'にしました)');
      }
      found.push({ cid: ch.id, eid: (ex || ch.expressions[0]).id, pos: pos });
    });
    if (found.length > 3) {
      warn('立ち絵は最大3人です(' + (found.length - 3) + '人分は表示しません)');
      found = found.slice(0, 3);
    }
    var used = {};
    found.forEach(function (f) {
      if (f.pos) {
        if (used[f.pos]) {
          warn('同じ位置に2人は置けません(' + NK.POS_LABEL[f.pos] + ')');
          f.pos = null;
        } else used[f.pos] = true;
      }
    });
    var anyExplicit = found.some(function (f) {
      return f.pos;
    });
    var table = !anyExplicit ? DEFAULT_POS[found.length] : null;
    var free = NK.POS.filter(function (p) {
      return !used[p];
    });
    found.forEach(function (f, i) {
      if (f.pos) return;
      if (table) f.pos = table[i];
      else f.pos = free.shift() || null;
    });
    return found
      .filter(function (f) {
        return f.pos;
      })
      .map(function (f) {
        return { pos: f.pos, cid: f.cid, eid: f.eid };
      });
  }

  NK.parseScript = function (text) {
    var warnings = [];
    var title = '';
    var pages = [];
    var lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter(function (l) {
        return !/^\s*```/.test(l);
      });

    var SEP = /^\s*(-{3,}|={3,}|【ページ[^】]*】|\[ページ[^\]]*\])\s*$/;
    var hasSep = lines.some(function (l) {
      return SEP.test(l);
    });

    function dirMatch(raw) {
      var line = raw.replace(/\*\*/g, '').replace(/：/g, ':');
      var br = line.match(/^\s*[\[［]\s*([^\]］:]+?)\s*:\s*(.*?)\s*[\]］]\s*$/);
      if (br) line = br[1] + ': ' + br[2];
      var m = line.match(/^\s*(?:[-・*•]\s+)?(背景|イラスト|立ち絵|BGM|話者|シナリオ|タイトル)\s*:\s*(.*?)\s*$/i);
      if (!m) return null;
      var key = KEYS[m[1]] || KEYS[m[1].toLowerCase()];
      return key ? { key: key, value: m[2] } : null;
    }

    /* A directive after body text starts a new page. Without separator lines
       (Markdown turns "---" into a rule and copying drops it), a blank line
       after body text also ends the page. */
    var blocks = [];
    var cur = { d: {}, body: [] };
    function flush() {
      var body = cur.body.slice();
      while (body.length && !body[0].trim()) body.shift();
      while (body.length && !body[body.length - 1].trim()) body.pop();
      blocks.push({ d: cur.d, text: body.join('\n') });
      cur = { d: {}, body: [] };
    }
    lines.forEach(function (raw) {
      if (SEP.test(raw)) {
        flush();
        return;
      }
      var dm = dirMatch(raw);
      if (dm) {
        if (cur.body.length) flush();
        cur.d[dm.key] = dm.value;
        return;
      }
      if (!raw.trim()) {
        if (!cur.body.length) return;
        if (!hasSep) flush();
        else cur.body.push(raw);
        return;
      }
      cur.body.push(raw.replace(/\*\*/g, ''));
    });
    flush();

    var bgs = assetsOf('bg');
    var ills = assetsOf('illust');
    var bgms = assetsOf('bgm');

    blocks.forEach(function (blk) {
      var d = blk.d;
      var textBody = blk.text;

      if (d.title && !title) title = d.title;
      var hasDirective = ['bg', 'illust', 'chars', 'bgm', 'speaker'].some(function (k) {
        return d[k] !== undefined;
      });
      if (!textBody && !hasDirective) return;

      var no = pages.length + 1;
      function warn(msg) {
        warnings.push(no + 'ページ目: ' + msg);
      }
      var page = { mode: 'chara', bg: 'keep', illust: 'keep', chars: 'keep', bgm: 'keep', speaker: '', text: textBody };

      if (d.bg !== undefined) {
        if (NONE.test(d.bg)) page.bg = null;
        else {
          var a = pickByName(bgs, d.bg);
          if (a) page.bg = a.id;
          else warn('背景「' + d.bg + '」が登録されていません(前のページを引き継ぎます)');
        }
      }
      if (d.illust !== undefined && !NONE.test(d.illust)) {
        page.mode = 'illust';
        var il = pickByName(ills, d.illust);
        if (il) page.illust = il.id;
        else warn('イラスト「' + d.illust + '」が登録されていません');
      }
      if (d.chars !== undefined) {
        if (page.mode === 'illust') warn('イラストのページでは立ち絵は表示されません');
        else {
          var cs = parseChars(d.chars, warn);
          if (cs.length || NONE.test(d.chars.trim())) page.chars = cs;
        }
      }
      if (d.bgm !== undefined) {
        if (STOP.test(d.bgm.trim())) page.bgm = null;
        else {
          var b = pickByName(bgms, d.bgm);
          if (b) page.bgm = b.id;
          else warn('BGM「' + d.bgm + '」が登録されていません(前のページを引き継ぎます)');
        }
      }
      if (d.speaker !== undefined && !NONE.test(d.speaker.trim())) page.speaker = d.speaker;
      pages.push(NK.fixPage(page));
    });

    return { title: title, pages: pages, warnings: warnings };
  };

  /* ---------- the instruction text to hand to Grok ---------- */
  NK.buildAiPrompt = function () {
    function names(list) {
      return list.length
        ? list
            .map(function (x) {
              return x.name;
            })
            .join('、')
        : '(まだ登録がありません。使いません)';
    }
    var chars = NK.data.project.characters.length
      ? NK.data.project.characters
          .map(function (c) {
            return c.name + '(表情: ' + c.expressions.map(function (e) { return e.name; }).join('/') + ')';
          })
          .join('、')
      : '(まだ登録がありません。使いません)';
    return [
      'あなたはノベルゲームのシナリオ作家です。次のルールで、台本を書いてください。',
      '',
      '【書式】',
      '・ページは、「【ページ】」とだけ書いた行で区切ります。',
      '・各ページの先頭に、必要な行だけ書きます。書かない項目は、前のページのまま引き継がれます。',
      '    背景: 名前',
      '    立ち絵: キャラ名(表情)@位置, キャラ名(表情)@位置',
      '    イラスト: 名前',
      '    BGM: 名前   (止めるときは「BGM: 停止」)',
      '    話者: 名前',
      '・立ち絵の位置は 左・中央・右 のどれか。最大3人。立ち絵を消すときは「立ち絵: なし」。',
      '・「イラスト:」を書いたページは、1枚絵を全画面で見せます(戦闘など)。立ち絵は出ません。',
      '・その次の行から本文を書きます。1ページは2〜4行ほど。セリフは「」で書きます。',
      '・最初のページの先頭に「シナリオ: タイトル」を書きます。',
      '・全体を、1つのコードブロック(```で囲んだ中)に入れて出力してください。太字や見出しは使いません。',
      '',
      '【使える名前(この中からだけ選ぶ)】',
      '背景: ' + names(assetsOf('bg')),
      'イラスト: ' + names(assetsOf('illust')),
      'キャラ: ' + chars,
      'BGM: ' + names(assetsOf('bgm')),
      '',
      '【例】',
      'シナリオ: 朝の教室',
      '背景: ' + (assetsOf('bg')[0] ? assetsOf('bg')[0].name : '教室'),
      '',
      '今日はいつもより少し早く学校に着いた。',
      '教室にはまだ誰もいない。',
      '【ページ】',
      '話者: 少女',
      '「……おはよう」',
      '',
      '【書いてほしい内容】',
      '(ここに、物語のあらすじや条件を書く)'
    ].join('\n');
  };

})();
