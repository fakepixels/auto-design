import * as React from "react";

import { cn } from "@/lib/utils";

type CollectionItem = { title: string; detail?: string; href?: string; image?: { src: string; alt: string } };

/** Products, posts or reasons under the first screen, laid out the system's way: each item in a card on an even grid. */
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
        <h2 className="font-semibold tracking-tight text-2xl">{title}</h2>
        {action && (
          <a href={action.href} className="text-sm text-muted-foreground transition-colors duration-120 ease-out hover:text-foreground">
            {action.label}
          </a>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {items.map((item) => (
          <a key={item.title} href={item.href ?? "#"} className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground">
            {item.image && <img src={item.image.src} alt={item.image.alt} className="aspect-4/5 w-full rounded-md object-cover" />}
            <span className="font-medium">{item.title}</span>
            {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
          </a>
        ))}
      </div>
    </section>
  );
}

export { Collection };
