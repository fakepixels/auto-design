/**
 * Photos from Openverse (openverse.org), WordPress's open-source search engine for openly licensed media.
 * It needs no key, and every result carries its license, its creator and a link back, so a system can
 * ship the photos it previews with their credits. Only licenses that allow commercial use and changes
 * (CC0, the public domain mark, CC BY and CC BY-SA) are asked for, photographs only.
 */

export interface Photo {
  /** Stable id: "openverse:<id>" or "own:<n>". */
  id: string;
  /** The full image. */
  url: string;
  /** A smaller copy for previews (Openverse serves these itself, with CORS). */
  thumb: string;
  width: number | null;
  height: number | null;
  /** What the photo shows, for alt text. */
  alt: string;
  title: string;
  creator: string | null;
  creatorUrl: string | null;
  /** "cc0", "pdm", "by", "by-sa" … or "own" for the person's own photos. */
  license: string;
  licenseVersion: string | null;
  licenseUrl: string | null;
  /** The page the photo comes from. */
  landing: string | null;
  /** Ready-made credit line. */
  credit: string;
  source: "openverse" | "own";
}

export interface PhotoQuery {
  q: string;
  /** Tall for product shots and editorial columns, wide for full-bleed first screens. */
  aspect?: "tall" | "wide" | "square";
  count?: number;
  signal?: AbortSignal;
}

const API = "https://api.openverse.org/v1/images/";

type Search = (query: PhotoQuery) => Promise<Photo[]>;
let override: Search | null = null;
/** Replace the search (tests, offline demos). Pass null to restore Openverse. */
export function setPhotoSearch(fn: Search | null) {
  override = fn;
}

const LICENSE_NAMES: Record<string, string> = { cc0: "CC0", pdm: "Public Domain Mark", by: "CC BY", "by-sa": "CC BY-SA", "by-nc": "CC BY-NC", "by-nd": "CC BY-ND" };

/** "Photo by Jane Doe, CC BY 2.0, via Flickr" — plain, and enough to satisfy CC BY's attribution terms with the link. */
export function creditLine(p: Pick<Photo, "creator" | "license" | "licenseVersion" | "source"> & { provider?: string | null }): string {
  if (p.source === "own") return "Your photo";
  const license = `${LICENSE_NAMES[p.license] ?? p.license.toUpperCase()}${p.licenseVersion && p.license !== "cc0" && p.license !== "pdm" ? ` ${p.licenseVersion}` : ""}`;
  return [`Photo${p.creator ? ` by ${p.creator}` : ""}`, license, p.provider ? `via ${p.provider[0]!.toUpperCase()}${p.provider.slice(1)}` : ""].filter(Boolean).join(", ");
}

interface OpenverseResult {
  id: string;
  title?: string | null;
  url: string;
  thumbnail?: string | null;
  width?: number | null;
  height?: number | null;
  creator?: string | null;
  creator_url?: string | null;
  license: string;
  license_version?: string | null;
  license_url?: string | null;
  foreign_landing_url?: string | null;
  provider?: string | null;
  source?: string | null;
  mature?: boolean;
  tags?: { name: string }[];
}

/** Search Openverse for photographs the system may ship and change. */
export async function searchPhotos(query: PhotoQuery): Promise<Photo[]> {
  if (override) return override(query);
  const params = new URLSearchParams({
    q: query.q,
    license_type: "commercial,modification",
    category: "photograph",
    page_size: String(Math.min(20, Math.max(1, query.count ?? 12))),
    mature: "false",
    filter_dead: "true",
  });
  if (query.aspect) params.set("aspect_ratio", query.aspect);
  const res = await fetch(`${API}?${params}`, {
    headers: { accept: "application/json", "user-agent": "auto-design (https://github.com/fakepixels/auto-design)" },
    signal: query.signal ?? AbortSignal.timeout(15_000),
  });
  if (res.status === 429) throw new Error("Openverse is busy right now. Try the search again in a minute.");
  if (!res.ok) throw new Error(`Openverse answered ${res.status}.`);
  const body = (await res.json()) as { results?: OpenverseResult[] };
  return (body.results ?? []).filter((r) => r.url && !r.mature).map(fromOpenverse);
}

export function fromOpenverse(r: OpenverseResult): Photo {
  const photo: Photo = {
    id: `openverse:${r.id}`,
    url: r.url,
    thumb: r.thumbnail || `${API}${r.id}/thumb/`,
    width: r.width ?? null,
    height: r.height ?? null,
    alt: (r.title || r.tags?.slice(0, 3).map((t) => t.name).join(", ") || "Photo").slice(0, 120),
    title: (r.title || "Untitled").slice(0, 160),
    creator: r.creator ?? null,
    creatorUrl: r.creator_url ?? null,
    license: r.license,
    licenseVersion: r.license_version ?? null,
    licenseUrl: r.license_url ?? null,
    landing: r.foreign_landing_url ?? null,
    credit: "",
    source: "openverse",
  };
  photo.credit = creditLine({ ...photo, provider: r.source ?? r.provider ?? null });
  return photo;
}

/** Words that say little about what a photo should show. */
const STOP = new Set(
  ("a an and the for of to in on with by from your our their its it is are be that this these those as at or into over under per via who what " +
    "when where how why we you they app apps platform tool tools software service services solution solutions product products company teams team " +
    "people made make makes making help helps lets offer offers offering sell sells selling provide provides build builds everyday every simple " +
    "easy fast new best one all more most just like online clients customers users personal appointments shop store brand").split(" "),
);

/** The default subject by kind, when the description names nothing a photo can show. */
const KIND_SUBJECT: Record<string, string> = {
  ecommerce: "product still life",
  consumer: "people lifestyle",
  saas: "people working office",
  agent: "desk workspace",
  devtool: "workspace laptop",
};

/**
 * Search words for a product's photos, without a model: the description's first concrete words (the
 * product's own name left out), then the kind's subject as a fallback. A model writes better ones.
 */
export function photoQueries(product: string, description: string, kind: string | null, vibe: string | null = null): string[] {
  const name = new Set(product.toLowerCase().split(/\s+/));
  const words = description
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w) && !name.has(w));
  const mood = vibe === "luxury" ? "luxury" : vibe === "scifi" ? "night city" : "";
  const out = [words.slice(0, 2).join(" "), [mood, KIND_SUBJECT[kind ?? ""] ?? "lifestyle"].filter(Boolean).join(" "), words[0] ?? ""];
  return [...new Set(out.map((q) => q.trim()).filter(Boolean))].slice(0, 3);
}
