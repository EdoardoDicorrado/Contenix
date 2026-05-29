import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UploadHistoryView } from "./history-view";

export default function StoricoUploadPage() {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href="/fatture/carica"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Carica fatture
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">
          Storico upload fatture
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ultime sessioni di caricamento — vedi cosa è entrato e cosa è stato
          saltato/duplicato per ognuna.
        </p>
      </div>

      <UploadHistoryView />
    </div>
  );
}
