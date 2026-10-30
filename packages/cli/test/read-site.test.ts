import { existsSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readSite } from "../src/onboard/read-site.js";

/** A Chromium to read pages with: AUTO_DESIGN_CHROMIUM, or the sandbox's preinstalled one. Skipped without either. */
function chromium(): string | null {
  if (process.env.AUTO_DESIGN_CHROMIUM) return process.env.AUTO_DESIGN_CHROMIUM;
  const base = "/opt/pw-browsers";
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const bin = join(base, dir, "chrome-linux64", "chrome");
    if (existsSync(bin)) return bin;
  }
  return null;
}
const bin = chromium();

// A one-pixel PNG, stretched by CSS: the reader looks at what an image covers, not what it shows.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNoaGgAAAMEAYFL09IQAAAAAElFTkSuQmCC";
const HOUSE = `<!doctype html><html><head><title>Maison</title><style>
body{margin:0;font:15px/1.6 Helvetica,sans-serif;color:#111;background:#fff}
header{position:absolute;inset:0 0 auto;display:grid;grid-template-columns:1fr auto 1fr;padding:24px 40px;z-index:2}
header nav a{color:#fff;text-transform:uppercase;letter-spacing:.14em;font-size:12px;margin-right:24px}
header .logo{font:500 28px Georgia,serif;letter-spacing:.35em;text-transform:uppercase;color:#fff}
.hero{position:relative;height:88vh}.hero img{position:absolute;inset:0;width:100%;height:100%}
.hero .copy{position:absolute;inset:auto 0 12%;text-align:center;color:#fff}.hero h1{font:400 84px/1 Georgia,serif}
.btn{display:inline-block;padding:14px 28px;background:#fff;color:#111;text-transform:uppercase;letter-spacing:.14em;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;padding:48px 40px}.grid img{width:100%;height:280px;display:block}
p{max-width:60ch}
</style></head><body>
<header><nav><a href="/new">New in</a><a href="/women">Women</a><a href="/men">Men</a></nav><a class="logo" href="/">Maison</a><nav><a href="/bag">Bag</a></nav></header>
<div class="hero"><img src="${PIXEL}" alt=""><div class="copy"><h1>The autumn collection</h1><a class="btn" href="/shop">Discover</a></div></div>
<div class="grid">${[1, 2, 3, 4].map((i) => `<div><img src="${PIXEL}" alt=""><p>Piece ${i}, a long enough caption to count as text</p></div>`).join("")}</div>
<p>Crafted in Florence since 1921, every piece is cut, stitched and finished by hand in our own workshops.</p>
</body></html>`;

describe.skipIf(!bin)("reading a site in a browser", () => {
  let server: Server;
  let url = "";
  beforeAll(async () => {
    process.env.AUTO_DESIGN_CHROMIUM = bin!;
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(HOUSE);
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  });
  afterAll(() => server.close());

  it("sees a fashion house as one: photos lead, full-bleed, a wordmark, uppercase labels and ink", async () => {
    const r = await readSite(url);
    expect(r.via).toBe("browser");
    expect(r.screenshot).toMatchObject({ type: "image", mediaType: "image/jpeg" });
    expect(r.material.look).toMatchObject({ imagery: "leading", hero: "full-bleed", labels: "uppercase", display: "dramatic", logo: "wordmark", ink: true, grid: "open" });
    expect(r.material.look!.facts[0]).toBe("Photography leads");
  }, 60_000);
});
