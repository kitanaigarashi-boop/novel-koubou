(function () {
  'use strict';
  var NK = window.NK;
  var DB_NAME = 'novel-koubou';
  var db = null;
  var memory = false;
  var memKv = new Map();
  var memAssets = new Map();

  function open() {
    return new Promise(function (resolve) {
      try {
        var req = window.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
          if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
        };
        req.onsuccess = function () {
          db = req.result;
          resolve(true);
        };
        req.onerror = function () {
          resolve(false);
        };
        req.onblocked = function () {
          resolve(false);
        };
      } catch (e) {
        resolve(false);
      }
    });
  }

  function run(store, mode, fn) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(store, mode);
      var s = t.objectStore(store);
      var out;
      var rq = fn(s);
      if (rq) {
        rq.onsuccess = function () {
          out = rq.result;
        };
      }
      t.oncomplete = function () {
        resolve(out);
      };
      t.onerror = function () {
        reject(t.error);
      };
      t.onabort = function () {
        reject(t.error);
      };
    });
  }

  NK.store = {
    init: async function () {
      try {
        if (!window.indexedDB) {
          memory = true;
          return;
        }
        var ok = await open();
        if (!ok) memory = true;
      } catch (e) {
        memory = true;
      }
    },
    isMemory: function () {
      return memory;
    },
    kvGet: async function (k) {
      if (memory) return memKv.get(k);
      return run('kv', 'readonly', function (s) {
        return s.get(k);
      });
    },
    kvSet: async function (k, v) {
      if (memory) {
        memKv.set(k, JSON.parse(JSON.stringify(v)));
        return;
      }
      await run('kv', 'readwrite', function (s) {
        return s.put(JSON.parse(JSON.stringify(v)), k);
      });
    },
    assetPut: async function (rec) {
      var r = { id: rec.id, kind: rec.kind, name: rec.name, type: rec.type, w: rec.w, h: rec.h, blob: rec.blob };
      if (memory) {
        memAssets.set(r.id, r);
        return;
      }
      await run('assets', 'readwrite', function (s) {
        return s.put(r);
      });
    },
    assetDel: async function (id) {
      if (memory) {
        memAssets.delete(id);
        return;
      }
      await run('assets', 'readwrite', function (s) {
        return s.delete(id);
      });
    },
    assetAll: async function () {
      if (memory) return Array.from(memAssets.values());
      return run('assets', 'readonly', function (s) {
        return s.getAll();
      });
    },
    assetClear: async function () {
      if (memory) {
        memAssets.clear();
        return;
      }
      await run('assets', 'readwrite', function (s) {
        return s.clear();
      });
    }
  };

  /* ---------- images: shrink on the way in ---------- */
  NK.processImage = async function (file, max, alpha) {
    max = max || 1600;
    var url = URL.createObjectURL(file);
    try {
      var src = null;
      var w = 0;
      var h = 0;
      if (window.createImageBitmap) {
        try {
          src = await createImageBitmap(file);
          w = src.width;
          h = src.height;
        } catch (e) {
          src = null;
        }
      }
      if (!src) {
        src = await new Promise(function (res, rej) {
          var im = new Image();
          im.onload = function () {
            res(im);
          };
          im.onerror = function () {
            rej(new Error('decode'));
          };
          im.src = url;
        });
        w = src.naturalWidth;
        h = src.naturalHeight;
      }
      var s = Math.min(1, max / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * s));
      var ch = Math.max(1, Math.round(h * s));
      var c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      var g = c.getContext('2d');
      if (!alpha) {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, cw, ch);
      }
      g.drawImage(src, 0, 0, cw, ch);
      var blob = await new Promise(function (r) {
        if (alpha) c.toBlob(r, 'image/png');
        else c.toBlob(r, 'image/jpeg', 0.86);
      });
      if (!blob) throw new Error('encode');
      return { blob: blob, w: cw, h: ch };
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  NK.addAsset = async function (kind, file) {
    var sprite = kind === 'sprite';
    var img = await NK.processImage(file, sprite ? 1400 : 1600, sprite);
    var name = (file.name || '').replace(/\.[^.]+$/, '').slice(0, 40) || '無題';
    var rec = { id: NK.uid(), kind: kind, name: name, type: img.blob.type, blob: img.blob, w: img.w, h: img.h };
    await NK.store.assetPut(rec);
    rec.url = URL.createObjectURL(rec.blob);
    NK.data.assets.set(rec.id, rec);
    return rec;
  };

  var MAX_AUDIO = 30 * 1024 * 1024;

  NK.addAudio = async function (file) {
    var okType = /^audio\//.test(file.type || '') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(file.name || '');
    if (!okType) throw new Error('not-audio');
    if (file.size > MAX_AUDIO) throw new Error('too-big');
    var name = (file.name || '').replace(/\.[^.]+$/, '').slice(0, 40) || '無題';
    var rec = { id: NK.uid(), kind: 'bgm', name: name, type: file.type || 'audio/mpeg', blob: file, w: 0, h: 0 };
    await NK.store.assetPut(rec);
    rec.url = URL.createObjectURL(rec.blob);
    NK.data.assets.set(rec.id, rec);
    return rec;
  };

  NK.removeAsset = async function (id) {
    await NK.store.assetDel(id);
    var a = NK.data.assets.get(id);
    if (a && a.url) URL.revokeObjectURL(a.url);
    NK.data.assets.delete(id);
    NK.data.project.scenarios.forEach(function (sc) {
      sc.pages.forEach(function (p) {
        if (p.bg === id) p.bg = null;
        if (p.illust === id) p.illust = null;
        if (p.bgm === id) p.bgm = null;
      });
    });
    NK.data.project.characters.forEach(function (c) {
      c.expressions.forEach(function (e) {
        if (e.asset === id) e.asset = null;
      });
    });
    NK.save();
  };

  /* ---------- backup: the whole work in one file ---------- */
  function blobToDataUrl(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () {
        res(fr.result);
      };
      fr.onerror = function () {
        rej(fr.error);
      };
      fr.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(u) {
    var i = u.indexOf(',');
    var type = u.slice(5, i).split(';')[0] || 'image/jpeg';
    var bin = atob(u.slice(i + 1));
    var arr = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return new Blob([arr], { type: type });
  }

  async function getDownloads() {
    try {
      if (window.claude && typeof window.claude.use === 'function') return await window.claude.use('downloads');
    } catch (e) {
      /* fall through */
    }
    return null;
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  NK.exportAll = async function () {
    var assets = [];
    var list = Array.from(NK.data.assets.values());
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      assets.push({ id: a.id, kind: a.kind, name: a.name, type: a.type, w: a.w, h: a.h, data: await blobToDataUrl(a.blob) });
    }
    var now = new Date();
    var payload = {
      format: 'novel-koubou',
      version: 1,
      exportedAt: now.toISOString(),
      project: NK.data.project,
      assets: assets
    };
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    var filename = 'novel-koubou-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '.json';
    var dl = await getDownloads();
    if (dl) {
      try {
        await dl.save({ filename: filename, data: blob });
      } catch (e) {
        if (e && e.code === 'declined') return false;
        throw e;
      }
    } else {
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 4000);
    }
    NK.data.lastExport = now.toISOString();
    await NK.store.kvSet('lastExport', NK.data.lastExport);
    return true;
  };

  NK.parseImport = function (text) {
    var obj = JSON.parse(text);
    if (!obj || obj.format !== 'novel-koubou' || !obj.project || !Array.isArray(obj.project.scenarios)) {
      throw new Error('format');
    }
    var assets = Array.isArray(obj.assets) ? obj.assets : [];
    return { project: NK.normalize(obj.project), assets: assets, exportedAt: obj.exportedAt || null };
  };

  NK.applyImport = async function (parsed) {
    NK.data.assets.forEach(function (a) {
      if (a.url) URL.revokeObjectURL(a.url);
    });
    NK.data.assets.clear();
    await NK.store.assetClear();
    for (var i = 0; i < parsed.assets.length; i++) {
      var a = parsed.assets[i];
      if (!a || !a.id || typeof a.data !== 'string') continue;
      var rec = {
        id: String(a.id),
        kind: a.kind === 'illust' || a.kind === 'sprite' || a.kind === 'bgm' ? a.kind : 'bg',
        name: String(a.name || '無題'),
        type: a.type || 'image/jpeg',
        w: a.w || 0,
        h: a.h || 0,
        blob: dataUrlToBlob(a.data)
      };
      await NK.store.assetPut(rec);
      rec.url = URL.createObjectURL(rec.blob);
      NK.data.assets.set(rec.id, rec);
    }
    NK.data.project = parsed.project;
    await NK.store.kvSet('project', NK.data.project);
    NK.ui.scId = null;
    NK.ui.pageIdx = null;
    NK.ui.charId = null;
  };
})();
