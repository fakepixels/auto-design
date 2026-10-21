// Shared by the screenshot scripts: a Chromium page whose Google Fonts requests are
// served from the @fontsource packages in node_modules, for sandboxes without Google Fonts.
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const NM = path.join(ROOT, "node_modules");
const { chromium } = require(path.join(NM, "playwright"));

function chromiumPath() {
  if (process.env.AUTO_DESIGN_CHROMIUM) return process.env.AUTO_DESIGN_CHROMIUM;
  const base = "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  for (const dir of fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const bin = path.join(base, dir, "chrome-linux", "chrome");
    if (fs.existsSync(bin)) return bin;
  }
  return undefined;
}

function packageFor(family) {
  const slug = family.toLowerCase().replace(/\s+variable$/, "").replace(/\s+/g, "-");
  for (const p of [`@fontsource-variable/${slug}`, `@fontsource/${slug}`]) if (fs.existsSync(path.join(NM, p, "index.css"))) return p;
  return null;
}

async function routeFonts(page) {
  const missing = new Set();
  await page.route("https://fonts.googleapis.com/**", (route) => {
    const families = new URL(route.request().url()).searchParams.getAll("family").map((f) => f.split(":")[0].replace(/\+/g, " "));
    let css = "";
    for (const f of families) {
      const pkg = packageFor(f);
      if (!pkg) { missing.add(f); continue; }
      css += fs.readFileSync(path.join(NM, pkg, "index.css"), "utf8").replace(/url\(\.\/files\//g, `url(https://fonts.local/${pkg}/files/`);
    }
    route.fulfill({ status: 200, contentType: "text/css", body: css });
  });
  await page.route("https://fonts.local/**", (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    route.fulfill({ status: 200, contentType: "font/woff2", body: fs.readFileSync(path.join(NM, rel)) });
  });
  return missing;
}

async function open({ width = 1440, height = 900, scale = 1, scheme = "light" } = {}) {
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-proxy-server"] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: scheme });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const missingFonts = await routeFonts(page);
  return { browser, page, errors, missingFonts };
}

module.exports = { ROOT, open, routeFonts, chromiumPath };
