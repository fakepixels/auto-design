/* Shared by the film's scenes. Draws the product's own pieces (its renderer, its specimens, its copy)
   from what scripts/video/capture.mts saved in assets/capture/data.js. No clocks, no randomness. */
(function () {
  "use strict";
  var C = window.__CAPTURE;
  var S = window.AutoDesignSpecimen;
  if (!C || !S) throw new Error("Run `npm run video:capture` first: assets/capture/ is missing.");

  /** Draw one renderer scene for a specimen into a host, at the onboarding's preview size times `zoom`. */
  function tile(view, specimen, scene, opts) {
    opts = opts || {};
    var zoom = opts.zoom || 1;
    var w = view.clientWidth / zoom, h = view.clientHeight / zoom;
    var host = document.createElement("div");
    host.className = "sp-host";
    host.style.width = w + "px";
    host.style.height = h + "px";
    host.style.zoom = String(zoom);
    view.appendChild(host);
    var inner = document.createElement("div");
    inner.style.height = "100%";
    host.appendChild(inner);
    S.render(inner, specimen, { mode: opts.mode || specimen.defaultMode, copy: opts.copy || C.final.copy, scenes: [scene], size: opts.size || "s" });
    return host;
  }

  /** A box in film pixels, relative to the scene root, whatever scale the preview draws the stage at. */
  function box(el, root) {
    var r = el.getBoundingClientRect(), R = root.getBoundingClientRect(), k = R.width / 1920 || 1;
    return { x: (r.left - R.left) / k, y: (r.top - R.top) / k, w: r.width / k, h: r.height / k, cx: (r.left - R.left + r.width / 2) / k, cy: (r.top - R.top + r.height / 2) / k };
  }

  /** A CSS cubic-bezier() as a GSAP ease, so the press uses the system's own curve. */
  function bezier(css) {
    var m = String(css).match(/cubic-bezier\(([^)]+)\)/);
    if (!m) return "power2.out";
    var p = m[1].split(",").map(Number), x1 = p[0], y1 = p[1], x2 = p[2], y2 = p[3];
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    var X = function (t) { return ((ax * t + bx) * t + cx) * t; };
    var Y = function (t) { return ((ay * t + by) * t + cy) * t; };
    var dX = function (t) { return (3 * ax * t + 2 * bx) * t + cx; };
    return function (x) {
      var t = x;
      for (var i = 0; i < 8; i++) { var e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
      return Y(Math.max(0, Math.min(1, t)));
    };
  }

  var CURSOR = '<svg viewBox="0 0 46 58" aria-hidden="true"><path d="M3 2.5 L3 46 L14.5 35.2 L22.2 53 L30.6 49.4 L23 31.9 L39 31.6 Z" fill="#fff" stroke="#0b0b0c" stroke-width="2.4" stroke-linejoin="round"/></svg>';

  /** Words of a line wrapped in spans, so a title can enter word by word without moving. */
  function words(el) {
    var text = el.textContent.trim();
    el.innerHTML = text.split(/\s+/).map(function (w) { return "<span>" + S.escape(w) + "</span>"; }).join(" ");
    return [].slice.call(el.querySelectorAll("span"));
  }

  window.FILM = { C: C, S: S, tile: tile, box: box, bezier: bezier, CURSOR: CURSOR, words: words };
})();
