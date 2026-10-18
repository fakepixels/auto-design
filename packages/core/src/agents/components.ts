import type { DesignSystem } from "../system.js";
import { skinFor, type ComponentSource } from "../emit/components.js";
import { mcpHostModule } from "./mcp-app.js";

/**
 * Components for agent surfaces: the pieces an AI product needs beyond
 * messages and tool calls. They ship when the system targets chat or MCP
 * Apps, and pass the same guardrails as everything else.
 */
export function agentComponentSources(s: DesignSystem): ComponentSource[] {
  const k = skinFor(s);
  const d = s.motion.durations;
  const padX = s.config.density === "compact" ? 3 : 4;
  const out: ComponentSource[] = [];

  if (s.config.surfaces.includes("chat")) {
    const approval = `import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The agent asks before it acts. The title says what will happen ("Send the
 * invoice to Maya Chen"), children show the specifics, and the answers are
 * short verbs. After a decision the card keeps a one-line record of it.
 */
function Approval({
  title,
  children,
  status = "pending",
  approveLabel = "Approve",
  denyLabel = "Deny",
  approvedLabel = "Approved",
  deniedLabel = "Denied",
  onApprove,
  onDeny,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  status?: "pending" | "approved" | "denied";
  approveLabel?: string;
  denyLabel?: string;
  /** The record after a decision. Name it after the action: "Sent", "Not sent". */
  approvedLabel?: string;
  deniedLabel?: string;
  onApprove?: () => void;
  onDeny?: () => void;
}) {
  return (
    <div
      data-slot="approval"
      data-status={status}
      role="group"
      className={cn("rounded-lg ${k.card} text-sm text-card-foreground", className)}
      {...props}
    >
      <div className="flex flex-col gap-1 px-${padX} py-3">
        <p className="font-medium">{title}</p>
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
      <div className="flex items-center gap-2 border-t px-${padX} py-3">
        {status === "pending" ? (
          <>
            <Button size="sm" onClick={onApprove}>
              {approveLabel}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDeny}>
              {denyLabel}
            </Button>
          </>
        ) : (
          <p role="status" className="flex items-center gap-2 text-muted-foreground">
            <span aria-hidden className={cn("size-2 rounded-full", status === "approved" ? "bg-success" : "bg-muted-foreground")} />
            {status === "approved" ? approvedLabel : deniedLabel}
          </p>
        )}
      </div>
    </div>
  );
}

export { Approval };
`;

    const citation = `import * as React from "react";

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
        "relative ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-muted px-1 align-super after:absolute after:-inset-2 text-xs font-medium tabular-nums text-muted-foreground no-underline transition-colors duration-${d.fast} ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
    return new URL(href).hostname.replace(/^www\\./, "");
  } catch {
    return "";
  }
}

export { Citation, Sources };
`;

    const streaming = `import * as React from "react";

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
`;

    const fileCard = `import * as React from "react";

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
    <div data-slot="file-card" className={cn("inline-flex w-fit max-w-full items-center rounded-lg ${k.card} p-2 pr-4", className)} {...props}>
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
  if (n < 1024) return \`\${n} B\`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return \`\${v < 10 ? v.toFixed(1) : Math.round(v)} \${units[i]}\`;
}

export { FileCard };
`;

    const reasoning = `import * as React from "react";

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
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-muted-foreground transition-colors duration-${d.fast} ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        {seconds === undefined ? "Thinking" : \`Thought for \${seconds < 60 ? \`\${Math.max(1, Math.round(seconds))}s\` : \`\${Math.round(seconds / 60)}m\`}\`}
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 transition-transform duration-${d.fast} ease-out group-open:rotate-90 motion-reduce:transition-none">
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="mt-2 border-l-2 pl-3 text-muted-foreground">{children}</div>
    </details>
  );
}

export { Reasoning };
`;

    out.push(
      { name: "approval", title: "Approval", description: "The agent asks before it acts: what will happen, and two short answers.", dependencies: [], requires: ["button"], file: "approval.tsx", content: approval },
      { name: "citation", title: "Citation", description: "Inline source numbers and the source list under an answer.", dependencies: [], file: "citation.tsx", content: citation },
      { name: "streaming-text", title: "Streaming text", description: "Model output as it arrives, with a caret and screen-reader-safe updates.", dependencies: [], file: "streaming-text.tsx", content: streaming },
      { name: "file-card", title: "File card", description: "Attachments and generated files, with type, name and size.", dependencies: [], file: "file-card.tsx", content: fileCard },
      { name: "reasoning", title: "Reasoning", description: "The agent's thinking, folded away with how long it took.", dependencies: [], file: "reasoning.tsx", content: reasoning },
    );
  }

  if (s.config.surfaces.includes("mcp-apps")) {
    out.push({
      name: "mcp-host",
      title: "MCP host",
      description: "Connects the system to Claude, ChatGPT and other MCP Apps hosts: host colors and type for structure, brand for actions.",
      dependencies: [],
      type: "registry:lib",
      file: "",
      content: "",
      lib: [{ file: "mcp-host.ts", content: mcpHostModule(s) }],
    });
  }
  return out;
}
