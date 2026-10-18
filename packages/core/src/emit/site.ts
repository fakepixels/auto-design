import { defaultCopy, type SpecimenCopy } from "../site/copy.js";
import { googleFontsHref, specimenAssets, specimenData } from "../site/specimen.js";
import type { DesignSystem } from "../system.js";
import { componentSources } from "./components.js";
import { GENERATOR } from "./shared.js";

const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * The system's docs site: public/index.html, next to the registry in public/r/.
 * The page is drawn in the system itself, so it doubles as the reference for
 * what "on-system" looks like. Host public/ anywhere static.
 */
export function emitSite(s: DesignSystem, copy?: SpecimenCopy): Record<string, string> {
  const data = specimenData(s);
  const c = copy ?? defaultCopy(s.config.displayName.replace(/ design( system)?$/i, ""), s.config.description);
  const { css, js } = specimenAssets();
  const surfaces = s.config.surfaces;
  const components = componentSources(s).map((x) => ({ name: x.name, title: x.title, description: x.description }));
  const title = `${s.config.displayName} design system`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(s.config.description || title)}">
<meta name="generator" content="${GENERATOR}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(googleFontsHref(data))}">
<style>
${css}
html, body { margin: 0; }
body.sp { min-height: 100vh; overflow: visible; }
.doc { max-width: 1120px; margin: 0 auto; padding: 48px 24px 96px; }
.doc header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 32px; }
.doc header h1 { font-family: var(--sp-display, var(--sp-sans)); font-weight: var(--sp-w-display); font-size: var(--sp-t-4xl); line-height: var(--sp-lh-4xl); letter-spacing: var(--sp-ls-4xl); }
.doc header p { margin-top: 8px; max-width: 56ch; color: var(--muted-foreground); font-size: var(--sp-t-lg); line-height: var(--sp-lh-lg); }
.doc > section { padding: 40px 0; border-top: 1px solid var(--border); }
.frame .sp-code { overflow-x: auto; }
.doc > section > h2 { font-size: var(--sp-t-xl); line-height: var(--sp-lh-xl); font-weight: var(--sp-w-strong); }
.doc > section > h2 + p { margin-top: 6px; color: var(--muted-foreground); max-width: 64ch; }
.frames { display: grid; gap: 16px; margin-top: 24px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); }
.frame { border: 1px solid var(--border); border-radius: var(--sp-r-xl); overflow: hidden; min-height: 280px; }
.frame.wide { grid-column: 1 / -1; }
.cmd { margin-top: 16px; display: grid; gap: 8px; }
.cmd pre { margin: 0; padding: 12px 14px; border-radius: var(--sp-r-lg); background: var(--muted); border: 1px solid var(--border); font-size: var(--sp-t-sm); overflow-x: auto; }
.swatches { display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); gap: 6px; margin-top: 16px; }
.swatches div { height: 56px; border-radius: var(--sp-r-md); position: relative; box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 8%, transparent); }
.swatches span { position: absolute; left: 6px; bottom: 4px; font-size: var(--sp-t-xs); line-height: 1; font-variant-numeric: tabular-nums; }
.doc a:not(.list a) { color: var(--primary); text-underline-offset: 3px; }
.scale { margin-top: 16px; display: grid; gap: 4px; }
.scale div { display: grid; grid-template-columns: 72px 1fr; align-items: baseline; gap: 16px; padding: 6px 0; border-bottom: 1px solid var(--border); overflow: hidden; white-space: nowrap; }
.scale code { color: var(--muted-foreground); font-size: var(--sp-t-xs); }
.list { margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.list a { display: block; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--sp-r-lg); color: inherit; text-decoration: none; }
.list a:hover { background: var(--accent); }
.list b { display: block; font-weight: var(--sp-w-medium); }
.list span { color: var(--muted-foreground); font-size: var(--sp-t-sm); }
.toggle { display: inline-flex; padding: 2px; border-radius: var(--sp-r-lg); background: var(--muted); }
.toggle button { height: var(--sp-ctl-sm); padding: 0 12px; border: 0; border-radius: var(--sp-r-md); background: transparent; color: var(--muted-foreground); font: inherit; font-size: var(--sp-t-sm); cursor: pointer; }
.toggle button[aria-pressed="true"] { background: var(--background); color: var(--foreground); box-shadow: var(--sp-shadow-xs); }
footer { margin-top: 48px; color: var(--muted-foreground); font-size: var(--sp-t-sm); }
@media (max-width: 640px) { .swatches { grid-template-columns: repeat(6, minmax(0, 1fr)); } .sp-app { grid-template-columns: 1fr !important; } .sp-side { display: none; } }
</style>
</head>
<body>
<div class="doc">
  <header>
    <div><h1>${esc(title)}</h1><p>${esc(s.config.description || "Tokens, components and guardrails for every surface the product touches.")}</p></div>
    <div class="toggle" role="group" aria-label="Color mode"><button data-mode="light">Light</button><button data-mode="dark">Dark</button></div>
  </header>

  <section>
    <h2>Install</h2>
    <p>Add the system to any Tailwind v4 app, then lint it. Agents read <a href="DESIGN.md">DESIGN.md</a> before writing UI.</p>
    <div class="cmd"><pre data-install>npx auto-design add ./r/ --components all</pre><pre>npx shadcn@latest add <span data-origin></span>/r/base.json</pre><pre>npx auto-design check</pre></div>
  </section>

  <section>
    <h2>Every surface</h2>
    <p>The same tokens on each surface the product touches. Where a surface owns its own look, like a text thread or a chat app, the brand travels through images, accents and words.</p>
    <div class="frames" id="frames"></div>
  </section>

  <section>
    <h2>Color</h2>
    <p>${data.report.passed} of ${data.report.total} contrast checks pass in light and dark mode.</p>
    <div class="swatches" id="brand" data-auto-design-ignore></div>
    <div class="swatches" id="neutral" data-auto-design-ignore></div>
  </section>

  <section>
    <h2>Type</h2>
    <p>${esc([s.type.fonts.display?.family, s.type.fonts.sans.family, s.type.fonts.mono.family].filter(Boolean).join(", "))}. Product screens stop at 3xl; larger steps are for marketing.</p>
    <div class="scale" id="scale"></div>
  </section>

  <section>
    <h2>Components</h2>
    <p>Each one installs on its own and passes the system's guardrails.</p>
    <div class="list">${components.map((x) => `<a href="r/${x.name}.json"><b>${esc(x.title)}</b><span>${esc(x.description)}</span></a>`).join("")}</div>
  </section>

  <footer>Generated by ${GENERATOR} from design.config.ts.</footer>
