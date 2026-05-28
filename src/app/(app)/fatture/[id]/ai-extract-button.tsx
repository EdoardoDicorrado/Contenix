"use client";

import { useState, useTransition } from "react";
import { Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { extractInvoiceWithAiAction, type AiExtractResult } from "./ai-actions";

type Props = {
  invoiceId: string;
  fileSizeBytes: number | null;
  alreadyExtracted?: boolean;
};

export function AiExtractButton({ invoiceId, fileSizeBytes, alreadyExtracted }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<AiExtractResult | null>(null);

  // Stima costo grossolana basata sulla dimensione del file
  const sizeKb = (fileSizeBytes ?? 0) / 1024;
  const estimatedMinEur = Math.max(0.005, sizeKb * 0.00002);
  const estimatedMaxEur = Math.max(0.02, sizeKb * 0.00008);

  function handleConfirm() {
    setResult(null);
    const fd = new FormData();
    fd.append("id", invoiceId);
    startTransition(async () => {
      const res = await extractInvoiceWithAiAction(fd);
      setResult(res);
      setConfirmed(false);
    });
  }

  if (result?.ok) {
    return (
      <div className="rounded-md border border-success/30 bg-success-muted px-4 py-3 flex items-start gap-2.5">
        <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">Estrazione completata</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Costo: <span className="font-mono">€{result.cost.toFixed(4)}</span> · Token usati:{" "}
            {result.tokens.toLocaleString("it-IT")}
            {result.cacheHit && (
              <Badge tone="primary" className="ml-2">
                Cache hit
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (result && !result.ok) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-muted px-4 py-3 flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-danger">Estrazione fallita</div>
          <div className="text-xs text-muted-foreground mt-0.5">{result.error}</div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              setResult(null);
              setConfirmed(false);
            }}
          >
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  if (!confirmed) {
    return (
      <Button
        variant={alreadyExtracted ? "ghost" : "primary"}
        size="sm"
        onClick={() => setConfirmed(true)}
        disabled={pending}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {alreadyExtracted ? "Ri-estrai con AI" : "Estrai dati con AI"}
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 flex flex-col gap-3">
      <div>
        <div className="text-sm font-medium text-foreground">
          {alreadyExtracted ? "Conferma ri-estrazione AI" : "Conferma estrazione AI"}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {alreadyExtracted
            ? "Sovrascriverà i dati attualmente salvati. "
            : "Verranno letti i dati di questa fattura tramite Claude Sonnet 4.6. "}
          <br />
          Costo stimato:{" "}
          <span className="font-mono">
            €{estimatedMinEur.toFixed(3)}–€{estimatedMaxEur.toFixed(3)}
          </span>{" "}
          (variabile in base alle pagine del PDF).
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleConfirm} disabled={pending}>
          <Sparkles className="h-3.5 w-3.5" />
          {pending ? "Estrazione in corso…" : "Conferma e procedi"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmed(false)}
          disabled={pending}
        >
          Annulla
        </Button>
      </div>
    </div>
  );
}
