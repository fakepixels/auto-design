import { extractFromSite, lookFromPage, pairingForFonts, type PageMeasure, type SiteMaterial, type Part } from "@auto-design/ai";
import { findFont, PAIRINGS } from "@auto-design/core";
import { launchBrowser } from "../agents.js";

/**
 * Read a site the way a designer looks at it: open it in a real browser, let it settle, and measure the
 * first screen (how much of it is photography, its shape, the headline against the text, the labels, the
 * logo, the colors the interface itself uses). The plain download in `extractFromSite` still runs for the
 * CSS-level facts and is the fallback when no browser is installed or the site won't render in one.
 */

/** A desktop Chrome's user agent: some sites serve a stripped page, or nothing, to anything else. */
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/**
 * Runs in the page. Plain browser JavaScript in a raw string, so a bundler can't rewrite it, and no
 * template placeholders inside. Returns a PageMeasure.
 */
export const MEASURE_SCRIPT = String.raw`() => {
  const vw = innerWidth, vh = innerHeight;
  const cs = (el) => getComputedStyle(el);
  const rect = (el) => el.getBoundingClientRect();
  const shown = (el) => {
    const r = rect(el), s = cs(el);
    return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity || "1") > 0.05;
  };
  const hex = (c) => {
    const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(c || "");
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) < 0.5) return null;
    return "#" + [m[1], m[2], m[3]].map((v) => Math.round(+v).toString(16).padStart(2, "0")).join("");
  };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) { const h = hex(cs(e).backgroundColor); if (h) return h; }
    return "#ffffff";
  };
  const isMedia = (el) => {
    const t = el.tagName;
    if (t === "IMG" || t === "VIDEO" || t === "PICTURE" || t === "CANVAS") return true;
    const bg = cs(el).backgroundImage;
    return !!bg && bg !== "none" && bg.indexOf("url(") >= 0;
  };
  const bigEnough = (el) => { const r = rect(el); return r.width * r.height >= vw * vh * 0.015; };

  // Photography in the first screen, sampled on a grid: a point counts when a sizeable picture is under it.
  let hits = 0, total = 0;
  const media = new Set();
  for (let y = vh / 48; y < vh; y += vh / 24) {
    for (let x = vw / 64; x < vw; x += vw / 32) {
      total++;
      const stack = document.elementsFromPoint(x, y);
      const m = stack.find((e) => isMedia(e) && bigEnough(e));
      if (m) { hits++; media.add(m); }
    }
  }
  const pics = [...media].map((el) => ({ el, r: rect(el) }));
  const fullBleed = pics.some((p) => p.r.width >= vw * 0.9 && p.r.height >= vh * 0.5 && p.r.top < vh * 0.25);

  // The headline: the largest text in the first screen.
  let headline = null, headEl = null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent || "").trim();
    if (text.length < 3) continue;
    const el = n.parentElement;
    if (!el || !shown(el)) continue;
    const r = rect(el);
    if (r.top > vh || r.bottom < 0) continue;
    const size = parseFloat(cs(el).fontSize);
    if (!headline || size > headline.size) { headline = { size, family: cs(el).fontFamily.split(",")[0].replace(/["']/g, "").trim(), text: text.slice(0, 80) }; headEl = el; }
  }
  // The body size: the most common size of real paragraphs on the page.
  const sizes = new Map();
  for (const p of document.querySelectorAll("p, li, dd")) {
    if ((p.textContent || "").trim().length < 40 || !shown(p)) continue;
    const s = Math.round(parseFloat(cs(p).fontSize));
    sizes.set(s, (sizes.get(s) || 0) + 1);
  }
  const bodySize = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || parseFloat(cs(document.body).fontSize) || 16;

  let centered = false, split = false;
  if (headEl) {
    const block = headEl.closest("h1, h2, h3, p, div, section") || headEl;
    const r = rect(block), mid = (r.left + r.right) / 2;
    centered = cs(block).textAlign === "center" || (Math.abs(mid - vw / 2) < vw * 0.06 && r.width < vw * 0.9);
    const hr = rect(headEl);
    split = !fullBleed && pics.some((p) => p.r.width >= vw * 0.25 && p.r.width <= vw * 0.75 && p.r.height >= vh * 0.3 && (p.r.left >= hr.right - 8 || p.r.right <= hr.left + 8));
  }

  // Navigation: links and buttons in the header band.
  const nav = { count: 0, upper: 0, tracked: 0 };
  for (const a of document.querySelectorAll("header a, header button, nav a, nav button, a, button")) {
    const r = rect(a);
    if (r.top > 160 || r.bottom < 0 || !shown(a)) continue;
    const text = (a.innerText || "").trim();
    if (!text || text.length > 24 || !/[a-z]/i.test(text)) continue;
    const s = cs(a);
    nav.count++;
    if (s.textTransform === "uppercase" || text === text.toUpperCase()) nav.upper++;
    if (parseFloat(s.letterSpacing) / parseFloat(s.fontSize) >= 0.05) nav.tracked++;
    if (nav.count >= 14) break;
  }

  // The logo: a link home in the header band.
  let logo = null;
  const home = location.origin + "/";
  for (const a of document.querySelectorAll("a[href]")) {
    const r = rect(a);
    if (r.top > 160 || !shown(a)) continue;
    let href = "";
    try { href = new URL(a.getAttribute("href"), location.href).href.split(/[?#]/)[0]; } catch (e) { continue; }
    if (href !== home && href !== location.href.split(/[?#]/)[0]) continue;
    const text = (a.innerText || "").trim();
    const s = cs(a);
    logo = {
      centered: Math.abs((r.left + r.right) / 2 - vw / 2) < vw * 0.08,
      text: text.length > 0,
      upper: text.length > 0 && (s.textTransform === "uppercase" || text === text.toUpperCase()),
      tracked: parseFloat(s.letterSpacing) / parseFloat(s.fontSize) >= 0.1,
    };
    break;
  }

  // A collection: the largest group of three or more siblings that each hold a picture, in the first three screens.
  let collection = null;
  for (const parent of document.querySelectorAll("ul, ol, div, section")) {
    const r = rect(parent);
    if (r.top > vh * 3 || r.bottom < 0) continue;
    const kids = [...parent.children].filter((k) => shown(k) && k.querySelector("img, picture, video"));
    if (kids.length < 3 || kids.length > 40) continue;
    const widths = kids.map((k) => rect(k).width).filter((w) => w > 40);
    if (widths.length < 3) continue;
    const boxed = kids.slice(0, 4).filter((k) => {
      const s = cs(k);
      const border = parseFloat(s.borderTopWidth) > 0 && hex(s.borderTopColor);
      const fill = hex(s.backgroundColor) && hex(s.backgroundColor) !== bgOf(parent);
      return border || fill || (s.boxShadow && s.boxShadow !== "none");
    }).length >= 2;
    const item = { items: kids.length, boxed, uneven: Math.max(...widths) / Math.min(...widths) >= 1.5, pictured: true };
    if (!collection || item.items > collection.items) collection = item;
  }

  // The interface's own colors: filled buttons, and link text, weighted by how much of the page they cover.
  const ctas = [], links = new Map();
  for (const el of document.querySelectorAll("a, button, [role=button], input[type=submit]")) {
    if (!shown(el)) continue;
    const r = rect(el);
    if (r.top > vh * 2) continue;
    const s = cs(el);
    const bg = hex(s.backgroundColor);
    if (bg && bg !== bgOf(el.parentElement || document.body) && r.width >= 48 && r.height >= 24 && r.height <= 96) {
      ctas.push({ bg, fg: hex(s.color) || "#000000", weight: Math.round(r.width * r.height) });
    } else {
      const c = hex(s.color);
      if (c) links.set(c, (links.get(c) || 0) + (el.innerText || "").length);
    }
    if (ctas.length > 40) break;
  }
  const radii = [];
  for (const el of document.querySelectorAll("button, input, a[class*=btn], a[class*=button]")) {
    if (!shown(el) || rect(el).top > vh * 2) continue;
    const v = parseFloat(cs(el).borderTopLeftRadius);
    if (!isNaN(v) && v < 40) radii.push(v);
  }
  radii.sort((a, b) => a - b);
  const fonts = [];
  for (const el of [headEl, document.querySelector("p"), document.body]) {
    if (!el) continue;
    const f = cs(el).fontFamily.split(",")[0].replace(/["']/g, "").trim();
    if (f && fonts.indexOf(f) < 0) fonts.push(f);
  }

  return {
    width: vw, height: vh,
    photoShare: total ? hits / total : 0,
    fullBleed, split, centered,
    headline, bodySize,
    nav, logo, collection,
    ctas: ctas.slice(0, 24),
    links: [...links.entries()].map(([color, weight]) => ({ color, weight })).sort((a, b) => b.weight - a.weight).slice(0, 8),
    pageBg: bgOf(document.elementFromPoint(vw / 2, vh - 4) || document.body),
    text: hex(cs(document.body).color) || "#111111",
    radius: radii.length >= 2 ? Math.round(radii[Math.floor(radii.length / 2)]) : null,
    fonts,
  };
}`;

