import type { SiteMeasure } from "@auto-design/ai";
import { launchBrowser } from "../agents.js";

/**
 * Measure a page as a browser draws it: the ground it sits on, the faces,
 * sizes and weights of its text and headline, and its main button. This is
 * what makes a system keep a product's own look, so it runs whenever a
 * browser is installed; without one, the CSS is read on its own.
 *
 * The script is a string so nothing the bundler adds to functions reaches the
 * page, and it avoids regex escapes for the same reason.
 */
const SCRIPT = `(() => {
  const clear = (c) => !c || c === "transparent" || c.endsWith(", 0)") || c.endsWith("/ 0)");
  const groundAt = (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el) {
      const c = getComputedStyle(el).backgroundColor;
      if (!clear(c)) return c;
      el = el.parentElement;
    }
    // Past the end of a short page the point lands on <html>, which is painted with the body's background.
    const body = getComputedStyle(document.body).backgroundColor;
    return clear(body) ? "rgb(255, 255, 255)" : body;
  };
  const w = innerWidth, h = innerHeight;
  const tally = {};
  for (const [x, y] of [[w / 2, h * 0.35], [24, h * 0.5], [w - 24, h * 0.5], [w / 2, h * 0.8], [24, h * 0.9]]) {
    const c = groundAt(x, y);
    tally[c] = (tally[c] || 0) + 1;
  }
  const background = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || null;
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.1;
  };
  const first = (name) => (name.split(",")[0] || "").trim().split('"').join("").split("'").join("");
  const kind = (stack) => {
    const s = stack.toLowerCase();
    if (s.includes("monospace")) return "mono";
    const generic = s.split(",").map((x) => x.trim()).pop();
    if (generic === "serif" || generic === "ui-serif") return "serif";
    return "sans";
  };
  const median = (list) => { const s = list.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

  // Text: the size most paragraphs are set in, weighted by how much they say.
  const paras = [...document.querySelectorAll("p, li")].filter((el) => seen(el) && el.textContent.trim().length > 40).slice(0, 60);
  const sizes = paras.map((el) => parseFloat(getComputedStyle(el).fontSize));
  const bodyEl = paras[0] || document.body;
  const bs = getComputedStyle(bodyEl);

  // The headline: the first visible h1, or else the largest heading on the page.
  const heads = [...document.querySelectorAll("h1, h2")].filter(seen);
  const h1 = heads.find((el) => el.tagName === "H1") || heads.sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0];
  const hs = h1 ? getComputedStyle(h1) : null;
  const size = hs ? parseFloat(hs.fontSize) : null;
  const spacing = hs ? (hs.letterSpacing === "normal" ? 0 : parseFloat(hs.letterSpacing) / size) : null;

  // The main button: the first filled control big enough to press.
  const btn = [...document.querySelectorAll("button, a, [role=button], input[type=submit]")].find((el) => {
    if (!seen(el)) return false;
    const r = el.getBoundingClientRect();
    return r.height >= 26 && r.height <= 84 && r.width >= 56 && r.width <= 480 && !clear(getComputedStyle(el).backgroundColor);
  });
  const br = btn ? btn.getBoundingClientRect() : null;
  const radius = btn ? parseFloat(getComputedStyle(btn).borderTopLeftRadius) : null;

  return {
    background,
    bodyFont: first(bs.fontFamily) || null,
    bodyKind: kind(bs.fontFamily),
    bodySize: median(sizes) || parseFloat(getComputedStyle(document.body).fontSize) || null,
    headingFont: hs ? first(hs.fontFamily) || null : null,
    headingKind: hs ? kind(hs.fontFamily) : null,
    headingSize: size,
    headingWeight: hs ? Number(hs.fontWeight) || null : null,
    headingTracking: spacing === null || Number.isNaN(spacing) ? null : Math.round(spacing * 1000) / 1000,
    controlHeight: br ? Math.round(br.height) : null,
    // A pill's radius says "fully round", not a corner size, so it isn't a reading of the system's corners.
    radius: btn && br && radius !== null && radius < br.height / 2 - 1 && radius <= 24 ? Math.round(radius) : null,
  };
})()`;

/** Names a browser reports for fonts nobody chose: the page fell back to the system's. */
const SYSTEM_FACE = /^(?:-apple-system|system-ui|ui-|blinkmacsystemfont|segoe ui|helvetica|arial|times|sans-serif|serif|monospace|__)/i;

export async function measureRendered(url: string): Promise<Partial<SiteMeasure> | null> {
  if (process.env.AUTO_DESIGN_NO_RENDER) return null;
  let browser: Awaited<ReturnType<typeof launchBrowser>>;
  try {
    browser = await launchBrowser();
  } catch {
    return null;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12_000 });
    // Fonts and client-rendered pages settle a moment after the document does.
    await page.evaluate("document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 400)))");
    const m = (await page.evaluate(SCRIPT)) as Partial<SiteMeasure>;
    // Next.js and others rename faces ("__Newsreader_a1b2c3"): take the name out of the wrapper.
    for (const k of ["bodyFont", "headingFont"] as const) {
      const name = m[k]?.replace(/^__/, "").replace(/_(?:Fallback_)?[0-9a-f]{6}$/i, "").replace(/_/g, " ").trim();
      m[k] = name && !SYSTEM_FACE.test(name) ? name : null;
    }
    return m;
  } catch {
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}
