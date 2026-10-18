/**
 * The rendered-page audit: checks what the browser actually drew, which the
 * source checker can't see. Third-party widgets, CSS from a template, a
 * component that overrides a token at runtime, a layout that scrolls sideways
 * on a phone. It runs inside the page, so it is plain browser JavaScript.
 */

export interface AuditInput {
  /** Role colors for the active mode, as hex. */
  colors: Record<string, string>;
  /** Font family names the system allows (lowercase). */
  families: string[];
  /** Type scale in px. */
  sizes: number[];
  /** True at phone widths: tap targets and sideways scrolling are checked. */
  mobile: boolean;
}

export interface AuditFinding {
  rule: "off-palette" | "contrast" | "font-family" | "type-scale" | "tap-target" | "overflow" | "alt-text";
  severity: "error" | "warn";
  message: string;
  /** Up to three short selectors where it happens. */
  where: string[];
  count: number;
}

/** Evaluated in the page with the input as its argument. Must stay self-contained. */
export const AUDIT_SCRIPT = `(input) => {
  const findings = new Map();
  const add = (rule, severity, key, message, el) => {
    const id = rule + "|" + key;
    let f = findings.get(id);
    if (!f) { f = { rule, severity, message, where: [], count: 0 }; findings.set(id, f); }
    f.count++;
    if (el && f.where.length < 3) { const s = describe(el); if (!f.where.includes(s)) f.where.push(s); }
  };
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) return s + "#" + el.id;
    const slot = el.getAttribute("data-slot");
    if (slot) return s + '[data-slot="' + slot + '"]';
    const cls = (el.getAttribute("class") || "").split(/\\s+/).filter(Boolean).slice(0, 3).join(".");
    const text = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24);
    return s + (cls ? "." + cls : "") + (text ? ' "' + text + '"' : "");
  };

  // Any CSS color to [r, g, b, a]. Mixing a color with itself in srgb makes the browser resolve
  // oklch(), color-mix() and translucent values to exact sRGB floats, alpha kept separate.
  const probe = document.createElement("i");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const cache = new Map();
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const rgba = (c) => {
    if (cache.has(c)) return cache.get(c);
    probe.style.color = "";
    probe.style.color = "color-mix(in srgb, " + c + " 100%, transparent 0%)";
    const out = getComputedStyle(probe).color;
    let v = [0, 0, 0, 0];
    let m = /color\\(srgb\\s+([-\\d.e]+)\\s+([-\\d.e]+)\\s+([-\\d.e]+)(?:\\s*\\/\\s*([\\d.e]+))?\\)/.exec(out);
    if (m) v = [clamp(+m[1] * 255), clamp(+m[2] * 255), clamp(+m[3] * 255), m[4] === undefined ? 1 : +m[4]];
    else if ((m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/.exec(out))) v = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    cache.set(c, v);
    return v;
  };
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const palette = Object.entries(input.colors).map(([role, hex]) => [role, hexRgb(hex)]);
  palette.push(["white", [255, 255, 255]], ["black", [0, 0, 0]]);
  const near = (c) => palette.some(([, p]) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) <= 12);
  const hex = (c) => "#" + c.slice(0, 3).map((x) => x.toString(16).padStart(2, "0")).join("");

  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, bottom) => [0, 1, 2].map((i) => Math.round(top[i] * top[3] + bottom[i] * (1 - top[3]))).concat(1);
  // The color behind an element: composite translucent backgrounds up the tree. Null if an image is in the way.
  const behind = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };

  // Media, code (syntax colors come from the code theme) and anything marked as a sample are out of scope.
  const skip = (el) => el.closest("svg, img, video, canvas, iframe, picture, pre, code, kbd, samp, [data-auto-design-ignore], nextjs-portal");
  const visible = (el, cs) => {
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const families = new Set(input.families);
  const sizes = input.sizes;
  const all = Array.from(document.body.querySelectorAll("*")).slice(0, 4000);

  for (const el of all) {
    if (skip(el)) continue;
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());

    for (const [prop, use] of [["backgroundColor", "background"], ["color", "text"], ["borderTopColor", "border"]]) {
      if (use === "text" && !ownText) continue;
      if (use === "border" && parseFloat(cs.borderTopWidth) === 0) continue;
      const c = rgba(cs[prop]);
      if (c[3] === 0) continue;
      if (!near(c)) add("off-palette", "warn", hex(c), "Off-palette " + use + " color " + hex(c) + ". Use a role class.", el);
    }

    if (ownText) {
      const fam = (cs.fontFamily.split(",")[0] || "").trim().replace(/^["']|["']$/g, "").toLowerCase();
      if (fam && !families.has(fam) && !families.has(fam.replace(/ variable$/, ""))) add("font-family", "warn", fam, "Text set in " + fam + ", which isn't one of the system's fonts.", el);
      const px = parseFloat(cs.fontSize);
      if (!sizes.some((s) => Math.abs(s - px) < 0.6)) add("type-scale", "warn", String(px), px + "px text is off the type scale.", el);
      const bg = behind(el);
      const fg = rgba(cs.color);
      if (bg && fg[3] > 0) {
        const r = ratio(over(fg, bg), bg);
        const large = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
        const need = large ? 3 : 4.5;
        if (r < need) add("contrast", "error", hex(fg) + "/" + hex(bg), "Text contrast " + r.toFixed(2) + ":1, below " + need + ":1.", el);
      }
    }

    if (input.mobile && el.matches("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox]")) {
      const r = el.getBoundingClientRect();
      // Links inside a sentence are exempt (WCAG 2.5.8): their size is set by the text around them.
      const inSentence = el.parentElement && Array.from(el.parentElement.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      const inline = (cs.display === "inline" && el.tagName === "A") || (el.tagName === "A" && inSentence);
      if (!inline && (r.width < 24 || r.height < 24)) add("tap-target", "warn", "small", "Tap targets under 24×24px are hard to hit on a phone.", el);
    }
  }
  for (const img of document.querySelectorAll("img:not([alt])")) add("alt-text", "warn", "img", "Images need alt text (alt=\\"\\" if decorative).", img);

  if (input.mobile && document.documentElement.scrollWidth > window.innerWidth + 1) {
    add("overflow", "error", "page", "The page scrolls sideways at " + window.innerWidth + "px (" + document.documentElement.scrollWidth + "px wide).", null);
  }
  probe.remove();
  return Array.from(findings.values());
}`;
