import { Suspense } from "react";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/sidebar";
import { TopProgressBar } from "@/components/top-progress-bar";
import { CommandPalette } from "@/components/command-palette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={null}>
        <TopProgressBar />
      </Suspense>
      <CommandPalette />
      <Sidebar />
      <main className="flex-1 flex flex-row min-w-0 bg-muted/30 overflow-hidden">
        <div className="flex-1 min-w-0 px-6 md:px-10 xl:px-16 py-6 md:py-8 overflow-auto">
          {children}
        </div>
        {/* Slot per push drawer (riempito via createPortal dai client).
            `relative` per i drawer "stacked" che si posizionano absolute. */}
        <div id="push-drawer-root" className="flex shrink-0 relative" />
      </main>
      <Toaster
        position="bottom-right"
        theme="system"
        toastOptions={{
          classNames: {
            toast:
              "bg-background border border-border text-foreground shadow-lg",
            description: "text-muted-foreground",
            success: "text-success",
            error: "text-danger",
          },
        }}
      />
    </div>
  );
}
