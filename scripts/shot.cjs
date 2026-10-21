// Screenshot a page with its web fonts served locally.
//   node scripts/shot.cjs <url> <out.png> [width] [height] [full] [light|dark]
// Phone width: 390 844. Pass "full" for a full-page shot.
const { open } = require("./lib/browser.cjs");
const [url, out, w = "1440", h = "900", full = "", scheme = "light"] = process.argv.slice(2);
if (!url || !out) { console.error("Usage: node scripts/shot.cjs <url> <out.png> [width] [height] [full] [light|dark]"); process.exit(1); }
(async () => {
  const { browser, page, errors, missingFonts } = await open({ width: +w, height: +h, scale: 2, scheme });
  await page.goto(url, { waitUntil: "networkidle" });
  // The design site follows a class, not only the media query.
  if (scheme === "dark") await page.evaluate(() => { const r = document.documentElement; if (r.dataset.modeClass === "dark") r.classList.add("dark"); else if (r.dataset.modeClass === "light") r.classList.remove("light"); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: out, fullPage: full === "full" });
  if (missingFonts.size) console.log("Not in node_modules, so drawn in a fallback face:", [...missingFonts].join(", "));
  if (errors.length) console.log("Page errors:\n" + errors.join("\n"));
  console.log("Wrote", out);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
