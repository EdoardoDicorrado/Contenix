import Link from "next/link";
import { ArrowLeft, FileCode } from "lucide-react";
import { UploadClient } from "../upload-client";

export default function CaricaCassettoPage() {
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
          <FileCode className="h-5 w-5 text-muted-foreground" />
          Carica dal cassetto fiscale
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          XML FatturaPA → lettura automatica. PDF → archiviato, dati da completare
          o estrarre con AI. ZIP → estratto e processato. I file di metadati
          / notifiche SDI vengono saltati automaticamente.
        </p>
      </div>

      <UploadClient mode="cassetto" />
    </div>
  );
}
