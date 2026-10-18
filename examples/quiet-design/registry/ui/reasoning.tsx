import * as React from "react";

import { cn } from "@/lib/utils";

/** What the agent considered before answering, folded away by default. */
function Reasoning({
  seconds,
  children,
  className,
  ...props
}: React.ComponentProps<"details"> & { seconds?: number }) {
  return (
    <details data-slot="reasoning" className={cn("group text-sm", className)} {...props}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-muted-foreground transition-colors duration-120 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        {seconds === undefined ? "Thinking" : `Thought for ${seconds < 60 ? `${Math.max(1, Math.round(seconds))}s` : `${Math.round(seconds / 60)}m`}`}
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 transition-transform duration-120 ease-out group-open:rotate-90 motion-reduce:transition-none">
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="mt-2 border-l-2 pl-3 text-muted-foreground">{children}</div>
    </details>
  );
}

export { Reasoning };
