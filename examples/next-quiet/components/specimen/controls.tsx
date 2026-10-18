"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ModeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("mode") === "dark";
    setDark(initial);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <Button variant="outline" size="sm" onClick={() => setDark((d) => !d)} aria-pressed={dark}>
      {dark ? "Light mode" : "Dark mode"}
    </Button>
  );
}

export function ApproveRun() {
  return (
    <Button
      onClick={() =>
        toast("Run approved", {
          description: "214 invoices will be sent on November 1.",
        })
      }
    >
      Approve run
    </Button>
  );
}
