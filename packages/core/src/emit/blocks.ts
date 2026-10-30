import { toCss } from "../color.js";
import type { DesignSystem } from "../system.js";
import type { ComponentSource } from "./components.js";
import { WEIGHT_NAMES } from "./shared.js";

/**
 * Marketing blocks: a site header, a hero and a collection, generated in the system's own art direction,
 * so an agent building a landing page starts from the right composition (a fashion house's full-bleed
 * photo and centered wordmark, software's words beside a screenshot) instead of a template. Each takes
 * its words, links and photos as props; the composition is the system's and isn't a prop. They pass the
 * system's checker like every component.
 */

/** A class string without doubled or edge spaces. */
const cls = (c: string) => c.replace(/\s+/g, " ").trim();

/** The first of the preferred weights the system has, as a class. */
function weight(s: DesignSystem, prefer: number[]): string {
  const w = prefer.find((x) => s.type.weights.includes(x)) ?? s.type.weights[s.type.weights.length - 1]!;
  return `font-${WEIGHT_NAMES[w]}`;
}

/** Class strings every block shares, from the system's art direction. */
export function blockStyle(s: DesignSystem) {
  const a = s.config.art;
  const display = s.type.fonts.display;
  const upper = a.labels === "uppercase";
  return {
    /** Navigation links and small labels. */
    label: upper ? "text-xs uppercase tracking-label" : "text-sm",
    /** Marketing buttons' labels. */
    buttonLabel: upper ? "text-xs uppercase tracking-label" : "",
    /** Headlines: the display face when there is one, at the system's weight for it. */
    head: display ? `font-display ${weight(s, display.weights.length ? [...display.weights] : [400])}` : `${weight(s, [600, 700, 500])} tracking-tight`,
    /** The headline face and weight, without tracking (for the wordmark, which sets its own). */
    headFace: display ? `font-display ${weight(s, display.weights.length ? [...display.weights] : [400])}` : weight(s, [600, 700, 500]),
    /** The landing page's headline size. */
    heroSize: a.display === "dramatic" ? "text-5xl md:text-6xl" : "text-4xl md:text-5xl",
    /** Pictures' corners: square for a square system, the system's large radius otherwise. */
    pic: s.config.shape.radius === 0 ? "" : "rounded-lg",
    medium: weight(s, [500, 600]),
    wordmark: a.logo === "wordmark",
    upper,
  };
}

/**
 * Words over a photo need light text and controls in either mode. The hero sets the role variables for
 * its own subtree, so the system's Button and links read on the photo without new colors; the scrim keeps
 * the text at contrast whatever the photo holds.
 */
export function imageryLayer(s: DesignSystem): string {
  const n = s.palettes.neutral;
  const light = toCss(n[50]);
  const dark = toCss(n[950]);
  return `/* Words over a photo: light text and controls in either mode, over a scrim that keeps them readable. */
@utility on-photo {
  --background: transparent;
  --foreground: ${light};
  --muted-foreground: color-mix(in oklab, ${light} 84%, transparent);
  --primary: ${light};
  --primary-foreground: ${dark};
  --accent: color-mix(in oklab, ${light} 16%, transparent);
  --accent-foreground: ${light};
  --border: color-mix(in oklab, ${light} 55%, transparent);
  --input: color-mix(in oklab, ${light} 55%, transparent);
  --ring: ${light};
  color: var(--foreground);
}

@utility photo-scrim {
  background-image: linear-gradient(to top, oklch(0 0 0 / 0.64), oklch(0 0 0 / 0.14) 52%, oklch(0 0 0 / 0.34));
}`;
}

