(function () {
  'use strict';
  var NK = window.NK;
  var h = NK.h;
  var views = (NK.views = {});

  /* ---------- small helpers ---------- */
  function guard(fn) {
    function fail(e) {
      if (window.console) console.error(e);
      NK.toast('うまくいきませんでした。もう一度試してください');
    }
    return function () {
      try {
        return Promise.resolve(fn.apply(null, arguments)).catch(fail);
      } catch (e) {
        fail(e);
        return Promise.resolve();
      }
    };
  }

  function confirmButton(label, armedLabel, onConfirm, cls) {
    var armed = false;
    var timer = null;
    var b = h('button', { class: 'btn ' + (cls || 'danger-outline'), type: 'button' }, label);
    b.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        b.textContent = armedLabel;
        b.classList.add('danger');
        timer = setTimeout(function () {
          armed = false;
          b.textContent = label;
          b.classList.remove('danger');
        }, 4000);
      } else {
        clearTimeout(timer);
        onConfirm();
      }
    });
    return b;
  }

  function excerpt(p) {
    var t = p.text.replace(/\s+/g, ' ').trim();
    if (!t && !p.speaker.trim()) return '(文章なし)';
    var s = (p.speaker.trim() ? p.speaker.trim() + ':' : '') + t;
    return s.length > 42 ? s.slice(0, 42) + '…' : s;
  }

  /* The real file input sits on top of the button (transparent), so a tap lands on it directly. */
  function fileLabel(text, multiple, onFiles, cls, accept) {
    var input = h('input', { type: 'file', class: 'file-over', multiple: multiple ? true : null, 'aria-label': text });
    if (accept !== '') input.setAttribute('accept', accept || 'image/*');
    function take() {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (files.length) onFiles(files);
    }
    input.addEventListener('change', take);
    input.addEventListener('input', take);
    return h('span', { class: 'btn file ' + (cls || '') }, h('span', { 'aria-hidden': 'true' }, text), input);
  }

  /* Fallback when the file chooser is unavailable: paste or drop an image here. */
  function imagesFrom(dt) {
    var out = [];
    if (!dt) return out;
    var i;
    if (dt.files && dt.files.length) {
      for (i = 0; i < dt.files.length; i++) if (/^image\//.test(dt.files[i].type)) out.push(dt.files[i]);
    }
    if (!out.length && dt.items) {
      for (i = 0; i < dt.items.length; i++) {
        if (dt.items[i].kind === 'file') {
          var f = dt.items[i].getAsFile();
          if (f && /^image\//.test(f.type)) out.push(f);
        }
      }
    }
    return out;
  }

  function pasteZone(onFiles) {
    var z = h(
      'div',
      { class: 'paste-zone', contenteditable: 'true', role: 'textbox', inputmode: 'none', spellcheck: 'false', 'aria-label': '画像を貼り付けて追加' },
      '画像の追加:写真をコピー → ここを長押し →「ペースト」'
    );
    function handle(e, dt) {
      e.preventDefault();
      var files = imagesFrom(dt);
      if (files.length) onFiles(files);
      else NK.toast('画像が見つかりませんでした');
    }
    z.addEventListener('paste', function (e) {
      handle(e, e.clipboardData);
    });
    z.addEventListener('drop', function (e) {
      handle(e, e.dataTransfer);
    });
    z.addEventListener('dragover', function (e) {
      e.preventDefault();
    });
    z.addEventListener('beforeinput', function (e) {
      e.preventDefault();
    });
    z.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) e.preventDefault();
    });
    return z;
  }

  /* ---------- asset picker (bottom sheet) ---------- */
  function openPicker(opts) {
    var back = h('div', { class: 'sheet-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title });
    function close() {
      back.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', function (e) {
      if (e.target === back) close();
    });

    function tile(label, val, url, emptyText) {
      return h(
        'button',
        {
          class: 'tile' + (opts.current === val ? ' sel' : ''),
          type: 'button',
          onclick: function () {
            opts.onPick(val);
            close();
          }
        },
        h('span', { class: 'tile-img' + (url ? '' : ' empty') + (opts.kind === 'sprite' ? ' contain' : ''), style: url ? 'background-image:url("' + url + '")' : null }, url ? null : emptyText),
        h('span', { class: 'tile-name' }, label)
      );
    }

    var grid = h('div', { class: 'grid' });
    if (opts.allowKeep) grid.appendChild(tile('引き継ぎ', 'keep', null, '前と同じ'));
    grid.appendChild(tile('なし', null, null, 'なし'));
    Array.from(NK.data.assets.values())
      .filter(function (a) {
        return a.kind === opts.kind;
      })
      .forEach(function (a) {
        grid.appendChild(tile(a.name, a.id, a.url));
      });

    var status = h('p', { class: 'muted small', role: 'status' });
    var upload = guard(async function (files) {
      status.textContent = '画像を縮小して保存しています…';
      var rec = await NK.addAsset(opts.kind, files[0]);
      opts.onPick(rec.id);
      close();
    });
    var add = fileLabel('ファイルから追加', false, upload);
    var sheet = h(
      'div',
      { class: 'sheet' },
      h('h2', { class: 'sheet-title' }, opts.title),
      grid,
      h('div', { class: 'btn-row sheet-act' }, add, h('button', { class: 'btn', type: 'button', onclick: close }, '閉じる')),
      pasteZone(upload),
      status
    );
    back.appendChild(sheet);
    document.body.appendChild(back);
  }

  /* ---------- BGM on a page ---------- */
  function openBgmPicker(opts) {
    var back = h('div', { class: 'sheet-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'BGMを選ぶ' });
    function close() {
      NK.audio.stopPreview();
      back.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', function (e) {
      if (e.target === back) close();
    });
    function row(label, sub, val, id) {
      var main = h(
        'button',
        {
          class: 'pick-main' + (opts.current === val ? ' sel' : ''),
          type: 'button',
          onclick: function () {
            opts.onPick(val);
            close();
          }
        },
        h('span', { class: 'track-name' }, label),
        h('span', { class: 'muted small' }, sub)
      );
      var kids = [main];
      if (id) {
        var play = h('button', { class: 'btn small-btn', type: 'button', 'aria-label': label + 'を試聴' }, '▶');
        play.addEventListener('click', function () {
          play.textContent = NK.audio.previewToggle(id) ? '■' : '▶';
        });
        kids.push(play);
      }
      return h('div', { class: 'pick-row' }, kids);
    }
    var sheet = h('div', { class: 'sheet' }, h('h2', { class: 'sheet-title' }, 'BGMを選ぶ'));
    var list = h('div', { class: 'list' });
    list.appendChild(row('引き継ぎ', '前のページの曲を流し続けます', 'keep'));
    list.appendChild(row('停止', 'ここでBGMを止めます', null));
    Array.from(NK.data.assets.values())
      .filter(function (a) {
        return a.kind === 'bgm';
      })
      .forEach(function (a) {
        list.appendChild(row(a.name, fmtSize(a.blob.size), a.id, a.id));
      });
    sheet.appendChild(list);
    if (!Array.from(NK.data.assets.values()).some(function (a) { return a.kind === 'bgm'; })) {
      sheet.appendChild(h('p', { class: 'muted small' }, 'BGMは「素材」タブで追加します。'));
    }
    sheet.appendChild(h('div', { class: 'btn-row sheet-act' }, h('button', { class: 'btn', type: 'button', onclick: close }, '閉じる')));
    back.appendChild(sheet);
    document.body.appendChild(back);
  }

  function bgmField(sc, idx, p) {
    var inherited = NK.resolve(sc, idx - 1).bgm;
    var text;
    if (p.bgm === 'keep') text = '引き継ぎ(' + (NK.assetName(inherited) || '停止中') + ')';
    else if (p.bgm === null) text = '停止';
    else text = NK.assetName(p.bgm) || '削除済み';
    return h(
      'div',
      { class: 'field' },
      h('span', { class: 'lbl' }, 'BGM'),
      h(
        'button',
        {
          class: 'field-btn',
          type: 'button',
          onclick: function () {
            openBgmPicker({
              current: p.bgm,
              onPick: function (val) {
                p.bgm = val;
                NK.save();
                NK.render();
              }
            });
          }
        },
        h('span', { class: 'pos-tag' }, '♪'),
        h('span', { class: 'field-val' }, text),
        h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')
      ),
      h('span', { class: 'muted small' }, '再生中は、このページからBGMが切り替わります。プレビューでは鳴りません。「再生」で確認できます。')
    );
  }

  /* ---------- characters on a page ---------- */
  function purgeRefs(cid, eid) {
    NK.data.project.scenarios.forEach(function (sc) {
      sc.pages.forEach(function (p) {
        if (p.chars === 'keep') return;
        p.chars = p.chars.filter(function (c) {
          return !(c.cid === cid && (!eid || c.eid === eid));
        });
      });
    });
  }

  function slotOf(list, pos) {
    for (var i = 0; i < list.length; i++) if (list[i].pos === pos) return list[i];
    return null;
  }

  function charText(c) {
    var ch = NK.findChar(c.cid);
    var ex = NK.findExpr(ch, c.eid);
    return ch ? ch.name + ' / ' + (ex ? ex.name : '?') : '削除済み';
  }

  function openCharPicker(opts) {
    var back = h('div', { class: 'sheet-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title });
    function close() {
      back.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', function (e) {
      if (e.target === back) close();
    });
    function pick(cid, eid) {
      opts.onPick(cid, eid);
      close();
    }
    var sheet = h('div', { class: 'sheet' }, h('h2', { class: 'sheet-title' }, opts.title));
    sheet.appendChild(
      h('div', { class: 'grid' }, h('button', { class: 'tile' + (!opts.current ? ' sel' : ''), type: 'button', onclick: function () { pick(null, null); } }, h('span', { class: 'tile-img empty' }, 'なし'), h('span', { class: 'tile-name' }, 'なし')))
    );
    NK.data.project.characters.forEach(function (ch) {
      sheet.appendChild(h('h3', { class: 'sec-title sheet-sub' }, ch.name));
      var grid = h('div', { class: 'grid' });
      ch.expressions.forEach(function (ex) {
        var u = ex.asset ? NK.assetUrl(ex.asset) : null;
        var sel = opts.current && opts.current.cid === ch.id && opts.current.eid === ex.id;
        grid.appendChild(
          h(
            'button',
            { class: 'tile' + (sel ? ' sel' : ''), type: 'button', onclick: function () { pick(ch.id, ex.id); } },
            h('span', { class: 'tile-img contain' + (u ? '' : ' empty'), style: u ? 'background-image:url("' + u + '")' : null }, u ? null : '画像なし'),
            h('span', { class: 'tile-name' }, ex.name)
          )
        );
      });
      sheet.appendChild(grid);
    });
    sheet.appendChild(h('div', { class: 'btn-row sheet-act' }, h('button', { class: 'btn', type: 'button', onclick: close }, '閉じる')));
    back.appendChild(sheet);
    document.body.appendChild(back);
  }

  function charsField(sc, idx, p) {
    var wrap = h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'キャラクター(最大3人)'));
    if (!NK.data.project.characters.length) {
      wrap.appendChild(
        h(
          'div',
          { class: 'notice' },
          h('p', { class: 'muted' }, 'キャラクターがまだ登録されていません。'),
          h('button', { class: 'btn primary', type: 'button', onclick: function () { NK.go({ tab: 'chars', charId: null }); } }, 'キャラを登録する')
        )
      );
      return wrap;
    }
    var inherited = NK.resolve(sc, idx - 1).chars;
    var keep = p.chars === 'keep';
    function setKeep(k) {
      if (k === keep) return;
      p.chars = k
        ? 'keep'
        : inherited.map(function (c) {
            return { pos: c.pos, cid: c.cid, eid: c.eid };
          });
      NK.save();
      NK.render();
    }
    function seg(label, k) {
      return h('button', { type: 'button', class: 'seg-btn' + (keep === k ? ' on' : ''), 'aria-pressed': String(keep === k), onclick: function () { setKeep(k); } }, label);
    }
    wrap.appendChild(h('div', { class: 'seg', role: 'group', 'aria-label': 'キャラクターの指定' }, seg('前と同じ', true), seg('このページで設定', false)));

    if (keep) {
      var txt = inherited.length
        ? inherited
            .map(function (c) {
              return NK.POS_LABEL[c.pos] + ':' + charText(c);
            })
            .join('  ')
        : '表示なし';
      wrap.appendChild(h('span', { class: 'muted small' }, '引き継ぎ中: ' + txt));
      return wrap;
    }

    NK.POS.forEach(function (pos) {
      var cur = slotOf(p.chars, pos);
      var u = cur ? NK.spriteUrl(cur.cid, cur.eid) : null;
      var thumb = h('span', { class: 'field-thumb contain' });
      if (u) thumb.style.backgroundImage = 'url("' + u + '")';
      wrap.appendChild(
        h(
          'button',
          {
            class: 'field-btn',
            type: 'button',
            'aria-label': NK.POS_LABEL[pos] + 'のキャラを選ぶ',
            onclick: function () {
              openCharPicker({
                title: NK.POS_LABEL[pos] + 'に表示するキャラ',
                current: cur,
                onPick: function (cid, eid) {
                  p.chars = p.chars.filter(function (c) {
                    return c.pos !== pos;
                  });
                  if (cid) p.chars.push({ pos: pos, cid: cid, eid: eid });
                  NK.save();
                  NK.render();
                }
              });
            }
          },
          h('span', { class: 'pos-tag' }, NK.POS_LABEL[pos]),
          thumb,
          h('span', { class: 'field-val' }, cur ? charText(cur) : 'なし'),
          h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')
        )
      );
    });
    return wrap;
  }

  /* ---------- キャラ ---------- */
  function viewCharList() {
    var v = h('div', { class: 'view' });
    v.appendChild(
      h(
        'div',
        { class: 'view-head' },
        h('h2', { class: 'view-title' }, 'キャラクター'),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: function () {
              var ch = NK.newCharacter();
              NK.data.project.characters.push(ch);
              NK.save();
              NK.go({ charId: ch.id });
            }
          },
          '＋ 新規作成'
        )
      )
    );
    var list = NK.data.project.characters;
    if (!list.length) {
      v.appendChild(
        h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'キャラクターを登録しましょう'), h('p', { class: 'muted' }, '名前をつけて、表情ごとに立ち絵の画像を登録します。登録すると、ページ編集で左・中央・右に配置できます。'))
      );
      return v;
    }
    var box = h('div', { class: 'list' });
    list.forEach(function (ch) {
      var first = null;
      ch.expressions.forEach(function (e) {
        if (!first && e.asset && NK.assetUrl(e.asset)) first = NK.assetUrl(e.asset);
      });
      var mini = h('span', { class: 'mini contain' });
      if (first) mini.style.backgroundImage = 'url("' + first + '")';
      box.appendChild(
        h(
          'button',
          { class: 'row-btn', type: 'button', onclick: function () { NK.go({ charId: ch.id }); } },
          mini,
          h('span', { class: 'row-title' }, ch.name),
          h('span', { class: 'row-meta' }, '表情 ' + ch.expressions.length),
          h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')
        )
      );
    });
    v.appendChild(box);
    return v;
  }

  function viewChar(ch) {
    var v = h('div', { class: 'view' });
    v.appendChild(h('button', { class: 'back', type: 'button', onclick: function () { NK.go({ charId: null }); } }, '‹ キャラ一覧'));
    v.appendChild(
      h(
        'label',
        { class: 'field', for: 'f-cname' },
        h('span', { class: 'lbl' }, 'キャラクター名'),
        h('input', {
          id: 'f-cname',
          type: 'text',
          value: ch.name,
          maxlength: '30',
          oninput: function (e) {
            ch.name = e.target.value;
            NK.save();
          }
        })
      )
    );
    v.appendChild(h('h3', { class: 'sec-title' }, '表情(' + ch.expressions.length + ')'));
    v.appendChild(h('p', { class: 'muted small' }, '画像の枠を押して、立ち絵の画像を選びます。背景が透明なPNG画像がおすすめです。'));

    var list = h('div', { class: 'list' });
    ch.expressions.forEach(function (ex, i) {
      var u = ex.asset ? NK.assetUrl(ex.asset) : null;
      var thumb = h(
        'button',
        {
          class: 'sprite-btn' + (u ? '' : ' empty'),
          type: 'button',
          'aria-label': ex.name + 'の画像を選ぶ',
          onclick: function () {
            openPicker({
              title: ex.name + 'の画像を選ぶ',
              kind: 'sprite',
              current: ex.asset,
              allowKeep: false,
              onPick: function (val) {
                ex.asset = val;
                NK.save();
                NK.render();
              }
            });
          }
        },
        u ? null : '画像を選ぶ'
      );
      if (u) thumb.style.backgroundImage = 'url("' + u + '")';
      var row = h(
        'div',
        { class: 'expr' },
        thumb,
        h(
          'div',
          { class: 'expr-side' },
          h('input', {
            type: 'text',
            value: ex.name,
            maxlength: '20',
            'aria-label': '表情名',
            oninput: function (e) {
              ex.name = e.target.value;
              NK.save();
            }
          }),
          confirmButton('削除', '本当に削除', function () {
            if (ch.expressions.length <= 1) {
              NK.toast('表情は最低1つ必要です');
              return;
            }
            ch.expressions.splice(i, 1);
            purgeRefs(ch.id, ex.id);
            NK.save();
            NK.render();
          })
        )
      );
      list.appendChild(row);
    });
    v.appendChild(list);
    v.appendChild(
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: function () {
            ch.expressions.push({ id: NK.uid(), name: '表情' + (ch.expressions.length + 1), asset: null });
            NK.save();
            NK.render();
          }
        },
        '＋ 表情を追加'
      )
    );
    v.appendChild(
      h(
        'div',
        { class: 'danger-zone' },
        confirmButton('このキャラを削除', '本当に削除する', function () {
          var all = NK.data.project.characters;
          all.splice(all.indexOf(ch), 1);
          purgeRefs(ch.id, null);
          NK.save();
          NK.toast('キャラクターを削除しました');
          NK.go({ charId: null });
        })
      )
    );
    return v;
  }

  views.chars = function () {
    if (NK.ui.charId === null) return viewCharList();
    var ch = NK.findChar(NK.ui.charId);
    if (!ch) {
      NK.ui.charId = null;
      return viewCharList();
    }
    return viewChar(ch);
  };

  /* ---------- あそぶ ---------- */
  views.play = function () {
    var v = h('div', { class: 'view' });
    v.appendChild(h('h2', { class: 'view-title' }, 'シナリオを選ぶ'));
    var list = NK.data.project.scenarios;
    if (!list.length) {
      v.appendChild(
        h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'シナリオがありません'), h('p', { class: 'muted' }, '「つくる」タブで最初のシナリオを作成すると、ここに表示されます。'))
      );
      return v;
    }
    var box = h('div', { class: 'list' });
    list.forEach(function (sc) {
      box.appendChild(
        h(
          'button',
          {
            class: 'play-card',
            type: 'button',
            onclick: function () {
              NK.player.start(sc.id, 0);
            }
          },
          h('span', { class: 'play-title' }, sc.title),
          h('span', { class: 'play-meta' }, sc.pages.length + ' ページ'),
          h('span', { class: 'play-go', 'aria-hidden': 'true' }, '読む ›')
        )
      );
    });
    v.appendChild(box);
    return v;
  };

  /* ---------- つくる: import a script ---------- */
  function copyText(text, area) {
    function fallback() {
      area.focus();
      area.select();
      NK.toast('選択しました。コピーしてください');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            NK.toast('コピーしました');
          },
          fallback
        );
        return;
      }
    } catch (e) {
      /* fall through */
    }
    fallback();
  }

  function viewImport() {
    var ui = NK.ui;
    var v = h('div', { class: 'view' });
    v.appendChild(h('button', { class: 'back', type: 'button', onclick: function () { NK.go({ importing: false }); } }, '‹ シナリオ一覧'));
    v.appendChild(h('h2', { class: 'view-title' }, '台本を取り込む'));
    v.appendChild(h('p', { class: 'muted' }, 'Grokなどで作った台本を貼り付けると、ページに自動で分けて、新しいシナリオとして追加します。今あるシナリオは変わりません。'));

    v.appendChild(h('h3', { class: 'sec-title' }, '1. Grokへの依頼文'));
    v.appendChild(h('p', { class: 'muted small' }, '登録済みの背景・キャラ・BGMの名前が入った依頼文です。コピーしてGrokに貼り付け、最後の「ストーリーの内容」を書き換えて送ってください。'));
    var prompt = NK.buildAiPrompt();
    var pa = h('textarea', { id: 'f-prompt', rows: '6', readonly: 'readonly', 'aria-label': 'Grokへの依頼文' });
    pa.value = prompt;
    v.appendChild(pa);
    v.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { copyText(prompt, pa); } }, '依頼文をコピー'));

    v.appendChild(h('h3', { class: 'sec-title' }, '2. 台本を貼り付ける'));
    var ta = h('textarea', {
      id: 'f-script',
      rows: '10',
      placeholder: '[シナリオ:朝の教室]\n---\n[背景:教室]\n今日はいつもより少し早く学校に着いた。\n---\n[話者:少女]\n「……おはよう」',
      oninput: function (e) {
        ui.scriptText = e.target.value;
        ui.scriptResult = null;
      }
    });
    ta.value = ui.scriptText;
    v.appendChild(h('label', { class: 'field', for: 'f-script' }, h('span', { class: 'lbl' }, '台本'), ta));
    v.appendChild(
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: function () {
            if (!ui.scriptText.trim()) {
              NK.toast('台本を貼り付けてください');
              return;
            }
            ui.scriptResult = NK.parseScript(ui.scriptText);
            NK.render();
          }
        },
        '内容を確認'
      )
    );

    var r = ui.scriptResult;
    if (r) {
      var box = h('div', { class: 'notice' });
      if (!r.pages.length) {
        box.appendChild(h('p', { class: 'notice-title' }, 'ページが見つかりませんでした'));
        box.appendChild(h('p', { class: 'muted small' }, '文章を貼り付けているか確認してください。ページは、「【ページ】」や「---」だけの行、または空行で区切れます。'));
      } else {
        box.appendChild(h('p', { class: 'notice-title' }, r.pages.length + ' ページを取り込めます'));
        box.appendChild(h('p', { class: 'muted small' }, 'シナリオ名: ' + (r.title || '取り込んだシナリオ')));
        if (r.warnings.length) {
          box.appendChild(h('p', { class: 'warn-title' }, '確認が必要な点(' + r.warnings.length + ')'));
          var ul = h('ul', { class: 'warn-list' });
          r.warnings.forEach(function (w) {
            ul.appendChild(h('li', {}, w));
          });
          box.appendChild(ul);
          box.appendChild(h('p', { class: 'muted small' }, '警告があっても取り込めます。取り込んだあとにページ編集で直せます。'));
        }
        var prev = h('div', { class: 'list' });
        r.pages.slice(0, 5).forEach(function (p, i) {
          prev.appendChild(h('div', { class: 'row-main static' }, h('span', { class: 'idx' }, String(i + 1)), h('span', { class: 'excerpt' }, h('span', { class: 'ex-text' }, excerpt(p)))));
        });
        box.appendChild(prev);
        if (r.pages.length > 5) box.appendChild(h('p', { class: 'muted small' }, '…ほか ' + (r.pages.length - 5) + ' ページ'));
        box.appendChild(
          h(
            'button',
            {
              class: 'btn primary',
              type: 'button',
              onclick: function () {
                var sc = NK.newScenario(r.title || '取り込んだシナリオ');
                sc.pages = r.pages;
                NK.data.project.scenarios.push(sc);
                NK.save();
                ui.scriptText = '';
                ui.scriptResult = null;
                NK.toast(r.pages.length + 'ページのシナリオを追加しました');
                NK.go({ importing: false, scId: sc.id, pageIdx: null });
              }
            },
            '新しいシナリオとして追加'
          )
        );
      }
      v.appendChild(box);
    }
    return v;
  }

  /* ---------- つくる: scenario list ---------- */
  function viewScenarioList() {
    var v = h('div', { class: 'view' });
    v.appendChild(
      h(
        'div',
        { class: 'view-head' },
        h('h2', { class: 'view-title' }, 'シナリオ'),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: function () {
              var sc = NK.newScenario();
              NK.data.project.scenarios.push(sc);
              NK.save();
              NK.go({ scId: sc.id, pageIdx: null });
            }
          },
          '＋ 新規作成'
        )
      )
    );
    v.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { NK.go({ importing: true }); } }, '台本を取り込む(Grokなどで作った文章)'));
    var list = NK.data.project.scenarios;
    if (!list.length) {
      v.appendChild(h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, '最初のシナリオを作りましょう'), h('p', { class: 'muted' }, '「新規作成」を押すと、1ページ目つきのシナリオができます。')));
      return v;
    }
    var box = h('div', { class: 'list' });
    list.forEach(function (sc) {
      box.appendChild(
        h(
          'button',
          {
            class: 'row-btn',
            type: 'button',
            onclick: function () {
              NK.go({ scId: sc.id, pageIdx: null });
            }
          },
          h('span', { class: 'row-title' }, sc.title),
          h('span', { class: 'row-meta' }, sc.pages.length + ' ページ'),
          h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')
        )
      );
    });
    v.appendChild(box);
    return v;
  }

  /* ---------- つくる: page list ---------- */
  function viewScenario(sc) {
    var v = h('div', { class: 'view' });
    v.appendChild(
      h(
        'button',
        {
          class: 'back',
          type: 'button',
          onclick: function () {
            NK.go({ scId: null, pageIdx: null });
          }
        },
        '‹ シナリオ一覧'
      )
    );
    v.appendChild(
      h(
        'label',
        { class: 'field', for: 'f-title' },
        h('span', { class: 'lbl' }, 'シナリオ名'),
        h('input', {
          id: 'f-title',
          type: 'text',
          value: sc.title,
          maxlength: '60',
          oninput: function (e) {
            sc.title = e.target.value;
            NK.save();
          }
        })
      )
    );
    v.appendChild(
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: function () {
              NK.player.start(sc.id, 0);
            }
          },
          '最初から再生'
        ),
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: function () {
              sc.pages.push(NK.newPage(sc.pages[sc.pages.length - 1]));
              NK.save();
              NK.go({ pageIdx: sc.pages.length - 1 });
            }
          },
          '＋ ページを追加'
        )
      )
    );

    function move(i, d) {
      var j = i + d;
      if (j < 0 || j >= sc.pages.length) return;
      var t = sc.pages[i];
      sc.pages[i] = sc.pages[j];
      sc.pages[j] = t;
      NK.save();
      NK.render();
    }

    var box = h('div', { class: 'list' });
    sc.pages.forEach(function (p, i) {
      var r = NK.resolve(sc, i);
      var u = NK.assetUrl(p.mode === 'illust' ? r.illust : r.bg);
      var mini = h('span', { class: 'mini' });
      if (u) mini.style.backgroundImage = 'url("' + u + '")';
      var main = h(
        'button',
        {
          class: 'row-main',
          type: 'button',
          onclick: function () {
            NK.go({ pageIdx: i });
          }
        },
        h('span', { class: 'idx' }, String(i + 1)),
        mini,
        h(
          'span',
          { class: 'excerpt' },
          h('span', { class: 'tags' }, h('span', { class: 'badge' + (p.mode === 'illust' ? ' ill' : '') }, p.mode === 'illust' ? 'イラスト' : '立ち絵'), p.bgm !== 'keep' ? h('span', { class: 'badge bgm' }, p.bgm === null ? '♪ 停止' : '♪ ' + (NK.assetName(p.bgm) || '?')) : null),
          h('span', { class: 'ex-text' }, excerpt(p))
        )
      );
      var act = h(
        'span',
        { class: 'row-act' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': i + 1 + 'ページ目を上へ', disabled: i === 0, onclick: function () { move(i, -1); } }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': i + 1 + 'ページ目を下へ', disabled: i === sc.pages.length - 1, onclick: function () { move(i, 1); } }, '↓')
      );
      box.appendChild(h('div', { class: 'row' }, main, act));
    });
    v.appendChild(box);

    v.appendChild(
      h(
        'div',
        { class: 'danger-zone' },
        confirmButton('このシナリオを削除', '本当に削除する', function () {
          var list = NK.data.project.scenarios;
          list.splice(list.indexOf(sc), 1);
          NK.save();
          NK.toast('シナリオを削除しました');
          NK.go({ scId: null, pageIdx: null });
        })
      )
    );
    return v;
  }

  /* ---------- つくる: page editor ---------- */
  function viewPage(sc, idx) {
    var p = sc.pages[idx];
    var v = h('div', { class: 'view' });

    v.appendChild(
      h(
        'div',
        { class: 'view-head' },
        h('button', { class: 'back', type: 'button', onclick: function () { NK.go({ pageIdx: null }); } }, '‹ ページ一覧'),
        h('span', { class: 'pos' }, idx + 1 + ' / ' + sc.pages.length + ' ページ')
      )
    );

    var preview = h('div', { class: 'preview' });
    function refresh() {
      NK.renderStage(preview, sc, idx, { hints: true });
    }
    v.appendChild(preview);
    v.appendChild(
      h(
        'div',
        { class: 'btn-row center' },
        h('button', { class: 'btn primary', type: 'button', onclick: function () { NK.player.start(sc.id, idx); } }, 'このページから再生')
      )
    );

    function segBtn(label, m) {
      return h(
        'button',
        {
          type: 'button',
          class: 'seg-btn' + (p.mode === m ? ' on' : ''),
          'aria-pressed': String(p.mode === m),
          onclick: function () {
            if (p.mode === m) return;
            p.mode = m;
            NK.save();
            NK.render();
          }
        },
        label
      );
    }
    v.appendChild(
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'lbl' }, '表示モード'),
        h('div', { class: 'seg', role: 'group', 'aria-label': '表示モード' }, segBtn('イラスト', 'illust'), segBtn('立ち絵', 'chara')),
        p.mode === 'chara' ? h('span', { class: 'muted small' }, '背景の上に、キャラを左・中央・右に最大3人まで表示できます。') : h('span', { class: 'muted small' }, '1枚絵を画面いっぱいに表示します。文章なしのページも作れます。')
      )
    );

    var key = p.mode === 'illust' ? 'illust' : 'bg';
    var kind = key;
    var inherited = NK.resolve(sc, idx - 1)[key];
    var effUrl = NK.assetUrl(NK.resolve(sc, idx)[key]);
    function valueLabel() {
      var val = p[key];
      if (val === 'keep') {
        var nm = NK.assetName(inherited);
        return '引き継ぎ(' + (nm || 'なし') + ')';
      }
      if (val === null) return 'なし';
      return NK.assetName(val) || '削除済み';
    }
    var thumb = h('span', { class: 'field-thumb' });
    if (effUrl) thumb.style.backgroundImage = 'url("' + effUrl + '")';
    v.appendChild(
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'lbl' }, key === 'illust' ? 'イラスト' : '背景'),
        h(
          'button',
          {
            class: 'field-btn',
            type: 'button',
            onclick: function () {
              openPicker({
                title: key === 'illust' ? 'イラストを選ぶ' : '背景を選ぶ',
                kind: kind,
                current: p[key],
                allowKeep: true,
                onPick: function (val) {
                  p[key] = val;
                  NK.save();
                  NK.render();
                }
              });
            }
          },
          thumb,
          h('span', { class: 'field-val' }, valueLabel()),
          h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')
        )
      )
    );

    if (p.mode === 'chara') v.appendChild(charsField(sc, idx, p));
    v.appendChild(bgmField(sc, idx, p));

    v.appendChild(
      h(
        'label',
        { class: 'field', for: 'f-speaker' },
        h('span', { class: 'lbl' }, '話者名(空欄なら表示しません)'),
        h('input', {
          id: 'f-speaker',
          type: 'text',
          value: p.speaker,
          maxlength: '30',
          placeholder: 'ミズキ',
          oninput: function (e) {
            p.speaker = e.target.value;
            NK.save();
            refresh();
          }
        })
      )
    );
    v.appendChild(
      h(
        'label',
        { class: 'field', for: 'f-text' },
        h('span', { class: 'lbl' }, '文章'),
        h('textarea', {
          id: 'f-text',
          rows: '6',
          value: p.text,
          placeholder: '今日はいつもより少し早く学校に着いた。',
          oninput: function (e) {
            p.text = e.target.value;
            NK.save();
            refresh();
          }
        })
      )
    );

    v.appendChild(
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', disabled: idx === 0, onclick: function () { NK.go({ pageIdx: idx - 1 }); } }, '‹ 前のページ'),
        h('button', { class: 'btn', type: 'button', disabled: idx === sc.pages.length - 1, onclick: function () { NK.go({ pageIdx: idx + 1 }); } }, '次のページ ›')
      )
    );
    v.appendChild(
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: function () {
              sc.pages.splice(idx + 1, 0, NK.newPage(p));
              NK.save();
              NK.go({ pageIdx: idx + 1 });
            }
          },
          '＋ このあとに追加'
        ),
        confirmButton('このページを削除', '本当に削除する', function () {
          if (sc.pages.length <= 1) {
            NK.toast('最後の1ページは削除できません');
            return;
          }
          sc.pages.splice(idx, 1);
          NK.save();
          NK.go({ pageIdx: Math.min(idx, sc.pages.length - 1) });
        })
      )
    );

    refresh();
    return v;
  }

  views.make = function () {
    var ui = NK.ui;
    if (ui.importing) return viewImport();
    if (ui.scId === null) return viewScenarioList();
    var sc = NK.findScenario(ui.scId);
    if (!sc) {
      ui.scId = null;
      ui.pageIdx = null;
      return viewScenarioList();
    }
    if (ui.pageIdx === null) return viewScenario(sc);
    if (ui.pageIdx >= sc.pages.length) ui.pageIdx = sc.pages.length - 1;
    if (ui.pageIdx < 0) ui.pageIdx = 0;
    return viewPage(sc, ui.pageIdx);
  };

  /* ---------- 素材 ---------- */
  views.assets = function () {
    var v = h('div', { class: 'view' });
    v.appendChild(h('h2', { class: 'view-title' }, '素材'));
    v.appendChild(h('p', { class: 'muted' }, '登録した画像は、ページ編集の「背景」「イラスト」から選べます。画像は長辺1600pxまで自動で縮小して保存します。'));

    [
      ['bg', '背景'],
      ['illust', 'イラスト'],
      ['sprite', '立ち絵']
    ].forEach(function (pair) {
      var kind = pair[0];
      var title = pair[1];
      var items = Array.from(NK.data.assets.values()).filter(function (a) {
        return a.kind === kind;
      });
      var status = h('span', { class: 'muted small', role: 'status' });
      var upload = guard(async function (files) {
        for (var i = 0; i < files.length; i++) {
          status.textContent = '保存中… ' + (i + 1) + ' / ' + files.length;
          await NK.addAsset(kind, files[i]);
        }
        NK.toast(files.length + '枚を追加しました');
        NK.render();
      });
      var add = fileLabel('ファイルから追加', true, upload);
      v.appendChild(h('div', { class: 'view-head sec' }, h('h3', { class: 'sec-title' }, title + '(' + items.length + ')'), add));
      v.appendChild(pasteZone(upload));
      v.appendChild(status);
      if (!items.length) {
        v.appendChild(h('p', { class: 'muted' }, title + 'はまだありません。'));
        return;
      }
      var grid = h('div', { class: 'grid' });
      items.forEach(function (a) {
        var n = NK.countUsage(a.id);
        grid.appendChild(
          h(
            'div',
            { class: 'asset' },
            h('span', { class: 'tile-img' + (kind === 'sprite' ? ' contain' : ''), style: 'background-image:url("' + a.url + '")', role: 'img', 'aria-label': a.name }),
            h('span', { class: 'tile-name' }, a.name),
            h('span', { class: 'muted small' }, n ? n + ' ページで使用' : '未使用'),
            confirmButton('削除', '本当に削除', guard(async function () {
              await NK.removeAsset(a.id);
              NK.toast('画像を削除しました');
              NK.render();
            }))
          )
        );
      });
      v.appendChild(grid);
    });

    /* BGM library */
    var tracks = Array.from(NK.data.assets.values()).filter(function (a) {
      return a.kind === 'bgm';
    });
    var bStatus = h('span', { class: 'muted small', role: 'status' });
    var bUpload = guard(async function (files) {
      var added = 0;
      for (var i = 0; i < files.length; i++) {
        bStatus.textContent = '保存中… ' + (i + 1) + ' / ' + files.length;
        try {
          await NK.addAudio(files[i]);
          added++;
        } catch (e) {
          if (e && e.message === 'too-big') NK.toast(files[i].name + ' は30MBを超えているため追加できません');
          else if (e && e.message === 'not-audio') NK.toast(files[i].name + ' は音声ファイルではありません');
          else throw e;
        }
      }
      if (added) NK.toast(added + '曲を追加しました');
      NK.render();
    });
    v.appendChild(h('div', { class: 'view-head sec' }, h('h3', { class: 'sec-title' }, 'BGM(' + tracks.length + ')'), fileLabel('ファイルから追加', true, bUpload, '', 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus')));
    v.appendChild(bStatus);
    v.appendChild(h('p', { class: 'muted small' }, 'mp3・m4aなどの音声ファイル(1曲30MBまで)を追加できます。スマホのClaudeアプリ内の画面ではファイルを選べないため、通常のブラウザで開いてください。'));
    if (!tracks.length) {
      v.appendChild(h('p', { class: 'muted' }, 'BGMはまだありません。'));
    } else {
      var tl = h('div', { class: 'list' });
      tracks.forEach(function (a) {
        var n = NK.countUsage(a.id);
        var play = h('button', { class: 'btn small-btn', type: 'button', 'aria-label': a.name + 'を試聴' }, '▶ 試聴');
        play.addEventListener('click', function () {
          var on = NK.audio.previewToggle(a.id);
          play.textContent = on ? '■ 停止' : '▶ 試聴';
        });
        tl.appendChild(
          h(
            'div',
            { class: 'track' },
            h('span', { class: 'track-main' }, h('span', { class: 'track-name' }, a.name), h('span', { class: 'muted small' }, fmtSize(a.blob.size) + ' / ' + (n ? n + ' ページで使用' : '未使用'))),
            play,
            confirmButton('削除', '本当に削除', guard(async function () {
              await NK.removeAsset(a.id);
              NK.toast('BGMを削除しました');
              NK.render();
            }))
          )
        );
      });
      v.appendChild(tl);
    }
    return v;
  };

  /* ---------- 保存 (backup) ---------- */
  function fmtSize(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  views.backup = function () {
    var v = h('div', { class: 'view' });
    v.appendChild(h('h2', { class: 'view-title' }, 'バックアップ'));

    var pages = 0;
    NK.data.project.scenarios.forEach(function (s) {
      pages += s.pages.length;
    });
    var bytes = 0;
    NK.data.assets.forEach(function (a) {
      bytes += a.blob ? a.blob.size : 0;
    });
    v.appendChild(
      h(
        'dl',
        { class: 'stats' },
        h('div', {}, h('dt', {}, 'シナリオ'), h('dd', {}, String(NK.data.project.scenarios.length))),
        h('div', {}, h('dt', {}, 'ページ'), h('dd', {}, String(pages))),
        h('div', {}, h('dt', {}, '素材'), h('dd', {}, NK.data.assets.size + '点 / ' + fmtSize(bytes)))
      )
    );
    v.appendChild(h('p', { class: 'muted' }, '作品のデータはこの端末のブラウザ内に保存されます。ブラウザの設定や容量不足で消えることがあるため、制作の区切りごとに書き出してください。'));

    var exStatus = h('p', { class: 'muted small', role: 'status' }, NK.data.lastExport ? '最後の書き出し: ' + new Date(NK.data.lastExport).toLocaleString('ja-JP') : 'まだ書き出していません');
    v.appendChild(h('h3', { class: 'sec-title' }, '書き出し'));
    v.appendChild(h('p', { class: 'muted' }, 'シナリオと画像を1つのファイルにまとめて保存します。'));
    v.appendChild(
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: guard(async function (e) {
            var btn = e.currentTarget;
            btn.textContent = '作成中…';
            try {
              var ok = await NK.exportAll();
              if (ok) NK.toast('書き出しました');
            } finally {
              NK.render();
            }
          })
        },
        '作品を書き出す'
      )
    );
    v.appendChild(exStatus);

    v.appendChild(h('h3', { class: 'sec-title' }, '読み込み'));
    v.appendChild(h('p', { class: 'muted' }, '書き出したファイルを選ぶと、今の作品をその内容に置き換えます。'));
    var impStatus = h('p', { class: 'muted small', role: 'status' });
    var pick = fileLabel(
      'ファイルを選ぶ',
      false,
      guard(async function (files) {
        impStatus.textContent = '読み込み中…';
        var text = await files[0].text();
        try {
          NK.ui.pending = NK.parseImport(text);
        } catch (err) {
          NK.ui.pending = null;
          impStatus.textContent = 'このファイルは読み込めません。このアプリで書き出したファイルを選んでください。';
          return;
        }
        NK.render();
      }),
      '',
      ''
    );
    v.appendChild(pick);
    v.appendChild(impStatus);

    var pend = NK.ui.pending;
    if (pend) {
      var np = 0;
      pend.project.scenarios.forEach(function (s) {
        np += s.pages.length;
      });
      v.appendChild(
        h(
          'div',
          { class: 'notice' },
          h('p', { class: 'notice-title' }, '読み込む内容'),
          h('p', {}, 'シナリオ ' + pend.project.scenarios.length + ' 件 / ' + np + ' ページ / 画像 ' + pend.assets.length + ' 枚' + (pend.exportedAt ? '(' + new Date(pend.exportedAt).toLocaleString('ja-JP') + ' に書き出し)' : '')),
          h('p', { class: 'muted small' }, '今の作品は上書きされます。必要なら先に書き出してください。'),
          h(
            'div',
            { class: 'btn-row' },
            confirmButton('この内容に置き換える', '本当に置き換える', guard(async function () {
              await NK.applyImport(pend);
              NK.ui.pending = null;
              NK.toast('読み込みました');
              NK.render();
            }), 'primary-outline'),
            h('button', { class: 'btn', type: 'button', onclick: function () { NK.ui.pending = null; NK.render(); } }, 'やめる')
          )
        )
      );
    }
    return v;
  };
})();
