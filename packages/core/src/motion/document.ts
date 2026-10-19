import { googleFontsHref, motionRuntime, specimenData } from "../site/specimen.js";
import type { SpecimenCopy } from "../site/copy.js";
import type { DesignSystem } from "../system.js";
import { motionCss } from "./css.js";
import { FORMATS, animationsFor, renderAnimation, type AnimationFormat, type AnimationProps } from "./templates.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * A stage: the frame an animation plays in. It scales to whatever box holds it.
 * mode "inherit" takes colors from the page, so a stage follows the site's own
 * light and dark switch.
 */
export function animationStage(s: DesignSystem, id: string, opts: { copy: SpecimenCopy; props?: AnimationProps; format?: AnimationFormat; mode?: "light" | "dark" | "inherit"; className?: string }): string {
  const format = opts.format ?? "landscape";
  const r = renderAnimation(s, id, { copy: opts.copy, props: opts.props, format });
  const f = FORMATS[format];
  const mode = opts.mode ?? (s.config.color.modes === "dark" ? "dark" : s.config.color.modes === "light" ? "light" : s.config.color.defaultMode);
  const modeClass = mode === "inherit" ? "" : ` adm-${mode}`;
  return `<div class="adm-stage${modeClass}${opts.className ? ` ${opts.className}` : ""}" data-animation="${esc(id)}" data-format="${format}" data-duration="${r.duration}" data-loop="${r.loop ? 1 : 0}" style="aspect-ratio:${f.width} / ${f.height}"><div class="adm-frame"><div class="adm-backdrop"></div>${r.html}</div></div>`;
}

export interface DocumentOptions {
  copy: SpecimenCopy;
  props?: AnimationProps;
  format?: AnimationFormat;
  mode?: "light" | "dark";
  /**
   * "play" loops in a browser window (click to pause); "render" holds still at
   * time 0 and exposes window.__seek(ms) for frame-by-frame capture.
   */
  purpose?: "play" | "render";
}

/** One animation as a self-contained HTML file: open it in a browser, embed it, or render it to video. */
export function animationDocument(s: DesignSystem, id: string, opts: DocumentOptions): string {
  const info = animationsFor(s).find((a) => a.id === id);
  const format = opts.format ?? "landscape";
  const f = FORMATS[format];
  const stage = animationStage(s, id, opts);
  const fonts = googleFontsHref(specimenData(s));
  const render = opts.purpose === "render";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${info?.title ?? id} · ${s.config.displayName}`)}</title>
<meta name="generator" content="auto-design">
<link rel="stylesheet" href="${esc(fonts)}">
<style>
${motionCss(s)}
html, body { margin: 0; height: 100%; background: ${render ? "transparent" : "#111"}; }
body { display: grid; place-items: center; overflow: hidden; }
.adm-stage { width: min(100vw, calc(100vh * ${f.width} / ${f.height})); cursor: ${render ? "default" : "pointer"}; }
</style>
</head>
<body>
${stage}
<script>
${motionRuntime()}
(function () {
  var stage = document.querySelector(".adm-stage");
  var start = function () {
    var ctl = ADMotion.mount(stage, { autoplay: ${render ? "false" : "true"}, loop: true, respectReducedMotion: ${render ? "false" : "true"} });
    window.__adm = ctl;
    window.__seek = function (ms) { ctl.seek(ms); return ctl.duration; };
    window.__duration = ctl.duration;
    ${render ? "" : `stage.addEventListener("click", function () { ctl.playing ? ctl.pause() : ctl.play(); });`}
    window.__ready = true;
  };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { requestAnimationFrame(start); });
})();
</script>
</body>
</html>
`;
}
