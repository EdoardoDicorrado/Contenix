import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { TopProgressBar } from "@/components/top-progress-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={null}>
        <TopProgressBar />
      </Suspense>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Dashboard" />
        <main className="flex-1 px-6 py-6 overflow-auto bg-muted/30">
          {children}
        </main>
      </div>
    </div>
  );
}
