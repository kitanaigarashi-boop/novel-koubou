(function () {
  'use strict';
  var NK = window.NK;
  var VOL = 0.7;
  var FADE_MS = 500;

  var cur = null; /* asset id of the track that should be playing */
  var el = null; /* its <audio> element */
  var muted = false;
  var prev = null; /* {id, el} for the library preview button */

  function fade(a, from, to, ms, done) {
    var steps = 10;
    var i = 0;
    var t = setInterval(function () {
      i++;
      try {
        a.volume = Math.max(0, Math.min(1, from + ((to - from) * i) / steps));
      } catch (e) {
        /* some browsers lock volume; ignore */
      }
      if (i >= steps) {
        clearInterval(t);
        if (done) done();
      }
    }, ms / steps);
  }

  function dispose(a) {
    try {
      a.pause();
      a.removeAttribute('src');
      a.load();
    } catch (e) {
      /* ignore */
    }
  }

  NK.audio = {
    current: function () {
      return cur;
    },
    isMuted: function () {
      return muted;
    },
    /* Follow the page: same track keeps playing, a new one fades in, null fades out. */
    setTrack: function (id) {
      id = id || null;
      if (id === cur) return;
      var old = el;
      cur = id;
      el = null;
      if (old) {
        fade(old, old.volume, 0, FADE_MS, function () {
          dispose(old);
        });
      }
      if (!id) return;
      var url = NK.assetUrl(id);
      if (!url) {
        cur = null;
        return;
      }
      var a = new Audio(url);
      a.loop = true;
      a.preload = 'auto';
      a.muted = muted;
      a.volume = 0;
      el = a;
      var p = a.play();
      if (p && p.catch) {
        p.catch(function () {
          /* blocked until the next tap; the next page turn tries again */
          if (el === a) cur = null;
        });
      }
      fade(a, 0, VOL, FADE_MS);
    },
    stop: function () {
      NK.audio.setTrack(null);
    },
    setMuted: function (m) {
      muted = !!m;
      if (el) el.muted = muted;
    },
    /* library preview: one clip at a time, returns true while playing */
    previewToggle: function (id) {
      if (prev && prev.id === id) {
        NK.audio.stopPreview();
        return false;
      }
      NK.audio.stopPreview();
      var url = NK.assetUrl(id);
      if (!url) return false;
      var a = new Audio(url);
      a.volume = VOL;
      prev = { id: id, el: a };
      a.addEventListener('ended', function () {
        if (prev && prev.el === a) prev = null;
      });
      var p = a.play();
      if (p && p.catch) {
        p.catch(function () {
          if (prev && prev.el === a) prev = null;
          NK.toast('この曲は再生できませんでした');
        });
      }
      return true;
    },
    stopPreview: function () {
      if (prev) {
        dispose(prev.el);
        prev = null;
      }
    }
  };
})();
