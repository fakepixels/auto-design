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
    v["--sp-raised"] = d.skin.raised ? d.shadows.raised : "none";
    v["--sp-rest"] = d.skin.rest && d.skin.rest !== "none" ? d.shadows[d.skin.rest] : "none";
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
    el.setAttribute("data-case", d.art && d.art.labels === "uppercase" ? "upper" : "sentence");
    if (d.fonts.display && (d.texture === "editorial" || d.texture === "tactile")) el.setAttribute("data-display-titles", "");
    else el.removeAttribute("data-display-titles");
  }

  /** The product's mark: its first letter on the brand color. */
  function mark(copy) {
    var ch = String(copy.product || "N").trim().charAt(0).toUpperCase() || "N";
    return '<i class="sp-mark" aria-hidden="true">' + e(ch) + "</i>";
  }

  var DECISION = { label: "Q4 plan", title: "Approve the Q4 plan?", body: "Three projects need a decision by Friday.", approve: "Approve", decline: "Not now", command: "app approve q4 --notify" };
  function decision(copy) {
    var dc = copy.decision || {};
    var out = {};
    for (var k in DECISION) out[k] = dc[k] || DECISION[k];
    return out;
  }

  /** Copy for the other objects, merged over defaults so older copy (and a model's) still draws. */
  var SHOP = { item: "Canvas tote", variant: "Natural · One size", price: "$48", count: "2", subtotal: "$96.00", checkout: "Check out", note: "Free shipping on this order" };
  var AGENT = { ask: "Send the October invoices", tool: "send_invoices", args: "3 clients", say: "Ready to send 3 invoices: $18,400.", approve: "Send them", decline: "Edit first" };
  var MOMENT = { title: "Something new is here", body: "A small collection, picked for you.", cta: "Take a look", later: "Later" };
  function merged(base, over) {
    var out = {};
    over = over || {};
    for (var k in base) out[k] = over[k] || base[k];
    return out;
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

  /* ---------- Pages: how a landing page is composed (the system's art direction) ---------- */

  var ART = { imagery: "none", hero: "type", grid: "cards", labels: "sentence", display: "standard", logo: "mark" };
  var SITE = {
    links: ["Product", "Customers", "Pricing"], action: "Sign in", collection: "Why teams switch",
    items: [
      { title: "Plan in one place", body: "Projects, owners and budgets on one page." },
      { title: "See what needs a decision", body: "What's at risk rises to the top before Friday." },
      { title: "Share the numbers", body: "One link for clients, always current." },
    ],
  };
  /** The object that stands in for a picture when there is none: the kind's own card on a tinted panel. */
  var KIND_OBJECT = { ecommerce: "shop", agent: "agent", consumer: "moment" };
  /** Collections drawn as pictures rather than words. */
  var PICTURED = { ecommerce: true, consumer: true };

  function artOf(d) {
    var a = {};
    for (var k in ART) a[k] = (d.art && d.art[k]) || ART[k];
    return a;
  }
  function siteOf(copy) {
    var s = copy.site || {};
    var out = {};
    for (var k in SITE) out[k] = s[k] && (!Array.isArray(s[k]) || s[k].length) ? s[k] : SITE[k];
    return out;
  }
  function picture(img, cls) {
    return '<figure class="sp-pic' + (cls ? " " + cls : "") + '"><img src="' + e(img.src) + '" alt="' + e(img.alt || "") + '" loading="lazy" decoding="async"></figure>';
  }
  function stand(d, copy, cls) {
    return '<figure class="sp-pic sp-stand' + (cls ? " " + cls : "") + '">' + scenes[KIND_OBJECT[copy.kind] || "object"](d, copy, {}) + "</figure>";
  }
  function logo(copy, art) {
    return art.logo === "wordmark" ? '<span class="sp-wordmark">' + e(copy.product) + "</span>" : '<span class="brand">' + mark(copy) + e(copy.product) + "</span>";
  }
  function siteNav(d, copy, art, size, over) {
    var s = siteOf(copy);
    var small = size === "s" || size === "xs";
    var links = small ? "" : s.links.slice(0, art.logo === "wordmark" ? 3 : 4).map(function (l) { return "<a>" + e(l) + "</a>"; }).join("");
    var plain = over || art.labels === "uppercase" || art.logo === "wordmark";
    var action = plain ? '<a class="act">' + e(s.action) + "</a>" : '<button class="sp-btn sm outline" tabindex="-1">' + e(s.action) + "</button>";
    var cls = "sp-nav" + (d.texture === "glass" && !over ? " sp-glass" : "") + (over ? " over" : "");
    if (art.logo === "wordmark") return '<nav class="' + cls + ' centered"><span class="side">' + links + "</span>" + logo(copy, art) + '<span class="side end">' + action + "</span></nav>";
    return '<nav class="' + cls + '">' + logo(copy, art) + links + action + "</nav>";
  }
  function heroCopy(d, copy, size) {
    var small = size === "s" || size === "xs";
    return (
      "<h1" + (d.fonts.display ? ' class="display"' : "") + ">" + e(copy.headline) + "</h1>" +
      (size === "xs" ? "" : '<p class="lead">' + e(copy.subhead) + "</p>") +
      '<div class="sp-row"><button class="sp-btn primary lg" tabindex="-1">' + e(copy.cta) + "</button>" +
      (small ? "" : '<button class="sp-btn outline lg" tabindex="-1">' + e(copy.secondaryCta) + "</button>") + "</div>" +
      (small ? "" : '<p class="note">' + e(copy.note) + "</p>")
    );
  }
  /** One collection under the first screen: products for a store, moments for an app, reasons for software. */
  function collection(d, copy, art, imgs) {
    var s = siteOf(copy);
    var pictured = art.imagery !== "none" && (PICTURED[copy.kind] || art.imagery === "leading");
    var count = pictured && art.grid !== "editorial" ? 4 : 3;
    // With photos, show as many items as there are photos for them (three at least), so none is a blank.
    if (pictured && imgs.length > 1) count = Math.max(3, Math.min(count, imgs.length - 1));
    var items = s.items.slice(0, count).map(function (it, i) {
      var img = imgs[i + 1];
      // A photo with a short, plain name names its item, so a coat isn't captioned as a pouch.
      var named = img && /^[A-Za-z][A-Za-z' -]{2,38}$/.test(img.alt || "") && img.alt.split(/\s+/).length <= 5 && !/^(untitled|image|photo|picture|pic|img|dsc)\b/i.test(img.alt);
      if (named) it = { title: img.alt.charAt(0).toUpperCase() + img.alt.slice(1), body: it.body };
      var media = !pictured ? "" : img ? picture(img) : '<figure class="sp-pic sp-blank"><i class="sp-shop-img" aria-hidden="true"><i></i></i></figure>';
      return '<article class="sp-item">' + media + '<div class="cap"><b>' + e(it.title) + "</b><span>" + e(it.body) + "</span></div></article>";
    }).join("");
    return (
      '<section class="sp-coll"><div class="sp-coll-head"><h2' + (d.fonts.display ? ' class="display"' : "") + ">" + e(s.collection) + "</h2><a>View all</a></div>" +
      '<div class="sp-coll-grid" data-grid="' + e(art.grid) + '" data-pictured="' + (pictured ? "yes" : "no") + '" style="--sp-coll-n:' + count + '">' + items + "</div></section>"
    );
  }
  var HERO_STEP = { xs: "2xl", s: "3xl", m: "4xl", l: "5xl" };
  var HERO_STEP_DRAMATIC = { xs: "3xl", s: "4xl", m: "5xl", l: "6xl" };

  var scenes = {
    /**
     * One composed object on the system's own backdrop: a decision card in its
     * type, color, surface and corners. Onboarding compares options with it, so
     * the only differences you see are the ones you're choosing between.
     */
    object: function (d, copy) {
      var dc = decision(copy);
      var tech = d.texture === "technical";
      return (
        '<div class="sp-tile"><div class="sp-ob"><div class="sp-ob-top">' + mark(copy) + "<span>" + e(copy.product) + '</span><span class="lb">' +
        e(tech ? dc.label.toUpperCase() : dc.label) + '</span></div><p class="sp-ob-h">' + e(dc.title) + '</p><p class="sp-ob-p">' + e(dc.body) + "</p>" +
        (tech ? '<code class="sp-ob-cmd">$ ' + e(dc.command) + "</code>" : "") +
        '<div class="sp-ob-a"><button class="sp-ob-pri" tabindex="-1">' + e(dc.approve) + '</button><button class="sp-ob-sec" tabindex="-1">' + e(dc.decline) + "</button></div></div></div>"
      );
    },

    /** The decision card by name, for galleries that mix objects. */
    decision: function (d, copy, o) {
      return scenes.object(d, copy, o);
    },

    /** A store's object: an item in the bag, the subtotal, and one clear way to check out. */
    shop: function (d, copy) {
      var s = merged(SHOP, copy.shop);
      return (
        '<div class="sp-tile"><div class="sp-ob sp-shop"><div class="sp-ob-top">' + mark(copy) + "<span>" + e(copy.product) + '</span><span class="lb">Bag · ' + e(s.count) + "</span></div>" +
        '<div class="sp-shop-item"><i class="sp-shop-img" aria-hidden="true"><i></i></i><div class="sp-shop-txt"><b>' + e(s.item) + "</b><span>" + e(s.variant) + '</span></div><span class="sp-shop-price">' + e(s.price) + "</span></div>" +
        '<div class="sp-shop-sum"><span>Subtotal</span><b>' + e(s.subtotal) + "</b></div>" +
        '<div class="sp-ob-a wide"><button class="sp-ob-pri" tabindex="-1">' + e(s.checkout) + " · " + e(s.subtotal) + "</button></div>" +
        '<p class="sp-shop-note"><i aria-hidden="true"></i>' + e(s.note) + "</p></div></div>"
      );
    },

    /** An agent's object: the ask, the tool it ran, and the approval it needs. */
    agent: function (d, copy) {
      var a = merged(AGENT, copy.agent);
      return (
        '<div class="sp-tile"><div class="sp-ob sp-agent"><div class="sp-ob-top">' + mark(copy) + "<span>" + e(copy.product) + '</span><span class="lb">Agent</span></div>' +
        '<p class="sp-ag-you">' + e(a.ask) + "</p>" +
        '<div class="sp-ag-tool"><i aria-hidden="true"></i><code>' + e(a.tool) + "</code><span>" + e(a.args) + "</span></div>" +
        '<p class="sp-ag-say">' + e(a.say) + "</p>" +
        '<div class="sp-ob-a"><button class="sp-ob-pri" tabindex="-1">' + e(a.approve) + '</button><button class="sp-ob-sec" tabindex="-1">' + e(a.decline) + "</button></div></div></div>"
      );
    },

    /** A consumer app's object: a piece of art in the brand's hues, a line of invitation, one action. */
    moment: function (d, copy) {
      var m = merged(MOMENT, copy.moment);
      return (
        '<div class="sp-tile"><div class="sp-ob sp-moment"><i class="sp-mo-art" aria-hidden="true"><i></i><i></i>' + mark(copy) + "</i>" +
        '<p class="sp-ob-h">' + e(m.title) + '</p><p class="sp-ob-p">' + e(m.body) + "</p>" +
        '<div class="sp-ob-a"><button class="sp-ob-pri" tabindex="-1">' + e(m.cta) + '</button><button class="sp-ob-sec" tabindex="-1">' + e(m.later) + "</button></div></div></div>"
      );
    },

    /** Type on its own: the headline, a paragraph and figures in the code face. */
    typeface: function (d, copy) {
      var r = copy.table.rows;
      return (
        '<div class="sp-tile"><div class="sp-face"><p class="h' + (d.fonts.display ? " dsp" : "") + '">' + e(copy.headline) + '</p><p class="b">' + e(copy.subhead) +
        '</p><p class="m"><span>' + e(r[0].value) + "</span><span>" + e(r[1].value) + "</span><span>" + e(copy.metrics[1].value) + "</span></p></div></div>"
      );
    },

    app: function (d, copy, o) {
      var size = o.size || "m";
      var side = size === "s" ? "" :
        '<aside class="sp-side"><div class="brand">' + mark(copy) + e(copy.product) + "</div>" +
        copy.nav.slice(0, size === "l" ? 5 : 4).map(function (n, i) { return '<a class="' + (i === 1 ? "on" : "") + '">' + e(n) + "</a>"; }).join("") +
        "</aside>";
      var metrics = size === "s" ? "" :
        '<dl class="sp-metrics">' + copy.metrics.map(function (m) { return "<div><dt>" + e(m.label) + "</dt><dd>" + e(m.value) + "</dd></div>"; }).join("") + "</dl>";
      return (
        '<div class="sp-app sp-shell' + (size !== "s" && (d.texture === "minimal" || d.texture === "glass" || d.texture === "tactile") ? " inset" : "") + '"' + (size === "s" ? ' style="grid-template-columns:1fr"' : "") + ">" + side +
        '<div class="sp-main"><div class="sp-head"><div><div class="sp-row"><h2 class="sp-title">' + e(copy.pageTitle) + "</h2>" +
        '<span class="sp-badge warn">' + e(copy.statusLabel) + '</span></div><p class="muted t-sm" style="margin-top:4px">' + e(copy.pageSummary) +
        '</p></div><button class="sp-btn primary" tabindex="-1">' + e(copy.primaryAction) + "</button></div>" +
        metrics + table(copy, size === "s" ? 3 : 4) + "</div></div>"
      );
    },

    /**
     * A landing page in the system's art direction: its first screen (words only, centered, split,
     * full-bleed or editorial), its navigation and, at the largest size, one collection below.
     * Pictures come from o.images ({ src, alt }); without them, the kind's own object stands in, or
     * the brand fills the screen.
     */
    hero: function (d, copy, o) {
      var art = artOf(d);
      var size = o.size || "m";
      var imgs = (o.images || d.images || []).filter(function (x) { return x && x.src; });
      var first = art.imagery !== "none" ? imgs[0] : null;
      var step = (art.display === "dramatic" ? HERO_STEP_DRAMATIC : HERO_STEP)[size] || "5xl";
      var style = ' style="--sp-hero-size:var(--sp-t-' + step + ");--sp-hero-lh:var(--sp-lh-" + step + ");--sp-hero-ls:var(--sp-ls-" + step + ')"';
      var text = heroCopy(d, copy, size);
      var more = size === "l" ? collection(d, copy, art, art.imagery !== "none" ? imgs : []) : "";
      var shell = function (hero, body) { return '<div class="sp-shell sp-marketing" data-hero="' + hero + '" data-size="' + size + '">' + body + more + "</div>"; };
      if (art.hero === "full-bleed") {
        return shell("full-bleed",
          '<section class="sp-hero sp-bleed ' + (first ? "on-photo" : "on-brand") + (art.logo === "wordmark" ? " centered" : "") + '"' + style + ">" +
          (first ? picture(first, "bg") : "") + siteNav(d, copy, art, size, true) + '<div class="sp-over">' + text + "</div></section>");
      }
      var nav = siteNav(d, copy, art, size, false);
      if (art.hero === "split") {
        return shell("split", nav + '<section class="sp-hero sp-split-hero"' + style + '><div class="sp-hero-copy">' + text + "</div>" + (first ? picture(first) : stand(d, copy)) + "</section>");
      }
      if (art.hero === "editorial") {
        return shell("editorial", nav + '<section class="sp-hero sp-ed-hero"' + style + '><div class="sp-hero-copy"><hr>' + text + "</div>" + (first ? picture(first, "tall") : stand(d, copy, "tall")) + "</section>");
      }
      if (art.hero === "centered") {
        return shell("centered", nav + '<section class="sp-hero sp-center-hero"' + style + ">" + text + "</section>" + (first && size !== "xs" ? picture(first, "band") : ""));
      }
      return shell("type", nav + '<section class="sp-hero"' + style + ">" + text + "</section>");
    },

    chat: function (d, copy, o) {
      var c = copy.chat;
      return (
        '<div class="sp-chat"><div class="sp-msg-user">' + e(c.question) + "</div>" +
        '<div class="sp-tool"><i></i><code>' + e(c.tool) + '</code><span class="args">' + e(c.toolArgs) + '</span><span class="st">Done</span></div>' +
        '<div class="sp-msg-ai"><p>' + e(c.answer) + (o.size === "s" ? "" : '<span class="sp-cite">1</span>') + "</p>" + (o.size === "s" ? "" : "<p>" + e(c.followUp) + "</p>") + "</div>" +
        (o.size === "l"
          ? '<div class="sp-card sp-approval"><div class="t">Send this summary to the project owners<span>3 people, by email. They can reply in the thread.</span></div>' +
            '<div class="a"><button class="sp-btn primary sm" tabindex="-1">Send</button><button class="sp-btn ghost sm" tabindex="-1">Don\u2019t send</button></div></div>'
          : "") +
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

    /** One beat of the system's motion: a press, the status changing, a confirmation. */
    motion: function (d, copy) {
      var r = copy.table.rows[0];
      var check = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5"/></svg>';
      return (
        '<div class="sp-stage sp-shell"><div class="sp-card sp-beat"><div class="top"><div><b>' + e(r.name) + '</b><span class="muted">' + e(r.detail) + " · " + e(r.value) +
        '</span></div><span class="sp-swap"><span class="sp-badge warn before">' + e(copy.reviewLabel || "Needs review") + '</span><span class="sp-badge ok after">' +
        e(copy.approvedLabel || "Approved") + "</span></span></div>" +
        '<div class="sp-row"><button class="sp-btn primary" tabindex="-1">' + e(copy.primaryAction) + '</button><button class="sp-btn ghost" tabindex="-1">Details</button></div></div>' +
        '<div class="sp-toast sp-overlay"><b><span class="ic">' + check + "</span>" + e(copy.done || copy.primaryAction) + '</b><span class="muted">' + e(copy.pageSummary) + "</span></div></div>"
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

  /** Replay the motion demo in an element. With { loop: true } it settles back at the end, ready to play again. */
  function play(el, opts) {
    var stage = el.querySelector(".sp-stage");
    if (!stage) return;
    stage.classList.remove("play");
    stage.classList.toggle("loop", !!(opts && opts.loop));
    void stage.offsetWidth;
    stage.classList.add("play");
  }

  global.AutoDesignSpecimen = { vars: vars, apply: apply, render: render, play: play, scenes: scenes, escape: e };
})(typeof window !== "undefined" ? window : globalThis);
