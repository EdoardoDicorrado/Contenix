"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

/**
 * Pulsante "Aggiungi" rotondo: cerchio bianco con + blu (primary).
 * Usato come CTA secondaria leggera per "Nuova fattura / movimento / dipendente
 * / categoria / regola" al posto del bottone primario rettangolare.
 *
 * Accessibilità: il `label` viene esposto come `aria-label` e `title` (tooltip).
 */

const BASE_CLASS =
  "inline-flex items-center justify-center h-10 w-10 rounded-full " +
  "bg-foreground text-background border border-foreground shadow-sm " +
  "hover:opacity-90 transition-opacity cursor-pointer " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:opacity-50 disabled:pointer-events-none";

export function AddButton({
  label,
  onClick,
  disabled,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={className ? `${BASE_CLASS} ${className}` : BASE_CLASS}
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}

export function AddLinkButton({
  label,
  href,
  className,
}: {
  label: string;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={className ? `${BASE_CLASS} ${className}` : BASE_CLASS}
    >
      <Plus className="h-4 w-4" />
    </Link>
  );
}
