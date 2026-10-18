/* auto-design specimen renderer: draws a design system on realistic screens.
   Used by the onboarding app, the studio and every system's docs page. No dependencies. */
(function (global) {
  "use strict";

  var e = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var STEPS = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"];

  /** CSS custom properties for one mode of a system. */
  function vars(d, mode) {
    var v = {};
    var roles = d.roles[mode];
    for (var k in roles) v["--" + k] = roles[k];
    var code = d.code[mode];
    for (var c in code) v["--sp-code-" + c] = code[c];
    v["--sp-sans"] = d.fonts.sans;
    v["--sp-mono"] = d.fonts.mono;
    if (d.fonts.display) v["--sp-display"] = d.fonts.display;
    v["--sp-r"] = d.radius + "px";
    STEPS.forEach(function (s) {
      var t = d.type[s];
      v["--sp-t-" + s] = t.size;
      v["--sp-lh-" + s] = String(t.lh);
      v["--sp-ls-" + s] = t.ls;
    });
    v["--sp-w-body"] = String(d.weights.body);
    v["--sp-w-medium"] = String(d.weights.medium);
    v["--sp-w-strong"] = String(d.weights.strong);
    v["--sp-w-display"] = String(d.weights.display);
    for (var sh in d.shadows) v["--sp-shadow-" + sh] = d.shadows[sh];
    v["--sp-raised"] = d.skin.raised ? (d.texture === "minimal" ? d.shadows.xs : d.shadows.sm) : "none";
    v["--sp-card-shadow"] = d.skin.cardShadow === "none" ? "none" : d.shadows[d.skin.cardShadow];
    var cb = d.skin.cardBorder || "always";
    v["--sp-card-border"] = cb === "always" || (cb === "dark" && mode === "dark") ? "var(--border)" : "transparent";
    v["--sp-tab-shadow"] = d.texture === "technical" || d.texture === "editorial" ? "none" : d.texture === "minimal" ? d.shadows.xs : d.shadows.sm;
    v["--sp-ctl-sm"] = d.controls.sm + "px";
    v["--sp-ctl-md"] = d.controls.md + "px";
    v["--sp-ctl-lg"] = d.controls.lg + "px";
    v["--sp-btn-px"] = (d.density === "compact" ? 12 : 16) + "px";
    v["--sp-pad"] = d.pad + "px";
    v["--sp-fast"] = d.motion.fast + "ms";
    v["--sp-base"] = d.motion.base + "ms";
    v["--sp-slow"] = d.motion.slow + "ms";
    v["--sp-ease-out"] = d.motion.easeOut;
    v["--sp-ease-in-out"] = d.motion.easeInOut;
    v["--sp-enter-s"] = String(d.motion.enterScale);
    v["--sp-enter-d"] = d.motion.enterDistance + "px";
    return v;
  }

  /** Point an element at a system: variables plus the texture switches the stylesheet reads. */
  function apply(el, d, mode) {
    mode = mode || d.defaultMode;
    var v = vars(d, mode);
    for (var k in v) el.style.setProperty(k, v[k]);
    el.classList.add("sp");
    el.setAttribute("data-mode", mode);
    el.setAttribute("data-texture", d.texture);
    el.setAttribute("data-press", d.skin.press);
    el.setAttribute("data-labels", d.skin.tableMono ? "mono" : "sans");
    if (d.fonts.display && (d.texture === "editorial" || d.texture === "tactile")) el.setAttribute("data-display-titles", "");
    else el.removeAttribute("data-display-titles");
  }

  function badge(status, copy) {
    return status === "ok"
      ? '<span class="sp-badge ok">' + e(copy.okLabel || "On track") + "</span>"
      : '<span class="sp-badge warn">' + e(copy.reviewLabel || "Needs review") + "</span>";
  }

  function table(copy, rows) {
    var t = copy.table;
    return (
      '<table class="sp-table"><thead><tr><th>' + e(t.columns[0]) + "</th><th>" + e(t.columns[1]) + '</th><th class="r">' + e(t.columns[2]) +
      "</th><th>" + e(t.columns[3]) + "</th></tr></thead><tbody>" +
      t.rows.slice(0, rows).map(function (r) {
        return "<tr><td>" + e(r.name) + '</td><td class="dim">' + e(r.detail) + '</td><td class="r">' + e(r.value) + "</td><td>" + badge(r.status, copy) + "</td></tr>";
      }).join("") +
      "</tbody></table>"
    );
  }

  var scenes = {
    app: function (d, copy, o) {
      var size = o.size || "m";
      var side = size === "s" ? "" :
        '<aside class="sp-side"><div class="brand"><i></i>' + e(copy.product) + "</div>" +
        copy.nav.slice(0, size === "l" ? 5 : 4).map(function (n, i) { return '<a class="' + (i === 1 ? "on" : "") + '">' + e(n) + "</a>"; }).join("") +
        "</aside>";
      var metrics = size === "s" ? "" :
        '<dl class="sp-metrics">' + copy.metrics.map(function (m) { return "<div><dt>" + e(m.label) + "</dt><dd>" + e(m.value) + "</dd></div>"; }).join("") + "</dl>";
      return (
        '<div class="sp-app sp-shell"' + (size === "s" ? ' style="grid-template-columns:1fr"' : "") + ">" + side +
        '<div class="sp-main"><div class="sp-head"><div><div class="sp-row"><h2 class="sp-title">' + e(copy.pageTitle) + "</h2>" +
        '<span class="sp-badge warn">' + e(copy.statusLabel) + '</span></div><p class="muted t-sm" style="margin-top:4px">' + e(copy.pageSummary) +
        '</p></div><button class="sp-btn primary" tabindex="-1">' + e(copy.primaryAction) + "</button></div>" +
        metrics + table(copy, size === "s" ? 3 : 4) + "</div></div>"
      );
    },

    hero: function (d, copy, o) {
      var glass = d.texture === "glass" ? " sp-glass" : "";
      var size = o.size || "m";
      var small = size === "s" || size === "xs";
      var style = size === "xs" ? ' style="--sp-hero-size:var(--sp-t-2xl);--sp-hero-lh:var(--sp-lh-2xl);padding-top:calc(var(--sp-pad)*0.75);padding-bottom:var(--sp-pad)"' :
        size === "s" ? ' style="--sp-hero-size:var(--sp-t-3xl);--sp-hero-lh:var(--sp-lh-3xl)"' : size === "m" ? ' style="--sp-hero-size:var(--sp-t-4xl);--sp-hero-lh:var(--sp-lh-4xl)"' : "";
      return (
        '<div class="sp-shell"><nav class="sp-nav' + glass + '"><span class="brand"><i></i>' + e(copy.product) + "</span>" +
        (small ? "" : "<a>Product</a><a>Pricing</a><a>Docs</a>") +
        '<button class="sp-btn sm outline" tabindex="-1">Sign in</button></nav>' +
        '<section class="sp-hero"' + style + "><h1>" + e(copy.headline) + "</h1>" + (size === "xs" ? "" : '<p class="lead">' + e(copy.subhead) + "</p>") +
        '<div class="sp-row"><button class="sp-btn primary lg" tabindex="-1">' + e(copy.cta) + "</button>" +
        (small ? "" : '<button class="sp-btn outline lg" tabindex="-1">' + e(copy.secondaryCta) + "</button>") + "</div>" +
        (small ? "" : '<p class="note">' + e(copy.note) + "</p>") + "</section></div>"
      );
    },

    chat: function (d, copy, o) {
      var c = copy.chat;
      return (
        '<div class="sp-chat"><div class="sp-msg-user">' + e(c.question) + "</div>" +
        '<div class="sp-tool"><i></i><code>' + e(c.tool) + '</code><span class="args">' + e(c.toolArgs) + '</span><span class="st">Done</span></div>' +
        '<div class="sp-msg-ai"><p>' + e(c.answer) + "</p>" + (o.size === "s" ? "" : "<p>" + e(c.followUp) + "</p>") + "</div>" +
        (o.size === "s" ? "" : '<div class="sp-composer"><div class="sp-input">Ask a follow-up</div><button class="sp-btn secondary" tabindex="-1">Send</button></div>') +
        "</div>"
      );
    },

    code: function (d, copy) {
      var cmd = e(copy.code.command)
        .replace(/(&quot;.*?&quot;)/g, '<span class="s">$1</span>')
        .replace(/(\s)(--?[a-z][\w-]*)/g, '$1<span class="k">$2</span>')
        .replace(/(\s)(\d[\d.]*)\b/g, '$1<span class="n">$2</span>')
        .replace(/^(\S+)/, '<span class="f">$1</span>');
      return '<div style="padding:var(--sp-pad)"><pre class="sp-code"><span class="c">' + e(copy.code.comment) + "</span>\n" + cmd + "</pre></div>";
    },

    sms: function (d, copy) {
      var s = copy.sms;
      var msg = function (m) { return '<div class="b ' + (m.from === "business" ? "in" : "out") + '">' + e(m.text) + "</div>"; };
      return (
        '<div class="sp-phone"><div class="who">' + e(copy.product) + " · Text message</div>" +
        (s[0] ? msg(s[0]) : "") + (s[1] ? msg(s[1]) : "") + '<div class="gap"></div>' +
        '<div class="img"><div class="sp-mcard"><div class="top"><i></i>' + e(copy.product) + '</div><div class="t">' + e(copy.card.title) +
        '</div><div class="muted" style="font-size:13px;margin-top:4px">' + e(copy.card.body) + '</div><span class="m">' + e(copy.card.metric) + "</span></div></div>" +
        (s[2] ? msg(s[2]) : "") +
        '<div class="link"><div class="sp-lcard">' + e(copy.card.title) + '</div><div class="cap">' + e(copy.headline) + "<small>" + e(String(copy.product).toLowerCase().replace(/[^a-z0-9]+/g, "")) + ".com</small></div></div></div>"
      );
    },

    mcp: function (d, copy) {
      var heights = [42, 58, 50, 74, 66, 92];
      return (
        '<div class="sp-host"><div class="ask">' + e(copy.chat.question) + '</div><div class="say">Here is what ' + e(copy.product) + " shows for this month.</div>" +
        '<div class="sp-widget"><div class="wt"><span>' + e(copy.card.title) + "</span><small>" + e(copy.product) + "</small></div>" +
        '<div class="sp-bars">' + heights.map(function (h, i) { return '<i class="' + (i < 5 ? "alt" : "") + '" style="height:' + h + '%"></i>'; }).join("") + "</div>" +
        '<button class="sp-btn primary sm" tabindex="-1">Open in ' + e(copy.product) + "</button></div>" +
        '<div class="tag">Inside a chat app: the host sets the font, text and background; your accent and corners stay.</div></div>'
      );
    },

    dialog: function (d, copy, o) {
      return (
        '<div class="sp-shell" style="position:relative;height:100%">' + scenes.app(d, copy, { size: o.size || "m" }) +
        '<div class="sp-scrim"></div><div class="sp-dialog sp-overlay" role="presentation"><h3>' + e(copy.primaryAction) + '?</h3><p class="muted t-sm">' +
        e(copy.pageSummary) + '</p><div class="sp-row"><button class="sp-btn outline" tabindex="-1">Cancel</button><button class="sp-btn primary" tabindex="-1">' +
        e(copy.primaryAction) + "</button></div></div></div>"
      );
    },

    type: function (d, copy) {
      return (
        '<div class="sp-type"><p class="head">' + e(copy.headline) + '</p><p class="body">' + e(copy.subhead) + "</p>" + table(copy, 2) + "</div>"
      );
    },

    controls: function (d, copy) {
      return (
        '<div style="padding:var(--sp-pad);display:flex;flex-direction:column;gap:14px">' +
        '<div class="sp-row"><button class="sp-btn primary" tabindex="-1">' + e(copy.primaryAction) + '</button><button class="sp-btn outline" tabindex="-1">Export</button>' +
        '<button class="sp-btn ghost" tabindex="-1">Cancel</button></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px"><span class="sp-label">' + e(copy.table.columns[0]) + '</span><div class="sp-input">' + e(copy.table.rows[0].name) + "</div></div>" +
        '<div class="sp-row" style="justify-content:space-between"><span class="sp-tabs"><span class="on">' + e(copy.nav[0]) + "</span><span>" + e(copy.nav[1]) + "</span><span>" + e(copy.nav[2]) + "</span></span>" +
        '<span class="sp-switch"></span></div>' +
        '<div class="sp-card" style="padding:12px 14px"><div class="sp-row" style="justify-content:space-between"><span class="sp-h4">' + e(copy.table.rows[1].name) + "</span>" + badge("ok", copy) +
        '</div><p class="muted t-sm" style="margin-top:4px">' + e(copy.table.rows[1].detail) + " · " + e(copy.table.rows[1].value) + "</p></div></div>"
      );
    },

    /** Content surfaces with a floating menu over them: where texture shows most. */
    surfaces: function (d, copy) {
      var r = copy.table.rows;
      var card = function (row, i) {
        return '<div class="sp-card sp-tex-card"><div class="sp-row" style="justify-content:space-between"><span class="sp-h4">' + e(row.name) + "</span>" + badge(row.status, copy) +
          '</div><p class="sp-tex-num">' + e(row.value) + '</p><p class="muted t-sm">' + e(row.detail) + "</p></div>";
      };
      return (
        '<div class="sp-shell sp-tex"><div class="sp-head"><h2 class="sp-title">' + e(copy.pageTitle) + '</h2><div class="sp-row" style="flex-wrap:nowrap">' +
        '<button class="sp-btn primary" tabindex="-1">' + e(copy.primaryAction) + '</button><button class="sp-btn outline sp-icon" tabindex="-1" aria-label="More">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button></div></div>' +
        '<div class="sp-tex-grid">' + card(r[0], 0) + card(r[1], 1) + "</div>" + table(copy, 2) +
        '<div class="sp-menu sp-overlay"><span>Rename</span><span>Duplicate</span><span class="on">Move to ' + e(copy.nav[1]) + '</span><hr><span class="danger">Delete</span></div></div>'
      );
    },

    /** Compact controls for judging corner radius side by side. */
    corners: function (d, copy) {
      return (
        '<div style="padding:16px;display:flex;flex-direction:column;gap:12px">' +
        '<div class="sp-row"><button class="sp-btn primary" tabindex="-1">Save</button><button class="sp-btn outline" tabindex="-1">Export</button></div>' +
        '<div class="sp-input">' + e(copy.table.rows[0].name) + "</div>" +
        '<div class="sp-row" style="justify-content:space-between">' + badge("ok", copy) + '<span class="sp-switch"></span></div>' +
        '<div class="sp-card" style="padding:12px"><span class="sp-h4">' + e(copy.table.rows[1].name) + '</span><p class="muted t-sm" style="margin-top:2px">' + e(copy.table.rows[1].value) + "</p></div></div>"
      );
    },

    motion: function (d, copy) {
      return (
        '<div class="sp-stage sp-shell"><div class="sp-row"><button class="sp-btn primary" tabindex="-1">' + e(copy.primaryAction) + "</button>" +
        '<button class="sp-btn outline" tabindex="-1">Details</button></div>' +
        '<div class="sp-stage-list">' + copy.table.rows.slice(0, 3).map(function (r) { return '<div><span>' + e(r.name) + '</span><span class="muted num">' + e(r.value) + "</span></div>"; }).join("") + "</div>" +
        '<div class="sp-sheet sp-overlay"><p class="sp-h4">' + e(copy.table.rows[0].name) + '</p><p class="muted t-sm" style="margin-top:2px">' +
        e(copy.table.rows[0].detail) + " · " + e(copy.table.rows[0].value) + "</p></div>" +
        '<div class="sp-toast sp-overlay"><b>' + e(copy.done || copy.primaryAction) + '</b><span class="muted">' + e(copy.pageSummary) + "</span></div></div>"
      );
    },
  };

  /**
   * Draw scenes into an element. `scenes` is a list of names, drawn top to
   * bottom, or [[a, b]] pairs drawn side by side.
   */
  function render(el, d, opts) {
    opts = opts || {};
    var copy = opts.copy;
    apply(el, d, opts.mode);
    var one = function (name) {
      var parts = String(name).split("@");
      var o = parts[1] ? Object.assign({}, opts, { size: parts[1] }) : opts;
      return scenes[parts[0]](d, copy, o);
    };
    var html = (opts.scenes || ["app"]).map(function (s) {
      if (Array.isArray(s)) {
        return '<div class="sp-split">' + s.map(function (x) { return '<div class="sp-pane">' + one(x) + "</div>"; }).join("") + "</div>";
      }
      return one(s);
    }).join("");
    el.innerHTML = html;
    return el;
  }

  /** Replay the motion demo in an element. */
  function play(el) {
    var stage = el.querySelector(".sp-stage");
    if (!stage) return;
    stage.classList.remove("play");
    void stage.offsetWidth;
    stage.classList.add("play");
  }

  global.AutoDesignSpecimen = { vars: vars, apply: apply, render: render, play: play, scenes: scenes, escape: e };
})(typeof window !== "undefined" ? window : globalThis);
