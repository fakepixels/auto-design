import * as React from "react";

import { cn } from "@/lib/utils";

/** A placeholder in the shape of content that is still loading. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
