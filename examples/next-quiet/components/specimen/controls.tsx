"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Approval } from "@/components/ui/approval";
import { Button } from "@/components/ui/button";
import { StreamingText } from "@/components/ui/streaming-text";

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

export function ApproveSend() {
  const [status, setStatus] = useState<"pending" | "approved" | "denied">("pending");
  return (
    <Approval
      title="Send the invoice to Acme Robotics with a note to Maya Chen"
      status={status}
      approveLabel="Send"
      denyLabel="Don't send"
      approvedLabel="Sent"
      deniedLabel="Not sent"
      onApprove={() => setStatus("approved")}
      onDeny={() => setStatus("denied")}
    >
      $41,920, due November 15. The note explains the image inference increase.
    </Approval>
  );
}

const REPLY = "Sent. Maya has the note, and the invoice goes out with tonight's run.";

export function StreamingReply() {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= REPLY.length) return;
    const t = setTimeout(() => setShown((n) => Math.min(REPLY.length, n + 3)), 30);
    return () => clearTimeout(t);
  }, [shown]);
  return <StreamingText text={REPLY.slice(0, shown)} streaming={shown < REPLY.length} />;
}
