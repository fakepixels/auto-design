import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Text that arrives while the model writes. A caret shows it's still going.
 * aria-busy holds screen readers until the text is complete, so they read it
 * once instead of token by token.
 */
function StreamingText({
  text,
  streaming,
  className,
  ...props
}: React.ComponentProps<"div"> & { text: string; streaming: boolean }) {
  return (
    <div
      data-slot="streaming-text"
      aria-live="polite"
      aria-busy={streaming}
      className={cn("whitespace-pre-wrap text-base text-foreground", className)}
      {...props}
    >
      {text}
      {streaming ? (
        <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-foreground motion-reduce:animate-none" />
      ) : null}
    </div>
  );
}

export { StreamingText };