export function blockSources(s: DesignSystem): ComponentSource[] {
  if (!s.config.surfaces.includes("marketing")) return [];
  const a = s.config.art;
  const st = blockStyle(s);
  const centered = a.hero === "centered" || (a.hero === "full-bleed" && st.wordmark);

  const header = `import * as React from "react";

import { cn } from "@/lib/utils";

type HeaderLink = { label: string; href: string };

/** The site's header in this system's art direction: ${st.wordmark ? "a spaced wordmark centered between the links and the action" : "a letter mark and the name on the left, links and one action on the right"}. */
function SiteHeader({
  name,
  links = [],
  action,
  overPhoto = false,
  className,
}: {
  name: string;
  links?: HeaderLink[];
  action?: HeaderLink;
  /** Set when the header sits on a full-bleed photo: text and controls turn light. */
  overPhoto?: boolean;
  className?: string;
}) {
${
  st.wordmark
    ? `  return (
    <header data-slot="site-header" className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 py-5 md:px-10", overPhoto && "on-photo", className)}>
      {/* Links that don't fit wrap onto a second row the header's height hides, so none is cut mid-word. */}
      <nav className="flex ${st.upper ? "h-4 gap-y-4" : "h-5 gap-y-5"} min-w-0 flex-wrap content-start items-center gap-x-6 overflow-hidden">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="${st.label} whitespace-nowrap text-foreground transition-opacity duration-${s.motion.durations.fast} ease-out hover:opacity-70">
            {l.label}
          </a>
        ))}
      </nav>
      <a href="/" className="${cls(`${st.headFace} text-2xl uppercase tracking-wordmark text-foreground`)}">
        {name}
      </a>
      <div className="flex items-center justify-end">
        {action && (
          <a href={action.href} className="${st.label} whitespace-nowrap text-foreground transition-opacity duration-${s.motion.durations.fast} ease-out hover:opacity-70">
            {action.label}
          </a>
        )}
      </div>
    </header>
  );`
    : `  return (
    <header data-slot="site-header" className={cn("flex items-center gap-6 px-6 py-4 md:px-10", overPhoto && "on-photo", className)}>
      <a href="/" className="mr-auto flex items-center gap-2 ${st.medium} text-foreground">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">{name.slice(0, 1)}</span>
        {name}
      </a>
      <nav className="hidden items-center gap-6 md:flex">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="${st.label} text-muted-foreground transition-colors duration-${s.motion.durations.fast} ease-out hover:text-foreground">
            {l.label}
          </a>
        ))}
      </nav>
      {action && (
        <a href={action.href} className="${st.label} ${st.medium} text-foreground">
          {action.label}
        </a>
      )}
    </header>
  );`
}
}

export { SiteHeader };
`;

  const actions = `      {(primary || secondary) && (
        <div className="${centered ? "mt-8 flex flex-wrap justify-center gap-3" : "mt-8 flex flex-wrap gap-3"}">
          {primary && (
            <Button asChild size="lg"${st.buttonLabel ? ` className="${st.buttonLabel}"` : ""}>
              <a href={primary.href}>{primary.label}</a>
            </Button>
          )}
          {secondary && (
            <Button asChild size="lg" variant="outline"${st.buttonLabel ? ` className="${st.buttonLabel}"` : ""}>
              <a href={secondary.href}>{secondary.label}</a>
            </Button>
          )}
        </div>
      )}
      {note && <p className="mt-4 text-sm text-muted-foreground">{note}</p>}`;
  const words = (align: string) => `      <h1 className="${st.head} ${st.heroSize} text-balance ${align}">{title}</h1>
      {lead && <p className="mt-5 max-w-prose text-lg text-muted-foreground${align ? " mx-auto" : ""}">{lead}</p>}
${actions}`;

  let body: string;
  switch (a.hero) {
    case "full-bleed":
      body = `  return (
    <section data-slot="hero" className={cn("relative isolate flex min-h-[85svh] flex-col overflow-hidden", className)}>
      {image ? <img src={image.src} alt={image.alt} className="absolute inset-0 -z-20 size-full object-cover" /> : <div aria-hidden="true" className="absolute inset-0 -z-20 bg-primary" />}
      <div aria-hidden="true" className="photo-scrim absolute inset-0 -z-10" />
      <div className="on-photo flex flex-1 flex-col">
        {header}
        <div className="${centered ? "mx-auto mt-auto max-w-3xl px-6 pb-16 text-center md:pb-24" : "mt-auto max-w-3xl px-6 pb-16 md:px-10 md:pb-24"}">
${words(centered ? "" : "").replace(/^/gm, "  ")}
        </div>
      </div>
    </section>
  );`;
      break;
    case "split":
      body = `  return (
    <section data-slot="hero" className={cn("", className)}>
      {header}
      <div className="grid items-center gap-12 px-6 py-16 md:grid-cols-2 md:px-10 md:py-24">
        <div>
${words("").replace(/^/gm, "    ")}
        </div>
        {image && <img src={image.src} alt={image.alt} className="${cls(`aspect-4/5 w-full object-cover ${st.pic}`)}" />}
      </div>
    </section>
  );`;
      break;
    case "editorial":
      body = `  return (
    <section data-slot="hero" className={cn("", className)}>
      {header}
      <div className="grid items-end gap-12 px-6 py-16 md:grid-cols-[5fr_4fr] md:px-10 md:py-24">
        <div>
          <hr className="mb-6 w-14 border-t-2 border-foreground" />
${words("").replace(/^/gm, "    ")}
        </div>
        {image && <img src={image.src} alt={image.alt} className="${cls(`aspect-3/4 w-full object-cover ${st.pic}`)}" />}
      </div>
    </section>
  );`;
      break;
    case "centered":
      body = `  return (
    <section data-slot="hero" className={cn("", className)}>
      {header}
      <div className="mx-auto max-w-3xl px-6 pt-16 text-center md:pt-24">
${words("").replace(/^/gm, "    ")}
      </div>
      {image && <img src={image.src} alt={image.alt} className="${cls(`mx-auto mt-16 aspect-21/9 w-full max-w-6xl object-cover ${st.pic}`)}" />}
    </section>
  );`;
      break;
    default:
      body = `  return (
    <section data-slot="hero" className={cn("", className)}>
      {header}
      <div className="max-w-3xl px-6 py-16 md:px-10 md:py-24">
${words("").replace(/^/gm, "    ")}
      </div>
    </section>
  );`;
  }
  const heroNames: Record<string, string> = {
    "full-bleed": "one photo fills the first screen and carries the words, with the header on it",
    split: "the words on one side, one picture on the other",
    editorial: "a short rule and a headline column beside one tall picture",
    centered: "the words centered, with a wide picture under them",
    type: "the headline, one line and the actions, with nothing decorative beside them",
  };
  const hero = `import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type HeroLink = { label: string; href: string };

/** A landing page's first screen in this system's composition: ${heroNames[a.hero]}. */
function Hero({
  title,
  lead,
  primary,
  secondary,
  note,
  image,
  header,
  className,
}: {
  title: string;
  lead?: string;
  primary?: HeroLink;
  secondary?: HeroLink;
  note?: string;
  /** ${a.imagery === "none" ? "This system leads with type; a picture is drawn only where the composition has room for one." : "A real photo of the product or its world, with alt text that says what it shows."} */
  image?: { src: string; alt: string };
  /** The SiteHeader, drawn inside the first screen${a.hero === "full-bleed" ? " (pass overPhoto so it reads on the photo)" : ""}. */
  header?: React.ReactNode;
  className?: string;
}) {
${body}
}

export { Hero };
`;

  const itemPic = (c: string) => `{item.image && <img src={item.image.src} alt={item.image.alt} className="${c}" />}`;
  let grid: string;
  if (a.grid === "editorial") {
    grid = `      <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
        {items.map((item, i) => (
          <a key={item.title} href={item.href ?? "#"} className={cn("group flex flex-col gap-3", i === 0 && "md:row-span-2")}>
            {item.image && <img src={item.image.src} alt={item.image.alt} className={cn("${cls(`w-full object-cover ${st.pic}`)}", i === 0 ? "aspect-4/5" : "aspect-16/10")} />}
            <div className={cn("flex items-baseline justify-between gap-3", !item.image && "border-t pt-4")}>
              <span className={cn("${st.medium}", i === 0 && "${cls(`${st.headFace} text-2xl`)}")}>{item.title}</span>
              {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
            </div>
          </a>
        ))}
      </div>`;
  } else if (a.grid === "open") {
    grid = `      <div className={cn("grid grid-cols-2 gap-6", items.length % 3 === 0 ? "md:grid-cols-3" : "md:grid-cols-4")}>
        {items.map((item) => (
          <a key={item.title} href={item.href ?? "#"} className={cn("flex flex-col gap-3", !item.image && "border-t pt-4")}>
            ${itemPic(cls(`aspect-4/5 w-full object-cover ${st.pic}`))}
            <div className="flex items-baseline justify-between gap-3">
              <span className="${st.medium}">{item.title}</span>
              {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
            </div>
          </a>
        ))}
      </div>`;
  } else {
    grid = `      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {items.map((item) => (
          <a key={item.title} href={item.href ?? "#"} className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground">
            ${itemPic("aspect-4/5 w-full rounded-md object-cover")}
            <span className="${st.medium}">{item.title}</span>
            {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
          </a>
        ))}
      </div>`;
  }
  const gridNames: Record<string, string> = { cards: "each item in a card on an even grid", open: "pictures and captions with no boxes, separated by space", editorial: "one large item beside smaller ones" };
  const collection = `import * as React from "react";

import { cn } from "@/lib/utils";

type CollectionItem = { title: string; detail?: string; href?: string; image?: { src: string; alt: string } };

/** Products, posts or reasons under the first screen, laid out the system's way: ${gridNames[a.grid]}. */
function Collection({
  title,
  items,
  action,
  className,
}: {
  title: string;
  items: CollectionItem[];
  /** A link to everything, like "View all". */
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <section data-slot="collection" className={cn("px-6 py-16 md:px-10", className)}>
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h2 className="${st.head} text-2xl">{title}</h2>
        {action && (
          <a href={action.href} className="${st.label} text-muted-foreground transition-colors duration-${s.motion.durations.fast} ease-out hover:text-foreground">
            {action.label}
          </a>
        )}
      </div>
${grid}
    </section>
  );
}

export { Collection };
`;

  return [
    { name: "site-header", title: "Site header", description: `A landing page's header: ${st.wordmark ? "the name as a centered wordmark, with links on either side" : "the mark and name, then the links"}.`, dependencies: [], file: "site-header.tsx", content: header },
    { name: "hero", title: "Hero", description: `A landing page's first screen: ${heroNames[a.hero]}.`, dependencies: [], file: "hero.tsx", content: hero, requires: ["button"] },
    { name: "collection", title: "Collection", description: `Products, posts or reasons under the first screen: ${gridNames[a.grid]}.`, dependencies: [], file: "collection.tsx", content: collection },
  ];
}
