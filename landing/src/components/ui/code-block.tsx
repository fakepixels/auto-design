import { codeToHtml } from "shiki";

import { dark, light } from "@/lib/code-theme";
import { cn } from "@/lib/utils";

/**
 * Server-rendered code in the system's syntax colors, switching with light and dark mode.
 * In Next.js with Cache Components, render it from a component marked "use cache":
 * the highlighter reads the clock, which a static prerender doesn't allow.
 */
async function CodeBlock({ code, lang = "tsx", className }: { code: string; lang?: string; className?: string }) {
  const html = await codeToHtml(code.trim(), { lang, themes: { light, dark }, defaultColor: false });
  return (
    <div
      data-slot="code-block"
      className={cn("overflow-x-auto rounded-lg border bg-muted text-sm [&_pre]:p-4 [&_pre]:font-mono [&_pre]:leading-relaxed", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export { CodeBlock };
