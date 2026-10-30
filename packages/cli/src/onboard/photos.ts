import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { Photo } from "@auto-design/ai";

/**
 * Photos on disk: a folder that stands in for Openverse when there's no network (demos, screenshots,
 * tests), and the system repo's `images/` folder, which publishing fills with the photos the person
 * chose and their credits.
 */

const IMAGE_EXT: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/** Credits a sample folder may carry: { "file.jpg": { "creator": "…", "license": "cc0", "landing": "https://…" } }. */
type FolderCredits = Record<string, { creator?: string; license?: string; licenseVersion?: string; landing?: string; alt?: string }>;

/** A photo search over a local folder: every image in it, whatever the words. Served at /photos/local/<file>. */
export function localPhotoSearch(dir: string) {
  const root = resolve(dir);
  return async (): Promise<Photo[]> => {
    const credits: FolderCredits = existsSync(join(root, "credits.json")) ? JSON.parse(readFileSync(join(root, "credits.json"), "utf8")) : {};
    return readdirSync(root)
      .filter((f) => IMAGE_EXT[extname(f).toLowerCase()])
      .sort()
      .map((file) => {
        const c = credits[file] ?? {};
        const size = imageSize(join(root, file));
        return {
          id: `local:${file}`,
          url: `/photos/local/${encodeURIComponent(file)}`,
          thumb: `/photos/local/${encodeURIComponent(file)}`,
          width: size?.width ?? null,
          height: size?.height ?? null,
          alt: c.alt ?? file.replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " "),
          title: file,
          creator: c.creator ?? null,
          creatorUrl: null,
          license: c.license ?? "sample",
          licenseVersion: c.licenseVersion ?? null,
          licenseUrl: null,
          landing: c.landing ?? null,
          credit: c.creator ? `Photo by ${c.creator}${c.license ? `, ${c.license.toUpperCase()}` : ""}` : "Sample photo",
          source: "openverse" as const,
        };
      });
  };
}

/** Serve a file from the local photo folder, or say it isn't there. */
export function localPhotoFile(dir: string, name: string): { mediaType: string; data: Buffer } | null {
  const root = resolve(dir);
  const file = resolve(root, decodeURIComponent(name));
  if (!file.startsWith(root + "/") || !existsSync(file) || !statSync(file).isFile()) return null;
  const mediaType = IMAGE_EXT[extname(file).toLowerCase()];
  return mediaType ? { mediaType, data: readFileSync(file) } : null;
}

/** Width and height from a JPEG, PNG or WebP header, without decoding it. */
export function imageSize(file: string | Buffer): { width: number; height: number } | null {
  const b = typeof file === "string" ? readFileSync(file) : file;
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") { const n = b.readUInt32LE(21); return { width: 1 + (n & 0x3fff), height: 1 + ((n >> 14) & 0x3fff) }; }
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]!;
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

/** One photo as the system repo records it in images/credits.json. */
export interface ImageRecord {
  file: string;
  alt: string;
  width: number | null;
  height: number | null;
  credit: string;
  license: string;
  licenseUrl: string | null;
  source: string | null;
  creator: string | null;
}

const MAX_BYTES = 8 * 1024 * 1024;

async function download(url: string): Promise<{ data: Buffer; mediaType: string } | null> {
  const res = await fetch(url, { headers: { "user-agent": "auto-design (https://github.com/fakepixels/auto-design)" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const mediaType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!/^image\/(jpeg|png|webp)$/.test(mediaType)) return null;
  const data = Buffer.from(await res.arrayBuffer());
  return data.length && data.length <= MAX_BYTES ? { data, mediaType } : null;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Put the chosen photos in the repo's images/ folder with their credits: the full image from its source,
 * else Openverse's own copy, and the person's own files as they gave them. Returns what was written and
 * what couldn't be fetched.
 */
export async function writePhotos(
  dir: string,
  photos: Photo[],
  own: Map<string, { mediaType: string; data: Buffer }>,
  local?: (name: string) => { mediaType: string; data: Buffer } | null,
): Promise<{ written: ImageRecord[]; failed: string[] }> {
  if (!photos.length) return { written: [], failed: [] };
  const out = join(dir, "images");
  mkdirSync(out, { recursive: true });
  const written: ImageRecord[] = [];
  const failed: string[] = [];
  for (const [i, p] of photos.entries()) {
    let got: { data: Buffer; mediaType: string } | null = null;
    try {
      if (p.source === "own") got = own.get(p.id) ?? null;
      else if (p.id.startsWith("local:")) got = local?.(p.id.slice(6)) ?? null;
      else got = (await download(p.url).catch(() => null)) ?? (await download(`${p.thumb}${p.thumb.includes("?") ? "&" : "?"}full_size=true`).catch(() => null));
    } catch {
      got = null;
    }
    if (!got) {
      failed.push(p.title || p.id);
      continue;
    }
    const file = `photo-${String(i + 1).padStart(2, "0")}.${EXT[got.mediaType] ?? "jpg"}`;
    writeFileSync(join(out, file), got.data);
    const size = imageSize(got.data);
    written.push({
      file,
      alt: p.alt,
      width: size?.width ?? p.width,
      height: size?.height ?? p.height,
      credit: p.credit,
      license: p.license,
      licenseUrl: p.licenseUrl,
      source: p.landing,
      creator: p.creator,
    });
  }
  if (written.length) {
    writeFileSync(join(out, "credits.json"), JSON.stringify({ images: written }, null, 2) + "\n");
    writeFileSync(join(out, "CREDITS.md"), creditsMarkdown(written));
  }
  return { written, failed };
}

/** The credits page: one line per photo, with its license and where it came from. */
export function creditsMarkdown(list: ImageRecord[]): string {
  const lines = [
    "# Photo credits",
    "",
    "The photos in this folder and where they come from. Photos from Openverse are openly licensed; keep these",
    "credits with them wherever they're shown (a footer or an About page is enough). Replace them with your own",
    "photography when you have it, and update `credits.json`.",
    "",
  ];
  for (const r of list) {
    const link = r.source ? ` ([source](${r.source}))` : "";
    const license = r.licenseUrl ? ` · [license](${r.licenseUrl})` : "";
    lines.push(`- \`${r.file}\`: ${r.alt}. ${r.credit}${link}${license}`);
  }
  return lines.join("\n") + "\n";
}
