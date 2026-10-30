import { afterEach, describe, expect, it } from "vitest";
import {
  creditLine,
  fromOpenverse,
  isChromatic,
  lookFromPage,
  lookFromPixels,
  lookPatch,
  patchFromSite,
  photoQueries,
  searchPhotos,
  setPhotoSearch,
  type PageMeasure,
} from "../src/index.js";

/** A fashion house's home page as a browser measures it: one photo fills the screen, a centered wordmark. */
const HOUSE: PageMeasure = {
  width: 1440, height: 900,
  photoShare: 0.94, fullBleed: true, split: false, centered: true,
  headline: { size: 84, family: "Cormorant Garamond", text: "The autumn collection" },
  bodySize: 15,
  nav: { count: 4, upper: 4, tracked: 4 },
  logo: { centered: true, text: true, upper: true, tracked: true },
  collection: { items: 4, boxed: false, uneven: false, pictured: true },
  ctas: [{ bg: "#ffffff", fg: "#111111", weight: 4000 }, { bg: "#111111", fg: "#ffffff", weight: 3600 }],
  links: [{ color: "#ffffff", weight: 40 }, { color: "#111111", weight: 30 }],
  pageBg: "#ffffff", text: "#111111", radius: 0, fonts: ["Cormorant Garamond", "Helvetica"],
};

/** Software's home page: words beside a screenshot, a blue button, cards. */
const SAAS: PageMeasure = {
  width: 1440, height: 900,
  photoShare: 0.2, fullBleed: false, split: true, centered: false,
  headline: { size: 52, family: "Inter", text: "Project planning for agencies" },
  bodySize: 16,
  nav: { count: 5, upper: 0, tracked: 0 },
  logo: { centered: false, text: true, upper: false, tracked: false },
  collection: null,
  ctas: [{ bg: "#2563eb", fg: "#ffffff", weight: 3000 }],
  links: [{ color: "#475569", weight: 60 }],
  pageBg: "#ffffff", text: "#0f172a", radius: 8, fonts: ["Inter"],
};

describe("reading a reference's look", () => {
  it("reads a fashion house as photography-led, full-bleed, a wordmark and a black-and-white interface", () => {
    const look = lookFromPage(HOUSE);
    expect(look).toMatchObject({ imagery: "leading", hero: "full-bleed", grid: "open", labels: "uppercase", display: "dramatic", logo: "wordmark", ink: true, inkColor: "#111111", dark: false });
    expect(look.headlineRatio).toBe(5.6);
    expect(look.facts).toContain("A black-and-white interface; the color is in the photos");
    expect(look.facts).toContain("Serif headlines (Cormorant Garamond)");
    // Ink, not a color from a photo, and the house's own display face.
    expect(lookPatch(look)).toMatchObject({ brand: "#111111", imagery: "leading", hero: "full-bleed", logo: "wordmark", fonts: { display: "cormorant-garamond" } });
  });

  it("reads software as words beside a picture, its button's color as the brand", () => {
    const look = lookFromPage(SAAS);
    expect(look).toMatchObject({ imagery: "supporting", hero: "split", labels: "sentence", display: "standard", logo: "mark", ink: false, uiColors: ["#2563eb"] });
    expect(lookPatch(look).brand).toBe("#2563eb");
    expect(lookPatch(look).fonts).toBeUndefined();
  });

  it("puts what a browser saw ahead of the CSS's most-used color", () => {
    const look = lookFromPage(HOUSE);
    const patch = patchFromSite({
      url: "https://maison.example/", title: "Maison", description: "", themeColor: null,
      // The CSS's busiest color is a photo filter's brown, not the brand.
      colors: [{ css: "#8a5a3c", hex: "#8a5a3c", score: 40 }], neutral: "warm", fonts: [], pairing: null, catalogFonts: null, radius: 0, dark: false, summary: "", look,
    });
    expect(patch.brand).toBe("#111111");
    expect(patch.hero).toBe("full-bleed");
    expect(patch.radius).toBe(0);
  });

  it("reads screenshots' pixels: photos that fill the top band, and flat parts without color", () => {
    const look = lookFromPixels([
      { photoShare: 0.55, topBand: 0.82, oneSide: false, flatChromatic: 0.01, flatColors: [], dark: false },
      { photoShare: 0.4, topBand: 0.3, oneSide: true, flatChromatic: 0, flatColors: ["#ffffff"], dark: false },
    ])!;
    expect(look).toMatchObject({ source: "images", imagery: "leading", hero: "full-bleed", ink: true, inkColor: "#111111" });
    const colorful = lookFromPixels([{ photoShare: 0.05, topBand: 0, oneSide: false, flatChromatic: 0.3, flatColors: ["#e4572e"], dark: false }])!;
    expect(colorful).toMatchObject({ imagery: "none", hero: "type", ink: false, uiColors: ["#e4572e"] });
    expect(lookFromPixels([])).toBeNull();
  });

  it("tells color from grays", () => {
    expect(isChromatic("#2563eb")).toBe(true);
    expect(isChromatic("#111111")).toBe(false);
    expect(isChromatic("#f6f6f7")).toBe(false);
  });
});

describe("photos", () => {
  afterEach(() => setPhotoSearch(null));

  it("keeps an Openverse result's license and credit", () => {
    const p = fromOpenverse({
      id: "abc", title: "Leather handbag", url: "https://live.staticflickr.com/1/a.jpg", thumbnail: "https://api.openverse.org/v1/images/abc/thumb/",
      width: 1600, height: 1200, creator: "Jane Doe", license: "by", license_version: "2.0", license_url: "https://creativecommons.org/licenses/by/2.0/",
      foreign_landing_url: "https://www.flickr.com/photos/jane/1", source: "flickr",
    });
    expect(p).toMatchObject({ id: "openverse:abc", alt: "Leather handbag", license: "by", source: "openverse" });
    expect(p.credit).toBe("Photo by Jane Doe, CC BY 2.0, via Flickr");
    expect(creditLine({ creator: null, license: "cc0", licenseVersion: "1.0", source: "openverse" })).toBe("Photo, CC0");
    expect(creditLine({ creator: null, license: "own", licenseVersion: null, source: "own" })).toBe("Your photo");
  });

  it("searches through a replacement when one is set", async () => {
    setPhotoSearch(async ({ q }) => [fromOpenverse({ id: q, url: "x", license: "cc0" })]);
    expect((await searchPhotos({ q: "hotel pool" }))[0]!.id).toBe("openverse:hotel pool");
  });

  it("finds words a camera can take in a description, without the product's own name", () => {
    const q = photoQueries("Gucci", "Gucci offers ready-to-wear, leather goods and accessories, with appointments in boutiques.", "ecommerce");
    expect(q[0]).toBe("ready-to-wear leather");
    expect(q).toContain("product still life");
    expect(q.join(" ")).not.toMatch(/gucci|offers/);
    expect(photoQueries("Northwind", "", "saas")).toEqual(["people working office"]);
  });
});
