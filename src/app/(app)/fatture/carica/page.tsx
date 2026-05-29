import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { UploadClient } from "./upload-client";

export default function CaricaFatturePage() {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/fatture"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Torna a Fatture
          </Link>
          <h2 className="text-2xl font-semibold tracking-tight mt-2">Carica fatture</h2>
          <p className="text-sm text-muted-foreground mt-1">
            XML FatturaPA → lettura automatica gratuita. PDF → archiviati su storage privato,
            dati da inserire manualmente o estrarre con AI. ZIP → estratto e processato.
            I file di metadati/notifiche SDI vengono saltati automaticamente.
          </p>
        </div>
        <Link
          href="/fatture/carica/storico"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs text-foreground hover:bg-muted transition-colors"
        >
          <History className="h-3.5 w-3.5" />
          Storico upload
        </Link>
      </div>

      <UploadClient />
    </div>
  );
}
