import type { DesignSystem } from "../system.js";

/**
 * Component sources, restyled shadcn primitives that use only this system's
 * tokens. They are templates because density and motion change their classes.
 * Every file here must pass `auto-design check` for every preset.
 */

export interface ComponentSource {
  name: string;
  title: string;
  description: string;
  dependencies: string[];
  /** Path inside the consuming project, relative to the components/ui alias. */
  file: string;
  content: string;
}

export function componentSources(s: DesignSystem): ComponentSource[] {
  const h = s.controls;
  const d = s.motion.durations;
  const press = s.motion.enterScale < 1 ? " active:scale-98" : "";
  const padX = s.config.density === "compact" ? 3 : 4;

  const button = `import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-${d.fast} ease-out${press} disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-${h.sm} gap-1.5 px-${padX === 3 ? 2.5 : 3}",
        default: "h-${h.md} px-${padX}",
        lg: "h-${h.lg} px-${padX + 2}",
        icon: "size-${h.md}",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
`;

  const card = `import * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("flex flex-col gap-${s.config.density === "compact" ? 4 : 6} rounded-lg border bg-card py-${s.config.density === "compact" ? 4 : 6} text-card-foreground shadow-xs", className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1 px-${s.config.density === "compact" ? 4 : 6}", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("text-base font-semibold leading-tight", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-${s.config.density === "compact" ? 4 : 6}", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center gap-2 px-${s.config.density === "compact" ? 4 : 6}", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
`;

  const input = `import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-${h.md} w-full min-w-0 rounded-md border border-input bg-background px-3 text-base shadow-xs transition-colors duration-${d.fast} ease-out placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
`;

  const badge = `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        success: "border-transparent bg-success/15 text-foreground before:size-1.5 before:rounded-full before:bg-success before:content-['']",
        warning: "border-transparent bg-warning/20 text-foreground before:size-1.5 before:rounded-full before:bg-warning before:content-['']",
        destructive: "border-transparent bg-destructive/15 text-foreground before:size-1.5 before:rounded-full before:bg-destructive before:content-['']",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
`;

  const toaster = `"use client";

import * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Toasts by Sonner (MIT, Emil Kowalski), styled with this system's tokens. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans text-sm shadow-lg",
          description: "text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
`;

  const message = `import * as React from "react";

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
`;

  return [
    { name: "button", title: "Button", description: "Buttons with one primary variant per view.", dependencies: ["@radix-ui/react-slot", "class-variance-authority"], file: "button.tsx", content: button },
    { name: "card", title: "Card", description: "Grouped content on the page.", dependencies: [], file: "card.tsx", content: card },
    { name: "input", title: "Input", description: "Text input sized to match buttons.", dependencies: [], file: "input.tsx", content: input },
    { name: "badge", title: "Badge", description: "Status and labels, always with text.", dependencies: ["class-variance-authority"], file: "badge.tsx", content: badge },
    { name: "toaster", title: "Toaster", description: "Toasts by Sonner, styled with system tokens.", dependencies: ["sonner"], file: "toaster.tsx", content: toaster },
    { name: "message", title: "Message", description: "Chat messages and tool-call rows for agent UI.", dependencies: [], file: "message.tsx", content: message },
  ];
}