</div>
<script>
${js}
</script>
<script>
(function () {
  var data = ${json(data)};
  var copy = ${json(c)};
  var surfaces = ${json(surfaces)};
  var S = window.AutoDesignSpecimen;
  var frames = [["hero", "wide"], ["app", "wide"]];
  if (surfaces.indexOf("chat") >= 0) frames.push(["chat", ""]);
  if (surfaces.indexOf("code") >= 0) frames.push(["code", ""]);
  if (surfaces.indexOf("messaging") >= 0) frames.push(["sms", ""]);
  if (surfaces.indexOf("mcp-apps") >= 0) frames.push(["mcp", ""]);
  frames.push(["controls", ""]);
  var origin = location.origin + location.pathname.replace(/\\/[^/]*$/, "");
  document.querySelectorAll("[data-origin]").forEach(function (el) { el.textContent = origin; });
  document.querySelector("[data-install]").textContent = "npx auto-design add " + origin + "/r/ --components all";

  function draw(mode) {
    S.apply(document.body, data, mode);
    var host = document.getElementById("frames");
    host.innerHTML = "";
    frames.forEach(function (f) {
      var el = document.createElement("div");
      el.className = "frame" + (f[1] ? " " + f[1] : "");
      host.appendChild(el);
      S.render(el, data, { mode: mode, copy: copy, scenes: [f[0]], size: "l" });
    });
    ["brand", "neutral"].forEach(function (name) {
      var row = document.getElementById(name);
      row.innerHTML = data.palettes[name].map(function (p) {
        return '<div style="background:' + p.css + '"><span style="color:' + labelOn(p.css) + '">' + p.step + "</span></div>";
      }).join("");
    });
    var steps = ["6xl", "5xl", "4xl", "3xl", "2xl", "xl", "lg", "base", "sm", "xs"];
    document.getElementById("scale").innerHTML = steps.map(function (st) {
      var t = data.type[st];
      var big = ["6xl", "5xl", "4xl", "3xl", "2xl"].indexOf(st) >= 0;
      var fam = big && data.fonts.display ? "var(--sp-display)" : "var(--sp-sans)";
      var w = big ? (data.fonts.display ? data.weights.display : data.weights.strong) : data.weights.body;
      return '<div><code>' + st + " · " + t.size + '</code><span style="font-family:' + fam + ";font-size:" + t.size + ";line-height:" + t.lh + ";letter-spacing:" + t.ls + ";font-weight:" + w + '">' + S.escape(copy.headline) + "</span></div>";
    }).join("");
    document.querySelectorAll(".toggle button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
  }
  // Swatch labels in black or white, whichever reads better on that step.
  function labelOn(css) {
    var probe = document.createElement("i");
    probe.style.color = "color-mix(in srgb, " + css + " 100%, transparent 0%)";
    document.body.appendChild(probe);
    var m = /color\\(srgb ([\\d.e-]+) ([\\d.e-]+) ([\\d.e-]+)/.exec(getComputedStyle(probe).color);
    probe.remove();
    if (!m) return "#000";
    var lin = function (v) { v = Math.max(0, Math.min(1, +v)); return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    var L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
    return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "#000" : "#fff";
  }
  var root = document.documentElement;
  var mode = root.classList.contains("dark") ? "dark" : root.classList.contains("light") ? "light" : data.defaultMode;
  try { mode = localStorage.getItem("auto-design-mode") || mode; } catch (e) {}
  // Follow <html class="dark"> or "light" if something else sets it.
  new MutationObserver(function () {
    var next = root.classList.contains("dark") ? "dark" : root.classList.contains("light") ? "light" : null;
    if (next && next !== mode) { mode = next; draw(mode); }
  }).observe(root, { attributes: true, attributeFilter: ["class"] });
  document.querySelectorAll(".toggle button").forEach(function (b) {
    b.addEventListener("click", function () { mode = b.dataset.mode; try { localStorage.setItem("auto-design-mode", mode); } catch (e) {} draw(mode); });
  });
  draw(mode);
})();
</script>
</body>
</html>
`;
  return { "public/index.html": html };
}
