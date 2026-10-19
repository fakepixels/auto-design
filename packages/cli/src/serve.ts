import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import pc from "picocolors";

/** Static files for the design site: the onboarding app, the studio and `auto-design serve` all use this. */
export const SITE_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/**
 * Serve a file from `dir` for a URL path below `prefix` ("/site/" or "/").
 * Folders get their index.html; a folder asked for without its slash is
 * redirected, so the site's relative links resolve. Returns false when the
 * path isn't under the prefix.
 */
export function serveStatic(dir: string, prefix: string, req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
  if (url.pathname !== base.slice(0, -1) && !url.pathname.startsWith(base)) return false;
  if (url.pathname === base.slice(0, -1)) {
    res.writeHead(301, { location: base }).end();
    return true;
  }
  const root = resolve(dir);
  let rel: string;
  try {
    rel = decodeURIComponent(url.pathname.slice(base.length));
  } catch {
    res.writeHead(400).end();
    return true;
  }
  let file = normalize(join(root, rel));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(400).end();
    return true;
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.pathname.endsWith("/")) {
      res.writeHead(301, { location: `${url.pathname}/${url.search}` }).end();
      return true;
    }
    file = join(file, "index.html");
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end(existsSync(join(root, "index.html")) ? "Not found" : "The design site hasn't been built yet. Run `npx auto-design build`.");
    return true;
  }
  res.writeHead(200, { "content-type": SITE_MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  res.end(readFileSync(file));
  return true;
}

/** `auto-design serve`: the built site and registry from public/, on this machine. */
export async function runServe(opts: { cwd: string; port: number }) {
  const dir = join(resolve(opts.cwd), "public");
  if (!existsSync(join(dir, "index.html"))) throw new Error(`No design site in ${dir}. Run \`npx auto-design build\` in the design system repo first.`);
  const server = createServer((req, res) => {
    if (!serveStatic(dir, "/", req, res)) res.writeHead(404).end();
  });
  const port = await new Promise<number>((resolvePort, reject) => {
    let p = opts.port;
    const tryListen = () => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && p < opts.port + 20) {
          p++;
          tryListen();
        } else reject(err);
      });
      server.listen(p, "127.0.0.1", () => resolvePort(p));
    };
    tryListen();
  });
  console.log(`\n  ${pc.bold("Design site")}  ${pc.cyan(`http://localhost:${port}/`)}`);
  console.log(`  ${pc.dim(`Serving ${dir}. Ctrl+C to stop.`)}\n`);
  return { server, port };
}
