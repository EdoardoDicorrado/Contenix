import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "success" | "danger" | "primary";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const toneClass = {
    neutral: "bg-muted text-muted-foreground border-border",
    success: "bg-success-muted text-success border-success/20",
    danger: "bg-danger-muted text-danger border-danger/20",
    primary: "bg-primary/10 text-primary border-primary/20",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-medium",
        toneClass,
        className,
      )}
      {...props}
    />
  );
}
