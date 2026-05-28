import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ExportClient } from "./export-client";

export default function EsportazioniPage() {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Esportazioni</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Scarica i registri IVA e i movimenti in formato CSV (compatibile Excel italiano)
          per consegnarli al commercialista.
        </p>
      </div>

      <ExportClient />

      <Card>
        <CardHeader>
          <CardTitle>Note tecniche</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside marker:text-muted-foreground/60">
            <li>
              Formato CSV con separatore <code className="font-mono">;</code>, decimali con virgola,
              encoding UTF-8 con BOM (apertura diretta in Excel italiano)
            </li>
            <li>
              Le <strong>note di credito</strong> sono esportate con importi negativi e marcate nella
              colonna dedicata
            </li>
            <li>
              I registri sono ordinati per data di emissione crescente come richiesto dalla normativa IVA
            </li>
            <li>
              I codici tipo documento (TD01-TD28) sono espansi nella loro descrizione testuale
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
