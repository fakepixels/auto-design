/* The brand animation runtime: one clock for every animation on a stage.
   Scenes are CSS animations with delays; this pauses them all and sets their
   time together, so playing, scrubbing and rendering a video frame by frame
   show exactly the same thing. MIT, no dependencies. */
(function (global) {
  "use strict";

  /** cubic-bezier(x1, y1, x2, y2) as a function of progress, for counters. */
  function bezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    function x(t) { return ((ax * t + bx) * t + cx) * t; }
    function y(t) { return ((ay * t + by) * t + cy) * t; }
    return function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      var lo = 0, hi = 1, t = p;
      for (var i = 0; i < 24; i++) {
        var v = x(t);
        if (Math.abs(v - p) < 1e-5) break;
        if (v < p) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return y(t);
    };
  }

  function easeOf(stage) {
    var m = /cubic-bezier\(([^)]+)\)/.exec(getComputedStyle(stage).getPropertyValue("--ease") || "");
    if (!m) return function (p) { return 1 - Math.pow(1 - p, 3); };
    var v = m[1].split(",").map(Number);
    return bezier(v[0], v[1], v[2], v[3]);
  }

  function format(n, el) {
    var dec = Number(el.getAttribute("data-decimals")) || 0;
    var s = n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: el.getAttribute("data-grouped") === "1" });
    return (el.getAttribute("data-prefix") || "") + s + (el.getAttribute("data-suffix") || "");
  }

  /**
   * Take over a stage's clock. opts.autoplay starts it; opts.loop restarts it
   * at the end (scenes that loop by nature always wrap). Returns a controller.
   */
  function mount(stage, opts) {
    opts = opts || {};
    var duration = Number(stage.getAttribute("data-duration")) || 3000;
    var natural = stage.getAttribute("data-loop") === "1";
    var ease = easeOf(stage);
    var anims = [], counters = [], listeners = [];
    var t = 0, playing = false, last = 0, raf = 0;

    function collect() {
      anims = stage.getAnimations ? stage.getAnimations({ subtree: true }) : [];
      for (var i = 0; i < anims.length; i++) anims[i].pause();
      counters = Array.prototype.slice.call(stage.querySelectorAll("[data-count]"));
    }

    function seek(ms) {
      t = Math.max(0, ms);
      for (var i = 0; i < anims.length; i++) {
        try { anims[i].currentTime = t; } catch (e) { /* a finished, removed animation */ }
      }
      for (var j = 0; j < counters.length; j++) {
        var c = counters[j];
        var p = (t - Number(c.getAttribute("data-start"))) / Math.max(1, Number(c.getAttribute("data-length")));
        c.textContent = format(Number(c.getAttribute("data-count")) * ease(Math.min(1, Math.max(0, p))), c);
      }
      for (var k = 0; k < listeners.length; k++) listeners[k](t, duration);
    }

    function frame(now) {
      if (!playing) return;
      var next = t + Math.min(100, now - last);
      last = now;
      if (next >= duration) {
        if (natural || opts.loop) next = next % duration;
        else { seek(duration); playing = false; for (var k = 0; k < listeners.length; k++) listeners[k](duration, duration, true); return; }
      }
      seek(next);
      raf = requestAnimationFrame(frame);
    }

    var ctl = {
      duration: duration,
      get time() { return t; },
      get playing() { return playing; },
      play: function () {
        if (playing) return;
        if (t >= duration && !natural) t = 0;
        playing = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      },
      pause: function () { playing = false; cancelAnimationFrame(raf); },
      seek: seek,
      /** Call after replacing the stage's scene. */
      refresh: function () {
        duration = Number(stage.getAttribute("data-duration")) || duration;
        ctl.duration = duration;
        natural = stage.getAttribute("data-loop") === "1";
        collect();
        seek(Math.min(t, duration));
      },
      on: function (fn) { listeners.push(fn); },
    };

    collect();
    var reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce && opts.respectReducedMotion !== false) seek(natural ? 0 : duration);
    else {
      seek(opts.at || 0);
      if (opts.autoplay) ctl.play();
    }
    return ctl;
  }

  /**
   * Mount every stage on the page. Each shows its last frame until it scrolls
   * into view, then plays from the start; offscreen ones pause.
   */
  function mountAll(root, opts) {
    opts = opts || {};
    var stages = Array.prototype.slice.call((root || document).querySelectorAll(".adm-stage"));
    var seen = [];
    var ctls = stages.map(function (s) {
      var c = mount(s, { loop: opts.loop, autoplay: false, respectReducedMotion: opts.respectReducedMotion });
      if (s.getAttribute("data-loop") !== "1") c.seek(c.duration);
      return c;
    });
    var reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (opts && opts.autoplay && !reduce && "IntersectionObserver" in global) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var c = ctls[stages.indexOf(e.target)];
          if (!c) return;
          var i = stages.indexOf(e.target);
          if (e.isIntersecting) {
            if (!seen[i]) { seen[i] = true; c.seek(0); }
            c.play();
          } else c.pause();
        });
      });
      stages.forEach(function (s) { io.observe(s); });
    }
    return ctls;
  }

  global.ADMotion = { mount: mount, mountAll: mountAll };
})(typeof window !== "undefined" ? window : globalThis);
