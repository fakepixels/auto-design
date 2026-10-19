// The Motion section's behavior: galleries play while on screen; the player
// plays, scrubs, switches format and mode, and redraws as the words change.
// Needs motion-runtime.js (ADMotion) and motion-templates.js (ADMotionTemplates).
(function () {
  "use strict";
  var root = document.documentElement.getAttribute("data-root") || "./";
  var player = document.querySelector("[data-player]");

  if (!player) {
    // A gallery: every stage loops while it's visible.
    window.ADMotion.mountAll(document, { autoplay: true, loop: true });
    return;
  }

  var data = JSON.parse(document.getElementById("adm-data").textContent);
  var stage = player.querySelector(".adm-stage");
  var frame = stage.querySelector(".adm-frame");
  var box = player.querySelector("[data-stage-box]");
  var scrub = player.querySelector("[data-scrub]");
  var time = player.querySelector("[data-time]");
  var playBtn = player.querySelector("[data-play]");
  var props = JSON.parse(JSON.stringify(data.defaults));
  var format = "landscape";
  var FORMATS = window.ADMotionTemplates.FORMATS;
  var ctl = window.ADMotion.mount(stage, { autoplay: true, loop: false });
  // Other stages on the page (none today) keep looping.

  function icon(playing) {
    playBtn.querySelector("[data-icon-pause]").hidden = !playing;
    playBtn.querySelector("[data-icon-play]").hidden = playing;
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }
  ctl.on(function (t, d, ended) {
    scrub.max = String(d);
    scrub.value = String(Math.round(t));
    time.textContent = (t / 1000).toFixed(1) + "s / " + (d / 1000).toFixed(1) + "s";
    if (ended) icon(false);
  });
  icon(ctl.playing);
  playBtn.addEventListener("click", function () {
    if (ctl.playing) ctl.pause(); else ctl.play();
    icon(ctl.playing);
  });
  scrub.addEventListener("input", function () {
    ctl.pause();
    icon(false);
    ctl.seek(Number(scrub.value));
  });

  function size() {
    var f = FORMATS[format];
    stage.style.aspectRatio = f.width + " / " + f.height;
    // Tall formats are bounded by the window, not the column.
    stage.style.width = format === "landscape" ? "100%" : "min(100%, calc(70vh * " + f.width + " / " + f.height + "))";
    box.style.padding = format === "landscape" ? "0" : "24px";
  }

  function redraw() {
    var r = window.ADMotionTemplates.renderAnimation(data.system, data.id, { copy: data.copy, props: props, format: format });
    frame.innerHTML = '<div class="adm-backdrop"></div>' + r.html;
    stage.setAttribute("data-duration", String(r.duration));
    stage.setAttribute("data-loop", r.loop ? "1" : "0");
    stage.setAttribute("data-format", format);
    size();
    ctl.refresh();
    ctl.seek(0);
    ctl.play();
    icon(true);
    command();
  }

  player.querySelectorAll("[data-format]").forEach(function (b) {
    b.addEventListener("click", function () {
      format = b.getAttribute("data-format");
      player.querySelectorAll("[data-format]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      redraw();
    });
  });
  player.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      var m = b.getAttribute("data-mode");
      stage.classList.remove("adm-light", "adm-dark");
      if (m !== "inherit") stage.classList.add("adm-" + m);
      player.querySelectorAll("[data-mode]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
    });
  });

  var timer = 0;
  document.querySelectorAll("[data-field]").forEach(function (el) {
    el.addEventListener("input", function () {
      var key = el.getAttribute("data-field");
      props[key] = el.hasAttribute("data-list") ? el.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean) : el.value;
      clearTimeout(timer);
      timer = setTimeout(redraw, 180);
    });
  });

  /* ---------- Use it ---------- */

  function quote(v) { return '"' + String(v).replace(/(["\\$`])/g, "\\$1") + '"'; }
  function command() {
    var parts = ["npx auto-design animate " + data.id];
    data.fields.forEach(function (f) {
      var now = props[f.key], was = data.defaults[f.key];
      if (JSON.stringify(now) === JSON.stringify(was)) return;
      parts.push("--" + f.key + " " + quote(Array.isArray(now) ? now.join("|") : now));
    });
    if (format !== "landscape") parts.push("--format " + format);
    var mode = player.querySelector("[data-mode][aria-pressed=true]");
    if (mode && mode.getAttribute("data-mode") !== "inherit") parts.push("--mode " + mode.getAttribute("data-mode"));
    parts.push("--out " + data.id + ".mp4");
    var text = parts.join(" ");
    var box = document.querySelector("[data-command]");
    if (!box) return;
    box.querySelector("code").textContent = text;
    box.querySelector("[data-copy]").setAttribute("data-copy", text);
  }
  player.querySelectorAll("[data-mode]").forEach(function (b) { b.addEventListener("click", command); });

  var dl = document.querySelector("[data-download]");
  if (dl) dl.addEventListener("click", function () {
    Promise.all([fetch(root + "_site/motion.css").then(function (r) { return r.text(); }), fetch(root + "_site/motion-runtime.js").then(function (r) { return r.text(); })]).then(function (res) {
      var fonts = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
      var copy = stage.cloneNode(true);
      copy.style.width = "";
      var mode = stage.classList.contains("adm-dark") ? "adm-dark" : stage.classList.contains("adm-light") ? "adm-light" : (document.documentElement.classList.contains(document.documentElement.getAttribute("data-mode-class") || "dark") ? (document.documentElement.getAttribute("data-mode-class") === "light" ? "adm-light" : "adm-dark") : (document.documentElement.getAttribute("data-default-mode") === "dark" ? "adm-dark" : "adm-light"));
      copy.classList.remove("w-full");
      copy.classList.add(mode);
      var f = FORMATS[format];
      var html = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>" + document.title + "</title>\n" +
        (fonts ? '<link rel="stylesheet" href="' + fonts.getAttribute("href") + '">\n' : "") +
        "<style>\n" + res[0] + "\nhtml, body { margin: 0; height: 100%; background: #111; }\nbody { display: grid; place-items: center; overflow: hidden; }\n.adm-stage { width: min(100vw, calc(100vh * " + f.width + " / " + f.height + ")); cursor: pointer; }\n</style>\n</head>\n<body>\n" +
        copy.outerHTML + "\n<script>\n" + res[1] + "\n(function(){var s=document.querySelector('.adm-stage');var go=function(){var c=ADMotion.mount(s,{autoplay:true,loop:true});s.addEventListener('click',function(){c.playing?c.pause():c.play();});};(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){requestAnimationFrame(go);});})();\n</" + "script>\n</body>\n</html>\n";
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      a.download = data.id + ".html";
      document.body.append(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
  });
})();
