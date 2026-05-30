import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { UploadClient } from "../upload-client";

export default function CaricaEsteroPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/fatture/carica"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start"
      >
        <ArrowLeft className="h-3 w-3" />
        Torna a Carica fatture
      </Link>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          Carica fatture estere
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Fatture non FatturaPA (estere o cartacee). Carica i PDF e poi
          completa o estrai i dati con AI dalla pagina della singola fattura.
          Nessuna lettura automatica, niente metadati SDI.
        </p>
      </div>

      <UploadClient mode="estero" />
    </div>
  );
}
