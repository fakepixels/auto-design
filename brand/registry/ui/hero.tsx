import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type HeroLink = { label: string; href: string };

/** A landing page's first screen in this system's composition: the headline, one line and the actions, with nothing decorative beside them. */
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
  /** This system leads with type; a picture is drawn only where the composition has room for one. */
  image?: { src: string; alt: string };
  /** The SiteHeader, drawn inside the first screen. */
  header?: React.ReactNode;
  className?: string;
}) {
  return (
    <section data-slot="hero" className={cn("", className)}>
      {header}
      <div className="max-w-3xl px-6 py-16 md:px-10 md:py-24">
          <h1 className="font-semibold tracking-tight text-4xl md:text-5xl text-balance ">{title}</h1>
          {lead && <p className="mt-5 max-w-prose text-lg text-muted-foreground">{lead}</p>}
          {(primary || secondary) && (
            <div className="mt-8 flex flex-wrap gap-3">
              {primary && (
                <Button asChild size="lg">
                  <a href={primary.href}>{primary.label}</a>
                </Button>
              )}
              {secondary && (
                <Button asChild size="lg" variant="outline">
                  <a href={secondary.href}>{secondary.label}</a>
                </Button>
              )}
            </div>
          )}
          {note && <p className="mt-4 text-sm text-muted-foreground">{note}</p>}
      </div>
    </section>
  );
}

export { Hero };
