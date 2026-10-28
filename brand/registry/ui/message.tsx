import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A chat message. User turns sit on a quiet fill at the right; assistant
 * turns are plain text on the page, so long answers read like a document.
 */
function Message({
  from,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { from: "user" | "assistant" }) {
  return (
    <div
      data-slot="message"
      data-from={from}
      className={cn("group flex w-full", from === "user" ? "justify-end" : "justify-start", className)}
      {...props}
    >
      <div
        className={cn(
          "max-w-prose text-base",
          from === "user" ? "rounded-xl bg-secondary px-4 py-2 text-secondary-foreground" : "text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A tool call the agent made, collapsed to one line with its status. */
function ToolCall({
  name,
  status,
  children,
  className,
  ...props
}: React.ComponentProps<"details"> & { name: string; status: "running" | "done" | "failed" }) {
  return (
    <details
      data-slot="tool-call"
      className={cn("group rounded-lg border bg-card text-sm text-card-foreground", className)}
      {...props}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            status === "running" && "animate-pulse bg-muted-foreground",
            status === "done" && "bg-success",
            status === "failed" && "bg-destructive",
          )}
        />
        <span className="font-mono text-xs">{name}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {status === "running" ? "Running" : status === "done" ? "Done" : "Failed"}
        </span>
      </summary>
      <div className="border-t px-3 py-2 font-mono text-xs text-muted-foreground">{children}</div>
    </details>
  );
}

export { Message, ToolCall };
