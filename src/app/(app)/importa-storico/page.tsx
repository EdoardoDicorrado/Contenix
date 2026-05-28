import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportStoricoClient } from "./import-storico-client";

export default function ImportaStoricoPage() {
  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4">
      <div>
        <Link
          href="/movimenti"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Movimenti
        </Link>
      </div>
      <ImportStoricoClient />
    </div>
  );
}
