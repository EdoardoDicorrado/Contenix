"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Checkbox custom con stile "outline + check al centro":
 *  - non-checked: quadratino vuoto bordo bianco (foreground)
 *  - checked:     stesso quadratino + icona check bianca al centro
 * Sostituisce <input type="checkbox"> nativo per coerenza visuale.
 */
export function CheckToggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 text-sm select-none",
        disabled ? "opacity-50" : "cursor-pointer",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "shrink-0 mt-0.5 h-4 w-4 rounded-sm border-2 border-foreground inline-flex items-center justify-center transition-colors",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          checked ? "bg-transparent" : "bg-transparent",
        )}
      >
        {checked && <Check className="h-3 w-3 text-foreground" strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <span>{label}</span>
        {description && (
          <span className="block text-xs text-muted-foreground mt-0.5">
            {description}
          </span>
        )}
      </div>
    </label>
  );
}
