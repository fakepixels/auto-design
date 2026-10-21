"use client";

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
          toast: "font-sans text-sm shadow-md",
          // Sonner colors descriptions for its own light theme; the system's role has to win in both modes.
          description: "text-muted-foreground!",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
