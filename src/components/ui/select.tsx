import * as React from "react";
import { cn } from "@/lib/utils";

// Freccia inline come data URI, applicata via style inline per non collidere
// con la classe bg-background di Tailwind (le shorthand background-image e
// background-color in arbitrary-value si sovrascrivono a vicenda).
const CHEVRON_BG_IMAGE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, style, ...props }, ref) => (
  <select
    ref={ref}
    style={{
      backgroundImage: CHEVRON_BG_IMAGE,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 0.6rem center",
      ...style,
    }}
    className={cn(
      "h-9 w-full rounded-md border border-input bg-background text-foreground px-3 pr-9 text-sm shadow-xs appearance-none",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
