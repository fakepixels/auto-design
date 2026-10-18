import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * An inline source marker: a small number after the claim, linking to where it
 * came from. Its tap area reaches past the chip so it's easy to hit on a phone.
 */
function Citation({
  index,
  title,
  className,
  ...props
}: Omit<React.ComponentProps<"a">, "title"> & { index: number; title: string }) {
  return (
    <a
      data-slot="citation"
      title={title}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "relative ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-muted px-1 align-super after:absolute after:-inset-2 text-xs font-medium tabular-nums text-muted-foreground no-underline transition-colors duration-120 ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    >
      <span className="sr-only">Source </span>
      {index}
    </a>
  );
}

/** The numbered sources under an answer, matching the inline markers. */
function Sources({
  sources,
  className,
  ...props
}: React.ComponentProps<"ol"> & { sources: { title: string; href: string }[] }) {
  return (
    <ol data-slot="sources" className={cn("flex flex-col text-sm", className)} {...props}>
      {sources.map((source, i) => (
        <li key={source.href} className="flex min-w-0 items-baseline gap-2">
          <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
          <a href={source.href} target="_blank" rel="noreferrer" className="min-w-0 truncate py-1 text-foreground underline-offset-4 hover:underline">
            {source.title}
          </a>
          <span className="shrink-0 text-xs text-muted-foreground">{hostOf(source.href)}</span>
        </li>
      ))}
    </ol>
  );
}

function hostOf(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export { Citation, Sources };
