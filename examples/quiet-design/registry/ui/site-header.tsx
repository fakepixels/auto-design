import * as React from "react";

import { cn } from "@/lib/utils";

type HeaderLink = { label: string; href: string };

/** The site's header in this system's art direction: a letter mark and the name on the left, links and one action on the right. */
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
  return (
    <header data-slot="site-header" className={cn("flex items-center gap-6 px-6 py-4 md:px-10", overPhoto && "on-photo", className)}>
      <a href="/" className="mr-auto flex items-center gap-2 font-medium text-foreground">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">{name.slice(0, 1)}</span>
        {name}
      </a>
      <nav className="hidden items-center gap-6 md:flex">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="text-sm text-muted-foreground transition-colors duration-120 ease-out hover:text-foreground">
            {l.label}
          </a>
        ))}
      </nav>
      {action && (
        <a href={action.href} className="text-sm font-medium text-foreground">
          {action.label}
        </a>
      )}
    </header>
  );
}

export { SiteHeader };
