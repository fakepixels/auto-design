import * as React from "react";

import { cn } from "@/lib/utils";

/** A file the person attached or the agent produced. Pass href to make it downloadable. */
function FileCard({
  name,
  size,
  kind,
  href,
  className,
  ...props
}: React.ComponentProps<"div"> & { name: string; size?: number; kind?: string; href?: string }) {
  const ext = (kind ?? (name.includes(".") ? name.split(".").pop() : "") ?? "").slice(0, 4).toUpperCase();
  const body = (
    <>
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs font-medium text-muted-foreground"
      >
        {ext || "FILE"}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        {size !== undefined ? <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(size)}</span> : null}
      </span>
    </>
  );
  return (
    <div data-slot="file-card" className={cn("inline-flex w-fit max-w-full items-center rounded-lg border bg-card shadow-sm p-2 pr-4", className)} {...props}>
      {href ? (
        <a href={href} download className="flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </a>
      ) : (
        <span className="flex min-w-0 items-center gap-3">{body}</span>
      )}
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export { FileCard };
