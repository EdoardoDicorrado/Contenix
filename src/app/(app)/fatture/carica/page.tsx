import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CaricaDropdown } from "./carica-dropdown";
import { UploadHistoryView } from "./storico/history-view";

/**
 * Hub di caricamento fatture. Pattern: stesso di /regole — titolo + bottone
 * principale (dropdown) per scegliere la sorgente, lista degli ultimi upload
 * inline come riferimento.
 */
export default function CaricaFatturePage() {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/fatture"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start"
      >
        <ArrowLeft className="h-3 w-3" />
        Torna a Fatture
      </Link>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Carica fatture
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Scegli la sorgente con il bottone in alto. Sotto trovi lo storico
            degli upload precedenti per riferimento.
          </p>
        </div>
        <CaricaDropdown />
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Ultimi upload</h3>
        <UploadHistoryView />
      </section>
    </div>
  );
}
