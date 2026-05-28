"use client";

import { useRef } from "react";
import { Palette } from "lucide-react";
import { cn } from "@/lib/utils";

export const PRESET_COLORS = [
  "#a3a3a3", "#6b7280", "#0a0a0a",
  "#2563eb", "#16a34a", "#dc2626",
  "#f97316", "#eab308", "#06b6d4", "#8b5cf6",
];

type Props = {
  value: string;
  onChange: (color: string) => void;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Color picker minimale: una serie di colori preset + opzione "personalizzato"
 * che apre il color picker nativo del browser. Il valore è sempre un hex `#RRGGBB`.
 */
export function ColorPicker({ value, onChange, size = "md", className }: Props) {
  const customInputRef = useRef<HTMLInputElement>(null);
  const isPreset = PRESET_COLORS.includes(value.toLowerCase());
  const dot = size === "sm" ? "h-6 w-6" : "h-7 w-7";

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            dot,
            "rounded-full border-2 transition-transform",
            value.toLowerCase() === c
              ? "border-foreground scale-110"
              : "border-transparent hover:scale-105",
          )}
          style={{ backgroundColor: c }}
          aria-label={`Seleziona colore ${c}`}
        />
      ))}

      <button
        type="button"
        onClick={() => customInputRef.current?.click()}
        className={cn(
          dot,
          "rounded-full border-2 flex items-center justify-center bg-background",
          !isPreset
            ? "border-foreground scale-110"
            : "border-border hover:scale-105 text-muted-foreground",
        )}
        title="Colore personalizzato"
        style={!isPreset ? { backgroundColor: value, color: "white" } : undefined}
      >
        {isPreset && <Palette className="h-3 w-3" />}
      </button>
      <input
        ref={customInputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        aria-label="Colore personalizzato"
      />

      <span className="ml-1 text-[10px] text-muted-foreground font-mono">{value}</span>
    </div>
  );
}