/** Hide cookie banners and consent walls that would otherwise be read as the page. */
const UNCOVER_SCRIPT = String.raw`() => {
  for (const el of document.querySelectorAll("body *")) {
    const s = getComputedStyle(el);
    if (s.position !== "fixed" && s.position !== "sticky") continue;
    const id = ((el.id || "") + " " + (el.className && el.className.baseVal === undefined ? el.className : "")).toLowerCase();
    if (/cookie|consent|onetrust|didomi|cmp|gdpr|privacy|truste|usercentrics|banner-overlay|modal-backdrop/.test(id)) el.style.setProperty("display", "none", "important");
  }
  document.documentElement.style.setProperty("overflow", "auto", "important");
  document.body.style.setProperty("overflow", "auto", "important");
}`;

export interface SiteReading {
  material: SiteMaterial;
  /** The first screen as the browser drew it, for a model to look at. Absent when no browser read it. */
  screenshot: Part | null;
  /** How the site was read, for the person: in a browser, or from its code alone. */
  via: "browser" | "download";
}

/** Read a site in a browser when one is available, and from its code either way. */
export async function readSite(input: string): Promise<SiteReading> {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).toString();
  // The code-level read (CSS colors, fonts, corners, title) runs alongside, and stands alone if the browser can't.
  const download = extractFromSite(url).catch((err: unknown) => err as Error);
  let measured: { measure: PageMeasure; shot: Buffer; title: string } | null = null;
  let browserError: Error | null = null;
  try {
    measured = await measureInBrowser(url);
  } catch (err) {
    browserError = err as Error;
  }
  const code = await download;
  if (!measured) {
    if (code instanceof Error) throw browserError && !/Playwright/.test(browserError.message) ? browserError : code;
    return { material: code, screenshot: null, via: "download" };
  }
  const look = lookFromPage(measured.measure);
  const base: SiteMaterial = code instanceof Error ? emptyMaterial(url, measured.title) : code;
  // Fonts the browser actually drew beat the ones named in the CSS.
  const fonts = [...new Set([...measured.measure.fonts, ...base.fonts])].slice(0, 5);
  const catalogFonts = catalogFor(look.headlineFont, measured.measure.fonts[1] ?? measured.measure.fonts[0] ?? null);
  const material: SiteMaterial = {
    ...base,
    title: base.title || measured.title,
    fonts,
    catalogFonts: catalogFonts ?? base.catalogFonts,
    pairing: pairingForFonts(fonts) ?? base.pairing,
    radius: measured.measure.radius ?? base.radius,
    dark: look.dark || base.dark,
    // The interface's measured colors lead; the CSS's follow.
    colors: [
      ...look.uiColors.map((hex, i) => ({ css: hex, hex, score: 100 - i })),
      ...base.colors.filter((c) => !look.uiColors.includes(c.hex)),
    ].slice(0, 6),
    look,
    summary: [base.summary || `Site: ${url}`, `What a browser saw: ${look.facts.join("; ")}.`].join("\n"),
  };
  return { material, screenshot: { type: "image", mediaType: "image/jpeg", data: measured.shot.toString("base64") }, via: "browser" };
}

