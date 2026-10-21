import * as React from "react";

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
      className={cn("rounded-lg border bg-card shadow-sm text-sm text-card-foreground", className)}
      {...props}
    >
      <div className="flex flex-col gap-1 px-3 py-3">
        <p className="font-medium">{title}</p>
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
      <div className="flex items-center gap-2 border-t px-3 py-3">
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
