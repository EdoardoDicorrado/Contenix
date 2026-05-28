import { Search } from "lucide-react";

export function Topbar({ title }: { title: string }) {
  return (
    <header className="h-14 border-b border-border bg-background px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-muted/40 text-xs text-muted-foreground w-64">
          <Search className="h-3.5 w-3.5" />
          <span>Cerca…</span>
        </div>
        <div className="h-7 w-7 rounded-full bg-muted border border-border flex items-center justify-center text-[11px] font-medium text-muted-foreground">
          E
        </div>
      </div>
    </header>
  );
}