function emptyMaterial(url: string, title: string): SiteMaterial {
  return { url, title, description: "", themeColor: null, colors: [], neutral: null, fonts: [], pairing: null, catalogFonts: null, radius: null, dark: false, summary: `Site: ${url}` };
}

/**
 * Catalog faces for what the browser drew: the body face, and a display face only when the headline is set
 * in a different face that the catalog has as a display face. Null when the catalog has neither.
 */
function catalogFor(headline: string | null, body: string | null): SiteMaterial["catalogFonts"] {
  const head = headline ? findFont(headline) : null;
  const text = body ? findFont(body) : null;
  const sans = text && text.roles.includes("body") && text.kind !== "mono" ? text.id : head && head.roles.includes("body") && head.kind !== "mono" ? head.id : null;
  const display = head && head.id !== sans && head.roles.includes("display") ? head.id : null;
  if (!sans && !display) return null;
  return { sans: sans ?? PAIRINGS[0]!.sans.font, mono: "jetbrains-mono", display };
}

async function measureInBrowser(url: string): Promise<{ measure: PageMeasure; shot: Buffer; title: string }> {
  const browser = await launchBrowser();
  try {
    const page = (await browser.newPage({ viewport: { width: 1440, height: 900 }, userAgent: USER_AGENT, locale: "en-US" })) as Awaited<ReturnType<typeof browser.newPage>> & {
      title(): Promise<string>;
      waitForLoadState(state: string, o?: object): Promise<void>;
    };
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate(`(${UNCOVER_SCRIPT})()`);
    await page.waitForTimeout(300);
    const measure = await page.evaluate<PageMeasure>(`(${MEASURE_SCRIPT})()`);
    const shot = await page.screenshot({ type: "jpeg", quality: 72 });
    const title = await page.title().catch(() => "");
    return { measure, shot, title };
  } finally {
    await browser.close();
  }
}
