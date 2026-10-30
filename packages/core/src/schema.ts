import { z } from "zod";

/**
 * The design config is the only hand-edited source of truth in a design
 * system repo. Everything else (tokens, CSS, registry, agent files, rules)
 * is compiled from it. The schema is deliberately narrow: every field is a
 * choice between good options, never a free-form CSS value.
 */

export const TEXTURES = ["minimal", "editorial", "glass", "tactile", "technical"] as const;
export const MOTION_PROFILES = ["still", "subtle", "expressive"] as const;
export const SURFACES = ["web-app", "marketing", "code", "chat", "mcp-apps", "messaging"] as const;
export const FONT_WEIGHTS = [300, 400, 500, 600, 700] as const;

/**
 * Art direction: how pages are composed, not only what they're made of. These are what make a
 * reference like a fashion house read as itself (photography that leads, a wordmark, uppercase
 * labels, headlines far larger than the text), and they're still choices between good options.
 */
/** How much photography carries the page. */
export const IMAGERY = ["none", "supporting", "leading"] as const;
/** The shape of a landing page's first screen. */
export const HEROES = ["type", "centered", "split", "full-bleed", "editorial"] as const;
/** How collections (products, features, posts) are laid out. */
export const GRIDS = ["cards", "open", "editorial"] as const;
/** Navigation and small labels: in sentence case, or uppercase with wide tracking. */
export const LABEL_CASES = ["sentence", "uppercase"] as const;
/** How far headlines rise above the text: the usual scale, or a dramatic one for display sizes. */
export const DISPLAY_SCALES = ["standard", "dramatic"] as const;
/** The product's name in the header: a letter mark beside it, or a spaced wordmark on its own. */
export const LOGOS = ["mark", "wordmark"] as const;

export const DEFAULT_ART = { imagery: "none", hero: "type", grid: "cards", labels: "sentence", display: "standard", logo: "mark" } as const;

/** Licenses that allow a font to be committed to a public MIT repo. */
export const OPEN_FONT_LICENSES = ["OFL-1.1", "Apache-2.0", "MIT", "system"] as const;

const fontWeight = z.union(FONT_WEIGHTS.map((w) => z.literal(w)) as [
  z.ZodLiteral<300>,
  z.ZodLiteral<400>,
  z.ZodLiteral<500>,
  z.ZodLiteral<600>,
  z.ZodLiteral<700>,
]);

export const fontSchema = z.object({
  /** CSS family name as the font registers it, e.g. "Geist Variable". */
  family: z.string().min(1),
  /** Fallback stack appended after the family. */
  fallback: z.array(z.string()).default([]),
  /** Guardrail: at most three weights per family keeps hierarchy legible. */
  weights: z.array(fontWeight).min(1).max(3),
  /** npm package that serves the font files, e.g. "@fontsource-variable/geist". */
  package: z.string().optional(),
  license: z.enum([...OPEN_FONT_LICENSES, "commercial"]),
});

export const designConfigSchema = z
  .object({
    /** Lowercase slug; also the shadcn registry namespace (@name/...). */
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]{1,38}$/, "Use a lowercase slug: letters, digits and dashes"),
    displayName: z.string().min(1),
    description: z.string().default(""),
    /** Private systems may use commercial fonts; public ones may not. */
    private: z.boolean().default(false),

    /** Taste sliders from onboarding, 0 to 1. Used to pick defaults and by the reviewer. */
    personality: z
      .object({
        energy: z.number().min(0).max(1).default(0.3),
        warmth: z.number().min(0).max(1).default(0.4),
        novelty: z.number().min(0).max(1).default(0.3),
      })
      .default({ energy: 0.3, warmth: 0.4, novelty: 0.3 }),

    texture: z.enum(TEXTURES),

    color: z.object({
      /** Any CSS color. It is kept exactly as the primary action color where contrast allows. */
      brand: z.string().min(1),
      /** Temperature of the grays. */
      neutral: z.enum(["cool", "neutral", "warm"]).default("neutral"),
      /** Which modes the system supports, and which one loads first. */
      modes: z.enum(["light", "dark", "both"]).default("both"),
      defaultMode: z.enum(["light", "dark"]).default("light"),
    }),

    type: z.object({
      sans: fontSchema,
      mono: fontSchema,
      /** Optional display face for headlines (marketing, editorial). */
      display: fontSchema.optional(),
      /** Body size in px. */
      baseSize: z.number().int().min(14).max(18).default(16),
      /** Modular scale ratio between steps. */
      ratio: z.number().min(1.125).max(1.333).default(1.2),
    }),

    shape: z
      .object({
        /** Base corner radius in px. Smaller and larger radii derive from it. */
        radius: z.number().min(0).max(20).default(8),
      })
      .default({ radius: 8 }),

    density: z.enum(["compact", "comfortable"]).default("comfortable"),

    /** Art direction for pages: imagery, the first screen's composition, grids, labels, headline scale and logo. */
    art: z
      .object({
        imagery: z.enum(IMAGERY).default(DEFAULT_ART.imagery),
        hero: z.enum(HEROES).default(DEFAULT_ART.hero),
        grid: z.enum(GRIDS).default(DEFAULT_ART.grid),
        labels: z.enum(LABEL_CASES).default(DEFAULT_ART.labels),
        display: z.enum(DISPLAY_SCALES).default(DEFAULT_ART.display),
        logo: z.enum(LOGOS).default(DEFAULT_ART.logo),
      })
      .default({ ...DEFAULT_ART }),
    motion: z.enum(MOTION_PROFILES).default("subtle"),
    surfaces: z.array(z.enum(SURFACES)).min(1).default(["web-app"]),

    voice: z
      .object({
        /** Case for buttons, menu items and headings in product UI. */
        uiCase: z.enum(["sentence", "title"]).default("sentence"),
        emoji: z.enum(["never", "sparingly"]).default("never"),
        /** One line on how the product talks, used in agent instructions. */
        tone: z.string().default("Clear, direct and calm. Say what happened and what to do next."),
      })
      .default({ uiCase: "sentence", emoji: "never", tone: "Clear, direct and calm. Say what happened and what to do next." }),

    /** Per-rule severity overrides for the checker. */
    rules: z.record(z.string(), z.enum(["error", "warn", "off"])).default({}),
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.private) {
      for (const role of ["sans", "mono", "display"] as const) {
        const font = cfg.type[role];
        if (font && font.license === "commercial") {
          ctx.addIssue({
            code: "custom",
            path: ["type", role, "license"],
            message: `${font.family} is a commercial font. Public systems ship only open-license fonts; set private: true to use it.`,
          });
        }
      }
    }
  });

export type DesignConfig = z.input<typeof designConfigSchema>;
export type ResolvedConfig = z.output<typeof designConfigSchema>;
export type Texture = (typeof TEXTURES)[number];
export type MotionProfileName = (typeof MOTION_PROFILES)[number];
export type Surface = (typeof SURFACES)[number];
export type Art = z.output<typeof designConfigSchema>["art"];
export type FontConfig = z.output<typeof fontSchema>;

/** Identity helper that gives editors type checking in design.config.ts. */
export function defineConfig(config: DesignConfig): DesignConfig {
  return config;
}

export class ConfigError extends Error {
  constructor(public issues: { path: string; message: string }[]) {
    super(
      "Invalid design config:\n" + issues.map((i) => `  - ${i.path || "(root)"}: ${i.message}`).join("\n"),
    );
    this.name = "ConfigError";
  }
}

export function parseConfig(input: unknown): ResolvedConfig {
  const result = designConfigSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}
